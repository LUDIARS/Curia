import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { discutereConfigPath, getSettings, saveSettings } from "../settings.mjs";
import { contract } from './contract-runtime.mjs'; /* augur-inject:import:46ac8184 */
import augurContract_6635683f from '../../contracts/discutere-model-placeholder.contract.mjs'; /* augur-inject:contract-predicate:fbb9e142 */

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

export function readDiscutereModelPlaceholder() {
  const shell = readFileSync(new URL("../../ui/shell.html", import.meta.url), "utf8");
  const field = shell.match(/<input\b[^>]*\bid="di-model"[^>]*>/u)?.[0];
  return field?.match(/\bplaceholder="([^"]*)"/u)?.[1];
}
// @ts-expect-error augur-inject
readDiscutereModelPlaceholder = contract(readDiscutereModelPlaceholder, { ...augurContract_6635683f, contractId: 'C-1', mode: 'observe', sample: 1, where: 'electron/__tests__/settings.test.mjs:24', rule: 'contract-wrap', id: '6635683f' }); /* augur-inject:contract-wrap:6635683f */

test("Discutere のモデル入力欄には役割名を例示する", () => {
  assert.equal(readDiscutereModelPlaceholder(), "haiku");
});

test("Discutere のモデル設定は空欄、役割名、明示 ID をそのまま保存する", (t) => {
  const dataRoot = withDataRoot(t);
  const context = { appRoot: "unused", dataRoot };
  const configPath = discutereConfigPath(dataRoot);
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, "{}", "utf8");

  assert.equal(getSettings(context).discutere.llmModel, "");
  for (const model of ["haiku", "provider-model-id", ""]) {
    const input = { discutere: { ...VALID_DISCUTERE, llmModel: model } };
    assert.deepEqual(saveSettings(context, input), { ok: true });
    assert.equal(JSON.parse(readFileSync(configPath, "utf8")).llm.model, model);
    assert.equal(getSettings(context).discutere.llmModel, model);
  }
});

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
