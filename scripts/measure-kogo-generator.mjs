import {readFileSync} from 'node:fs';
import {parseTsv} from './check-lexicon.mjs';
import {readKogoClues} from './check-kogo-clues.mjs';
import {lexiconPayload} from '../src/generator/lexicon.mjs';
import {generateKogoPreviewPuzzle} from '../src/learning/kogo/generator-preview.mjs';

const clues=readKogoClues(readFileSync(new URL('../data/learning/kogo_clues.jsonl',import.meta.url),'utf8'));
const lexiconEntries=lexiconPayload(parseTsv(readFileSync(new URL('../data/lexicon/approved_lexicon.tsv',import.meta.url),'utf8'))).entries;
const scenarios=[
  {difficulty:'normal',seed:7},
  {difficulty:'normal',seed:13},
  {difficulty:'hard',seed:29}
];
const samples=scenarios.map(sc=>{
 const result=generateKogoPreviewPuzzle({clues,lexiconEntries,...sc,count:24,maxNodes:12000,maxTries:3});
 return {seed:sc.seed,difficulty:sc.difficulty,status:result.status,
  attempts:result.attempts,selected:result.selected,
  ...result.measured??{},warnings:result.warnings,
  // No personalized information or unreviewed worksheet content in output.
  solverNodes:result.solver?.nodes??null};
});
const completed=samples.filter(x=>x.status==='draft_puzzle');
const summary={
  mode:'INTERNAL_PREVIEW_ONLY',bankRecords:clues.length,
  studentReleaseEnabled:false,samples,
  completed:completed.length,trials:samples.length,
  completionRate:completed.length/samples.length,
  actualKogoShare:completed.length?completed.reduce((s,x)=>s+x.kogoSlots,0)/
    completed.reduce((s,x)=>s+x.totalSlots,0):null,
  actualVocabularyShareAmongKogo:completed.length&&completed.some(x=>x.kogoSlots>0)?
    completed.reduce((s,x)=>s+x.vocabularyKogoSlots,0)/
    completed.reduce((s,x)=>s+x.kogoSlots,0):null
};
console.log(JSON.stringify(summary,null,2));
