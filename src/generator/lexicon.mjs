import {normalizeKana} from '../core/kana.mjs';

/**
 * Convert the curated lexicon into a stable, answer-unique search index.
 * The source still retains every homonymous sense; only a single sense is
 * selected per answer in one generated puzzle.
 */
export function buildLexiconIndex(records,{difficulty=2,categories=null,minLength=2,maxLength=15}={}) {
  if(!Array.isArray(records))throw new TypeError('語彙データが配列ではありません。');
  if(![1,2,3].includes(Number(difficulty)))throw new RangeError('難易度は1〜3です。');
  const selected=new Map(),allowed=categories==null?null:new Set(Array.isArray(categories)?categories:[categories]);
  for(const record of records){
    if(!record || typeof record!=='object')continue;
    if(allowed && !allowed.has(record.category))continue;
    let answer;
    try {answer=normalizeKana(String(record.answer??record.normalized??record.reading??''),{strict:true});}
    catch {continue;}
    if(!/^[ァ-ヴー]+$/u.test(answer) || answer.length<minLength || answer.length>maxLength || /^[ンー]/u.test(answer))continue;
    if(!String(record.clue??'').trim())continue;
    const row={id:String(record.id??answer),answer,clue:String(record.clue),surface:String(record.surface??answer),
      category:String(record.category??''),difficulty:Number(record.difficulty)||2};
    const previous=selected.get(answer);
    if(!previous || Math.abs(row.difficulty-difficulty)<Math.abs(previous.difficulty-difficulty))selected.set(answer,row);
  }
  const byLength=new Map(),byAnswer=new Map();
  for(const row of selected.values()){
    if(!byLength.has(row.answer.length))byLength.set(row.answer.length,[]);
    byLength.get(row.answer.length).push(row);
    byAnswer.set(row.answer,row);
  }
  return {byLength,byAnswer,totalRecords:records.length,uniqueAnswers:selected.size};
}

/** Serialisable browser payload, intentionally excluding review/private metadata. */
export function lexiconPayload(rows) {
  return {schemaVersion:1,entries:rows.map(row=>({
    id:row.id,answer:row.normalized,surface:row.surface,
    clue:row.clue,category:row.category,difficulty:Number(row.difficulty)
  }))};
}

/**
 * Required entries may be provided as kana readings or exact displayed
 * Japanese terms (e.g. 図書館). Ambiguous surfaces require an explicit reading.
 */
export function resolveRequiredWords(raw,records){
  if(!Array.isArray(raw))throw new TypeError('必須語は配列で指定してください。');
  const result=[];
  for(const value of raw){
    const term=String(value??'').trim();
    if(!term)continue;
    let answer='';
    try{
      answer=normalizeKana(term,{strict:true});
      if(!/^[ァ-ヴー]+$/u.test(answer))answer='';
    }catch{}
    if(!answer){
      const matches=new Set(records.filter(x=>x.surface===term).map(x=>x.answer??x.normalized));
      if(!matches.size)throw new Error('「'+term+'」は辞書にありません。読みをひらがなで入力してください。');
      if(matches.size!==1)throw new Error('「'+term+'」には複数の読みがあります。ひらがなで指定してください。');
      answer=[...matches][0];
    }
    result.push(answer);
  }
  if(new Set(result).size!==result.length)throw new Error('必須語が重複しています。');
  return result;
}
