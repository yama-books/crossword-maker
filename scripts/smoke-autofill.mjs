import {readFileSync} from 'node:fs';
import {parseLexiconTsv,generateCompleteFiveByFive} from '../src/generator/autofill.mjs';
const rows=parseLexiconTsv(readFileSync(new URL('../data/lexicon/approved_lexicon.tsv',import.meta.url),'utf8'));
const result=generateCompleteFiveByFive({requiredWords:['としょかん','がっこう'],difficulty:3,
  lexiconRows:rows,seed:20261019,maxNodes:250000,maxShapes:100});
console.log(JSON.stringify({status:result.status,nodes:result.nodes,examinedShapes:result.examinedShapes,
  grid:result.draft?.grid,words:result.words?.map(w=>w.answer),message:result.message},null,2));
