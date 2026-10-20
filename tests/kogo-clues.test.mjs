import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseTsv} from '../scripts/check-lexicon.mjs';
import {readKogoClues,auditKogoClues} from '../scripts/check-kogo-clues.mjs';

const bank=readKogoClues(readFileSync(new URL('../data/learning/kogo_clues.jsonl',import.meta.url),'utf8'));
const lex=parseTsv(readFileSync(new URL('../data/lexicon/approved_lexicon.tsv',import.meta.url),'utf8'));
const byId=id=>bank.find(r=>r.clue_id===id);

test('K1: 30 sourced candidates have valid kana, IDs, status, metadata, and link targets',()=>{
 const r=auditKogoClues(bank,lex);
 assert.deepEqual(r.issues,[]);
 assert.equal(r.ok,true);
 assert.equal(r.total,30);
 assert.equal(r.ready,0); // no teacher has yet approved these for automatic selection
 assert.equal(r.holds,1);
 assert.equal(r.linked,10);
 assert.deepEqual(Object.values(r.types).reduce((a,b)=>a+b,0),30);
 assert.ok(new Set(bank.map(x=>x.answer)).size<bank.length); // one answer, multiple classical clues
});
test('K2: central sense of いと supports multiple legitimate translations',()=>{
 const first=byId('KOGO-CLUE-012');
 assert.equal(first.answer,'イト');
 assert.match(first.explanation,/たいへん/);
 assert.match(first.explanation,/たいそう/);
 assert.match(first.explanation,/打消し/);
 for(const id of ['KOGO-CLUE-019','KOGO-CLUE-020']){
   const q=byId(id);
   assert.equal(q.review_status,'source_checked_candidate');
   assert.equal(q.question_type,'modern_meaning');
   assert.deepEqual(q.acceptable_answer_readings,['タイヘン','タイソウ']);
   assert.equal(q.meaning_policy,'core_dictionary_sense');
   assert.equal(q.answer_key,null);
 }
 const invalid=structuredClone(bank);
 invalid.find(x=>x.clue_id==='KOGO-CLUE-019').acceptable_answer_readings=['タイソウ'];
 assert.ok(auditKogoClues(invalid,lex).issues.some(x=>x.includes('許容解答')));
});
test('K1: same pronunciation never equates 兼好 with 健康, いと with 糸, or 雲 with 蜘蛛',()=>{
 const names=[['KOGO-CLUE-025','ケンコウ'],['KOGO-CLUE-012','イト']];
 for(const [id,answer] of names){
  assert.equal(byId(id).answer,answer);
  assert.equal(byId(id).answer_key,null);
 }
 const cloud=byId('KOGO-CLUE-006');
 assert.equal(cloud.answer,'クモ');
 assert.equal(lex.find(x=>x.id===cloud.answer_key)?.surface,'雲');
});
test('K1: classical orthography and multiple sense caution stay explicit',()=>{
 const spellings=[['KOGO-CLUE-013','をかし','ヲカシ'],['KOGO-CLUE-014','あはれ','アハレ'],
                  ['KOGO-CLUE-015','やうやう','ヤウヤウ']];
 for(const [id,reading,answer] of spellings){
   const q=byId(id);
   assert.equal(q.reading,reading);
   assert.equal(q.answer,answer);
   assert.equal(q.review_status,'source_checked_candidate');
 }
 assert.match(byId('KOGO-CLUE-023').explanation,/所在ない/);
 assert.equal(byId('KOGO-CLUE-023').review_status,'source_checked_candidate');
 assert.deepEqual(byId('KOGO-CLUE-023').acceptable_answer_readings,['タイクツ','ショザイナイ']);
});
test('K1: incomplete provenance or incorrect dictionary mapping is not accepted',()=>{
 const invalid=structuredClone(bank);
 invalid[0].source_url='http://unverified.example';
 assert.equal(auditKogoClues(invalid,lex).ok,false);
 const wrong=structuredClone(bank);
 wrong.find(x=>x.clue_id==='KOGO-CLUE-012').answer_key='LEX-0942'; // 糸, not the classical adverb
 assert.equal(auditKogoClues(wrong,lex).ok,false);
});

test('K2: a single cloze marker never implies the number of kana in the answer',()=>{
 const spring=byId('KOGO-CLUE-001');
 assert.equal(spring.answer,'アケボノ');
 assert.match(spring.prompt,/（　）/);
 assert.equal(spring.blank_not_char_count,true);
 assert.equal(auditKogoClues(bank,lex).ok,true);
});
test('K2: only text-specific source uncertainty remains held; polysemy itself does not block study',()=>{
 assert.deepEqual(bank.filter(x=>x.review_status==='hold').map(x=>x.clue_id),['KOGO-CLUE-024']);
 for(const id of ['KOGO-CLUE-014','KOGO-CLUE-015','KOGO-CLUE-019','KOGO-CLUE-020','KOGO-CLUE-023']){
   assert.equal(byId(id).review_status,'source_checked_candidate');
 }
 assert.equal(bank.filter(x=>x.review_status==='human_checked').length,0);
});
