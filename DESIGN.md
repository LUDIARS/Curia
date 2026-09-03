# Curia 設計 — Vo+Di 統合デスクトップスイート

> 状態: 初版 (2026-07-27)。neco 指示「Di もローカル駆動 / Vo と Di を Electron で起動する
> 起動メニュー / 統合ビルド用リポ新設 (submodule 取込)」への設計 + 実装。

## 1. 命名

「統治」= **Curia** (cūria, -ae f.)。元老院議事堂 = 統治が行われる場。両アプリが集まる
玄関 (起動メニュー) の比喩。初案 Compages (結合構造) から neco 選定で改称 (2026-07-27)。
既存 LUDIARS リポと非衝突 (Curare とは字面が近いので文中はフルネーム推奨)。
略称は PROJECT-CODES 登録時に決定 (`Cu` は Curare 使用済み)。

## 2. リポ構成

```
Curia/
├── apps/voluptas    (submodule, private)
├── apps/discutere   (submodule, public)
├── electron/        main.mjs / manager.mjs / registry.mjs / seed.mjs / preload.cjs
├── ui/shell.html    統合 hub shell (左レール + ダッシュボード, self-contained)
├── scripts/setup.mjs
├── electron-builder.yml
└── .github/workflows/desktop.yml
```

- 両アプリのサーバコードは**無改変**。統合はランチャー側の責務に閉じる
  (Vo/Di 本体への変更が必要になったら各リポへ PR を出す。このリポに fork を抱えない)。
- Voluptas が private のため **Curia も private**。CI の submodule checkout は
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

## 4. 統合 hub shell (ui/shell.html) — フロントエンド統合 (暫定実装)

**バックエンドは独立起動のまま、フロントエンドは 1 ウィンドウに統合する** (neco 指示
2026-07-27)。本流は Corpus capability base (§10) — 本節の内製 shell は T9b が揃うまでの
**暫定**で、今日から動く統合フロントとして維持する。

- **1 ウィンドウ = 左レール (タブ) + コンテンツ領域**。タブ = ダッシュボード + サービス群。
- サービスの UI は **`WebContentsView`** で埋め込む (アプリごとに 1 view、レール幅 232px を
  除いた領域に setBounds、非アクティブは hide — 既存フロントを無改変でフル機能のまま統合。
  iframe と違い X-Frame-Options / cross-origin の制約を受けない)。
- **タブ選択 = 入口の一本化**: 停止中のサービスのタブを選ぶと自動起動 → running に達した
  時点でビューを表示 (それまでダッシュボードに起動中表示)。
- ダッシュボード: 状態カード (起動/表示/停止/ログ/データフォルダ)。稼働中サービスの
  **Corpus service manifest** (`/.well-known/corpus-service.json`) を検出してバッジ表示
  (Voluptas は main で公開済み・corpusApi 1。Di は未対応 → 無くても正常系)。
- 外部リンクは OS ブラウザへ (Di 単体版のポリシー踏襲)。ウィンドウを閉じると
  サーバごと終了 (常駐しない)。
- 状態は preload 経由の IPC (`curia:*`) + push イベント。ポーリングは 2s。
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
| T8 | 統合 hub shell (§4: 左レール + WebContentsView + manifest 検出) — **暫定** | ✅ 本 PR |
| T9 | 本流化 = Corpus capability base + packs/curia (§10, T9a–T9d) | スケルトンのみ本 PR (apps/corpus submodule + packs/curia) |

## 9. 非目標

- Vo/Di 単体デスクトップ版の廃止 (併存。Curia は「両方使う人」向け)。
- サーバコードの fork・改変をこのリポに抱えること。
- 常駐 / 自動起動 (Excubitor 系の常駐運用は別レイヤー。これは手元起動ツール)。

## 10. 本流 = Corpus enterprise Electron capability base (neco 決定 2026-07-27)

フロントエンド統合の**本流は Corpus の `feat/enterprise-electron-capability-base`**
(`apps/corpus` submodule として取込済み・当該ブランチに pin)。同ブランチの提供物:

- **Corpus desktop 基盤**: `corpus.desktop.json` (productName / serviceId / pluginPack /
  noAuth) を差し替えるだけでブランド付きデスクトップ hub を作れる。Electron main が
  Corpus サーバを `ELECTRON_RUN_AS_NODE` 子プロセス (動的ポート) で起動し、
  BrowserWindow は Corpus shell (タブ + パネル) を開く。tray 常駐 + auto-update +
  capabilities/MCP ルート付き。
- **プラグインパック**: `pack.json` + モジュール (`index.ts` が CorpusModule を default
  export、`panel.ts` が `mount()` を export)。Corpus は tsx 実行なので .ts のまま動く。

**Curia の最終形** = この基盤 + `packs/curia`:

- `packs/curia/services` (スケルトン実装済み): Vo/Di 子プロセス管理を Corpus サーバ内に
  移し (electron/manager.mjs の後継)、connector (health/fetch) + `/api/x/services` 操作
  API + ダッシュボードパネルを登録する。バックエンド独立起動は維持 (1 サービス 1 子プロセス)。
- フル UI は **iframe パネル**で統合する: Vo ローカルモードは helmet を使わず (helmet は
  online の app.js のみ)、Di もフレーム制限ヘッダ無しのため、ローカル loopback の iframe
  埋め込みが可能なことを確認済み。
- 認証: ローカル完結 (noAuth=true)。オンライン運用へ広げる場合のみ cernere-project-token。

### 移行タスクと前提

