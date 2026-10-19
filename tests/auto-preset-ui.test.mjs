import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseTsv} from '../scripts/check-lexicon.mjs';
import {lexiconPayload} from '../src/generator/lexicon.mjs';
import {generateCompleteCrossword} from '../src/generator/auto-fill.mjs';
import {validatePuzzle} from '../src/core/puzzle.mjs';

const root=new URL('../',import.meta.url);
const html=readFileSync(new URL('editor.html',root),'utf8');
const app=readFileSync(new URL('src/editor/app.mjs',root),'utf8');
const worker=readFileSync(new URL('src/generator/auto-worker.mjs',root),'utf8');
const builder=readFileSync(new URL('scripts/build.mjs',root),'utf8');
test('iPhone-targeted generator control has 5x5, difficult, and required words by default',()=>{
  assert.match(html,/id="auto-required"/);
  assert.match(html,/としょかん\s+がっこう/);
  assert.match(html,/<option value="3" selected>むずかしい/);
  assert.match(html,/5×5を自動生成/);
});
test('worker is shipped by Pages and draft changes require validated result + user confirmation',()=>{
  assert.match(builder,/'src\/generator\/auto-worker.mjs'/);
  assert.match(worker,/generateCompleteCrossword/);
  assert.match(worker,/data\/lexicon.json/);
  assert.match(app,/new Worker\(/);
  assert.match(app,/const complete=fromPuzzle\(result\.puzzle\)/);
  assert.match(app,/window\.confirm\('5×5の完成盤面/);
  assert.match(app,/autoWorker\.terminate\(\)/);
});
test('user preset never silently drops required words or returns invalid published puzzle',()=>{
  const approved=parseTsv(readFileSync(new URL('data/lexicon/approved_lexicon.tsv',root),'utf8'));
  const entries=lexiconPayload(approved).entries;
  const result=generateCompleteCrossword({entries,required:['としょかん','がっこう'],
    size:5,difficulty:3,seed:20261019,maxNodes:5000});
  console.log('USER_PRESET_5x5_DIFFICULT_SMOKE',JSON.stringify({
    status:result.status,reason:result.reason,totalNodes:result.totalNodes,
    grid:result.puzzle?.grid
  }));
  assert.notEqual(result.status,'no_candidate');
  if(result.status==='success'){
    assert.equal(validatePuzzle(result.puzzle).ok,true);
    const used=new Set(result.puzzle.entries.map(e=>e.answer));
    assert.ok(used.has('トシヨカン'));
    assert.ok(used.has('ガツコウ'));
  }else{
    assert.ok(['exhausted','contradiction'].includes(result.status));
    assert.equal(result.puzzle,undefined);
  }
});
