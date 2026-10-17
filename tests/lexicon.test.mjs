import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {parseTsv,validateRecords,checkFiles} from '../scripts/check-lexicon.mjs';
import {normalizeKana} from '../src/core/kana.mjs';

const approvedPath = fileURLToPath(new URL('../data/lexicon/approved_lexicon.tsv',import.meta.url));
const approved=parseTsv(readFileSync(approvedPath,'utf8'));

test('1000 editorially checked words pass lexical structural checks',()=>{
 const check=checkFiles();
 assert.equal(check.candidates.count,1000);
 assert.equal(check.approved.count,1000);
 assert.deepEqual(check.errors,[]);
 assert.equal(Object.keys(check.approved.byCategory).length,50);
 assert.ok(Object.values(check.approved.byCategory).every(n=>n===20));
 assert.equal(Object.entries(check.approved.byLength).filter(([n])=>Number(n)<=5).reduce((n,[,value])=>n+value,0),910);
 assert.ok(approved.every(word=>word.review_status==='editor_checked'));
});
test('small kana expansion agrees with shared M1 function',()=>{
 const row=approved.find(word=>word.surface==='学校');
 assert.equal(row.normalized,normalizeKana(row.reading,{strict:true}));
 assert.equal(row.normalized,'ガツコウ');
 assert.equal(normalizeKana('ふぁすなー',{strict:true}),'フアスナー');
});
test('lexicon validator rejects duplicate answers and clue leakage',()=>{
 const duplicate={...approved[0],id:'LEX-9999'};
 const dup=validateRecords([...approved,duplicate],{approved:true});
 assert.ok(dup.errors.some(message=>message.includes('duplicate normalized')));
 const leaking={...approved[0],clue:approved[0].clue+' '+approved[0].surface};
 const checked=validateRecords([leaking],{approved:true});
 assert.ok(checked.errors.some(message=>message.includes('direct surface')));
});


test('normalization rejects ambiguous homophones and one-cell words',()=>{
  const map = new Map(approved.map(row=>[row.normalized,row.surface]));
  assert.equal(map.get(normalizeKana('びよういん',{strict:true})),'病院');
  assert.equal(map.get(normalizeKana('まつ',{strict:true})),'松');
  assert.equal(map.get(normalizeKana('りょうし',{strict:true})),'理容師');
  assert.equal(map.get(normalizeKana('すいせい',{strict:true})),'水星');
  const invalid={...approved[0],id:'LEX-9001',surface:'酢',reading:'す',normalized:'ス',length:'1',clue:'料理を酸っぱくする調味料'};
  assert.ok(validateRecords([invalid],{approved:true}).errors.length>0);
});
