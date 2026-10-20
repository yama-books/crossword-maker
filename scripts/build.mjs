import {readFileSync, writeFileSync, mkdirSync, copyFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {validatePuzzle} from '../src/core/puzzle.mjs';
import {parseTsv,validateRecords} from './check-lexicon.mjs';
import {lexiconPayload} from '../src/generator/lexicon.mjs';

const root = resolve(import.meta.dirname, '..');
const read = path => readFileSync(resolve(root,path),'utf8');
const puzzle = JSON.parse(read('puzzle.json'));
const validation = validatePuzzle(puzzle);
if (!validation.ok) throw new Error('Puzzle validation failed:\n'+JSON.stringify(validation.errors,null,2));
const template = read('src/index.template.html');
const kana = read('src/core/kana.mjs').replace(/^export /gm,'');
const MARKERS = ['/*__PUZZLE_DATA__*/','/*__KANA_CORE__*/'];
if (MARKERS.some(marker => !template.includes(marker))) throw new Error('Missing a required template marker');
const escaped = JSON.stringify(puzzle).replace(/</g,'\\u003c').replace(/>/g,'\\u003e');
const html = template.replace(MARKERS[0],escaped).replace(MARKERS[1],kana);
if (html.includes(MARKERS[0]) || html.includes(MARKERS[1])) throw new Error('Unexpanded build marker');
if (process.argv.includes('--sync')) {
  writeFileSync(resolve(root,'index.html'),html);
  console.log('Synced offline-ready index.html from puzzle.json and source template');
} else if (process.argv.includes('--check')) {
  if (read('index.html') !== html) throw new Error('index.html is stale. Run npm run sync and commit the result.');
  console.log('Verified index.html matches the canonical JSON and source template');
} else {
  mkdirSync(resolve(root,'dist'),{recursive:true});
  writeFileSync(resolve(root,'dist/index.html'),html);
  for (const path of ['editor.html','puzzle.json',
      'src/editor/app.mjs','src/editor/model.mjs','src/editor/motion.mjs','src/editor/layout-v3.css','src/editor/ux-v4.css','src/generator/words.mjs',
      'src/core/kana.mjs','src/core/puzzle.mjs',
      'src/generator/lexicon.mjs','src/generator/auto-fill.mjs','src/generator/auto-worker.mjs']) {
    const target=resolve(root,'dist',path);
    mkdirSync(resolve(target,'..'),{recursive:true});
    copyFileSync(resolve(root,path),target);
  }
  // Static deployment contains only curated, validated vocabulary, not candidates.
  const rows=parseTsv(read('data/lexicon/approved_lexicon.tsv'));
  const review=validateRecords(rows,{approved:true});
  if(review.errors.length)throw new Error('Curated lexicon validation failed: '+review.errors.slice(0,5).join('; '));
  mkdirSync(resolve(root,'dist/data'),{recursive:true});
  writeFileSync(resolve(root,'dist/data/lexicon.json'),JSON.stringify(lexiconPayload(rows)));
  console.log('Built validated player, studio and '+rows.length+' curated senses in dist/');
}
