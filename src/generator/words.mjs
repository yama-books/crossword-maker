import {normalizeKana} from '../core/kana.mjs';
import {extractSlots} from '../core/puzzle.mjs';

const MAX_WORDS=60;
const KANA=/^[ァ-ヴー]+$/u;

/** No arbitrary letters are invented: each placed word comes from user input. */
export function parseWordList(source) {
  const errors=[],entries=[],seen=new Set();
  const lines=String(source??'').split(/\r?\n/);
  for(let i=0;i<lines.length;i++){
    const line=lines[i].trim();
    if(!line || line.startsWith('#'))continue;
    const parts=line.replaceAll('｜','|').split('|').map(s=>s.trim());
    if(parts.length<2){errors.push((i+1)+'行目：「よみ | カギ」または「表示名 | よみ | カギ」で入力してください。');continue;}
    const display=parts.length===2?parts[0]:parts[0];
    const reading=parts.length===2?parts[0]:parts[1];
    const clue=parts.length===2?parts[1]:parts.slice(2).join(' | ').trim();
    let value;
    try{value=normalizeKana(reading,{strict:true});}
    catch{errors.push((i+1)+'行目：読みはカナで入力してください。');continue;}
    if(!KANA.test(value) || value.length<2 || value.length>15 || /^[ンー]/u.test(value)){
      errors.push((i+1)+'行目：2〜15文字で、先頭が「ン」「ー」以外の読みを指定してください。');continue;
    }
    if(!clue){errors.push((i+1)+'行目：カギが未入力です。');continue;}
    if(seen.has(value)){errors.push((i+1)+'行目：同じ読みが重複しています（'+value+'）。');continue;}
    seen.add(value);
    entries.push({id:'w'+(i+1),display:display||reading,reading,value,clue});
    if(entries.length>MAX_WORDS){errors.push('登録できる単語は最大'+MAX_WORDS+'語です。');break;}
  }
  if(!entries.length && !errors.length)errors.push('単語を2語以上入力してください。');
  return {entries,errors};
}
function fnvHash(text) {
  let h=2166136261;
  for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}
  return h>>>0;
}
function prng(seed) {
  let a=seed>>>0;
  return ()=>{
    a=(a+0x6d2b79f5)>>>0;
    let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);
    return ((t^(t>>>14))>>>0)/4294967296;
  };
}
function occupiedBounds(board) {
  let minR=Infinity,minC=Infinity,maxR=-1,maxC=-1;
  for(let r=0;r<board.length;r++)for(let c=0;c<board[r].length;c++){
    if(!board[r][c])continue;
    minR=Math.min(minR,r);minC=Math.min(minC,c);
    maxR=Math.max(maxR,r);maxC=Math.max(maxC,c);
  }
  return minR===Infinity?null:{minR,minC,maxR,maxC};
}
function candidate(board,mask,word,r,c,direction,first,bounds) {
  const height=board.length,width=board[0].length,len=word.length;
  const dr=direction==='D'?1:0,dc=direction==='A'?1:0,flag=direction==='A'?1:2;
  const lastR=r+dr*(len-1),lastC=c+dc*(len-1);
  if(r<0||c<0||lastR>=height||lastC>=width)return null;
  const beforeR=r-dr,beforeC=c-dc,afterR=r+dr*len,afterC=c+dc*len;
  if(beforeR>=0&&beforeC>=0&&board[beforeR][beforeC])return null;
  if(afterR<height&&afterC<width&&board[afterR][afterC])return null;
  let crosses=0,newCells=0;
  for(let i=0;i<len;i++){
    const y=r+dr*i,x=c+dc*i,existing=board[y][x];
    if(existing){
      if(existing!==word[i]||(mask[y][x]&flag))return null;
      crosses++;
    }else{
      newCells++;
      if(direction==='A'){
        if(y>0&&board[y-1][x])return null;
        if(y+1<height&&board[y+1][x])return null;
      }else{
        if(x>0&&board[y][x-1])return null;
        if(x+1<width&&board[y][x+1])return null;
      }
    }
  }
  if(!newCells || (first?crosses!==0:crosses===0))return null;
  const minR=Math.min(bounds?.minR??r,r),maxR=Math.max(bounds?.maxR??lastR,lastR);
  const minC=Math.min(bounds?.minC??c,c),maxC=Math.max(bounds?.maxC??lastC,lastC);
  const area=(maxR-minR+1)*(maxC-minC+1);
  const center=Math.abs((minR+maxR)/2-(height-1)/2)+Math.abs((minC+maxC)/2-(width-1)/2);
  return {r,c,direction,crosses,newCells,
    score:crosses*70+newCells*3-area*.33-center*2.1};
}
function positions(board,mask,word,first,bounds) {
  const out=[],height=board.length,width=board[0].length;
  for(const direction of ['A','D']){
    const h=direction==='D'?word.length:1;
    const w=direction==='A'?word.length:1;
    if(h>height||w>width)continue;
    for(let r=0;r<=height-h;r++)for(let c=0;c<=width-w;c++){
      const pos=candidate(board,mask,word,r,c,direction,first,bounds);
      if(pos)out.push(pos);
    }
  }
  return out;
}
function apply(board,mask,word,pos) {
  const dr=pos.direction==='D'?1:0,dc=pos.direction==='A'?1:0;
  for(let i=0;i<word.length;i++){
    const r=pos.r+dr*i,c=pos.c+dc*i;
    board[r][c]=word[i];mask[r][c]|=pos.direction==='A'?1:2;
  }
}
function trial(words,height,width,random) {
  const board=Array.from({length:height},()=>Array(width).fill(''));
  const mask=Array.from({length:height},()=>Array(width).fill(0));
  const eligible=words.filter(w=>w.value.length<=Math.max(height,width));
  const ordered=eligible.map(w=>({word:w,rank:w.value.length+random()*4}))
    .sort((a,b)=>b.rank-a.rank).map(x=>x.word);
  const placed=[],used=new Set();
  if(!ordered.length)return {board,placed,score:-Infinity,crosses:0};
  for(let pass=0;pass<5;pass++){
    let changed=false;
    // Ranking changes between passes, but actual selection remains seed reproducible.
    const round=pass?ordered.map(w=>({w,rank:w.value.length+random()*6}))
      .sort((a,b)=>b.rank-a.rank).map(x=>x.w):ordered;
    for(const word of round){
      if(used.has(word.id))continue;
      const candidates=positions(board,mask,word.value,placed.length===0,occupiedBounds(board));
      if(!candidates.length)continue;
      const scored=candidates.map(pos=>({pos,score:pos.score+random()*15}))
        .sort((a,b)=>b.score-a.score);
      const pick=scored[Math.floor(random()*Math.min(3,scored.length))].pos;
      apply(board,mask,word.value,pick);
      placed.push({word,r:pick.r,c:pick.c,direction:pick.direction,crosses:pick.crosses});
      used.add(word.id);changed=true;
    }
    if(!changed)break;
  }
  const crosses=mask.flat().filter(m=>m===3).length;
  const occupied=board.flat().filter(Boolean).length;
  const bounds=occupiedBounds(board);
  const area=bounds?(bounds.maxR-bounds.minR+1)*(bounds.maxC-bounds.minC+1):height*width;
  const directionBalance=Math.min(placed.filter(p=>p.direction==='A').length,placed.filter(p=>p.direction==='D').length);
  return {board,placed,crosses,score:placed.length*10000+crosses*120+directionBalance*35+occupied*5-area*1.4};
}
/**
 * Generate a connected, spaced arrangement from user's words.
 * This is a draft: filled cells not used by placed words become black cells,
 * which can violate the publisher's black-adjacency/symmetry rules.
 */
