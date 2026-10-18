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
