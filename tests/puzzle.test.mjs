import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeKana} from '../src/core/kana.mjs';
import {extractSlots,validatePuzzle} from '../src/core/puzzle.mjs';

const original=JSON.parse(readFileSync(new URL('../puzzle.json',import.meta.url),'utf8'));
const copy=()=>structuredClone(original);
const hasCode=(p,code,overrides)=>validatePuzzle(p,overrides).errors.some(e=>e.code===code);

test('normalization handles hiragana, half-width, small kana and voicing',()=>{
  assert.equal(normalizeKana('がっこう'), 'ガツコウ');
  assert.equal(normalizeKana('ｷｬｯﾌﾟ'), 'キヤツプ');
  assert.equal(normalizeKana('シャシン'), 'シヤシン');
  assert.equal(normalizeKana('ぱーと'), 'パート');
  assert.equal(normalizeKana('ヂヅヴ'), 'ヂヅヴ');
  assert.notEqual(normalizeKana('カ'),normalizeKana('ガ'));
});
test('strict normalization rejects invalid and empty answers',()=>{
  assert.throws(()=>normalizeKana('ＡＢＣ',{strict:true}));
  assert.throws(()=>normalizeKana('',{strict:true}));
  assert.throws(()=>normalizeKana('123',{strict:true}));
  assert.equal(normalizeKana('あB'), 'ア');
});
test('canonical 6x6 / 14 clue prototype passes structure',()=>{
  const result=validatePuzzle(original);
  assert.deepEqual(result.errors,[]);
  assert.equal(result.analysis.slots.length,14);
  assert.equal(result.analysis.height,6);
  assert.equal(result.analysis.width,6);
  assert.equal(result.analysis.covered.size,26);
  assert.equal(result.analysis.slots.filter(x=>x.direction==='A').length,8);
  assert.equal(result.analysis.slots.filter(x=>x.direction==='D').length,6);
});
test('numbering and slot enumeration use row-major order',()=>{
  const a=extractSlots(original.grid);
  assert.equal(a.numbers['0,1'],1);
  assert.equal(a.numbers['2,2'],7);
  assert.equal(a.numbers['5,2'],13);
  assert.equal(a.slots.find(x=>x.direction==='D'&&x.number===7).answer,'カテイカ');
});
test('detect changed answer, position, number and missing clue',()=>{
  const p=copy();p.entries[0].answer='キイガ';
  assert.ok(hasCode(p,'entry_mismatch'));
  p.entries[0].answer='カイガ';p.entries[0].clue='';
  assert.ok(hasCode(p,'missing_clue'));
  p.entries[0].clue='説明';p.entries[0].cells.pop();
  assert.ok(hasCode(p,'entry_mismatch'));
  p.entries[0].cells=copy().entries[0].cells;p.numbers['0,1']=99;
  assert.ok(hasCode(p,'number_mismatch'));
});
test('detect a missing entry, duplicate entry, and extra entry',()=>{
  const p=copy();p.entries.pop();assert.ok(hasCode(p,'missing_entry'));
  p.entries=copy().entries;p.entries.push(copy().entries[0]);assert.ok(hasCode(p,'duplicate_entry'));
  p.entries.push({...copy().entries[0],start:[5,5]});assert.ok(hasCode(p,'extra_entry'));
});
test('detect invalid characters and bad dimensions',()=>{
  const p=copy();p.grid[1]='バA■クラス';assert.ok(hasCode(p,'invalid_kana'));
  p.grid[1]='バツ■クラス■';assert.ok(hasCode(p,'invalid_grid'));
});
test('detect neighboring black cells',()=>{
  const p=copy();p.grid[0]='■■イガ■テ';assert.ok(hasCode(p,'black_adjacent'));
});
test('detect rotational asymmetry and allow alternate rules',()=>{
  const p=copy();p.grid[0]='■カイガカテ';
  assert.ok(hasCode(p,'asymmetry'));
  assert.ok(!hasCode(p,'asymmetry',{rotationalSymmetry:false}));
});
test('detect disconnected white areas',()=>{
  const p=copy();p.grid=['カイ■■■■','■■■■■■','■■■■■■','■■■■■■','■■■■■■','■■オカネ■'];
  assert.ok(hasCode(p,'disconnected',{forbidAdjacentBlacks:false,rotationalSymmetry:false}));
});
test('detect duplicate answers and forbidden start characters',()=>{
  const p=copy();p.grid[0]='■ンイガ■テ';assert.ok(hasCode(p,'invalid_start'));
  const q=copy();q.grid[4]='トケイ■バツ';
  assert.ok(hasCode(q,'duplicate_answer',{rotationalSymmetry:false}));
});
test('required words must appear in filled slots',()=>{
  const p=copy();p.requiredWords=['家庭科'];
  assert.ok(hasCode(p,'invalid_required_word'));
  p.requiredWords=['かていか','てすと'];assert.ok(validatePuzzle(p).ok);
  p.requiredWords.push('ヤキソバ');assert.ok(hasCode(p,'missing_required_word'));
});
test('rectangular grids supported',()=>{
  const {width,height,slots}=extractSlots(['アイウ','エオカ']);
  assert.equal(width,3);assert.equal(height,2);assert.ok(slots.length>0);
});
