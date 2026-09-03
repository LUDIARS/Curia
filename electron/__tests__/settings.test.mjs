import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { discutereConfigPath, saveSettings } from "../settings.mjs";

function withDataRoot(t) {
  const dataRoot = mkdtempSync(join(tmpdir(), "curia-settings-sections-"));
  t.after(() => rmSync(dataRoot, { recursive: true, force: true }));
  return dataRoot;
}

const VALID_DISCUTERE = {
  llmBackend: "anthropic",
  llmModel: "",
  localBaseUrl: "",
  localModel: "",
  discordBotToken: "",
  serverPort: 3110,
};

test("後続セクションが不正なら先行セクションも保存しない", (t) => {
  const dataRoot = withDataRoot(t);
  const configPath = discutereConfigPath(dataRoot);
  mkdirSync(join(dataRoot, "discutere"), { recursive: true });
  const original = `${JSON.stringify({ llm: { backend: "mock" }, server: { port: 3110 } }, null, 2)}\n`;
  writeFileSync(configPath, original, "utf8");

  const result = saveSettings(
    { appRoot: "unused", dataRoot },
    {
      discutere: VALID_DISCUTERE,
      thaleia: { geniusBaseUrl: "http://user:secret@localhost", augurBin: "", ludusRepoDir: "" },
    }
  );

  assert.equal(result.ok, false);
  assert.equal(readFileSync(configPath, "utf8"), original);
});

test("Augur はファイル、Ludus はディレクトリだけを受け付ける", (t) => {
  const dataRoot = withDataRoot(t);
  const filePath = join(dataRoot, "not-a-directory");
  writeFileSync(filePath, "", "utf8");

  const augurResult = saveSettings(
    { appRoot: "unused", dataRoot },
    { thaleia: { geniusBaseUrl: "", augurBin: dataRoot, ludusRepoDir: "" } }
  );
  const ludusResult = saveSettings(
    { appRoot: "unused", dataRoot },
    { thaleia: { geniusBaseUrl: "", augurBin: "", ludusRepoDir: filePath } }
  );

  assert.equal(augurResult.ok, false);
  assert.equal(ludusResult.ok, false);
});

test("実行時の cwd で参照先が変わる相対パスは受け付けない", (t) => {
  const dataRoot = withDataRoot(t);
  const testFilePath = fileURLToPath(import.meta.url);
  const testDirectory = dirname(testFilePath);

  const augurResult = saveSettings(
    { appRoot: "unused", dataRoot },
    {
      thaleia: {
        geniusBaseUrl: "",
        augurBin: relative(process.cwd(), testFilePath),
        ludusRepoDir: "",
      },
    }
  );
  const ludusResult = saveSettings(
    { appRoot: "unused", dataRoot },
    {
      thaleia: {
        geniusBaseUrl: "",
        augurBin: "",
        ludusRepoDir: relative(process.cwd(), testDirectory),
      },
    }
  );

  assert.equal(augurResult.ok, false);
  assert.equal(ludusResult.ok, false);
});
