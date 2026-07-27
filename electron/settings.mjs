/**
 * 設定画面のバックエンド — Discutere config (userData/discutere/discutere.config.json) の
 * 読み書き。書き込みは既存 JSON への深いマージで、$comment 等の未知キーは保持する。
 * 反映はサービス再起動 (Di は起動時に config を読む)。
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { seedDiscutereUserData } from "./seed.mjs";

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

/**
 * 設定画面からの保存。input は getSettings().discutere と同じ形。
 * @returns {{ok: boolean, error?: string}}
 */
export function saveSettings({ appRoot, dataRoot }, input) {
  const d = input?.discutere;
  if (!d || typeof d !== "object") return { ok: false, error: "入力が不正です" };
  if (!VALID_BACKENDS.has(d.llmBackend)) {
    return { ok: false, error: `LLM backend が不正です: ${d.llmBackend}` };
  }
  const port = Number(d.serverPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { ok: false, error: "ポート番号が不正です" };
  }
  const cfg = readConfig(appRoot, dataRoot);
  deepMerge(cfg, {
    llm: {
      backend: d.llmBackend,
      model: String(d.llmModel ?? ""),
      local: {
        baseUrl: String(d.localBaseUrl ?? ""),
        model: String(d.localModel ?? ""),
      },
    },
    discord: { botToken: String(d.discordBotToken ?? "") },
    server: { port },
  });
  writeFileSync(discutereConfigPath(dataRoot), `${JSON.stringify(cfg, null, 2)}\n`, "utf8");
  return { ok: true };
}
