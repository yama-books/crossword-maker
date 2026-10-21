import {readFileSync} from 'node:fs';
import {readKogoClues} from './check-kogo-clues.mjs';
import {selectKogoClues} from '../src/learning/kogo/selector.mjs';

// Local/internal data-only preview. No website deployment or student release.
const args=process.argv.slice(2);
const opts={audience:'preview',difficulty:'hard',count:10,vocabularyShare:0.8,seed:'lesson-demo'};
for(let i=0;i<args.length;i++){
  const key=args[i],value=args[++i];
  if(value==null)throw new Error('オプションに値がありません: '+key);
  if(key==='--difficulty')opts.difficulty=value;
  else if(key==='--count')opts.count=Number(value);
  else if(key==='--seed')opts.seed=value;
  else if(key==='--vocabulary-share')opts.vocabularyShare=Number(value);
  else if(key==='--audience')opts.audience=value;
  else throw new Error('未定義のオプション: '+key);
}
const rows=readKogoClues(readFileSync(new URL('../data/learning/kogo_clues.jsonl',import.meta.url),'utf8'));
const result=selectKogoClues(rows,opts);
console.log('古語クロスワード【データ選題プレビュー】');
console.log('状態: '+result.status+' ／選定 '+result.achieved+'/'+result.requested+
  '／単語 '+result.vocabularyCount+'／本文記憶 '+result.recallCount+
  '／単語割合 '+Math.round(result.achievedVocabularyShare*100)+'%');
for(const [i,e] of result.entries.entries())
  console.log(String(i+1).padStart(2,'0')+'. '+e.clue+'  → '+e.answer+' ['+e.id+']');
for(const message of result.warnings)console.warn('注意: '+message);
console.log('※盤面生成・完成問題・教師校閲・生徒向け公開は行っていません。');
