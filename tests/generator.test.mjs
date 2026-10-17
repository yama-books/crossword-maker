import test from 'node:test';
import assert from 'node:assert/strict';
import {parseWordList,generateWordLayout} from '../src/generator/words.mjs';
import {extractSlots,validatePuzzle} from '../src/core/puzzle.mjs';
import {createDraft,inspectDraft,toPuzzle} from '../src/editor/model.mjs';

const source=[
 '図書館 | としょかん | 本を読んだり借りたりするところ',
 '学校 | がっこう | 生徒が学ぶところ',
 '教室 | きょうしつ | 授業を受ける部屋',
 '先生 | せんせい | 学校で教える人',
 'かばん | 荷物を入れるもの',
 'りんご | 赤い果物',
 'みかん | 冬の果物',
 'ことば | 考えや気持ちを伝えるためのもの',
 'てんき | 晴れや雨など空のようす'
].join('\n');

test('words-first parser keeps display, canonical kana and the clue',()=>{
 const {entries,errors}=parseWordList(source);
 assert.deepEqual(errors,[]);
 assert.equal(entries.length,9);
 assert.deepEqual(entries[0],{
  id:'w1',display:'図書館',reading:'としょかん',value:'トシヨカン',
  clue:'本を読んだり借りたりするところ'
 });
 assert.equal(entries[1].value,'ガツコウ');
 assert.equal(entries[4].value,'カバン');
});
test('parser reports missing clues, invalid kana, duplicates, and length restrictions',()=>{
 const {entries,errors}=parseWordList([
  '学校 | がっこう | ヒント',
  'がっこう | 同じ読み',
  '漢字 | 漢字 | ヒント',
  'カ | 1文字の語',
  'カキ',
  'カタカナ | かな | '
 ].join('\n'));
 assert.equal(entries.length,1);
 assert.ok(errors.length>=5);
 assert.ok(errors.some(e=>e.includes('重複')));
 assert.ok(errors.some(e=>e.includes('読み')));
});
test('seeded arrangement is deterministic and every used answer occupies a matching slot',()=>{
 const {entries}=parseWordList(source);
 const a=generateWordLayout(entries,9,9,{trials:28,seed:20261017});
 const b=generateWordLayout(entries,9,9,{trials:28,seed:20261017});
 assert.deepEqual(a,b);
 assert.equal(a.grid.length,9);
 assert.equal([...a.grid[0]].length,9);
 assert.ok(a.placed.length>=2);
 assert.equal(a.placed.length+a.unplaced.length,entries.length);
 const slots=extractSlots(a.grid).slots;
 for(const entry of a.placed){
  assert.ok(slots.some(s=>s.direction===entry.direction&&
     s.start[0]===entry.r&&s.start[1]===entry.c&&s.answer===entry.value));
 }
});
test('generated result is editable without silently loosening the standard black rules',()=>{
 const {entries}=parseWordList(source);
 const layout=generateWordLayout(entries,9,9,{trials:20,seed:100});
 const draft={...createDraft(9,9),grid:layout.grid,clues:layout.clues};
 const report=inspectDraft(draft);
 assert.equal(report.blanks,0);
 assert.equal(report.missingClues,0);
 assert.ok(report.slotCount>=layout.placed.length);
 const puzzle=toPuzzle(draft);
 assert.deepEqual(puzzle.ruleSet,draft.rules);
 assert.equal(validatePuzzle(puzzle).ok,report.ok);
});
test('words larger than board remain unplaced without fake entries',()=>{
 const {entries,errors}=parseWordList('しんぶんししゃ | 新聞記者\nねこ | 動物');
 assert.deepEqual(errors,[]);
 const g=generateWordLayout(entries,5,5,{trials:3,seed:99});
 assert.equal(g.unplaced.length,1);
 assert.equal(g.unplaced[0].value,'シンブンシシヤ');
 assert.equal(g.placed.length,1);
});
test('generator does not accept malformed input or non-supported dimensions',()=>{
 const {entries}=parseWordList(source);
 assert.throws(()=>generateWordLayout(entries,4,8));
 assert.throws(()=>generateWordLayout(entries,9,16));
 assert.throws(()=>generateWordLayout([],9,9));
 assert.throws(()=>generateWordLayout([entries[0],entries[0]],9,9));
});
