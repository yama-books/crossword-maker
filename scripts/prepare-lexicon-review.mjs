import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {parseTsv} from './check-lexicon.mjs';

/** Fixed, audited first-batch questions: contrast pairs plus five controls. */
export const REVIEW_R1_IDS = Object.freeze([
  "LEX-0200",
  "LEX-0433",
  "LEX-0196",
  "LEX-1300",
  "LEX-1212",
  "LEX-1219",
  "LEX-0842",
  "LEX-0845",
  "LEX-0964",
  "LEX-0965",
  "LEX-0967",
  "LEX-0968",
  "LEX-1876",
  "LEX-1877",
  "LEX-1878",
  "LEX-1879",
  "LEX-0104",
  "LEX-0105",
  "LEX-0111",
  "LEX-0112",
  "LEX-1903",
  "LEX-1917",
  "LEX-1873",
  "LEX-1874",
  "LEX-0160",
  "LEX-0234",
  "LEX-0087",
  "LEX-0094",
  "LEX-0069",
  "LEX-0067",
  "LEX-0733",
  "LEX-0734",
  "LEX-0265",
  "LEX-0266",
  "LEX-0267",
  "LEX-0013",
  "LEX-0359",
  "LEX-0360",
  "LEX-1214",
  "LEX-1871"
]);
const SOURCE=fileURLToPath(new URL('../data/lexicon/approved_lexicon.tsv',import.meta.url));

function orderedReviewRows(rows){
  const byId=new Map(rows.map(row=>[row.id,row]));
  const chosen=REVIEW_R1_IDS.map(id=>{
    const row=byId.get(id);
    if(!row)throw new Error('Missing review ID: '+id);
    return row;
  });
  if(new Set(chosen.map(row=>row.normalized)).size!==chosen.length)
    throw new Error('Review sample accidentally repeats the same crossword answer');
  return chosen;
}
export function createReviewPack(rows,{kind='questions'}={}){
  if(!['questions','key'].includes(kind))throw new RangeError('kind must be questions or key');
  const chosen=orderedReviewRows(rows);
  const heading=kind==='questions'
    ? '# カギだけで答えるクロスワード語彙テスト｜第1回（40問）'
    : '# カギの解答・校正用キー｜第1回（配布禁止）';
  const introduction=kind==='questions'
    ? '\nこの用紙はヒントのわかりやすさを調べるための試験で、点数評価ではありません。各問には盤面でのマス数を記しています。わからない場合は空欄や「？」で構いません。思いつく別解があれば書いてください。\n'
    : '\n**回答者には見せないこと。** 順序・番号は問題用紙と対応します。厳密な採点より、自然に出てきた別解と迷い方を記録します。\n\n| 問番 | ID | 正解の表記 | かな | 正規化マス数 | ジャンル | 暫定難度 |\n| --- | --- | --- | --- | ---: | --- | --- |\n';
  const body=chosen.map((row,index)=>{
    const num=String(index+1).padStart(2,'0');
    if(kind==='key')return '| '+num+' | '+row.id+' | '+row.surface+' | '+row.reading+' | '+row.length+' | '+row.category+' | '+row.difficulty+' |';
    return '### 問'+num+'（'+row.length+'マス）\n'+row.clue+'\n\n回答：＿＿＿＿＿＿＿＿　自信：高・中・低　別の答え：＿＿＿＿＿＿\n';
  }).join(kind==='questions'?'\n':'\n');
  return heading+'\n'+introduction+'\n'+body+'\n';
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const args=process.argv.slice(2);
    if(args.length!==1||!['--questions','--key'].includes(args[0]))
      throw new Error('Usage: node scripts/prepare-lexicon-review.mjs --questions|--key');
    const rows=parseTsv(readFileSync(SOURCE,'utf8'));
    process.stdout.write(createReviewPack(rows,{kind:args[0]==='--questions'?'questions':'key'}));
  }catch(error){process.stderr.write(error.message+'\n');process.exitCode=1}
}
