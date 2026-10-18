import test from 'node:test';
import assert from 'node:assert/strict';
import {MOTIONS, availableMotions,chooseMotion,delayForCell} from '../src/editor/motion.mjs';

test('all 11 motion names are unique and include split-mask variants',()=>{
 assert.equal(MOTIONS.length,11);
 assert.equal(new Set(MOTIONS.map(m=>m.id)).size,11);
 assert.ok(MOTIONS.some(m=>m.id==='center-y'&&m.group==='board'));
 assert.ok(MOTIONS.some(m=>m.id==='center-x'&&m.group==='board'));
});
test('large boards omit per-cell masking and expensive clip effects',()=>{
 const small=availableMotions(9,9).map(x=>x.id);
 const large=availableMotions(15,15).map(x=>x.id);
 assert.equal(small.length,11);
 assert.ok(!large.includes('mask'));
 assert.ok(!large.includes('liquid'));
 assert.ok(!large.includes('shape'));
 assert.ok(!large.includes('iris'));
 for(const id of ['slide','wave','center-y','center-x','checker','diagonal'])assert.ok(large.includes(id));
});
test('random choice will not repeat its previous motion when alternatives exist',()=>{
 const first=chooseMotion({rows:7,cols:7,requested:'random',random:()=>0});
 const next=chooseMotion({rows:7,cols:7,requested:'random',random:()=>0,previous:first.id});
 assert.notEqual(first.id,next.id);
 assert.ok(next.duration<=850);
});
test('explicit light motion is selectable and unavailable heavy mode safely falls back',()=>{
 assert.equal(chooseMotion({rows:15,cols:15,requested:'center-y'}).id,'center-y');
 assert.notEqual(chooseMotion({rows:15,cols:15,requested:'liquid',random:()=>0}).id,'liquid');
 assert.equal(chooseMotion({rows:7,cols:7,requested:'liquid'}).id,'liquid');
});
test('reduced motion produces no effect even when explicitly requested',()=>{
 const effect=chooseMotion({rows:7,cols:7,requested:'center-y',reduced:true});
 assert.equal(effect.id,null);assert.equal(effect.duration,0);
});
test('cell delays preserve intended direction and are bounded on full-size grids',()=>{
 assert.ok(delayForCell('slide',0,0,9,9)>delayForCell('slide',0,8,9,9));
 assert.ok(delayForCell('diagonal',14,14,15,15)>delayForCell('diagonal',0,0,15,15));
 assert.equal(delayForCell('center-y',3,3,7,7),0);
 for(const motion of MOTIONS){
  for(let row=0;row<15;row++)for(let col=0;col<15;col++){
   const delay=delayForCell(motion.id,row,col,15,15);
   assert.ok(Number.isFinite(delay)&&delay>=0&&delay<=450);
  }
 }
});
test('invalid dimensions and cells are rejected before a motion plan is made',()=>{
 assert.throws(()=>availableMotions(0,7));
 assert.throws(()=>availableMotions(5,NaN));
 assert.throws(()=>delayForCell('slide',7,0,7,7));
 assert.throws(()=>delayForCell('not-a-motion',0,0,7,7));
});
