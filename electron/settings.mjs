/**
 * 設定画面のバックエンド — セクションごとに正本の置き場所へ振り分ける。
 *   discutere: Di config (userData/discutere/discutere.config.json) を深いマージで更新
 *   thaleia:   Curia 自身の設定ストア (curia-settings.mjs)。env として子へ渡す値だけ
 * どちらも $comment 等の未知キーは保持する。反映はサービス再起動。
 */

import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { seedDiscutereUserData } from "./seed.mjs";
import { curiaSettingsPath, readCuriaSettings, writeCuriaSettings } from "./curia-settings.mjs";

export function discutereConfigPath(dataRoot) {
  return join(dataRoot, "discutere", "discutere.config.json");
}

function readConfig(appRoot, dataRoot) {
  const path = discutereConfigPath(dataRoot);
  if (!existsSync(path)) {
    // 初回起動前でも設定画面を開けるよう、シードをここでも保証する。
    seedDiscutereUserData(join(appRoot, "apps", "discutere"), join(dataRoot, "discutere"));
  }
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}

/** 設定画面が扱うキーだけを抜き出して返す (フル config は返さない)。 */
export function getSettings({ appRoot, dataRoot }) {
  const cfg = readConfig(appRoot, dataRoot);
  const curia = readCuriaSettings(dataRoot);
  return {
    discutere: {
      configPath: discutereConfigPath(dataRoot),
      llmBackend: cfg?.llm?.backend ?? "anthropic",
      llmModel: cfg?.llm?.model ?? "",
      localBaseUrl: cfg?.llm?.local?.baseUrl ?? "",
      localModel: cfg?.llm?.local?.model ?? "",
      discordBotToken: cfg?.discord?.botToken ?? "",
      serverPort: cfg?.server?.port ?? 3110,
    },
    thaleia: {
      configPath: curiaSettingsPath(dataRoot),
      ...curia.thaleia,
    },
  };
}

function deepMerge(target, patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      if (!target[key] || typeof target[key] !== "object") target[key] = {};
      deepMerge(target[key], value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

const VALID_BACKENDS = new Set(["anthropic", "claude-cli", "local", "worker-pool", "mock"]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isHttpBaseUrl(value) {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

function pathMatches(value, kind) {
  // 検証時 (Curia) と利用時 (Thaleia) は cwd が異なるため、相対パスを保存すると
  // 検証だけ成功して実行時に別の場所を参照してしまう。
  if (!isAbsolute(value)) return false;
  try {
    const stats = statSync(value);
    return kind === "file" ? stats.isFile() : stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * 設定画面からの保存。input は getSettings() と同じ形で、含まれるセクションだけ保存する。
 * @returns {{ok: boolean, error?: string}}
 * @implements SPEC-CURIA-SETTINGS-SECTIONS
 */
export function saveSettings({ appRoot, dataRoot }, input) {
  if (!isRecord(input)) return { ok: false, error: "入力が不正です" };
  const hasDiscutere = Object.hasOwn(input, "discutere");
  const hasThaleia = Object.hasOwn(input, "thaleia");
  if (!hasDiscutere && !hasThaleia) return { ok: false, error: "入力が不正です" };

  const discutere = hasDiscutere ? validateDiscutereSection(input.discutere) : null;
  if (discutere && !discutere.ok) return discutere;
  const thaleia = hasThaleia ? validateThaleiaSection(input.thaleia) : null;
  if (thaleia && !thaleia.ok) return thaleia;

  // 全セクションの検証後に書き始め、不正な後続セクションによる部分保存を防ぐ。
  if (discutere) {
    saveDiscutereSection({ appRoot, dataRoot }, discutere.value);
  }
  if (thaleia) {
    saveThaleiaSection({ dataRoot }, thaleia.value);
  }
  return { ok: true };
}

function validateDiscutereSection(d) {
  if (!isRecord(d)) return { ok: false, error: "入力が不正です" };
  if (!VALID_BACKENDS.has(d.llmBackend)) {
    return { ok: false, error: `LLM backend が不正です: ${d.llmBackend}` };
  }
  const port = Number(d.serverPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { ok: false, error: "ポート番号が不正です" };
  }
  return {
    ok: true,
    value: {
      llmBackend: d.llmBackend,
      llmModel: String(d.llmModel ?? ""),
      localBaseUrl: String(d.localBaseUrl ?? ""),
      localModel: String(d.localModel ?? ""),
      discordBotToken: String(d.discordBotToken ?? ""),
      serverPort: port,
    },
  };
}

/**
 * @implements SPEC-CURIA-SETTINGS-SECTIONS
 */
function saveDiscutereSection({ appRoot, dataRoot }, d) {
  const cfg = readConfig(appRoot, dataRoot);
  deepMerge(cfg, {
    llm: {
      backend: d.llmBackend,
      model: d.llmModel,
      local: {
        baseUrl: d.localBaseUrl,
        model: d.localModel,
      },
    },
    discord: { botToken: d.discordBotToken },
    server: { port: d.serverPort },
  });
  writeFileSync(discutereConfigPath(dataRoot), `${JSON.stringify(cfg, null, 2)}\n`, "utf8");
}

/**
 * Thaleia が使う「Curia の外にある上流」(Genius / Augur / Ludus)。
 * Anatomia / Praeforma / Discutere は Curia が自動で配線するのでここには出さない。
 * 空欄は未使用 = その軸は評価で missing に落ちる (ダミー値を作らない)。
 * 入力ミスを黙って無視しないよう、URL 形式とパス種別を検証する。
 * @implements SPEC-CURIA-SETTINGS-SECTIONS
 */
function validateThaleiaSection(t) {
  if (!isRecord(t)) return { ok: false, error: "入力が不正です" };
  const geniusBaseUrl = String(t.geniusBaseUrl ?? "").trim();
  const augurBin = String(t.augurBin ?? "").trim();
  const ludusRepoDir = String(t.ludusRepoDir ?? "").trim();
  if (geniusBaseUrl && !isHttpBaseUrl(geniusBaseUrl)) {
    return { ok: false, error: "Genius base URL が不正です" };
  }
  if (augurBin && !pathMatches(augurBin, "file")) {
    return { ok: false, error: `Augur CLI が見つかりません: ${augurBin}` };
  }
  if (ludusRepoDir && !pathMatches(ludusRepoDir, "directory")) {
    return { ok: false, error: `Ludus リポジトリが見つかりません: ${ludusRepoDir}` };
  }
  return { ok: true, value: { geniusBaseUrl, augurBin, ludusRepoDir } };
}

function saveThaleiaSection({ dataRoot }, settings) {
  writeCuriaSettings(dataRoot, { thaleia: settings });
}
