import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseTsv} from '../scripts/check-lexicon.mjs';
import {lexiconPayload} from '../src/generator/lexicon.mjs';
import {generateCompleteCrossword} from '../src/generator/auto-fill.mjs';
import {validatePuzzle} from '../src/core/puzzle.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('APP-002 guided entry starts empty and hides advanced difficulty',()=>{
  const html=read('editor.html');
  assert.match(html,/id="auto-required"[^>]*><\/textarea>/);
  assert.match(html,/<option value="2" selected>ふつう<\/option>/);
  assert.match(html,/id="auto-start"[^>]*>✦ クロスワードを作る/);
  assert.match(html,/id="start-words"/);
  assert.match(html,/id="start-manual"/);
});
test('APP-002 user-preset generation never claims success without both whole answers',()=>{
  const entries=lexiconPayload(parseTsv(read('data/lexicon/approved_lexicon.tsv'))).entries;
  const result=generateCompleteCrossword({entries,size:5,difficulty:3,
    required:['トシヨカン','ガツコウ'],seed:20261019,maxNodes:22000});
  console.log('APP002_REQUIRED_PRESET',JSON.stringify({status:result.status,
    reason:result.reason,totalNodes:result.totalNodes,grid:result.puzzle?.grid}));
  if(result.status==='success'){
    assert.equal(validatePuzzle(result.puzzle).ok,true);
    const answers=new Set(result.puzzle.entries.map(entry=>entry.answer));
    assert.ok(answers.has('トシヨカン'));
    assert.ok(answers.has('ガツコウ'));
  } else {
    assert.ok(['contradiction','exhausted'].includes(result.status));
    assert.equal(result.puzzle,undefined);
  }
});
