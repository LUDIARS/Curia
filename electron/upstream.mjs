/**
 * 上流サービスの接続先解決 — Curia が起動しているアプリの base URL を求め、
 * 子プロセスの env へ反映する。
 *
 * Curia は「アプリを同時に起動する器」なので、Thaleia / Praeforma が上流 (Anatomia /
 * Discutere / Praeforma) を叩くための接続先を知っているのは Curia だけになる。
 * ポート既定値をここで二重に持たないよう、URL は各アプリ定義の `baseUrl(ctx)` から取る。
 *
 * 切り離し可能性 (DESIGN.md §11) は「registry に載っているアプリしか解決しない」ことで守る。
 * `curia.apps.json` で無効にしたアプリは registry に現れないので base URL も渡らない。
 */

/**
 * 有効アプリ (registry) の base URL を id -> URL で返す。末尾スラッシュは落とす。
 * @param {import('./registry.mjs').AppDef[]} registry buildRegistry() の戻り値 (= 有効アプリのみ)
 * @param {{appRoot: string, dataRoot: string}} ctx
 * @returns {Record<string, string>}
 * @implements SPEC-CURIA-UPSTREAM-RESOLVE
 */
export function resolveUpstreamBaseUrls(registry, ctx) {
  const resolved = {};
  for (const def of registry) {
    if (typeof def.baseUrl !== "function") continue;
    const url = def.baseUrl(ctx);
    if (typeof url === "string" && url) resolved[def.id] = url.replace(/\/+$/, "");
  }
  return resolved;
}

/**
 * 上流 base URL を子プロセスの env へ反映する。
 *
 * 別名キーも含めて **必ず先に削除してから** 設定するので、無効化した上流の URL が
 * 開発シェルの環境変数から漏れ込んで「落ちている先を叩き続ける」ことは起きない。
 * 値は各キー配列の先頭 (= 正規のキー名) にだけ入れる。
 *
 * @param {Record<string, string>} env 書き換える env オブジェクト (process.env のコピー)
 * @param {Record<string, string[]>} keysByApp アプリ id -> 環境変数キー (先頭が正規名)
 * @param {Record<string, string>} baseUrls resolveUpstreamBaseUrls() の戻り値
 * @returns {Record<string, string>} 渡した env (呼び出し側で連鎖できるように返す)
 * @implements SPEC-CURIA-UPSTREAM-ENV
 */
export function applyUpstreamEnv(env, keysByApp, baseUrls) {
  for (const [appId, keys] of Object.entries(keysByApp)) {
    for (const key of keys) delete env[key];
    const url = baseUrls[appId];
    if (url) env[keys[0]] = url;
  }
  return env;
}

/**
 * 「別のアプリが有効なときだけ立てる」機能フラグを子プロセスの env へ反映する。
 *
 * applyUpstreamEnv が「上流の接続先」を配るのに対し、こちらは **下流アプリの都合で
 * 上流側の機能を有効化する** 逆向きの配線。素の Discutere は persona-engine を既定で
 * 起動しないが、Thaleia の Di 議論軸は persona 単位の合意集計を読むので、Thaleia を
 * 使うときだけ Di 側で立てる必要がある。
 *
 * applyUpstreamEnv と同じく **必ず先に削除してから** 設定する。依存アプリが無効なら
 * env から消えるので、開発シェルに残った値でフラグが立ちっぱなしになることはない
 * (消すのは env だけなので、アプリ自身の設定ファイルでの指定はそのまま効く)。
 *
 * @param {Record<string, string>} env 書き換える env オブジェクト (process.env のコピー)
 * @param {Record<string, Record<string, string>>} flagsByApp 依存先アプリ id -> 立てる env
 * @param {Record<string, string>} baseUrls resolveUpstreamBaseUrls() の戻り値 (= 有効アプリ)
 * @returns {Record<string, string>} 渡した env (呼び出し側で連鎖できるように返す)
 * @implements SPEC-CURIA-UPSTREAM-ENV
 */
export function applyDependentFeatureEnv(env, flagsByApp, baseUrls) {
  for (const [appId, flags] of Object.entries(flagsByApp)) {
    for (const key of Object.keys(flags)) delete env[key];
    if (!baseUrls[appId]) continue;
    for (const [key, value] of Object.entries(flags)) env[key] = value;
  }
  return env;
}
