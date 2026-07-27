import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const PORT = Number(process.env.CURIA_PRAEFORMA_PORT ?? 8889);

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
  forkSpec({ appRoot, dataRoot }) {
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
  healthUrl: () => `http://127.0.0.1:${PORT}/`,
  dataDir: ({ dataRoot }) => join(dataRoot, "praeforma"),
  shutdownByMessage: false,
};
