# Compages 設計 — Vo+Di 統合デスクトップスイート

> 状態: 初版 (2026-07-27)。neco 指示「Di もローカル駆動 / Vo と Di を Electron で起動する
> 起動メニュー / 統合ビルド用リポ新設 (submodule 取込)」への設計 + 実装。

## 1. 命名

「統合」= **Compages** (compāgēs, -is f.)。部分を結合してひとつにした構造・骨組・接合。
Omnipotens 以外・既存 LUDIARS リポと非衝突を確認済み。略称候補 `Cg` (PROJECT-CODES 登録は別途)。

## 2. リポ構成

```
Compages/
├── apps/voluptas    (submodule, private)
├── apps/discutere   (submodule, public)
├── electron/        main.mjs / manager.mjs / registry.mjs / seed.mjs / preload.cjs
├── ui/menu.html     起動メニュー (self-contained)
├── scripts/setup.mjs
├── electron-builder.yml
└── .github/workflows/desktop.yml
```

- 両アプリのサーバコードは**無改変**。統合はランチャー側の責務に閉じる
  (Vo/Di 本体への変更が必要になったら各リポへ PR を出す。このリポに fork を抱えない)。
- Voluptas が private のため **Compages も private**。CI の submodule checkout は
  `SUBMODULE_TOKEN` (repo:read PAT) を使う。

## 3. プロセスモデル

**ランチャー main プロセス + アプリごとの `utilityProcess.fork`**。1 プロセス 1 サーバ。

| | Voluptas | Discutere |
|---|---|---|
| エントリ | `player-profile-server/desktop/serverProcess.js` (既存をそのまま fork) | `dist/index.js` (既存をそのまま fork) |
| cwd | エントリのあるディレクトリ (cwd 非依存) | `<userData>/discutere` (cwd 相対パス解決のため) |
| ポート | 動的 (listen 0 → `parentPort` の ready メッセージで URL 受領) | config `server.port` (既定 3110) |
| ready 判定 | `{type:'ready', url}` メッセージ | `GET /health` 200 ポーリング (60s timeout) |
| 停止 | `{type:'shutdown'}` メッセージ → 猶予後 kill | kill (graceful shutdown はサーバ側 signal handler) |
| ネイティブ依存 | なし (ローカルモードは pure JS + frontend/dist 同梱) | better-sqlite3 (**要 Electron ABI rebuild**) / kuzu (N-API, そのまま可) |

決定の理由:

- **main プロセス直 import (Di 単体版の方式) は不採用**: Di は `process.chdir` 前提、
  Vo と同居すると cwd が競合する。fork なら子ごとに cwd を持てる。
- **system Node の spawn は不採用**: Node 未インストール環境で動かない。
  utilityProcess なら同梱 Electron の Node で完結する。代償は better-sqlite3 の
  ABI rebuild 1 点 (Di 単体デスクトップ版と同じ制約、`docs/desktop-app.md` 参照)。
- Electron は **43 系に pin** (Vo 単体版と同系)。Di submodule の better-sqlite3 は
  setup で 43 の ABI に rebuild する (Di 単体の 42 系ビルドとは併用不可。開発機で
  Di を素の Node に戻すときは `npm run app:rebuild:undo`)。

## 4. 起動メニュー (ui/menu.html)

- アプリごとのカード: 状態 (停止中/起動中/稼働中/エラー)・起動/停止・開く・ログ・データフォルダ。
- 「開く」は専用 BrowserWindow (アプリごとに 1 枚、外部リンクは OS ブラウザへ — Di 単体版の
  ポリシー踏襲)。メニューを閉じてもアプリウィンドウは残り、全ウィンドウを閉じると
  サーバごと終了 (常駐しない)。
- 状態は preload 経由の IPC (`compages:*`) + push イベント。ポーリングは 2s。
- stdout/stderr は `<userData>/logs/<app>.log` に tee (packaged で stdout が見えないため)。

## 5. データ配置と単体版との関係

- **Di**: `<userData>/discutere` を cwd にし、初回に submodule 同梱の
  `data/games` / `data/affects` / `worker-home` / `discutere.config.example.json` →
  `discutere.config.json` をシード (Di 単体版 `electron/main.mjs` と同じ手順・上書きしない)。
  Di 単体デスクトップ版 (`%APPDATA%/Discutere`) とはデータを**分離** (同時起動すると
  3110 が衝突するため、シード config はそのまま・衝突時はメニューにエラー表示)。
- **Vo**: ローカルモード設定 (`%LOCALAPPDATA%/Volputas/local-config.json`) と VolputasData
  リポジトリは単体版と**共有** (データの正本が Git リポなので分離する理由がない)。
- ランチャー自身の状態は持たない (どのアプリを起動したかの復元はしない。毎回メニューから)。

## 6. Di ローカル駆動の前提と残ギャップ

Di は既にローカル駆動の下地がある: bot token 無しで Web UI (`/flow` 議論・学習ビュー) が動く。
Discord は任意 (config に botToken を書けば従来通り)。残ギャップと扱い:

| ギャップ | 扱い |
|---|---|
| LLM backend が無いと議論フローが起動しない | config で `llm.backend=local` (Ollama 等) か Claude Code OAuth (SDK fallback が `~/.claude/.credentials.json` を読む) を選ぶ。**初期リリースは config 手編集** (メニューから設定ファイルを開ける)。設定 UI は T5 |
| kuzu KG 初期データが無い (空 KG) | 空で起動可 (学習クロールで育つ)。既存 KG の持込は config の kuzuPath 指定 |
| ペルソナブリッジ (Vo→Di) | Voluptas#26 / Discutere#202 の設計が前提。Di 側 D1 (importer) 実装後、メニューに「Vo ペルソナを Di へ取込」アクションを足す (T6) |

## 7. パッケージング

- electron-builder (NSIS + portable、Di 単体版と同じ)。**asar 無効**
  (ネイティブアドオン + cwd 相対読みのため。Di 単体版踏襲)。
- files: `electron/**`, `ui/**` + 両 submodule の実行必要物のみ
  (Vo: src/desktop/frontend-dist/lib/node_modules、Di: dist/node_modules/data/worker-home/config example)。
- 実配布 (タグ push → release) は当面やらない。手動 dispatch で artifact 確認まで
  (Di 単体版の「実配布はデータ管理ツール対応後」の運用に従属)。

## 8. 実装タスク

| # | タスク | 状態 |
|---|---|---|
| T1 | リポ bootstrap (submodule / README / DESIGN) | ✅ 本 PR |
| T2 | ランチャー本体 (manager/registry/seed/menu UI/preload) | ✅ 本 PR |
| T3 | setup スクリプト (deps + build + ABI rebuild) | ✅ 本 PR |
| T4 | electron-builder + CI (手動 dispatch, SUBMODULE_TOKEN) | ✅ 本 PR (実ビルド検証は CI 初回実行で) |
| T5 | 設定 UI (Di の LLM backend / ポート / Vo データリポ切替をメニューから) | 未 |
| T6 | ペルソナブリッジ メニューアクション (Vo export → Di import) | 未 (Di D1 実装後) |
| T7 | 自動更新 (Vo 単体版の update-electron-app 相当) | 未 (実配布運用の決定後) |

## 9. 非目標

- Vo/Di 単体デスクトップ版の廃止 (併存。Compages は「両方使う人」向け)。
- サーバコードの fork・改変をこのリポに抱えること。
- 常駐 / 自動起動 (Excubitor 系の常駐運用は別レイヤー。これは手元起動ツール)。
