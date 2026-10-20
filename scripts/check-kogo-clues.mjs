import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {normalizeKana} from '../src/core/kana.mjs';
import {parseTsv} from './check-lexicon.mjs';

const TYPES=new Set(['passage','classical_word','modern_meaning','literary_history','grammar']);
const STATES=new Set(['hold','source_checked_candidate','human_checked']);
const SAFE_ID=/^KOGO-CLUE-\d{3}$/;

export function readKogoClues(text){
  if(typeof text!=='string')throw new TypeError('問題バンクの文字列が必要です。');
  return text.split(/\r?\n/).filter(x=>x.trim()).map((line,i)=>{
    try{return JSON.parse(line);}catch{throw new Error((i+1)+'行目：JSONを読み込めません。');}
  });
}

export function auditKogoClues(records,lexicon){
  const issues=[],idSet=new Set(),pairSet=new Set(),lexById=new Map(lexicon.map(x=>[x.id,x]));
  for(const [i,rec] of records.entries()){
    const where=(rec?.clue_id??'行'+(i+1));
    if(!rec || typeof rec!=='object' || Array.isArray(rec)){issues.push(where+': 不正なレコード');continue;}
    if(!SAFE_ID.test(rec.clue_id)||idSet.has(rec.clue_id))issues.push(where+': ID不正または重複');
    idSet.add(rec.clue_id);
    if(!TYPES.has(rec.question_type)||!STATES.has(rec.review_status))issues.push(where+': 分類またはレビュー状態が不正');
    if(![1,2,3].includes(rec.difficulty))issues.push(where+': 難易度の範囲外');
    if(rec.classics_related!==true||typeof rec.answer_is_classical!=='boolean')issues.push(where+': 古典フラグが不正');
    if(typeof rec.prompt!=='string'||rec.prompt.trim().length<12||rec.prompt.length>280)
      issues.push(where+': 問いの文字数が不正');
    if(typeof rec.answer!=='string'||!/^[ァ-ヴー]{2,15}$/u.test(rec.answer))
      issues.push(where+': 盤面の解答カナが不正');
    if(typeof rec.reading!=='string')issues.push(where+': 読みの欠落');
    else try{if(normalizeKana(rec.reading,{strict:true})!==rec.answer)issues.push(where+': 読みと盤面解答の不一致');}
    catch{issues.push(where+': 読みが不正');}
    if(typeof rec.prompt==='string'&&typeof rec.answer==='string'&&rec.prompt.includes(rec.answer))
      issues.push(where+': 問題文に解答カナをそのまま表示');
    if(typeof rec.explanation!=='string'||rec.explanation.length<7)issues.push(where+': 解説が不十分');
    if(typeof rec.work!=='string'||!rec.work)issues.push(where+': 作品情報が欠落');
    if(typeof rec.source_url!=='string'||!/^https:\/\/(ja\.wikisource\.org|kotobank\.jp|ndlsearch\.ndl\.go\.jp)\//.test(rec.source_url))
      issues.push(where+': 出典URLが不正');
    if(typeof rec.source_excerpt!=='string'||rec.source_excerpt.length<2||rec.source_excerpt.length>55)
      issues.push(where+': 確認した原文が長すぎるか欠落');
    if(typeof rec.review_note!=='string'||!rec.review_note)issues.push(where+': レビュー注記が欠落');
    const pair=rec.answer+'|'+rec.prompt;
    if(pairSet.has(pair))issues.push(where+': 同一の問いが重複');
    pairSet.add(pair);
    if(rec.answer_key!=null){
      const entry=lexById.get(rec.answer_key);
      if(!entry || entry.normalized!==rec.answer || rec.lexicon_link_status!=='linked')
        issues.push(where+': 解答語IDとカナが不一致');
    }else if(rec.lexicon_link_status!=='unlinked')issues.push(where+': 未リンクなのにリンク済み扱い');
    if(['KOGO-CLUE-019','KOGO-CLUE-020'].includes(rec.clue_id)&&rec.review_status!=='hold')
      issues.push(where+': 「いと」の現代語訳は複数正答のため保留必須');
  }
  const meaningQuestions=records.filter(x=>x?.question_type==='modern_meaning');
  const ready=records.filter(x=>x?.review_status==='human_checked');
  return {ok:issues.length===0,issues,total:records.length,ready:ready.length,
    holds:records.filter(x=>x?.review_status==='hold').length,
    linked:records.filter(x=>x?.answer_key).length,
    types:Object.fromEntries([...TYPES].map(t=>[t,records.filter(x=>x?.question_type===t).length])),
    meaningQuestions:meaningQuestions.length};
}

const calledAsScript=process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1];
if(calledAsScript){
 const data=readKogoClues(readFileSync(new URL('../data/learning/kogo_clues.jsonl',import.meta.url),'utf8'));
 const lex=parseTsv(readFileSync(new URL('../data/lexicon/approved_lexicon.tsv',import.meta.url),'utf8'));
 const report=auditKogoClues(data,lex);
 if(!report.ok){console.error(report.issues.join('\n'));process.exitCode=1;}
 else console.log('Kogo clue bank:',report.total,'candidates,',report.ready,'human-approved,',report.holds,'held,',report.linked,'lexicon matches.');
}
