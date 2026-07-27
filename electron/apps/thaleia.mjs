import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const PORT = Number(process.env.CURIA_THALEIA_PORT ?? 8890);

/**
 * Thaleia — 企画↔実装トレーサビリティ (optional。curia.apps.json で切り離し可)。
 * Praeforma と Anatomia の間に立つ突合サービス。tsx CLI 経由で fork。
 * @type {import('../registry.mjs').AppDef}
 */
export default {
  id: "thaleia",
  name: "Thaleia",
  description: "企画↔実装トレーサビリティ — Praeforma×Anatomia 突合 (port 8890)",
  forkSpec({ appRoot, dataRoot }) {
    const repoRoot = join(appRoot, "apps", "thaleia");
    const tsxCli = join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
    const entry = join(repoRoot, "src", "index.ts");
    if (!existsSync(entry)) {
      throw new Error("apps/thaleia が未チェックアウトです (npm run setup)");
    }
    if (!existsSync(tsxCli)) {
      throw new Error("Thaleia の依存が未インストールです (npm run setup)");
    }
    const cwd = join(dataRoot, "thaleia");
    mkdirSync(cwd, { recursive: true });
    const env = { ...process.env, THALEIA_PORT: String(PORT) };
    delete env.NODE_ENV;
    // tsx の子プロセス再 spawn 対策 (praeforma.mjs と同じ): spawnKind "node" で起動。
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
  dataDir: ({ dataRoot }) => join(dataRoot, "thaleia"),
  shutdownByMessage: false,
};
