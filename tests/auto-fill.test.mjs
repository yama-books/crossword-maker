import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {parseTsv} from '../scripts/check-lexicon.mjs';
import {buildLexiconIndex,lexiconPayload} from '../src/generator/lexicon.mjs';
import {fillCrossword,generateCompleteCrossword,STARTER_MASKS_5} from '../src/generator/auto-fill.mjs';
import {validatePuzzle} from '../src/core/puzzle.mjs';

const rows=parseTsv(readFileSync(fileURLToPath(new URL('../data/lexicon/approved_lexicon.tsv',import.meta.url)),'utf8'));
const entries=lexiconPayload(rows).entries;
test('G1: source senses remain intact and search index deduplicates answer only',()=>{
  assert.equal(rows.length,2000);
  assert.equal(entries.length,2000);
  const ix=buildLexiconIndex(entries);
  assert.equal(ix.uniqueAnswers,1936);
  assert.equal(ix.byAnswer.size,1936);
  assert.ok(ix.byLength.get(5).length>200);
  assert.ok(!JSON.stringify(entries[0]).includes('review_status'));
});
test('G2: sample 5x5 template can become a valid completed crossword',()=>{
  const output=generateCompleteCrossword({entries,seed:7,maxNodes:30000});
  assert.equal(output.status,'success',JSON.stringify({status:output.status,reason:output.reason,nodes:output.totalNodes}));
  assert.equal(output.puzzle.grid.length,5);
  assert.equal(validatePuzzle(output.puzzle).ok,true);
  const answers=new Set(entries.map(x=>x.answer));
  assert.ok(output.puzzle.entries.every(x=>answers.has(x.answer)));
});
test('G2: self-created letters and a required answer are never overwritten',()=>{
  const solved=['■カナシム','ゲンシヨク','■シ■ウ■','シヨウカキ','カクニン■'];
  const draft=solved.map((line,r)=>[...line].map((ch,c)=>
    ch==='■'||(r===1&&c===0)||(r===3&&c===3)?ch:'□').join(''));
  const result=fillCrossword({grid:draft,entries,required:['かなしむ'],maxNodes:30000,seed:2});
  assert.equal(result.status,'success',JSON.stringify(result).slice(0,700));
  assert.equal(validatePuzzle(result.puzzle).ok,true);
  for(let r=0;r<5;r++)for(let c=0;c<5;c++)if(draft[r][c]!=='□')
    assert.equal(result.puzzle.grid[r][c],draft[r][c]);
  assert.ok(result.puzzle.entries.some(x=>x.answer==='カナシム'));
});
test('G2: contradictory or missing requested words are rejected without a fake puzzle',()=>{
  const result=fillCrossword({grid:STARTER_MASKS_5[0],entries,required:['ありもしないことば'],maxNodes:25});
  assert.equal(result.status,'no_candidate');
  assert.equal(result.puzzle,undefined);
  const incorrect=fillCrossword({grid:['■■□□□','□□□□□','■□■□■','□□□□□','□□□□■'],entries});
  assert.equal(incorrect.status,'invalid_pattern');
});
test('G2: seed and budget handling remain deterministic',()=>{
  const a=fillCrossword({grid:STARTER_MASKS_5[0],entries,seed:1,maxNodes:1});
  const b=fillCrossword({grid:STARTER_MASKS_5[0],entries,seed:1,maxNodes:1});
  assert.deepEqual(a,b);
  assert.ok(['exhausted','success','contradiction'].includes(a.status));
});