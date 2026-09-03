---
task: "thaleia-upstream-wiring"
project: "Curia"
kind: "実装"
created: "2026-09-03"
---
# Thaleia (施策設計ツール) を Curia が正しく包む — 上流の接続先を配線する

## 目的

Thaleia は「Praeforma×Anatomia の突合サービス」から **施策設計ツール (成否リスクのスコア化)**
へ再定義された (Castra `spec/plan/2026-09-03-thaleia-initiative-design-tool.md`、Thaleia PR #1261)。
新しい Thaleia は Anatomia / Discutere / Praeforma を**同時に**読む。接続先は env でしか渡せず、
未設定の上流はその軸が missing に落ちて confidence が下がり「判定保留」になる。

Curia はこの 3 つを同時に起動する唯一の器なので、接続先を知っているのも Curia だけになる。
Curia の配線が旧 Thaleia 前提のままだと、Curia の中で Thaleia を開いても 5 軸のうち 4 軸が
使えない。ここを塞いで、**Curia の中で施策 1 件を評価しきれる**状態にする。

あわせて、Praeforma が PR #1253 で Anatomia `/api/graph` の直接取得へ移った際に開いた穴
(`PRAEFORMA_ANATOMIA_URL` が渡っておらず Studio の関連処理グラフが取れない) も同じ仕組みで塞ぐ。

## 実装の要点

- **接続先の解決を 1 か所に置く** (`electron/upstream.mjs`)。各アプリ定義が `baseUrl(ctx)` を
  持ち、そこがポート既定値の正本になる (二重管理しない)。Discutere だけは config JSON が
  ポートの正本なので `seed.mjs` の解決結果を返す。
- **無効なアプリの接続先は誰にも渡さない**。`resolveUpstreamBaseUrls()` は `buildRegistry()` の
  戻り値 (= `curia.apps.json` で enabled なアプリ) だけを見る。`applyUpstreamEnv()` は別名キーも
  含めて必ず先に削除してから設定するので、開発シェルに残った `ANATOMIA_URL` 等が漏れて
  「落ちている先を叩き続ける」ことも防ぐ。
- **Curia が起動しない上流** (Genius / Augur CLI / Ludus リポ) は Curia 自身の設定ストア
  (`electron/curia-settings.mjs` → `<userData>/curia.settings.json`) に持ち、設定タブから入力する。
  Di config に相乗りさせない (env として渡す性質のため)。継承元の同名 env を先に削除し、
  未入力ならその軸は設計どおり missing に落ちる (古い値やダミー値を使わない)。
- **実行時データを submodule に書かせない**。`THALEIA_DATA_DIR` を `<userData>/thaleia/data` に
  向ける (CLAUDE.md「submodule 配下に実行時データを書かない」)。受け口は Thaleia 側 PR。
- `CURIA_ANATOMIA_PORT` を実際の bind まで届かせる。`anatomia web` は env を読まず `--port`
  しか取らないので、`baseUrl` と bind がずれていた。
- submodule bump は **thaleia / praeforma / discutere の 3 つだけ**。anatomia / voluptas / corpus は
  本タスクのスコープ外なので触らない。

### 再利用探索の採否

`anatomia where --project curia` は landings 空 (Curia にドメイン宣言が 1 つも無かったため)。
`anatomia find --project curia --symbol forkSpec` で 5 アプリの `forkSpec` を引き、既存の
env 組み立て (`praeforma.mjs` の `{...process.env, PRAEFORMA_PORT}` + `delete env.NODE_ENV`) と
`seed.mjs` の `resolveDiscutereAddress` を確認した。

| 既存実装 | 採否 | 理由 |
|---|---|---|
| `seed.mjs` `resolveDiscutereAddress` | **採用** | Di のポートは config JSON が正本。既にある解決をそのまま `baseUrl` に流用し、ポート既定値を二重に持たない |
| `apps/*.mjs` の `healthUrl` | **採用 (派生元に変更)** | `baseUrl` を新設し `healthUrl` をそこから導出。ポートの正本が各アプリ定義 1 か所になる |
| `settings.mjs` の `deepMerge` + 部分保存 | **採用 (セクション分割)** | Di config への深いマージはそのまま。Thaleia は保存先が別ファイルなので `saveSettings` をセクション単位に割り、UI 側も `saveSection()` 1 本に寄せた |
| `manager.mjs` の ctx | **採用 (追加のみ)** | `upstreamBaseUrls()` を ctx に足すだけで `ServerManager` は無改変。Di はポートを config で変えられるので、起動のたびに解決し直せるよう関数のまま渡す |

### ドメイン

Curia には Anatomia のドメイン宣言が 1 つも無く、Revisor の審査で `target domain is still missing`
になる (実例: Curia local PR #1015 が 2 回とも同じ理由で失敗)。同じ PR で `spec/domains/` を新設した。

| ドメイン | 範囲 |
|---|---|
| `hub-shell` | `electron/main.mjs` / `manager.mjs` / `preload.cjs` / `ui/` |
| `app-integration` | `electron/apps/*.mjs` / `registry.mjs` / `upstream.mjs` / `seed.mjs` / `scripts/` |
| `settings-store` | `electron/settings.mjs` / `curia-settings.mjs` |
| `corpus-pack` | `packs/curia/services/*.ts` (DESIGN.md §10 T9b の受け皿) |

## 完了条件

- [x] `apps/thaleia` が Thaleia main (#1261 込み) を指す。あわせて `THALEIA_DATA_DIR` を
      受ける Thaleia PR #1274 (768d00f) までを含める
- [x] `apps/praeforma` が #1253 込みの main、`apps/discutere` が #1252 込みの main を指す
- [x] Curia 起動時、Thaleia に Anatomia / Discutere / Praeforma の base URL が渡る
- [x] `curia.apps.json` で anatomia / praeforma を `enabled:false` にすると、その base URL が
      別名キーごと Thaleia の env から消える
- [x] Praeforma に `PRAEFORMA_ANATOMIA_URL` が渡る (Studio の関連処理グラフ)
- [x] Thaleia の説明が「施策設計ツール (成否リスクのスコア化)」で thaleia.mjs / README / DESIGN §11 一致
- [x] Thaleia の ready 判定が `GET /health` になり `healthLenient` が外れている
- [x] 施策 1 件を Curia の中で登録 → 評価 → ビューア描画まで通した
- [x] `npm test` (node --test) が緑
