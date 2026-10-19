import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {parseTsv} from '../scripts/check-lexicon.mjs';
import {lexiconPayload} from '../src/generator/lexicon.mjs';
import {candidateMasks5,generateCompleteCrossword} from '../src/generator/auto-fill.mjs';
import {validatePuzzle} from '../src/core/puzzle.mjs';

const read=path=>readFileSync(fileURLToPath(new URL('../'+path,import.meta.url)),'utf8');
const entries=lexiconPayload(parseTsv(read('data/lexicon/approved_lexicon.tsv'))).entries;

test('new responsive editor keeps the board and tools together',()=>{
  const html=read('editor.html'),css=read('src/editor/layout-v3.css'),build=read('scripts/build.mjs');
  assert.ok(html.indexOf('id="board"')<html.indexOf('id="auto-start"'));
  assert.ok(html.indexOf('id="tool-letter"')<html.indexOf('id="auto-start"'));
  assert.ok(html.includes('class="collapse-panel"'));
  assert.ok(html.includes('id="auto-fill"'));
  assert.ok(html.includes('としょかん\nがっこう</textarea>'));
  assert.match(html,/<option value="3" selected>むずかしい<\/option>/);
  assert.match(css,/grid-template-areas:"board create" "review review"/);
  assert.match(css,/max-width:850px/);
  assert.ok(build.includes("'src/editor/layout-v3.css'"));
});
test('shape enumeration supports two independent two-letter slots',()=>{
  const patterns=candidateMasks5(['イヌ','ネコ']);
  assert.ok(patterns.length>0);
  assert.ok(patterns.some(mask=>{
    const across=mask.grid.join('');
    return across.includes('■') && mask.slots>=4;
  }));
});
test('two short must-have words generate a completed verified crossword',()=>{
  const result=generateCompleteCrossword({entries,required:['いぬ','ねこ'],difficulty:3,seed:20261019,maxNodes:22000});
  assert.equal(result.status,'success',JSON.stringify({status:result.status,reason:result.reason,nodes:result.totalNodes,tries:result.triedPatterns}));
  assert.ok(result.puzzle.entries.some(e=>e.answer==='イヌ'));
  assert.ok(result.puzzle.entries.some(e=>e.answer==='ネコ'));
  assert.equal(validatePuzzle(result.puzzle).ok,true);
});