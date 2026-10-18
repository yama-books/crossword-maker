import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {parseTsv} from '../scripts/check-lexicon.mjs';
import {createLexiconExport} from '../scripts/export-lexicon.mjs';
import {parseWordList} from '../src/generator/words.mjs';

const lexicon=parseTsv(readFileSync(fileURLToPath(new URL('../data/lexicon/approved_lexicon.tsv',import.meta.url)),'utf8'));
const byId=new Map(lexicon.map(row=>[row.id,row]));
function readTable(name,header){
 const path=fileURLToPath(new URL('../data/lexicon/review/'+name,import.meta.url));
 const lines=readFileSync(path,'utf8').replace(/\r\n/g,'\n').replace(/\n$/u,'').split('\n');
 assert.equal(lines.shift(),header.join('\t'));
 return lines.map(line=>{
   const values=line.split('\t');
   assert.equal(values.length,header.length);
   return Object.fromEntries(header.map((k,i)=>[k,values[i]]));
 });
}

test('24 blind-review questions match their separate key and the canonical clues',()=>{
 const questions=readTable('round8_blind_questions.tsv',['question_id','length','clue','response','confidence']);
 const key=readTable('round8_blind_answer_key.tsv',['question_id','lexicon_id','surface','normalized','category','difficulty']);
 assert.equal(questions.length,24);
 assert.equal(key.length,24);
 const keyByQ=new Map(key.map(row=>[row.question_id,row]));
 assert.equal(keyByQ.size,24);
 assert.equal(new Set(key.map(row=>row.lexicon_id)).size,24);
 assert.equal(new Set(key.map(row=>row.normalized)).size,24);
 assert.ok(new Set(key.map(row=>row.category)).size>=8);
 for(const q of questions){
   const answer=keyByQ.get(q.question_id);
   assert.ok(answer,'answer key for '+q.question_id);
   const source=byId.get(answer.lexicon_id);
   assert.ok(source,'lexicon ID for '+q.question_id);
   assert.equal(q.clue,source.clue);
   assert.equal(q.length,source.length);
   assert.equal(answer.surface,source.surface);
   assert.equal(answer.normalized,source.normalized);
   assert.equal(answer.category,source.category);
   assert.equal(answer.difficulty,source.difficulty);
   assert.equal(source.review_status,'editor_checked');
   assert.equal(q.response,'');
   assert.equal(q.confidence,'');
   // Keep direct display answers out of the respondent-facing test, even for a single-kanji word.
   assert.ok(!q.clue.includes(source.surface),q.question_id+' repeats display answer');
 }
});

test('all 100 genres can produce five deterministic M3a-compatible distinct answers',()=>{
 const categories=[...new Set(lexicon.map(row=>row.category))];
 assert.equal(categories.length,100);
 for(const category of categories){
   const opts={category,difficulty:2,count:5,seed:20261018,maxLength:15};
   const first=createLexiconExport(lexicon,opts);
   const again=createLexiconExport(lexicon,opts);
   assert.equal(first.text,again.text,category+' changed seeded selection');
   assert.equal(first.selected.length,5);
   assert.ok(first.selected.every(row=>row.category===category));
   assert.equal(new Set(first.selected.map(row=>row.normalized)).size,5);
   const parsed=parseWordList(first.text);
   assert.deepEqual(parsed.errors,[],category+' has unusable M3a input');
   assert.equal(parsed.entries.length,5);
 }
});
