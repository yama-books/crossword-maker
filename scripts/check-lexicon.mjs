import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {normalizeKana} from '../src/core/kana.mjs';

const COLS = ['id','surface','reading','normalized','length','clue','category','difficulty','source','review_status'];
const statuses = new Set(['candidate','editor_checked','human_checked']);
const isValid = /^[ァ-ヴー]+$/u;
const count = s => [...s].length;

export function parseTsv(text) {
  const lines = text.replace(/\r\n/g, '\n').trimEnd().split('\n');
  if (lines[0] !== COLS.join('\t')) throw new Error('Unexpected lexicon header');
  return lines.slice(1).filter(Boolean).map((line,i) => {
    const columns=line.split('\t');
    if (columns.length !== COLS.length) throw new Error('Line '+(i+2)+' has '+columns.length+' columns');
    return Object.fromEntries(COLS.map((key,j)=>[key,columns[j]]));
  });
}
export function validateRecords(rows,{approved=false}={}) {
  const errors=[],ids=new Set(),senses=new Set(),answerGroups=new Map(),byCategory={},byLength={};
  for (const [idx,row] of rows.entries()) {
    const where='line '+(idx+2)+' '+row.id;
    if(!/^LEX-\d{4,}$/u.test(row.id)||ids.has(row.id))errors.push(where+': missing/duplicate ID');
    ids.add(row.id);
    if(!row.surface?.trim()||!row.reading?.trim()||!row.clue?.trim()||!row.category?.trim()||!row.source?.trim())errors.push(where+': empty required field');
    let expected='';
    try {expected=normalizeKana(row.reading,{strict:true});}
    catch {errors.push(where+': invalid reading');}
    if(row.normalized!==expected||!isValid.test(row.normalized))errors.push(where+': normalization mismatch');
    if(count(row.normalized)<2||count(row.normalized)>15||/^[ンー]/u.test(row.normalized))errors.push(where+': invalid crossword answer');
    if(Number(row.length)!==count(row.normalized)||!String(row.length).match(/^\d+$/u))errors.push(where+': length mismatch');
    // Multiple meanings or clues may share a crossword answer. Only a truly
    // repeated sense+clue is invalid; one cell answer must still be deduplicated.
    const senseKey=[row.normalized,row.surface,row.clue].join('\u0000');
    if(senses.has(senseKey))errors.push(where+': duplicate answer/surface/clue '+row.normalized);
    senses.add(senseKey);
    if(!answerGroups.has(row.normalized))answerGroups.set(row.normalized,[]);
    answerGroups.get(row.normalized).push(row);
    if(!['1','2','3'].includes(row.difficulty))errors.push(where+': invalid difficulty');
    if(!statuses.has(row.review_status)||(approved&&row.review_status==='candidate')||(!approved&&row.review_status!=='candidate'))errors.push(where+': invalid review status');
    if(row.surface.length>1&&row.clue.includes(row.surface))errors.push(where+': direct surface in clue');
    if(count(row.reading)>=3&&row.clue.includes(row.reading))errors.push(where+': direct reading in clue');
    if(count(row.clue)<7)errors.push(where+': clue is too short');
    byCategory[row.category]=(byCategory[row.category]??0)+1;
    byLength[row.length]=(byLength[row.length]??0)+1;
  }
  const homonymGroups=Object.fromEntries(
    [...answerGroups].filter(([,entries])=>entries.length>1)
      .map(([answer,entries])=>[answer,entries.map(({id,surface,difficulty})=>({id,surface,difficulty}))]));
  return {errors,count:rows.length,uniqueAnswers:answerGroups.size,homonymGroups,byCategory,byLength};
}

/**
 * Convert meaning/clue records to one selectable answer per crossword.
 * Does not discard lexicon senses: it only chooses which clue a puzzle uses.
 * Optionally filter by category or a list of categories before selection.
 * Within a shared answer, choose the sense closest to the requested difficulty;
 * ties keep the earlier (stable ID-ordered) row.
 */
export function selectOneCluePerAnswer(rows,{difficulty=1,category=null}={}) {
  const target=Number(difficulty);
  if(![1,2,3].includes(target))throw new RangeError('difficulty must be 1, 2 or 3');
  const categoryList=category===null?null:(Array.isArray(category)?category:[category]);
  if(categoryList!==null && (!categoryList.length || categoryList.some(x=>typeof x!=='string'||!x.trim())))
    throw new TypeError('category must be a nonempty string or array of strings');
  const allowed=categoryList===null?null:new Set(categoryList);
  const chosen=new Map();
  for(const row of rows){
    if(allowed!==null && !allowed.has(row.category))continue;
    const previous=chosen.get(row.normalized);
    if(!previous || Math.abs(Number(row.difficulty)-target)<Math.abs(Number(previous.difficulty)-target)){
      chosen.set(row.normalized,row);
    }
  }
  return [...chosen.values()];
}
/** Compatible with M3a's "display | reading | clue" word list. */
export function toLegacyWordList(rows,options={}) {
  return selectOneCluePerAnswer(rows,options)
    .map(({surface,reading,clue})=>[surface,reading,clue].join(' | ')).join('\n');
}
export function checkFiles() {
  const base = fileURLToPath(new URL('../data/lexicon/',import.meta.url));
  const candidates = parseTsv(readFileSync(resolve(base,'seed_candidates.tsv'),'utf8'));
  const approved = parseTsv(readFileSync(resolve(base,'approved_lexicon.tsv'),'utf8'));
  const a=validateRecords(candidates),b=validateRecords(approved,{approved:true});
  const candidatesById=new Map(candidates.map(row=>[row.id,row]));
  for(const row of approved)if(!candidatesById.has(row.id))b.errors.push('approved ID absent in candidates: '+row.id);
  for(const row of approved){
    const candidate=candidatesById.get(row.id);
    if(candidate){
      for(const key of COLS.filter(k=>k!=='review_status')){
        if(candidate[key]!==row[key])b.errors.push('approved mismatch '+row.id+': '+key);
      }
    }
  }
  return {candidates:a,approved:b,errors:[...a.errors,...b.errors]};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const r=checkFiles();
  console.log(JSON.stringify({candidateCount:r.candidates.count,approvedCount:r.approved.count,uniqueAnswers:r.approved.uniqueAnswers,homonymGroups:r.approved.homonymGroups,categories:r.approved.byCategory,lengths:r.approved.byLength,errors:r.errors},null,2));
  if(r.errors.length)process.exitCode=1;
}