| # | タスク | 前提 |
|---|---|---|
| T9a | Corpus 側ブランチのマージ (capability base + corp-hub template) | Corpus #51 系列のレビュー (Curia 側からは待ち) |
| T9b | `packs/curia/services` の spawn 実配線 (Di: dist/index.js + config env / Vo: ローカルエントリ) + iframe フル UI パネル + Electron 層を capability base 方式 (Corpus 起動のみ) に置換 | **Voluptas feat/dual-mode-persona-ui のマージ** (Vo main にはローカルモードのサーバエントリがまだ無い — 現状 Vo タブは明示エラー表示) |
| T9c | Di の Corpus manifest (`/.well-known/corpus-service.json` + ローカル無認証 data endpoint) | Di 側 PR |
| T9d | §4 の暫定 shell (WebContentsView) 撤去 | T9b がフル UI 込みで動くこと |

### 暫定 (interim) の位置づけ

§4 の内製 shell は **T9b が揃うまでの暫定**。今日から動く統合フロントとして残すが、
新機能はパック側に寄せ、shell には足さない。プロセス管理ロジック (manager.mjs) は
T9b で packs/curia/services/process-manager.ts に一本化する。

「全部 Corpus パネルに寄せる」ことは目標にしない — Vo (React SPA) / Di (サーバ描画) の
フル UI は iframe タブが最も情報量が多く、パネルは要約・横断ビュー (ペルソナブリッジ状況、
アンケート回答数、議論の結論一覧など) に向く。

## 11. Optional アプリ (Anatomia / Praeforma / Thaleia) — 着脱可能な統合

neco 指示 (2026-07-28)。**すぐ切り離せる**ことを構造で保証する:

- **manifest = `curia.apps.json`** が有効化と表示順の正本。`enabled:false` にするだけで
  タブ / カード / 起動対象 / setup 対象から消える (コード変更不要)。
- アプリ定義は `electron/apps/<id>.mjs` に 1 ファイルずつ分離。完全除去 =
  manifest の行 + 定義ファイル + submodule の 3 点削除で、他アプリに影響しない。
- setup は optional アプリの submodule 未取得 / manifest 無効を**エラーにせずスキップ**する。

| アプリ | 起動 | ポート | 備考 |
|---|---|---|---|
| Anatomia | `bin/anatomia.mjs web` を utilityProcess で (要 tsc build) | 4200 | kuzu=N-API で rebuild 不要。cwd=`<userData>/anatomia` |
| Praeforma | tsx CLI + `server/src/local.ts` を **spawnKind "node"** で (ローカルモード: SQLite + Cernere 不要 + 固定ユーザ) | 8889 | better-sqlite3 は setup で Electron ABI rebuild。web は `build:web` |
| Thaleia | tsx CLI + `src/index.ts` を **spawnKind "node"** で | 8890 | 施策設計ツール (成否リスクのスコア化)。上流 = Anatomia / Discutere / Praeforma (Curia が env で配線) + 任意で Genius / Augur / Ludus (設定タブ) |

**spawnKind "node"** = `child_process.spawn(process.execPath, …, ELECTRON_RUN_AS_NODE=1)`。
tsx は子プロセスを再 spawn するため utilityProcess では動かない (再 spawn が別 Electron
アプリとして起動 → single-instance lock / utility_init クラッシュ)。Corpus capability base の
EmbeddedCorpusServer と同じパターンで、純 Node 子プロセスとして起動する。

- ready 判定は Anatomia / Praeforma が lenient health (HTTP 応答があれば up。専用 /health を
  仮定しない)、Thaleia は専用の `GET /health` を厳密に見る。
- ポートは各サービスの既定に従い、env (`CURIA_ANATOMIA_PORT` 等) で上書き可。
  既に同ポートで単体起動中なら起動失敗としてカードにエラーが出る (併用しない前提)。

### 上流の配線 (`electron/upstream.mjs`)

当初は「Curia は配線に関与しない」方針だったが、Thaleia が施策設計ツールへ再定義され
**Anatomia / Discutere / Praeforma を同時に読む**ようになったことで成立しなくなった
(接続先を env で渡さないと 5 軸のうち 4 軸が missing に落ちる)。Curia はこの 3 つを
同時に起動する唯一の器なので、接続先を知っているのも Curia だけになる。

切り離し可能性は「**registry に載っているアプリしか解決しない**」ことで守る:

- 各アプリ定義が `baseUrl(ctx)` を持ち、そこがポート既定値の正本 (二重管理しない)。
  Discutere だけは config JSON がポートの正本なので `seed.mjs` の解決結果を返す。
- `resolveUpstreamBaseUrls(registry, ctx)` は `buildRegistry()` の戻り値 (= 有効アプリ)
  だけを見る。`curia.apps.json` で `enabled:false` にしたアプリは registry に現れないので
  接続先も渡らない。
- `applyUpstreamEnv()` は **別名キーも含めて必ず先に削除してから**設定する。開発シェルに
  残った `ANATOMIA_URL` 等が漏れて「落ちている先を叩き続ける」ことを防ぐ。
- 配線先: Thaleia ← `ANATOMIA_BASE_URL` / `DISCUTERE_BASE_URL` / `PRAEFORMA_BASE_URL`、
  Praeforma ← `PRAEFORMA_ANATOMIA_URL` (Studio の関連処理グラフ)。
- Curia が起動しない上流 (Genius / Augur CLI / Ludus リポ) は設定タブの任意入力を
  `curia.settings.json` に持ち、入力があるときだけ env に積む。未入力ならその軸は
  Thaleia 側で missing に落ちる (ダミー値を作らない)。
