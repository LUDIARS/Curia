import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { applyThaleiaExternalEnv, readCuriaSettings } from "../curia-settings.mjs";
import { applyUpstreamEnv } from "../upstream.mjs";

const PORT = Number(process.env.CURIA_THALEIA_PORT ?? 8890);

/**
 * Thaleia が上流を読む env のキー (Thaleia src/config.ts の firstEnv と同じ順)。
 * 先頭が正規キー、以降は別名。無効アプリの分は applyUpstreamEnv が全部削除する。
 */
const UPSTREAM_ENV_KEYS = {
  anatomia: ["ANATOMIA_BASE_URL", "ANATOMIA_API_URL", "ANATOMIA_URL"],
  discutere: ["DISCUTERE_BASE_URL", "DISCUTERE_URL"],
  praeforma: ["PRAEFORMA_BASE_URL", "PRAEFORMA_API_URL", "PRAEFORMA_URL"],
};

/**
 * Thaleia — 施策設計ツール (optional。curia.apps.json で切り離し可)。
 * 企画を入れると 5 軸 (UX / 実装コスト / AI 実装可否 / ドメイン解析 / Di 議論) の
 * スコアと根拠が出る評価サービス。上流は Curia が env で配線する。tsx CLI 経由で fork。
 * @type {import('../registry.mjs').AppDef}
 */
export default {
  id: "thaleia",
  name: "Thaleia",
  description: "施策設計ツール (成否リスクのスコア化) — 5 軸評価 + Di 四象限 (port 8890)",
  forkSpec(ctx) {
    const { appRoot, dataRoot } = ctx;
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
    const dataDir = join(cwd, "data");
    mkdirSync(dataDir, { recursive: true });
    // 施策と評価は userData へ書く (submodule 配下に実行時データを置かない。CLAUDE.md)。
    const env = { ...process.env, THALEIA_PORT: String(PORT), THALEIA_DATA_DIR: dataDir };
    delete env.NODE_ENV;
    // Curia が起動している上流だけを渡す (無効アプリの URL は env から消える)。
    applyUpstreamEnv(env, UPSTREAM_ENV_KEYS, ctx.upstreamBaseUrls?.() ?? {});
    // Curia の外にある上流 (Genius / Augur / Ludus) は設定タブの入力を渡す。
    applyThaleiaExternalEnv(env, readCuriaSettings(dataRoot));
    // tsx の子プロセス再 spawn 対策 (praeforma.mjs と同じ): spawnKind "node" で起動。
    return {
      spawnKind: "node",
      modulePath: tsxCli,
      args: [entry],
      options: { cwd, env },
    };
  },
  readyKind: "health",
  baseUrl: () => `http://127.0.0.1:${PORT}`,
  healthUrl: () => `http://127.0.0.1:${PORT}/health`,
  dataDir: ({ dataRoot }) => join(dataRoot, "thaleia"),
  shutdownByMessage: false,
};
