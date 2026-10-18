# APP-002 辞書の出題候補を既存エディタ向けに出力する

`approved_lexicon.tsv` のジャンル、難易度、マス数を指定して、既存エディタに貼り付けられる `表示語 | よみ | カギ` 形式を出力する辞書専用ツールです。

## 使用例

```sh
node scripts/export-lexicon.mjs --category=音楽のことば --difficulty=1 --count=10 --seed=42
node scripts/export-lexicon.mjs --category=木の種類 --difficulty=2 --count=12 --max-length=6
node scripts/export-lexicon.mjs --category=同音異義のことば --category=天体と地球 --count=20 --seed=7
npm run lexicon:export -- --category=読解と日本語 --count=12
```

`--category` は複数回指定できます。省略時は全ジャンルを対象にします。`--difficulty` は1〜3、`--count` は2〜60、`--seed` は出力の再現性に使う整数、`--min-length` と `--max-length` は2〜15マスで指定できます。デフォルトは12語、難易度1、2〜8マスです。

**同音異義語は辞書内で複数保持し、出題候補の出力時だけ一つのカギを選びます。** 例えば音楽では「歌詞」、樹木では「樫」を出力します。出力したテキストを手動で入力欄に貼り付けてください。辞書と画面の自動連携は未実装です。

この抽出は盤面完成やヒントの唯一解を保証しません。人による解答レビューと実機動作検証は別途必要です。
