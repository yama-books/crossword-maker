import {readFileSync, writeFileSync, mkdirSync, copyFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {validatePuzzle} from '../src/core/puzzle.mjs';

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
      'src/editor/app.mjs','src/editor/model.mjs','src/generator/words.mjs',
      'src/core/kana.mjs','src/core/puzzle.mjs']) {
    const target=resolve(root,'dist',path);
    mkdirSync(resolve(target,'..'),{recursive:true});
    copyFileSync(resolve(root,path),target);
  }
  console.log('Built validated player and editable studio in dist/');
}
