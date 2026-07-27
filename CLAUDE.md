# Curia 開発ルール

Vo+Di 統合デスクトップスイート (起動メニュー)。設計と決定事項は `DESIGN.md` が正本。

- **submodule (apps/voluptas, apps/discutere) のサーバコードは無改変。**
  本体側の変更が要るときは各リポへ PR を出し、マージ後に submodule bump する。
  このリポに fork・パッチを抱えない。
- Voluptas が private のため、このリポも private。CI は `SUBMODULE_TOKEN` 前提。
- better-sqlite3 は setup で Curia の Electron ABI に rebuild される。
  開発機で Discutere を素の Node に戻すときは `apps/discutere` で
  `npm run app:rebuild:undo`。
- データ書き込みは userData (`%APPDATA%/Curia`) のみ。submodule 配下に
  実行時データを書かない。
