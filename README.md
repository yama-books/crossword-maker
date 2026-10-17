# 日本語クロスワード作成機 | crossword-maker

**[▶ クロスワードを遊ぶ](https://yama-books.github.io/crossword-maker/)**

**[✦ クロスワードをつくる（M2試作）](https://yama-books.github.io/crossword-maker/editor.html)**

日本語クロスワードの制作・学習教材化を目的とする公開プロジェクトです。

## 現在の試作品

- テーマ「学校生活と身近なことば」
- 6×6マス、ヨコ8問・タテ6問、合計14問
- スマートフォン・PCのブラウザでプレイ可能
- タテ/ヨコのカギ選択、ひらがな自動変換、答え合わせ、1文字ヒント、解答表示
- 途中経過のブラウザ内保存、A4印刷/PDF保存
- サーバー・Python・ユーザー登録不要

GitHub Pages公開URL、または `index.html` をローカルで直接開くと利用できます。

## ファイル構成

| ファイル | 内容 |
|---|---|
| `index.html` | プレイ画面一式（HTML/CSS/JavaScript） |
| `puzzle.json` | 盤面・ヒント・解答のデータ |
| `.github/workflows/pages.yml` | GitHub Pagesへの自動公開ワークフロー |

**問題データの正本は `puzzle.json` だけです。** `index.html` は `src/index.template.html` と `src/core/kana.mjs` から自動生成された配布ファイルです。直接編集しないでください。

## パズルの基本ルール

- カタカナ1マス1文字。小さいカナは大きい文字として記入。
- 黒マスは縦横に隣接せず、180度回転対称。
- 白マスは連結し、タテ・ヨコのすべての2文字以上の単語が成立。

## 開発ロードマップ

1. 構造検証済みの6×6試作盤面（現在地）
2. 単語・ヒントの編集UI
3. 語彙辞書と読みの正規化
4. 制約充足探索による自動盤面生成
5. テーマ・難易度設定、手動編集
6. 教材向けPDF/Word出力と問題管理

**M2第1段階で手動編集UIを追加しました。** 黒マス・文字・カギ・Undo/Redo・作業JSON保存/読込・完成問題JSON出力に対応します。自動生成・辞書補完は未実装で、別セッションのHTML試作をそのまま統合したものではありません。M1の盤面検証エンジンと既存プレイヤーは維持します。

## ライセンス

公開リポジトリですが、現時点では明示的なオープンソースライセンスは設定していません。

## GitHub Pagesの初回公開設定

このリポジトリでは `main` へのpushで公開ワークフローが自動実行されます。ただし、最初の1回だけ、リポジトリ管理者が [Settings → Pages](https://github.com/yama-books/crossword-maker/settings/pages) で **Build and deployment → Source = GitHub Actions** を選択してください。

その後、[Actions → Publish crossword-maker](https://github.com/yama-books/crossword-maker/actions/workflows/pages.yml) から **Run workflow**（または失敗した実行の **Re-run jobs**）を選ぶとサイトが公開されます。以後の `main` 更新は自動で公開されます。

## 開発指針

今後の仕様、品質基準、自動生成の方針、実装優先順位は [開発指針（docs/DEVELOPMENT_GUIDELINES.md）](docs/DEVELOPMENT_GUIDELINES.md) を正本として管理します。機能追加時はこの文書を確認し、決定事項を反映してください。

## M1開発手順（基本はGitHub上で作業）

- 正本はこの公開リポジトリです。作業ブランチ→PR→CI確認→mainへのマージで進めます。
- 問題の内容やカギを修正する場合は `puzzle.json` を編集し、`npm run sync` で `index.html` を再生成して一緒にコミットしてください。
- 画面の変更は `src/index.template.html`、カナ入力の規則は `src/core/kana.mjs` を編集します。
- GitHub Actionsは `npm test`（構造検証）→`npm run check`（生成HTMLとの一致）→`npm run build`（配布生成）の順に実行します。
- mainのPages公開もテストが成功した場合に限って進みます。配布は `dist/index.html` を使い、ルートの開発ファイルを公開しません。
- Node.js 22以降をCIで使います。外部パッケージのインストールは不要です。ローカル開発は必須ではありません。
- 現在の6×6・14問は、交差の一致・番号・黒マス配置・白マス連結などを自動で検査します。語彙やカギの自然さは別途人間が確認します。

詳しくは [M1実装メモ](docs/M1_IMPLEMENTATION.md) と [開発指針](docs/DEVELOPMENT_GUIDELINES.md) を参照してください。

## M2 制作画面（作業ブランチからの反映後）

- [制作画面](editor.html) は既存のプレイヤーとは別ページです。レトロなマットブロック型ボタン、ランダムな盤面登場演出を導入しています。
- 未完成盤面はバージョン付き作業JSONに保存できます。すべてのマス・カギと盤面の検証を通った場合に完成問題JSONを書き出せます。
- 作業内容はブラウザ内に自動保存されます。外部サーバー・会員登録は不要です。
- [M2実装記録](docs/M2_IMPLEMENTATION.md) と [UI・モーション計画](docs/UI_MOTION_PLAN.md) を参照してください。
- 生成機能、実機でのIME・ダウンロード・印刷の検証は今後の課題です。

## M3a 単語から配置案を作る（試作）

制作画面に「単語から盤面を生成」を追加しました。1行に `表示名 | よみ | カギ` または `よみ | カギ` を入力し、5〜15マスの盤面で交差する配置案を探索できます。配置できなかった語は一覧表示し、編集・Undo・JSON保存を続けられます。

**配置案は完成問題とは限りません。** 未使用マスを黒にする初期アルゴリズムは、標準の黒マス隣接禁止・180度対称を満たさないことがあります。完成問題JSONは従来どおり盤面検証に合格した場合のみ出力します。辞書による盤面先行補完、固定語を守る部分再生成は未実装です。

実装・検証範囲は [M3a実装記録](docs/M3A_WORDS_FIRST.md) を参照してください。実機のスマートフォンIME・ダウンロード操作は引き続き検証待ちです。
