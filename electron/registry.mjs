/**
 * アプリ定義レジストリ。各アプリの「どう起動し、どう ready を検知し、どう止めるか」を
 * 宣言的に持つ。サーバコード側 (submodule) は無改変が前提 (DESIGN.md §3)。
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { seedDiscutereUserData, resolveDiscutereAddress } from "./seed.mjs";

/**
 * @typedef {object} AppDef
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {(ctx: {appRoot: string, dataRoot: string}) => {modulePath: string, options: object} | never} forkSpec
 *   fork するモジュールとオプション。前提を満たさない場合は Error を投げる (メニューに表示)。
 * @property {"message" | "health"} readyKind
 * @property {(ctx: {appRoot: string, dataRoot: string}) => string | null} healthUrl readyKind=health のときのポーリング先
 * @property {(ctx: {appRoot: string, dataRoot: string}) => string | null} dataDir 「データフォルダを開く」先
 * @property {boolean} shutdownByMessage {type:'shutdown'} メッセージでの graceful stop に対応するか
 */

/** @returns {AppDef[]} */
export function buildRegistry() {
  return [
    {
      id: "voluptas",
      name: "Voluptas",
      description: "プレイヤーリサーチ / ペルソナ分析 (Git-backed ローカルモード)",
      forkSpec({ appRoot }) {
        const modulePath = join(
          appRoot, "apps", "voluptas", "player-profile-server", "desktop", "serverProcess.js"
        );
        if (!existsSync(modulePath)) {
          throw new Error("apps/voluptas が未セットアップです (npm run setup)");
        }
        const serverRoot = join(appRoot, "apps", "voluptas", "player-profile-server");
        if (!existsSync(join(serverRoot, "node_modules"))) {
          throw new Error("Voluptas の依存が未インストールです (npm run setup)");
        }
        return {
          modulePath,
          options: {
            cwd: join(serverRoot, "desktop"),
            stdio: ["ignore", "pipe", "pipe"],
            serviceName: "compages-voluptas",
          },
        };
      },
      // serverProcess.js が parentPort に {type:'ready', url} を投げる (動的ポート)。
      readyKind: "message",
      healthUrl: () => null,
      // ローカル設定/データリポは単体版と共有 (%LOCALAPPDATA%/Volputas)。DESIGN.md §5。
      dataDir: () =>
        process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Volputas") : null,
      shutdownByMessage: true,
    },
    {
      id: "discutere",
      name: "Discutere",
      description: "遊びの議論プラットフォーム (/flow チャット議論・学習ビュー)",
      forkSpec({ appRoot, dataRoot }) {
        const modulePath = join(appRoot, "apps", "discutere", "dist", "index.js");
        if (!existsSync(modulePath)) {
          throw new Error("apps/discutere が未ビルドです (npm run setup)");
        }
        const cwd = join(dataRoot, "discutere");
        seedDiscutereUserData(join(appRoot, "apps", "discutere"), cwd);
        const configPath = join(cwd, "discutere.config.json");
        return {
          modulePath,
          options: {
            cwd,
            env: { ...process.env, DISCUTERE_CONFIG: configPath },
            stdio: ["ignore", "pipe", "pipe"],
            serviceName: "compages-discutere",
          },
        };
      },
      readyKind: "health",
      healthUrl({ dataRoot }) {
        const { baseUrl } = resolveDiscutereAddress(
          join(dataRoot, "discutere", "discutere.config.json")
        );
        return `${baseUrl}/health`;
      },
      dataDir: ({ dataRoot }) => join(dataRoot, "discutere"),
      shutdownByMessage: false,
    },
  ];
}
