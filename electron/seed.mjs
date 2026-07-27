/**
 * Discutere 用 userData シード + アドレス解決。
 * Di 単体デスクトップ版 (apps/discutere/electron/main.mjs) と同じ手順:
 * リポ同梱の読み取りデータを初回のみコピーし、既存には触らない。
 */

import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * @param {string} repoRoot apps/discutere の絶対パス
 * @param {string} userDataDir Di の cwd にするディレクトリ (<userData>/discutere)
 */
export function seedDiscutereUserData(repoRoot, userDataDir) {
  mkdirSync(join(userDataDir, "data"), { recursive: true });
  const pairs = [
    [join(repoRoot, "data", "games"), join(userDataDir, "data", "games")],
    [join(repoRoot, "data", "affects"), join(userDataDir, "data", "affects")],
    [join(repoRoot, "worker-home"), join(userDataDir, "worker-home")],
    [join(repoRoot, "discutere.config.example.json"), join(userDataDir, "discutere.config.json")],
  ];
  for (const [from, to] of pairs) {
    if (!existsSync(to) && existsSync(from)) cpSync(from, to, { recursive: true });
  }
}

/** config ファイルから HTTP bind 先を解決する (Di src/config.ts の既定と揃える)。 */
export function resolveDiscutereAddress(configPath) {
  let port = 3110;
  let host = "127.0.0.1";
  try {
    const cfg = JSON.parse(readFileSync(configPath, "utf8"));
    if (typeof cfg?.server?.port === "number") port = cfg.server.port;
    if (typeof cfg?.server?.host === "string" && cfg.server.host) host = cfg.server.host;
  } catch {
    /* config 無し/壊れは Di 側の既定に任せる */
  }
  const displayHost = host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host;
  return { port, baseUrl: `http://${displayHost}:${port}` };
}
