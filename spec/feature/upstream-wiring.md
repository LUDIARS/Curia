# 上流の接続先配線 (Curia → Thaleia / Praeforma)

Curia は「アプリを同時に起動する器」なので、アプリ同士が互いを呼ぶときの接続先を知っているのは
Curia だけになる。ここはその配線の仕様。設計の位置づけは DESIGN.md §11。

## SPEC-CURIA-UPSTREAM-RESOLVE — 接続先の解決

- 各アプリ定義 (`electron/apps/<id>.mjs`) は任意で `baseUrl(ctx)` を持つ。**ポート既定値の正本は
  そのアプリ定義 1 か所**とし、health URL もそこから導出する (二重管理しない)。
  Discutere だけはポートの正本が config JSON なので `seed.mjs` の解決結果を返す。
- `resolveUpstreamBaseUrls(registry, ctx)` は `buildRegistry()` の戻り値 (= `curia.apps.json` で
  `enabled` なアプリ) だけを見て `{id: baseUrl}` を返す。末尾スラッシュは落とす。
- **無効化されたアプリは registry に現れないので接続先も解決されない。** これが
  「すぐ切り離せる」(DESIGN.md §11) を配線側でも守るための唯一の仕組み。

## SPEC-CURIA-UPSTREAM-ENV — env への反映

- `applyUpstreamEnv(env, keysByApp, baseUrls)` は、アプリごとに宣言された環境変数キー
  (先頭が正規キー、以降は別名) を **必ず先に全部削除してから**、解決できたものだけを
  正規キーへ入れる。
- 別名まで消すのは、開発シェルに残った `ANATOMIA_URL` 等が子プロセスへ漏れて
  「落ちている先を叩き続ける」ことを防ぐため。無効な上流は「未設定」として渡るのが正しい。
- 配線先:
  - Thaleia ← `ANATOMIA_BASE_URL` / `DISCUTERE_BASE_URL` / `PRAEFORMA_BASE_URL`
  - Praeforma ← `PRAEFORMA_ANATOMIA_URL` (Studio の関連処理グラフ)
- `applyDependentFeatureEnv(env, flagsByApp, baseUrls)` は逆向きの配線で、**下流アプリが
  有効なときだけ上流アプリの機能を立てる**。削除してから設定する規約は同じ。
  - Discutere ← `DISCUTERE_PERSONA_ENGINE_ENABLED=1` (thaleia が有効なときだけ)。
    Di は persona-engine を既定で起動しないが、Thaleia の Di 議論軸は persona 単位の
    合意集計 API を読むため、これが無いと四象限が空になる。
  - 消すのは env だけなので、Di 自身の設定ファイル (`personaEngine.enabled`) での
    指定は上書きしない。Thaleia が無効なら Di は素の既定へ戻る。

## SPEC-CURIA-THALEIA-DATA-DIR — 実行時データの逃がし先

- Thaleia には `THALEIA_DATA_DIR` = `<userData>/thaleia/data` を渡す。
  submodule 配下に実行時データを書かない (CLAUDE.md)。

## SPEC-CURIA-SETTINGS-STORE — Curia 自身の設定ストア

- Curia が起動しない上流 (Genius / Augur CLI / Ludus リポ) の接続先は
  `<userData>/curia.settings.json` に持つ。Di config には相乗りさせない
  (env として子へ渡す性質のもので、Di の設定ではないため)。
- 読み出しは既知キーだけを既定値 (空文字) で埋めて返す。ファイルが無い / 壊れていても
  既定へ落として起動を止めない。保存時は既存 JSON の未知キー (`$comment` 等) を保持する。
- **継承元の同名 env は先に削除し、空欄は env に積まない。** 未設定の上流は Thaleia 側で
  その軸が missing になるのが設計どおりで、開発シェルの古い値やダミー値を使わない。

## SPEC-CURIA-SETTINGS-SECTIONS — 設定画面のセクション分割

- 設定は保存先が異なるセクション (`discutere` = Di config / `thaleia` = Curia 設定ストア) に分かれる。
  `saveSettings()` は **入力に含まれるセクションだけ**を、それぞれの正本へ保存する。
- 入力ミスを黙って無視しない: URL 形式、ポート番号、Augur が絶対パスのファイルで Ludus が
  絶対パスのディレクトリであることを検証し、不正ならどのセクションも保存せずエラー文言を返す。
- 保存後の再起動は成否を返し、アプリが無効または起動失敗なら設定画面に失敗を表示する。
- 画面側 (`ui/settings-tab.js`) は保存 + 任意の再起動を 1 つの関数 (`saveSection`) で扱い、
  セクションが増えても流儀が割れないようにする。`loadSettings` / `syncLocalFields` /
  `discutereInput` / `thaleiaInput` も同じファイルに置き、`ui/shell.html` は
  マークアップとダッシュボード描画だけを持つ (1 ファイル 1 責務)。
