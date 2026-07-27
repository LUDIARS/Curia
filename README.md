# Curia

**Voluptas + Discutere 統合デスクトップスイート** — バックエンドはサービスごとに
独立プロセス、フロントエンドは 1 ウィンドウ (左レール + タブ) に統合する hub shell。
cūria (羅: 元老院議事堂 = 統治が行われる場。各アプリが集まる玄関) から命名。

- **Voluptas** (プレイヤーリサーチ / ペルソナ分析) — Git-backed ローカルモード
- **Discutere** (遊びの議論プラットフォーム) — Web UI (`/flow`) のローカル駆動

両アプリは git submodule (`apps/voluptas`, `apps/discutere`) で取り込み、
サーバコードは**無改変**のまま Electron の utilityProcess として起動する。
設計の詳細と決定事項は [DESIGN.md](./DESIGN.md)。

## セットアップ (開発)

```sh
git clone --recursive https://github.com/LUDIARS/Curia.git
cd Curia
npm ci
npm run setup     # submodule init + 両アプリの deps/build + better-sqlite3 の Electron ABI rebuild
npm run dev       # 起動メニューを開く
```

`npm run setup` の内訳 (個別にやり直すときの参照):

1. `git submodule update --init --recursive`
2. `apps/voluptas/player-profile-server` で `npm ci`
3. `apps/discutere` で `npm ci` → `npm run setup:submodules` → `npm run build`
4. `apps/discutere` の better-sqlite3 を Curia の Electron ABI へ rebuild
   (Discutere 単体を素の Node で動かすときは `apps/discutere` で `npm run app:rebuild:undo`)

## データ配置

書き込みはすべて userData (`%APPDATA%/Curia`) 配下:

| パス | 内容 |
|---|---|
| `discutere/` | Di の cwd (config / SQLite / KG / logs)。初回にリポ同梱データをシード |
| `logs/` | ランチャーが tee する各アプリの stdout/stderr |

Voluptas ローカルモードの設定 (`%LOCALAPPDATA%/Volputas/local-config.json`) と
データリポジトリは**単体デスクトップ版と共有**する (DESIGN.md §5)。

## パッケージング (Windows exe)

```sh
npm run dist:win   # electron-builder --win → release/
```

CI は `.github/workflows/desktop.yml` (手動 dispatch)。Voluptas が private のため
submodule checkout に `SUBMODULE_TOKEN` (repo:read PAT) が必要。
