/**
 * Pure presentation-only motion planner.
 * No crossword, clue, dictionary, storage or editing state is read or mutated here.
 * Mask-reveal direction is an original CSS adaptation informed by Motion Prompt #005:
 * https://showheyohtaki.github.io/motion-prompt/#005
 * Reference: MIT License (c) 2026 Shohei Ohtaki. No source implementation copied.
 */
export const MOTIONS = Object.freeze([
  {id:'slide', label:'右列からスライド', group:'cells'},
  {id:'mask', label:'マスクワイプ', group:'cells', heavy:true},
  {id:'pixel', label:'ピクセルディゾルブ', group:'cells'},
  {id:'shape', label:'シェイプ', group:'cells', heavy:true},
  {id:'liquid', label:'リキッド', group:'cells', heavy:true},
  {id:'wave', label:'グリッドウェーブ', group:'cells'},
  {id:'center-y', label:'中央から上下に開く', group:'board'},
  {id:'center-x', label:'中央から左右に開く', group:'board'},
  {id:'iris', label:'中央アイリス', group:'board', heavy:true},
  {id:'checker', label:'チェッカー出現', group:'cells'},
  {id:'diagonal', label:'斜めカスケード', group:'cells'}
]);
const lookup=new Map(MOTIONS.map(m=>[m.id,m]));
const DURATION=Object.freeze({slide:840,mask:840,pixel:800,shape:810,liquid:810,wave:800,
  'center-y':780,'center-x':780,iris:760,checker:810,diagonal:830});
export const MOTION_DEFAULT='random';

export function availableMotions(rows,cols) {
  if(!Number.isInteger(rows)||!Number.isInteger(cols)||rows<1||cols<1) {
    throw new RangeError('Invalid board dimensions');
  }
  const large=rows*cols>121;
  return MOTIONS.filter(effect=>!large||!effect.heavy);
}
export function chooseMotion({rows,cols,requested=MOTION_DEFAULT,previous=null,random=Math.random,reduced=false}={}) {
  const eligible=availableMotions(rows,cols);
  if(reduced)return {id:null,label:'アニメーションなし（動きを減らす設定）',duration:0,group:'none'};
  let chosen;
  if(requested!=='random'){
    chosen=eligible.find(x=>x.id===requested);
  }
  if(!chosen){
    const alternatives=eligible.filter(x=>x.id!==previous);
    const pool=alternatives.length?alternatives:eligible;
    const sample=Number(random());
    const n=Number.isFinite(sample)?Math.min(.999999,Math.max(0,sample)):0;
    chosen=pool[Math.floor(n*pool.length)];
  }
  return {id:chosen.id,label:chosen.label,group:chosen.group,duration:DURATION[chosen.id]};
}
export function delayForCell(effect,row,col,rows,cols) {
  if(!lookup.has(effect))throw new Error('Unknown motion: '+effect);
  if(!Number.isInteger(row)||!Number.isInteger(col)||row<0||col<0||
    !Number.isInteger(rows)||!Number.isInteger(cols)||row>=rows||col>=cols) {
    throw new RangeError('Invalid cell coordinates');
  }
  // Board-level reveals have one shared clipping mask, not 225 individual masks.
  if(lookup.get(effect).group==='board')return 0;
  const jitter=((row*11+col*7)%5)*14;
  const rightToLeft=cols>1?(cols-1-col)/(cols-1):0;
  const diagonally=(row+col)/Math.max(1,rows+cols-2);
  const fromCenter=(Math.abs(row-(rows-1)/2)+Math.abs(col-(cols-1)/2))/
    Math.max(1,(rows-1)/2+(cols-1)/2);
  const base={
    slide:rightToLeft*330, mask:rightToLeft*330, pixel:fromCenter*300,
    shape:fromCenter*260, liquid:rightToLeft*295, wave:rightToLeft*300,
    checker:((row+col)%2)*115+Math.floor(row/2)*13,
    diagonal:diagonally*370
  }[effect];
  return Math.round(base+jitter);
}
