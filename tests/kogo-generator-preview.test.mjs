import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readKogoClues} from '../scripts/check-kogo-clues.mjs';
import {parseTsv} from '../scripts/check-lexicon.mjs';
import {lexiconPayload} from '../src/generator/lexicon.mjs';
import {validatePuzzle} from '../src/core/puzzle.mjs';
import {generateKogoPreviewPuzzle} from '../src/learning/kogo/generator-preview.mjs';

const clues=readKogoClues(readFileSync(new URL('../data/learning/kogo_clues.jsonl',import.meta.url),'utf8'));
const lexiconEntries=lexiconPayload(parseTsv(readFileSync(new URL('../data/lexicon/approved_lexicon.tsv',import.meta.url),'utf8'))).entries;

test('K6: student release is closed before any unapproved general filler can be selected',()=>{
 const result=generateKogoPreviewPuzzle({clues,lexiconEntries,audience:'student'});
 assert.equal(result.status,'student_blocked');
 assert.equal(result.puzzle,null);
 assert.equal(result.attempts,0);
 const modified=structuredClone(clues);
 modified[0].review_status='human_checked';
 assert.equal(generateKogoPreviewPuzzle({clues:modified,lexiconEntries,audience:'student'}).status,'student_blocked');
});
test('K6: a bounded fixed 5x5 experiment reports validity and actual measured clue mixture',()=>{
 const options={clues,lexiconEntries,difficulty:'normal',seed:7,count:24,maxNodes:12000,maxTries:3};
 const r=generateKogoPreviewPuzzle(options);
 assert.ok(['draft_puzzle','not_completed'].includes(r.status));
 assert.ok(r.selected>0);
 if(r.status==='draft_puzzle'){
   assert.equal(r.valid,true);
   assert.equal(validatePuzzle(r.puzzle).ok,true);
   assert.ok(r.measured.kogoSlots>=1);
   assert.equal(r.measured.totalSlots,r.puzzle.entries.length);
   assert.equal(r.measured.kogoSlots+r.measured.genericSlots,r.measured.totalSlots);
   assert.equal(r.measured.vocabularyKogoSlots+r.measured.textRecallKogoSlots,r.measured.kogoSlots);
   assert.ok(r.measured.vocabularyShareWithinKogo>=0&&r.measured.vocabularyShareWithinKogo<=1);
   assert.ok(r.puzzle.entries.some(e=>r.selection.entries.some(s=>s.answer===e.answer&&s.clue===e.clue)));
   assert.ok(r.warnings.some(w=>w.includes('未承認')));
 }else{
   assert.equal(r.puzzle,null);
   assert.equal(r.attempts,3);
   assert.equal(r.failures.length,3);
 }
 console.log('K6 actual integration sample',JSON.stringify({
   seed:7,status:r.status,attempts:r.attempts,measured:r.measured??null,
   failures:r.failures??[]
 }));
});
test('K6: invalid input, quotas and release states fail explicitly',()=>{
 const base={clues,lexiconEntries};
 assert.throws(()=>generateKogoPreviewPuzzle({...base,maxNodes:0}),RangeError);
 assert.throws(()=>generateKogoPreviewPuzzle({...base,maxTries:9}),RangeError);
 assert.throws(()=>generateKogoPreviewPuzzle({...base,seed:-1}),RangeError);
 assert.throws(()=>generateKogoPreviewPuzzle({...base,clues:{}}),TypeError);
 const noCandidates=generateKogoPreviewPuzzle({
   ...base,clues:clues.map(x=>({...x,review_status:'hold'})),maxTries:1,maxNodes:1
 });
 assert.equal(noCandidates.status,'no_candidate');
 assert.equal(noCandidates.puzzle,null);
});
