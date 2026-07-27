import { existsSync } from "node:fs";
import { join } from "node:path";
import { seedDiscutereUserData, resolveDiscutereAddress } from "../seed.mjs";

/** @type {import('../registry.mjs').AppDef} */
export default {
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
    // NODE_ENV は継承しない: 開発シェルの NODE_ENV=production が漏れると
    // Di の production 起動ガード (botToken 必須) が誤発動する。デスクトップ起動では未設定が正。
    const env = { ...process.env, DISCUTERE_CONFIG: configPath };
    delete env.NODE_ENV;
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
  healthUrl({ dataRoot }) {
    const { baseUrl } = resolveDiscutereAddress(
      join(dataRoot, "discutere", "discutere.config.json")
    );
    return `${baseUrl}/health`;
  },
  dataDir: ({ dataRoot }) => join(dataRoot, "discutere"),
  shutdownByMessage: false,
};
