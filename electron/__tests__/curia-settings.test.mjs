/**
 * curia-settings.mjs — Curia 自身の設定ストア。
 * 「未入力ならその軸は missing に落ちる」= ダミー値を env に作らない、を回帰で押さえる。
 */

import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyThaleiaExternalEnv,
  curiaSettingsPath,
  readCuriaSettings,
  writeCuriaSettings,
} from "../curia-settings.mjs";

const dataRoots = [];
const newDataRoot = () => {
  const dataRoot = mkdtempSync(join(tmpdir(), "curia-settings-"));
  dataRoots.push(dataRoot);
  return dataRoot;
};
after(() => {
  for (const dataRoot of dataRoots) rmSync(dataRoot, { recursive: true, force: true });
});

test("設定ファイルが無ければ既定 (全部空) を返す", () => {
  assert.deepEqual(readCuriaSettings(newDataRoot()), {
    thaleia: { geniusBaseUrl: "", augurBin: "", ludusRepoDir: "" },
  });
});

test("壊れた JSON でも既定に落ちて起動を止めない", () => {
  const dataRoot = newDataRoot();
  writeFileSync(curiaSettingsPath(dataRoot), "{ not json", "utf8");
  assert.equal(readCuriaSettings(dataRoot).thaleia.augurBin, "");
});

test("配列の JSON は設定オブジェクトとして扱わない", () => {
  const dataRoot = newDataRoot();
  writeFileSync(curiaSettingsPath(dataRoot), "[]", "utf8");
  writeCuriaSettings(dataRoot, { thaleia: { geniusBaseUrl: "http://127.0.0.1:4230" } });
  assert.equal(readCuriaSettings(dataRoot).thaleia.geniusBaseUrl, "http://127.0.0.1:4230");
});

test("保存は既知キーだけを書き、未知キーは保持する", () => {
  const dataRoot = newDataRoot();
  writeFileSync(
    curiaSettingsPath(dataRoot),
    JSON.stringify({ $comment: "手書きメモ", thaleia: { ludusRepoDir: "E:/Ludus" } }),
    "utf8"
  );
  writeCuriaSettings(dataRoot, { thaleia: { geniusBaseUrl: " http://127.0.0.1:4230 " } });
  const saved = JSON.parse(readFileSync(curiaSettingsPath(dataRoot), "utf8"));
  assert.equal(saved.$comment, "手書きメモ");
  assert.equal(saved.thaleia.ludusRepoDir, "E:/Ludus");
  assert.equal(saved.thaleia.geniusBaseUrl, "http://127.0.0.1:4230");
});

test("空欄の上流は env に積まない (Thaleia 側で missing になる)", () => {
  const env = {
    GENIUS_BASE_URL: "http://stale:4230",
    AUGUR_BIN: "E:/stale/augur.mjs",
    LUDUS_REPO_DIR: "E:/stale/Ludus",
    THALEIA_PORT: "8890",
  };
  applyThaleiaExternalEnv(env, {
    thaleia: { geniusBaseUrl: "", augurBin: "", ludusRepoDir: "" },
  });
  assert.deepEqual(env, { THALEIA_PORT: "8890" });
});

test("入力された上流だけを env にする", () => {
  const env = { AUGUR_BIN: "E:/stale/augur.mjs" };
  applyThaleiaExternalEnv(env, {
    thaleia: {
      geniusBaseUrl: "http://127.0.0.1:4230/",
      augurBin: "E:/Augur/bin/augur.mjs",
      ludusRepoDir: "",
    },
  });
  assert.deepEqual(env, {
    GENIUS_BASE_URL: "http://127.0.0.1:4230",
    AUGUR_BIN: "E:/Augur/bin/augur.mjs",
  });
});
