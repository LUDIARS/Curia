/**
 * upstream.mjs の純粋ロジック。
 * 「無効なアプリの接続先は誰にも渡らない」ことが Curia の切り離し可能性 (DESIGN.md §11)
 * の要なので、そこを回帰で押さえる。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveUpstreamBaseUrls, applyUpstreamEnv, applyDependentFeatureEnv } from "../upstream.mjs";

const CTX = { appRoot: "E:/app", dataRoot: "E:/data" };

const anatomia = { id: "anatomia", baseUrl: () => "http://127.0.0.1:4200" };
const praeforma = { id: "praeforma", baseUrl: () => "http://127.0.0.1:8889/" };
const discutere = { id: "discutere", baseUrl: (ctx) => `http://127.0.0.1:3110#${ctx.dataRoot}` };
const voluptas = { id: "voluptas" }; // baseUrl を持たない (動的ポート)

test("registry にあるアプリだけを解決し、末尾スラッシュを落とす", () => {
  const resolved = resolveUpstreamBaseUrls([anatomia, praeforma, voluptas], CTX);
  assert.deepEqual(resolved, {
    anatomia: "http://127.0.0.1:4200",
    praeforma: "http://127.0.0.1:8889",
  });
});

test("baseUrl には ctx が渡る", () => {
  const resolved = resolveUpstreamBaseUrls([discutere], CTX);
  assert.equal(resolved.discutere, "http://127.0.0.1:3110#E:/data");
});

test("registry から外れたアプリは解決結果に出ない", () => {
  // curia.apps.json で enabled:false にすると buildRegistry がそのアプリを返さない。
  const resolved = resolveUpstreamBaseUrls([praeforma], CTX);
  assert.deepEqual(Object.keys(resolved), ["praeforma"]);
});

test("解決できた上流は正規キーにだけ入る", () => {
  const env = {};
  applyUpstreamEnv(
    env,
    { anatomia: ["ANATOMIA_BASE_URL", "ANATOMIA_API_URL", "ANATOMIA_URL"] },
    { anatomia: "http://127.0.0.1:4200" }
  );
  assert.deepEqual(env, { ANATOMIA_BASE_URL: "http://127.0.0.1:4200" });
});

test("無効な上流のキーは別名も含めて env から消える", () => {
  // 開発シェルに残った環境変数が漏れて「落ちている先」を叩き続けるのを防ぐ。
  const env = {
    ANATOMIA_BASE_URL: "http://stale:4200",
    ANATOMIA_API_URL: "http://stale:4200",
    ANATOMIA_URL: "http://stale:4200",
    THALEIA_PORT: "8890",
  };
  applyUpstreamEnv(env, { anatomia: ["ANATOMIA_BASE_URL", "ANATOMIA_API_URL", "ANATOMIA_URL"] }, {});
  assert.deepEqual(env, { THALEIA_PORT: "8890" });
});

test("有効な上流でも別名キーは残さない", () => {
  const env = { PRAEFORMA_URL: "http://stale:8889" };
  applyUpstreamEnv(
    env,
    { praeforma: ["PRAEFORMA_BASE_URL", "PRAEFORMA_API_URL", "PRAEFORMA_URL"] },
    { praeforma: "http://127.0.0.1:8889" }
  );
  assert.deepEqual(env, { PRAEFORMA_BASE_URL: "http://127.0.0.1:8889" });
});

const PERSONA_ENGINE = { thaleia: { DISCUTERE_PERSONA_ENGINE_ENABLED: "1" } };

test("依存アプリが有効なら機能フラグを立てる", () => {
  // Thaleia の Di 議論軸は persona 単位の合意集計を読むので、Di 側で persona-engine が要る。
  const env = { DISCUTERE_CONFIG: "E:/data/discutere/discutere.config.json" };
  applyDependentFeatureEnv(env, PERSONA_ENGINE, { thaleia: "http://127.0.0.1:8890" });
  assert.deepEqual(env, {
    DISCUTERE_CONFIG: "E:/data/discutere/discutere.config.json",
    DISCUTERE_PERSONA_ENGINE_ENABLED: "1",
  });
});

test("依存アプリが無効なら機能フラグは env から消える", () => {
  // curia.apps.json で thaleia を enabled:false にすると registry から外れ、
  // 開発シェルに残った値でフラグが立ちっぱなしになることもない。
  const env = { DISCUTERE_PERSONA_ENGINE_ENABLED: "1", DISCUTERE_CONFIG: "E:/data/c.json" };
  applyDependentFeatureEnv(env, PERSONA_ENGINE, {});
  assert.deepEqual(env, { DISCUTERE_CONFIG: "E:/data/c.json" });
});

test("機能フラグの削除は env だけで、他のキーには触らない", () => {
  // env から消えても Di 自身の設定ファイル (personaEngine.enabled) の指定は生きる。
  const env = { PERSONA_ENGINE_TICK_MS: "5000" };
  applyDependentFeatureEnv(env, PERSONA_ENGINE, {});
  assert.deepEqual(env, { PERSONA_ENGINE_TICK_MS: "5000" });
});
