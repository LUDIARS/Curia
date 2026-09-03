/**
 * Curia 自身の設定ストア (<userData>/curia.settings.json)。
 *
 * Curia が起動しない上流 (Genius / Augur / Ludus リポ) の接続先だけを持つ。
 * Discutere の設定は Di の config JSON が正本なのでここには載せない (settings.mjs)。
 * 値は env として子プロセスへ渡す性質なので、Di config に相乗りさせず独立させている。
 * 未入力は空文字のまま保持し、env にも積まない (ダミー値を作らない)。
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** 設定画面が扱う Thaleia セクションのキーと既定値。 */
const THALEIA_DEFAULTS = {
  geniusBaseUrl: "",
  augurBin: "",
  ludusRepoDir: "",
};

const THALEIA_EXTERNAL_ENV_KEYS = ["GENIUS_BASE_URL", "AUGUR_BIN", "LUDUS_REPO_DIR"];

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function curiaSettingsPath(dataRoot) {
  return join(dataRoot, "curia.settings.json");
}

function readRaw(dataRoot) {
  const path = curiaSettingsPath(dataRoot);
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return isRecord(parsed) ? parsed : {};
  } catch {
    // 壊れた設定で起動不能にしない (既定に落として設定画面から上書きさせる)。
    return {};
  }
}

/** 既知キーだけを既定値で埋めて返す。未知キーは呼び出し側に見せない。 */
/**
 * @implements SPEC-CURIA-SETTINGS-STORE
 */
export function readCuriaSettings(dataRoot) {
  const raw = readRaw(dataRoot);
  const thaleia = isRecord(raw.thaleia) ? raw.thaleia : {};
  return {
    thaleia: Object.fromEntries(
      Object.entries(THALEIA_DEFAULTS).map(([key, fallback]) => [
        key,
        typeof thaleia[key] === "string" ? thaleia[key].trim() : fallback,
      ])
    ),
  };
}

/**
 * セクション単位の保存。既存 JSON の未知キー ($comment 等) は保持する。
 * @param {string} dataRoot
 * @param {{thaleia?: Record<string, string>}} patch
 * @implements SPEC-CURIA-SETTINGS-STORE
 */
export function writeCuriaSettings(dataRoot, patch) {
  const raw = readRaw(dataRoot);
  if (patch?.thaleia) {
    raw.thaleia = { ...(isRecord(raw.thaleia) ? raw.thaleia : {}) };
    for (const key of Object.keys(THALEIA_DEFAULTS)) {
      if (key in patch.thaleia) raw.thaleia[key] = String(patch.thaleia[key] ?? "").trim();
    }
  }
  writeFileSync(curiaSettingsPath(dataRoot), `${JSON.stringify(raw, null, 2)}\n`, "utf8");
}

/**
 * Thaleia へ渡す「Curia の外にある上流」の env を反映する。
 * 継承元に残った値を必ず消してから、設定された値だけを積む。
 * 空欄なら Thaleia 側でその軸が missing に落ちる (= 設計どおり)。
 * @param {Record<string, string | undefined>} env process.env のコピー
 * @param {ReturnType<typeof readCuriaSettings>} settings
 * @returns {Record<string, string | undefined>}
 * @implements SPEC-CURIA-SETTINGS-STORE
 */
export function applyThaleiaExternalEnv(env, settings) {
  for (const key of THALEIA_EXTERNAL_ENV_KEYS) delete env[key];
  const { geniusBaseUrl, augurBin, ludusRepoDir } = settings.thaleia;
  if (geniusBaseUrl) env.GENIUS_BASE_URL = geniusBaseUrl.replace(/\/+$/, "");
  if (augurBin) env.AUGUR_BIN = augurBin;
  if (ludusRepoDir) env.LUDUS_REPO_DIR = ludusRepoDir;
  return env;
}
