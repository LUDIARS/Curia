/**
 * アプリ定義レジストリ。`curia.apps.json` (manifest) が有効化と表示順の正本で、
 * 各アプリの定義は electron/apps/<id>.mjs に 1 ファイルずつ分離する。
 * 切り離し = manifest で enabled:false (即) / 完全除去 = submodule + 定義ファイル削除。
 * サーバコード側 (submodule) は無改変が前提 (DESIGN.md §3, §11)。
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import voluptas from "./apps/voluptas.mjs";
import discutere from "./apps/discutere.mjs";
import anatomia from "./apps/anatomia.mjs";
import praeforma from "./apps/praeforma.mjs";
import thaleia from "./apps/thaleia.mjs";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * @typedef {object} AppCtx
 * @property {string} appRoot
 * @property {string} dataRoot
 * @property {() => Record<string, string>} [upstreamBaseUrls]
 *   有効アプリの base URL (id -> URL)。main.mjs が registry から解決して渡す。
 */

/**
 * @typedef {object} AppDef
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {(ctx: AppCtx) => {modulePath: string, args: string[], options: object} | never} forkSpec
 *   fork するモジュール/引数/オプション。前提を満たさない場合は Error を投げる (カードに表示)。
 * @property {"message" | "health"} readyKind
 * @property {boolean} [healthLenient] true なら HTTP 応答があれば up 扱い (ステータス不問)
 * @property {(ctx: AppCtx) => string | null} [baseUrl] 他アプリへ渡す接続先 (末尾スラッシュ無し)。
 *   持つアプリだけが upstream.mjs の解決対象になる (= 上流として配線できる)。
 * @property {(ctx: AppCtx) => string | null} healthUrl
 * @property {(ctx: AppCtx) => string | null} dataDir
 * @property {boolean} shutdownByMessage
 */

const DEFINITIONS = new Map(
  [voluptas, discutere, anatomia, praeforma, thaleia].map((def) => [def.id, def])
);

export function loadManifest(appRoot = join(here, "..")) {
  const manifest = JSON.parse(readFileSync(join(appRoot, "curia.apps.json"), "utf8"));
  return Array.isArray(manifest?.apps) ? manifest.apps : [];
}

/** @returns {AppDef[]} manifest で enabled なアプリを表示順で返す。 */
export function buildRegistry(appRoot) {
  const registry = [];
  for (const entry of loadManifest(appRoot)) {
    if (!entry?.id || entry.enabled === false) continue;
    const def = DEFINITIONS.get(entry.id);
    if (!def) {
      console.warn(`[curia] manifest のアプリ定義がありません: ${entry.id} (electron/apps/${entry.id}.mjs)`);
      continue;
    }
    registry.push(def);
  }
  return registry;
}
