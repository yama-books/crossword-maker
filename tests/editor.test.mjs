import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDraft,fromPuzzle,normalizeDraft,putCell,putClue,toPuzzle,inspectDraft} from '../src/editor/model.mjs';
import {validatePuzzle} from '../src/core/puzzle.mjs';
const puzzle=JSON.parse(readFileSync(new URL('../puzzle.json', import.meta.url),'utf8'));

test('initial draft can be saved without being a completed puzzle',()=>{
 const d=createDraft(7,9),v=inspectDraft(d);
 assert.equal(d.grid.length,7);assert.equal([...d.grid[0]].length,9);
 assert.equal(v.ok,false);assert.ok(v.blanks>0);
 assert.deepEqual(normalizeDraft(JSON.parse(JSON.stringify(d))),d);
});
test('single-cell edit uses the same Japanese normalization as the player',()=>{
 const d=createDraft(5,6);
 const next=putCell(d,1,2,'が');
 assert.equal(d.grid[1][2],'□');assert.equal(next.grid[1][2],'ガ');
 assert.equal(putCell(next,1,2,'っ').grid[1][2],'ツ');
 assert.equal(putCell(next,1,2,'').grid[1][2],'□');
 assert.throws(()=>putCell(next,1,2,'漢'));assert.throws(()=>putCell(next,1,2,'あい'));
 assert.throws(()=>putCell(next,100,0,'カ'));
});
test('legacy valid puzzle converts to an editable draft without altering its answers',()=>{
 const draft=fromPuzzle(puzzle);
 assert.equal(draft.grid.length,6);
 assert.equal(inspectDraft(draft).ok,true);
 assert.deepEqual(toPuzzle(draft).grid,puzzle.grid);
 assert.equal(toPuzzle(draft).entries.length,14);
 assert.ok(validatePuzzle(toPuzzle(draft)).ok);
});
test('legacy puzzle JSON imports, and corrupt legacy answers are rejected',()=>{
 assert.equal(normalizeDraft(puzzle).kind,'crossword-draft');
 const bad=structuredClone(puzzle);bad.entries[0].answer='ヤキソバ';
 assert.throws(()=>normalizeDraft(bad));
});
test('changing letters and clues prevents publishing until the issue is repaired',()=>{
 let draft=fromPuzzle(puzzle);
 draft=putCell(draft,0,1,'□');assert.equal(inspectDraft(draft).ok,false);
 draft=putCell(draft,0,1,'カ');assert.equal(inspectDraft(draft).ok,true);
 draft=putClue(draft,'A:0,1','');assert.equal(inspectDraft(draft).ok,false);
 draft=putClue(draft,'A:0,1','絵の作品');assert.equal(inspectDraft(draft).ok,true);
});
test('broken black square shapes remain drafts and cannot export as completed puzzles',()=>{
 const d=putCell(fromPuzzle(puzzle),0,1,'■');
 assert.equal(inspectDraft(d).ok,false);
 assert.ok(inspectDraft(d).issues.some(x=>x.includes('盤面ルール違反')));
});
test('modified draft rejects malformed JSON, invalid grid and oversized dimensions',()=>{
 const normal=fromPuzzle(puzzle);
 assert.throws(()=>normalizeDraft({...normal, grid:['ア']})); 
 assert.throws(()=>normalizeDraft({...normal,grid: Array(16).fill('ア'.repeat(16))}));
 assert.throws(()=>normalizeDraft({...normal,grid:['ア'.repeat(5),...normal.grid.slice(1)]}));
 assert.throws(()=>normalizeDraft({...normal,grid:normal.grid.map(x=>x.replace('カ','A'))}));
 assert.throws(()=>normalizeDraft({...normal,schemaVersion:999}));
});
test('empty board and orphan cells are never marked as completed',()=>{
 const allBlack=createDraft(5,5);
 assert.equal(inspectDraft({...allBlack,grid:Array(5).fill('■'.repeat(5))}).ok,false);
});
