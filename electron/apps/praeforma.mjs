import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { applyUpstreamEnv } from "../upstream.mjs";

const PORT = Number(process.env.CURIA_PRAEFORMA_PORT ?? 8889);

/** Praeforma Studio が関連処理グラフ (Anatomia /api/graph) を引くための env。 */
const UPSTREAM_ENV_KEYS = { anatomia: ["PRAEFORMA_ANATOMIA_URL"] };

/**
 * Praeforma — 仕様書↔実装連携 (optional。curia.apps.json で切り離し可)。
 * ローカルモード (server/src/local.ts: SQLite + Cernere 不要 + 固定ローカルユーザ) を
 * tsx CLI 経由で fork。better-sqlite3 は setup で Electron ABI に rebuild される。
 * @type {import('../registry.mjs').AppDef}
 */
export default {
  id: "praeforma",
  name: "Praeforma",
  description: "仕様書↔実装連携 — placeholder/仕様レビュー (ローカルモード, port 8889)",
  forkSpec(ctx) {
    const { appRoot, dataRoot } = ctx;
    const repoRoot = join(appRoot, "apps", "praeforma");
    const tsxCli = join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
    const entry = join(repoRoot, "server", "src", "local.ts");
    if (!existsSync(entry)) {
      throw new Error("apps/praeforma が未チェックアウトです (npm run setup)");
    }
    if (!existsSync(tsxCli)) {
      throw new Error("Praeforma の依存が未インストールです (npm run setup)");
    }
    const cwd = join(dataRoot, "praeforma");
    mkdirSync(cwd, { recursive: true });
    const env = { ...process.env, PRAEFORMA_PORT: String(PORT) };
    delete env.NODE_ENV;
    // Anatomia が有効なときだけ Studio の関連処理グラフを配線する (無効なら env ごと消す)。
    applyUpstreamEnv(env, UPSTREAM_ENV_KEYS, ctx.upstreamBaseUrls?.() ?? {});
    // tsx はさらに子プロセスを spawn するため utilityProcess では動かない
    // → spawnKind "node" (ELECTRON_RUN_AS_NODE の純 Node 子プロセス) で起動する。
    return {
      spawnKind: "node",
      modulePath: tsxCli,
      args: [entry],
      options: { cwd, env },
    };
  },
  readyKind: "health",
  healthLenient: true,
  // 上流として他アプリへ渡す接続先 (ポート既定値の正本はこのファイル)。
  baseUrl: () => `http://127.0.0.1:${PORT}`,
  healthUrl: () => `http://127.0.0.1:${PORT}/`,
  dataDir: ({ dataRoot }) => join(dataRoot, "praeforma"),
  shutdownByMessage: false,
};
