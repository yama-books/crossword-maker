import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {selectKogoClues} from '../src/learning/kogo/selector.mjs';
import {readKogoClues} from '../scripts/check-kogo-clues.mjs';

const records=readKogoClues(readFileSync(new URL('../data/learning/kogo_clues.jsonl',import.meta.url),'utf8'));

test('K5: normal level picks vocabulary without inadvertently pulling hard source memorization',()=>{
  const selection=selectKogoClues(records,{count:10,seed:'lesson-01'});
  assert.equal(selection.status,'draft_preview');
  assert.equal(selection.achieved,10);
  assert.equal(selection.recallCount,0);
  assert.equal(selection.vocabularyCount,10);
  assert.ok(selection.entries.every(e=>e.difficulty<=2));
  assert.ok(selection.entries.every(e=>e.review_status==='source_checked_candidate'));
  assert.ok(selection.warnings.length===0);
});

test('K5: hard level targets 80 percent word-based clues while including limited text recall',()=>{
  const selection=selectKogoClues(records,{count:10,difficulty:'hard',seed:42});
  assert.equal(selection.achieved,10);
  assert.ok(selection.vocabularyCount>=8);
  assert.ok(selection.recallCount<=2);
  assert.ok(selection.achievedVocabularyShare>=0.8);
  assert.ok(selection.entries.every(e=>e.difficulty<=3));
  assert.ok(selection.entries.every(e=>e.id!=='KOGO-CLUE-024'));
});

test('K5: reproducible across reordered input with the same seed; avoid duplicates of answer or meaning group',()=>{
  const options={count:24,difficulty:'hard',seed:'stable-a'};
  const first=selectKogoClues(records,options);
  const reversed=selectKogoClues(records.slice().reverse(),options);
  assert.deepEqual(first,reversed);
  assert.equal(new Set(first.entries.map(e=>e.answer)).size,first.entries.length);
  const groups=first.entries.map(e=>e.meaning_group_id).filter(Boolean);
  assert.equal(new Set(groups).size,groups.length);
  assert.notDeepEqual(first.entries.map(e=>e.id),selectKogoClues(records,{...options,seed:'stable-b'}).entries.map(e=>e.id));
});

test('K5: student release fails closed if there are zero teacher-approved questions',()=>{
  const selection=selectKogoClues(records,{audience:'student',difficulty:'hard'});
  assert.equal(selection.status,'no_approved_clues');
  assert.equal(selection.eligible,0);
  assert.equal(selection.achieved,0);
  assert.deepEqual(selection.entries,[]);
  assert.ok(selection.warnings.some(s=>s.includes('承認')));
  const approved=structuredClone(records);
  approved.find(x=>x.clue_id==='KOGO-CLUE-019').review_status='human_checked';
  approved.find(x=>x.clue_id==='KOGO-CLUE-020').review_status='human_checked';
  const result=selectKogoClues(approved,{audience:'student',count:3,difficulty:'hard'});
  assert.equal(result.status,'approved_selection');
  assert.equal(result.achieved,1); // いと: たいへん/たいそう are one meaning-group
  assert.ok(result.entries.every(x=>x.review_status==='human_checked'));
  assert.equal(result.entries.filter(x=>x.meaning_group_id==='kogo:ito:intensifier').length,1);
});

test('K5: topic/length filters and shortage reporting are explicit, not invented entries',()=>{
  const selection=selectKogoClues(records,{
    difficulty:'hard',works:['源氏物語'],count:30,maxLength:5,seed:'length'
  });
  assert.ok(selection.achieved<30);
  assert.ok(selection.entries.every(x=>x.work==='源氏物語'&&x.answer.length<=5));
  assert.ok(selection.warnings.some(w=>w.includes('不足')));
  assert.equal(selection.eligible,records.filter(x=>x.work==='源氏物語'&&x.answer.length<=5&&x.review_status!=='hold').length);
});
test('K5: invalid options throw before selection',()=>{
  assert.throws(()=>selectKogoClues({},{}),TypeError);
  assert.throws(()=>selectKogoClues(records,{audience:'unknown'}),RangeError);
  assert.throws(()=>selectKogoClues(records,{difficulty:'unknown'}),RangeError);
  assert.throws(()=>selectKogoClues(records,{count:0}),RangeError);
  assert.throws(()=>selectKogoClues(records,{vocabularyShare:2}),RangeError);
  assert.throws(()=>selectKogoClues(records,{minLength:10,maxLength:4}),RangeError);
});