export function generateWordLayout(words,rows,cols,{trials=48,seed}={}) {
  if(!Number.isInteger(rows)||!Number.isInteger(cols)||rows<5||cols<5||rows>15||cols>15) {
    throw new Error('盤面サイズは5〜15マスにしてください。');
  }
  if(!Array.isArray(words)||!words.length||words.length>MAX_WORDS)throw new Error('2〜60語を登録してください。');
  if(!words.every(w=>typeof w.id==='string'&&typeof w.value==='string'&&
      KANA.test(w.value)&&w.value.length>=2&&typeof w.clue==='string'))throw new Error('単語データが不正です。');
  if(new Set(words.map(w=>w.value)).size!==words.length)throw new Error('同じ読みの語が含まれています。');
  const attempts=Math.max(1,Math.min(64,Number.isInteger(trials)?trials:48));
  const actualSeed=Number.isInteger(seed)?seed>>>0:fnvHash(
    words.map(w=>w.value+'|'+w.clue).join('\n')+'|'+rows+','+cols);
  const random=prng(actualSeed);
  let best=null;
  for(let i=0;i<attempts;i++){
    const attempt=trial(words,rows,cols,random);
    if(!best||attempt.score>best.score)best=attempt;
    if(best.placed.length===words.length && i>=7)break;
  }
  const placementIds=new Set(best.placed.map(x=>x.word.id));
  const grid=best.board.map(row=>row.map(ch=>ch||'■').join(''));
  const clues={};
  for(const p of best.placed)clues[p.direction+':'+p.r+','+p.c]=p.word.clue;
  const slots=extractSlots(grid).slots;
  // The generator cannot claim a placed word whose actual slot differs.
  for(const p of best.placed){
    const slot=slots.find(s=>s.direction===p.direction&&s.start[0]===p.r&&s.start[1]===p.c);
    if(!slot||slot.answer!==p.word.value)throw new Error('配置された語枠が一致しません。');
  }
  return {grid,clues,
    placed:best.placed.map(p=>({...p.word,r:p.r,c:p.c,direction:p.direction})),
    unplaced:words.filter(w=>!placementIds.has(w.id)),
    crosses:best.crosses,score:best.score,seed:actualSeed,attempts};
}
