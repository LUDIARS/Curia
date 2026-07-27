import { existsSync } from "node:fs";
import { join } from "node:path";

/** @type {import('../registry.mjs').AppDef} */
export default {
  id: "voluptas",
  name: "Voluptas",
  description: "プレイヤーリサーチ / ペルソナ分析 (Git-backed ローカルモード)",
  forkSpec({ appRoot }) {
    const modulePath = join(
      appRoot, "apps", "voluptas", "player-profile-server", "desktop", "serverProcess.js"
    );
    if (!existsSync(modulePath)) {
      throw new Error(
        "Voluptas のローカルモードエントリがまだ main に入っていません "
        + "(feat/dual-mode-persona-ui のマージ待ち。DESIGN.md §10 T9b)"
      );
    }
    const serverRoot = join(appRoot, "apps", "voluptas", "player-profile-server");
    if (!existsSync(join(serverRoot, "node_modules"))) {
      throw new Error("Voluptas の依存が未インストールです (npm run setup)");
    }
    return {
      modulePath,
      args: [],
      options: {
        cwd: join(serverRoot, "desktop"),
        stdio: ["ignore", "pipe", "pipe"],
        serviceName: "curia-voluptas",
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
};
