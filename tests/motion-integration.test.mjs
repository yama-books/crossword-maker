import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('editor.html');
const app=read('src/editor/app.mjs');
const build=read('scripts/build.mjs');
test('editor HTML has real preview controls and center split CSS reveals',()=>{
 for(const token of ['id="motion-select"','id="motion-preview"','id="motion-caption"',
  '@keyframes cw-center-y','@keyframes cw-center-x','@keyframes cw-center-rule',
  'data-motion="center-y"','data-motion="center-x"'])assert.ok(html.includes(token),token);
 assert.ok(html.includes('prefers-reduced-motion:reduce'));
 assert.ok(html.includes('@media print'));
});
test('app uses the shared motion planner and does not alter puzzle data to animate',()=>{
 assert.match(app,/from '\.\/motion\.mjs'/);
 assert.match(app,/chooseMotion\(/);
 assert.match(app,/delayForCell\(/);
 assert.ok(app.includes("$('board').addEventListener('pointerdown',stopMotion"));
 assert.ok(app.includes('clearTimeout(motionTimer)'));
 assert.ok(app.includes('requestAnimationFrame'));
 assert.ok(!app.includes('CELLS[4]'));
});
test('editor app and build manifest both recognize browser module',()=>{
 assert.ok(build.includes("'src/editor/motion.mjs'"));
 const check=spawnSync(process.execPath,['--check','src/editor/app.mjs'],{encoding:'utf8'});
 assert.equal(check.status,0,check.stderr);
});
