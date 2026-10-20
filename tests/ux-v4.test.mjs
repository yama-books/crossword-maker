import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('UX v4 provides exactly two clear starting paths and a separate resume action',()=>{
 const html=read('editor.html');
 const start=html.indexOf('id="welcome-screen"'),board=html.indexOf('id="board"');
 assert.ok(start>0&&start<board);
 assert.match(html,/<body data-view="welcome">/);
 for(const id of ['start-words','start-manual','start-resume','back-to-home','view-navigation',
  'editor-fill-action','auto-simplify','auto-apply','auto-retry']){
   assert.ok(html.includes('id="'+id+'"'),'Missing UX control '+id);
 }
 assert.match(html,/id="auto-required"[^>]*><\/textarea>/);
 assert.match(html,/id="auto-start"[^>]*>✦ クロスワードを作る/);
});

test('guided stages hide unrelated editor controls and keep old editing logic',()=>{
 const css=read('src/editor/ux-v4.css'),app=read('src/editor/app.mjs'),build=read('scripts/build.mjs');
 assert.match(css,/body\[data-view="welcome"\] \.layout/);
 assert.match(css,/body\[data-view="words"\] \.board-panel/);
 assert.match(css,/body\[data-view="editor"\] \.primary-controls/);
 assert.match(app,/showView\('welcome'\)/);
 assert.match(app,/showView\('words'\)/);
 assert.match(app,/showView\('editor'\)/);
 assert.match(app,/runAutoFill\('fill'\)/);
 assert.match(app,/localStorage\.getItem\(STORAGE\)/);
 assert.match(app,/commit\(fromPuzzle\(chosen\)/);
 assert.ok(build.includes("'src/editor/ux-v4.css'"));
});
test('tap feedback begins on pointerdown without waiting for long-press',()=>{
 const css=read('src/editor/ux-v4.css'),app=read('src/editor/app.mjs');
 assert.match(app,/document\.addEventListener\('pointerdown'/);
 assert.match(app,/document\.addEventListener\('pointerup'/);
 assert.match(app,/document\.addEventListener\('pointercancel'/);
 assert.match(app,/classList\.add\('is-pressed'\)/);
 assert.match(app,/setTimeout\(\(\)=>\{button\.classList\.remove\('is-pressed'\);releaseTimers\.delete\(button\);\},120\)/);
 assert.match(css,/\.block-btn\.is-pressed:not\(:disabled\)/);
 assert.match(css,/transform:translate3d\(0,var\(--press-depth\),0\)!important/);
 assert.match(css,/touch-action:manipulation/);
});
test('no new puzzle is generated with hidden preset words',()=>{
 const html=read('editor.html'),app=read('src/editor/app.mjs');
 assert.ok(!html.includes('>としょかん\ngっこう</textarea>'));
 assert.ok(app.includes("const required=mode==='new' ?"));
 assert.ok(app.includes("const required=mode==='new' ? $('auto-required').value"));
 assert.ok(app.includes("status.textContent='この組合せは、今回試した5×5の盤面では完成できませんでした。'"));
});
