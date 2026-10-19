import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {parseTsv} from '../scripts/check-lexicon.mjs';
import {lexiconPayload,resolveRequiredWords} from '../src/generator/lexicon.mjs';
import {generateCompleteCrossword} from '../src/generator/auto-fill.mjs';
import {validatePuzzle} from '../src/core/puzzle.mjs';

const read=path=>readFileSync(fileURLToPath(new URL('../'+path,import.meta.url)),'utf8');
const entries=lexiconPayload(parseTsv(read('data/lexicon/approved_lexicon.tsv'))).entries;

test('registered surface terms and kana work as required generation input',()=>{
  assert.deepEqual(resolveRequiredWords(['図書館','がっこう'],entries),['トシヨカン','ガツコウ']);
  assert.throws(()=>resolveRequiredWords(['存在しない漢字語'],entries),/辞書にありません/);
});
test('starting with 図書館 can produce a completed puzzle or report a bounded search failure',()=>{
  const result=generateCompleteCrossword({entries,required:['トシヨカン'],seed:20261019,maxNodes:22000});
  assert.equal(result.status,'success',JSON.stringify({status:result.status,reason:result.reason,nodes:result.totalNodes}));
  assert.equal(validatePuzzle(result.puzzle).ok,true);
  assert.ok(result.puzzle.entries.some(entry=>entry.answer==='トシヨカン'));
});
test('editor includes worker controls and published assets include the worker',()=>{
  const html=read('editor.html'),app=read('src/editor/app.mjs'),build=read('scripts/build.mjs'),worker=read('src/generator/auto-worker.mjs');
  for(const id of ['auto-required','auto-start','auto-fill','auto-preview','auto-apply','auto-cancel'])
    assert.ok(html.includes('id="'+id+'"'));
  assert.match(app,/new Worker\(new URL/);
  assert.match(app,/clearPendingAuto\(\)/);
  assert.ok(build.includes('auto-worker.mjs'));
  assert.ok(build.includes('dist/data/lexicon.json'));
  assert.ok(worker.includes('resolveRequiredWords'));
  assert.ok(worker.includes('validatePuzzle'));
});