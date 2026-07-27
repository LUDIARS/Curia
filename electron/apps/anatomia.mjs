import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const PORT = Number(process.env.CURIA_ANATOMIA_PORT ?? 4200);

/**
 * Anatomia — 建築規約オラクル (optional。curia.apps.json で切り離し可)。
 * `bin/anatomia.mjs web` (dist 必須) を fork。kuzu は N-API なので rebuild 不要。
 * @type {import('../registry.mjs').AppDef}
 */
export default {
  id: "anatomia",
  name: "Anatomia",
  description: "建築規約オラクル — DAG/KG 解析・supply→verify (port 4200)",
  forkSpec({ appRoot, dataRoot }) {
    const repoRoot = join(appRoot, "apps", "anatomia");
    const modulePath = join(repoRoot, "bin", "anatomia.mjs");
    if (!existsSync(modulePath)) {
      throw new Error("apps/anatomia が未チェックアウトです (npm run setup)");
    }
    if (!existsSync(join(repoRoot, "dist", "adapters", "cli.js"))) {
      throw new Error("apps/anatomia が未ビルドです (npm run setup)");
    }
    const cwd = join(dataRoot, "anatomia");
    mkdirSync(cwd, { recursive: true });
    return {
      modulePath,
      args: ["web"],
      options: {
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
        serviceName: "curia-anatomia",
      },
    };
  },
  readyKind: "health",
  healthLenient: true, // 応答さえあれば up (専用 /health を仮定しない)
  healthUrl: () => `http://127.0.0.1:${PORT}/`,
  dataDir: ({ dataRoot }) => join(dataRoot, "anatomia"),
  shutdownByMessage: false,
};
