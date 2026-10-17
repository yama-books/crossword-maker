import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {parseTsv,validateRecords,checkFiles} from '../scripts/check-lexicon.mjs';
import {normalizeKana} from '../src/core/kana.mjs';

const approvedPath = fileURLToPath(new URL('../data/lexicon/approved_lexicon.tsv',import.meta.url));
const approved=parseTsv(readFileSync(approvedPath,'utf8'));

test('560 editorially checked words pass lexical structural checks',()=>{
 const check=checkFiles();
 assert.equal(check.candidates.count,560);
 assert.equal(check.approved.count,560);
 assert.deepEqual(check.errors,[]);
 assert.equal(Object.keys(check.approved.byCategory).length,28);
 assert.ok(Object.values(check.approved.byCategory).every(n=>n===20));
 assert.equal(Object.entries(check.approved.byLength).filter(([n])=>Number(n)<=5).reduce((n,[,value])=>n+value,0),519);
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

