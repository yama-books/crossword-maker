import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {parseTsv} from '../scripts/check-lexicon.mjs';
import {parseWordList} from '../src/generator/words.mjs';
import {parseExportArgs,createLexiconExport} from '../scripts/export-lexicon.mjs';

const path=fileURLToPath(new URL('../data/lexicon/approved_lexicon.tsv',import.meta.url));
const rows=parseTsv(readFileSync(path,'utf8'));

test('CLI options handle multiple genres and reject invalid requests',()=>{
 const result=parseExportArgs(['--category=木の種類','--category','音楽のことば','--difficulty=2','--count=8','--seed=42','--max-length=6']);
 assert.deepEqual(result.settings.category,['木の種類','音楽のことば']);
 assert.equal(result.settings.difficulty,2);
 assert.equal(result.settings.count,8);
 assert.equal(result.settings.maxLength,6);
 assert.equal(parseExportArgs(['--help']).help,true);
 assert.throws(()=>parseExportArgs(['--count=61']),RangeError);
 assert.throws(()=>parseExportArgs(['--count=2.5']),RangeError);
 assert.throws(()=>parseExportArgs(['--wrong=x']),/Unknown option/);
 assert.throws(()=>parseExportArgs(['--min-length=9','--max-length=3']),RangeError);
});
test('seeded export is reproducible, answer-distinct, and parseable by M3a',()=>{
 const opts={category:['木の種類','音楽のことば'],difficulty:2,count:12,seed:15,maxLength:8};
 const result=createLexiconExport(rows,opts);
 assert.equal(result.available>12,true);
 assert.equal(result.selected.length,12);
 assert.equal(result.text,createLexiconExport(rows,opts).text);
 assert.notEqual(result.text,createLexiconExport(rows,{...opts,seed:16}).text);
 assert.equal(new Set(result.selected.map(r=>r.normalized)).size,12);
 const parsed=parseWordList(result.text);
 assert.deepEqual(parsed.errors,[]);
 assert.equal(parsed.entries.length,12);
 assert.ok(result.selected.every(r=>opts.category.includes(r.category)));
});
test('genre chooses the right homonym clue and deduplicates crossword answers',()=>{
 const senses=rows.filter(r=>['カシ','ヒヨウシ'].includes(r.normalized));
 const music=createLexiconExport(senses,{category:'音楽のことば',difficulty:2,count:2,seed:1,maxLength:15});
 assert.deepEqual(new Set(music.selected.map(r=>r.surface)),new Set(['歌詞','拍子']));
 const easy=createLexiconExport(senses,{category:'音楽のことば',difficulty:1,count:2,seed:1,maxLength:15});
 assert.deepEqual(new Set(easy.selected.map(r=>r.surface)),new Set(['歌詞','拍子']));
 assert.deepEqual(parseWordList(easy.text).errors,[]);
 const homophones=createLexiconExport(rows,{category:'同音異義のことば',count:19,seed:2,maxLength:15});
 assert.equal(new Set(homophones.selected.map(r=>r.normalized)).size,19);
});
test('size bounds, unknown genre, and impossible selection fail explicitly',()=>{
 assert.throws(()=>createLexiconExport(rows,{count:61}),RangeError);
 assert.throws(()=>createLexiconExport(rows,{category:'存在しない分野',count:2}),/Unknown category/);
 assert.throws(()=>createLexiconExport(rows,{count:60,category:'天体と地球',maxLength:15}),/Only 20 matching/);
 assert.throws(()=>createLexiconExport(rows,{minLength:10,maxLength:3}),RangeError);
});

test('new history, arithmetic and solar-term genres export exact requested counts',()=>{
 const history=createLexiconExport(rows,{category:'歴史と建築',difficulty:2,count:10,seed:11,maxLength:15});
 const arithmetic=createLexiconExport(rows,{category:'数学と数量',difficulty:1,count:12,seed:9,maxLength:15});
 const season=createLexiconExport(rows,{category:'二十四節気',difficulty:3,count:15,seed:3,maxLength:15});
 assert.deepEqual(history.selected.length,10);
 assert.deepEqual(arithmetic.selected.length,12);
 assert.deepEqual(season.selected.length,15);
 for(const sample of [history,arithmetic,season]){
   assert.deepEqual(parseWordList(sample.text).errors,[]);
   assert.equal(sample.selected.length,new Set(sample.selected.map(row=>row.normalized)).size);
 }
 const named=rows.filter(row=>row.normalized==='シリヨウ');
 assert.throws(()=>createLexiconExport(named,{category:'歴史と建築',count:2,seed:1}),/Only 1 matching/);
});

test('2000-sense dictionary exports new genres without repeating an answer',()=>{
 const genres=['図書館と出版','海と船','農作業と畑','色彩と模様','物理とエネルギー',
 '舞台と演劇','身体の動き','身近な化学','和菓子と甘味','世界の料理',
 '鳥とその暮らし','地質と自然現象','庭と園芸','暮らしの工夫'];
 for(const category of genres){
   const sample=createLexiconExport(rows,{category,difficulty:2,count:10,seed:2026,maxLength:15});
   assert.equal(sample.selected.length,10);
   assert.equal(sample.selected.every(r=>r.category===category),true);
   assert.deepEqual(parseWordList(sample.text).errors,[]);
 }
 const homonyms=createLexiconExport(rows,{category:'同音異義の名詞と動詞',count:10,maxLength:15});
 assert.equal(homonyms.selected.length,10);
 assert.equal(new Set(homonyms.selected.map(r=>r.normalized)).size,10);
 assert.throws(()=>createLexiconExport(rows,{category:'同音異義の名詞と動詞',count:12,maxLength:15}),/Only 11 matching/);
});
