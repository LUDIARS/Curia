/**
 * 設定タブのフロントエンド。
 *
 * セクション (Discutere / Thaleia) ごとに入力を集め、保存先の振り分けはメイン側
 * (electron/settings.mjs) に任せる。ここは DOM の読み書きだけを持つ。
 * shell.html から classic script として読み込むので、公開するのは loadSettings だけ。
 */

const $ = (id) => document.getElementById(id);

function syncLocalFields() {
  $("di-local-fields").style.display = $("di-backend").value === "local" ? "" : "none";
}
$("di-backend").addEventListener("change", syncLocalFields);

async function loadSettings() {
  const s = await curia.getSettings();
  $("di-config-path").textContent = s.discutere.configPath;
  $("di-backend").value = s.discutere.llmBackend;
  $("di-model").value = s.discutere.llmModel;
  $("di-local-url").value = s.discutere.localBaseUrl;
  $("di-local-model").value = s.discutere.localModel;
  $("di-token").value = s.discutere.discordBotToken;
  $("di-port").value = s.discutere.serverPort;
  $("di-status").textContent = "";
  $("th-config-path").textContent = s.thaleia.configPath;
  $("th-genius").value = s.thaleia.geniusBaseUrl;
  $("th-augur").value = s.thaleia.augurBin;
  $("th-ludus").value = s.thaleia.ludusRepoDir;
  $("th-status").textContent = "";
  syncLocalFields();
}

/**
 * セクション 1 つ分の保存 + 任意で該当サービス再起動 (Di / Th で流儀を揃える)。
 * @implements SPEC-CURIA-SETTINGS-SECTIONS
 */
async function saveSection(appId, appName, statusId, buildInput, restart) {
  const status = $(statusId);
  status.textContent = "保存中…";
  try {
    const result = await curia.saveSettings(buildInput());
    if (!result.ok) {
      status.textContent = `保存失敗: ${result.error}`;
      return;
    }
    if (!restart) {
      status.textContent = "保存しました (反映は再起動後)";
      return;
    }

    status.textContent = `保存しました — ${appName} を再起動中…`;
    const restartResult = await curia.restart(appId);
    status.textContent = restartResult.ok
      ? "保存して再起動しました"
      : `保存しましたが再起動に失敗しました: ${restartResult.error}`;
  } catch {
    // IPC 自体が失敗した場合も未処理 Promise にせず、保存結果が不明なことを明示する。
    status.textContent = "処理に失敗しました。保存内容とアプリの状態を確認してください";
  }
}

const discutereInput = () => ({
  discutere: {
    llmBackend: $("di-backend").value,
    llmModel: $("di-model").value.trim(),
    localBaseUrl: $("di-local-url").value.trim(),
    localModel: $("di-local-model").value.trim(),
    discordBotToken: $("di-token").value.trim(),
    serverPort: Number($("di-port").value),
  },
});
const thaleiaInput = () => ({
  thaleia: {
    geniusBaseUrl: $("th-genius").value.trim(),
    augurBin: $("th-augur").value.trim(),
    ludusRepoDir: $("th-ludus").value.trim(),
  },
});

$("di-save").addEventListener("click", () =>
  void saveSection("discutere", "Discutere", "di-status", discutereInput, false));
$("di-save-restart").addEventListener("click", () =>
  void saveSection("discutere", "Discutere", "di-status", discutereInput, true));
$("th-save").addEventListener("click", () =>
  void saveSection("thaleia", "Thaleia", "th-status", thaleiaInput, false));
$("th-save-restart").addEventListener("click", () =>
  void saveSection("thaleia", "Thaleia", "th-status", thaleiaInput, true));
