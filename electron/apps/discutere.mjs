import { existsSync } from "node:fs";
import { join } from "node:path";
import { seedDiscutereUserData, resolveDiscutereAddress } from "../seed.mjs";
import { applyDependentFeatureEnv } from "../upstream.mjs";

/**
 * 下流アプリが有効なときだけ Di 側で立てる機能。
 * Thaleia (施策設計ツール) の Di 議論軸は persona 単位の合意集計 API
 * (`GET /admin/consensus/:gapId/personas`) を読むが、Di は persona-engine を
 * 既定で起動しない (新フロー集約のため。`src/index.ts` の起動ログ参照)。
 * Thaleia を有効にしている間だけ Curia が立てて、四象限が空にならないようにする。
 */
const DEPENDENT_FEATURE_ENV = {
  thaleia: { DISCUTERE_PERSONA_ENGINE_ENABLED: "1" },
};

/** @type {import('../registry.mjs').AppDef} */
export default {
  id: "discutere",
  name: "Discutere",
  description: "遊びの議論プラットフォーム (/flow チャット議論・学習ビュー)",
  forkSpec(ctx) {
    const { appRoot, dataRoot } = ctx;
    const modulePath = join(appRoot, "apps", "discutere", "dist", "index.js");
    if (!existsSync(modulePath)) {
      throw new Error("apps/discutere が未ビルドです (npm run setup)");
    }
    const cwd = join(dataRoot, "discutere");
    seedDiscutereUserData(join(appRoot, "apps", "discutere"), cwd);
    const configPath = join(cwd, "discutere.config.json");
    // NODE_ENV は継承しない: 開発シェルの NODE_ENV=production が漏れると
    // Di の production 起動ガード (botToken 必須) が誤発動する。デスクトップ起動では未設定が正。
    const env = { ...process.env, DISCUTERE_CONFIG: configPath };
    delete env.NODE_ENV;
    // Thaleia が有効なときだけ persona-engine を立てる (無効なら env ごと消す)。
    applyDependentFeatureEnv(env, DEPENDENT_FEATURE_ENV, ctx.upstreamBaseUrls?.() ?? {});
    return {
      modulePath,
      args: [],
      options: {
        cwd,
        env,
        stdio: ["ignore", "pipe", "pipe"],
        serviceName: "curia-discutere",
      },
    };
  },
  readyKind: "health",
  // 上流として他アプリへ渡す接続先 (ポートの正本は Di の config JSON)。
  baseUrl: ({ dataRoot }) =>
    resolveDiscutereAddress(join(dataRoot, "discutere", "discutere.config.json")).baseUrl,
  healthUrl(ctx) {
    return `${this.baseUrl(ctx)}/health`;
  },
  dataDir: ({ dataRoot }) => join(dataRoot, "discutere"),
  shutdownByMessage: false,
};
