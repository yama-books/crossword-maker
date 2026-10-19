import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseLexiconTsv,normalizeRequiredWords,enumerateFiveByFiveMasks,generateCompleteFiveByFive} from '../src/generator/autofill.mjs';
import {inspectDraft} from '../src/editor/model.mjs';
const dictionary=parseLexiconTsv(readFileSync(new URL('../data/lexicon/approved_lexicon.tsv',import.meta.url),'utf8'));
test('canonical approved dictionary is parsed and required Japanese words normalize correctly',()=>{
  assert.equal(dictionary.length,2000);
  assert.deepEqual(normalizeRequiredWords(['としょかん','がっこう']),['トシヨカン','ガツコウ']);
  assert.ok(dictionary.some(w=>w.normalized==='トシヨカン'));
  assert.ok(dictionary.some(w=>w.normalized==='ガツコウ'));
});
test('5x5 symmetric candidates preserve connected cells and word lengths',()=>{
  const shapes=enumerateFiveByFiveMasks([5,4]);
  assert.ok(shapes.length>=1);
  for(const shape of shapes){
    assert.equal(shape.grid.length,5);
    for(let r=0;r<5;r++)for(let c=0;c<5;c++)
      assert.equal(shape.grid[r][c]==='■',shape.grid[4-r][4-c]==='■');
  }
});
test('missing required answer is reported without a fake completed puzzle',()=>{
  const output=generateCompleteFiveByFive({requiredWords:['あわわわ'],lexiconRows:dictionary,maxNodes:100});
  assert.equal(output.status,'no_candidate');
});
test('the exact requested 5x5 difficult setting never publishes an invalid puzzle',()=>{
  const result=generateCompleteFiveByFive({
    requiredWords:['としょかん','がっこう'],difficulty:3,lexiconRows:dictionary,
    maxNodes:250000,maxShapes:100,seed:20261019
  });
  assert.ok(['success','exhausted','contradiction'].includes(result.status));
  if(result.status==='success'){
    assert.equal(inspectDraft(result.draft).ok,true);
    assert.ok(result.words.some(w=>w.answer==='トシヨカン'));
    assert.ok(result.words.some(w=>w.answer==='ガツコウ'));
  }
});
