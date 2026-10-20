import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {validatePuzzle} from '../src/core/puzzle.mjs';
import {encodeSharedPuzzle,decodeSharedPuzzle,makeShareUrl,sharedProgressKey} from '../src/share/codec.mjs';
import {lexiconPayload} from '../src/generator/lexicon.mjs';
import {parseTsv} from '../scripts/check-lexicon.mjs';
import {generateCompleteCrossword} from '../src/generator/auto-fill.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const original=JSON.parse(read('puzzle.json'));
test('complete sample puzzle can be shared and reconstructed without server storage',()=>{
 const fragment=encodeSharedPuzzle(original);
 assert.match(fragment,/^#p=1\.[A-Za-z0-9_-]+$/);
 assert.ok(fragment.length<6500);
 const restored=decodeSharedPuzzle(fragment);
 assert.equal(validatePuzzle(restored).ok,true);
 assert.equal(restored.title,original.title);
 assert.deepEqual(restored.grid,original.grid);
 const clues=p=>p.entries.map(e=>({direction:e.direction,number:e.number,clue:e.clue,answer:e.answer}));
 assert.deepEqual(clues(restored),clues(original));
 assert.equal(encodeSharedPuzzle(restored),fragment);
});
test('generated custom 5x5 shares successfully with all clues',()=>{
 const entries=lexiconPayload(parseTsv(read('data/lexicon/approved_lexicon.tsv'))).entries;
 const made=generateCompleteCrossword({entries,required:['イヌ','ネコ'],difficulty:3,seed:20261019,maxNodes:22000});
 assert.equal(made.status,'success');
 const decoded=decodeSharedPuzzle(encodeSharedPuzzle(made.puzzle));
 assert.equal(validatePuzzle(decoded).ok,true);
 assert.deepEqual(decoded.grid,made.puzzle.grid);
 assert.ok(decoded.entries.some(e=>e.answer==='イヌ'));
 assert.ok(decoded.entries.some(e=>e.answer==='ネコ'));
});
test('unfinished puzzles are blocked and malformed links do not load',()=>{
 const draft=structuredClone(original);
 draft.grid[0]=draft.grid[0].replace('カ','□');
 assert.throws(()=>encodeSharedPuzzle(draft),/完成していない/);
 assert.throws(()=>decodeSharedPuzzle('#p=1.invalid!'),/形式/);
 assert.throws(()=>decodeSharedPuzzle('#p=2.abc'),/形式/);
 assert.throws(()=>decodeSharedPuzzle('#p=1.abc'),/共有/);
});
test('shared progress is isolated by link and unrelated to the original sample',()=>{
 const a=encodeSharedPuzzle(original);
 const b=structuredClone(original);b.title='別の問題';
 const c=encodeSharedPuzzle(b);
 assert.notEqual(sharedProgressKey(a),sharedProgressKey(c));
 assert.notEqual(sharedProgressKey(a),'jp-crossword-proto-v1');
 assert.equal(sharedProgressKey(a),sharedProgressKey(a));
 const url=makeShareUrl(original,'https://yama-books.github.io/crossword-maker/editor.html');
 assert.match(url,/^https:\/\/yama-books\.github\.io\/crossword-maker\/index\.html#p=1\./);
 assert.equal(decodeSharedPuzzle(new URL(url).hash).title,original.title);
});
test('player embeds working offline share decoder and still includes default puzzle',()=>{
 const html=read('index.html'),template=read('src/index.template.html'),build=read('scripts/build.mjs');
 assert.match(template,/\/\*__PUZZLE_CORE__\*\//);
 assert.match(template,/\/\*__SHARE_CORE__\*\//);
 assert.ok(html.includes('decodeSharedPuzzle(location.hash)'));
 assert.ok(html.includes("localStorage.getItem(progressKey)"));
 assert.ok(html.includes("grid.style.gridTemplateColumns="));
 assert.ok(html.includes('const originalPuzzle='));
 assert.ok(build.includes("'src/share/codec.mjs'"));
 assert.doesNotMatch(html,/\/\*__SHARE_CORE__\*\//);
 const source=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
 assert.ok(source);
 assert.doesNotThrow(()=>new Script(source,{filename:'index.html inline script'}));
});
test('editor only enables share after the canonical board verification',()=>{
 const html=read('editor.html'),app=read('src/editor/app.mjs');
 for(const id of ['share-puzzle','share-panel','share-url','share-copy','share-native','share-preview'])
  assert.ok(html.includes('id="'+id+'"'));
 assert.ok(app.includes(" $('share-puzzle').disabled=!review.ok;"));
 assert.ok(app.includes('makeShareUrl(toPuzzle(draft),location.href)'));
 assert.ok(app.includes("navigator.clipboard?.writeText"));
 assert.ok(app.includes("navigator.share("));
});