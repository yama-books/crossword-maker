import {DEFAULT_RULES,extractSlots,validatePuzzle} from '../core/puzzle.mjs';

const CODEC_VERSION=1;
const URL_LIMIT=6500;
const MAX_JSON_BYTES=70000;
const MAX_INPUT_CHARS=30000;
const RULE_KEYS=Object.keys(DEFAULT_RULES);
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});

function assertComplete(puzzle){
  const checked=validatePuzzle(puzzle);
  if(!checked.ok)throw new Error('完成していない問題は共有できません。盤面とカギを確認してください。');
  const {height,width,slots}=checked.analysis;
  if(height<5||width<5||height>15||width>15)throw new Error('共有できる盤面は5〜15マスです。');
  if(slots.length>100)throw new Error('カギが多すぎます。');
  return checked.analysis;
}
function packBytes(input){
  const dict=new Map();
  for(let i=0;i<256;i++)dict.set(String.fromCharCode(i),i);
  let next=256,w='',codes=[];
  for(const byte of input){
    const k=String.fromCharCode(byte),candidate=w+k;
    if(dict.has(candidate)){w=candidate;continue;}
    if(w)codes.push(dict.get(w));
    if(next<4096)dict.set(candidate,next++);
    w=k;
  }
  if(w)codes.push(dict.get(w));
  const out=[];let buffer=0,bits=0;
  for(const code of codes){
    buffer=(buffer<<12)|code;bits+=12;
    while(bits>=8){bits-=8;out.push((buffer>>>bits)&255);buffer&=(1<<bits)-1;}
  }
  if(bits>0)out.push(buffer<<(8-bits));
  return Uint8Array.from(out);
}
function unpackBytes(input){
  let buffer=0,bits=0,codes=[];
  for(const byte of input){
    buffer=(buffer<<8)|byte;bits+=8;
    if(bits>=12){bits-=12;codes.push((buffer>>>bits)&4095);buffer&=(1<<bits)-1;}
  }
  if(!codes.length)throw new Error('共有データが空です。');
  let dict=Array.from({length:256},(_,i)=>String.fromCharCode(i));
  let previous=dict[codes[0]],next=256;
  if(previous===undefined)throw new Error('共有データが壊れています。');
  const chunks=[previous];let outputBytes=previous.length;
  for(let i=1;i<codes.length;i++){
    const code=codes[i];
    const entry=dict[code]??(code===next?previous+previous[0]:null);
    if(entry===null)throw new Error('共有データが壊れています。');
    chunks.push(entry);outputBytes+=entry.length;
    if(outputBytes>MAX_JSON_BYTES)throw new Error('共有データのサイズが大きすぎます。');
    if(next<4096)dict[next++]=previous+entry[0];
    previous=entry;
  }
  return Uint8Array.from(chunks.join(''),ch=>ch.charCodeAt(0));
}
function toUrl64(bytes){
  let text='';
  for(const byte of bytes)text+=String.fromCharCode(byte);
  return btoa(text).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function fromUrl64(text){
  if(!/^[A-Za-z0-9_-]+$/.test(text))throw new Error('共有リンクに使えない文字が含まれています。');
  const s=atob(text.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-text.length%4)%4));
  return Uint8Array.from(s,c=>c.charCodeAt(0));
}
function compact(puzzle){
  const analysis=assertComplete(puzzle);
  const byId=new Map(puzzle.entries.map(e=>[e.direction+':'+e.start.join(','),e.clue]));
  const clues=analysis.slots.map(slot=>byId.get(slot.direction+':'+slot.start.join(',')));
  if(clues.some(c=>typeof c!=='string'||!c.trim()||c.length>500))
    throw new Error('カギは1件につき500文字以内で入力してください。');
  const title=String(puzzle.title??'クロスワード').trim().slice(0,80);
  const flags=RULE_KEYS.map(k=>(puzzle.ruleSet?.[k]??DEFAULT_RULES[k])?'1':'0').join('');
  return {v:CODEC_VERSION,t:title,g:puzzle.grid,c:clues,r:flags};
}
function expand(raw){
  if(!raw||raw.v!==CODEC_VERSION||typeof raw.t!=='string'||raw.t.length>80||
    !Array.isArray(raw.g)||raw.g.length<5||raw.g.length>15||raw.g.some(s=>typeof s!=='string'||[...s].length>15)||
    !Array.isArray(raw.c)||raw.c.length>100||raw.c.some(s=>typeof s!=='string'||s.length>500||!s.trim())||
    typeof raw.r!=='string'||!/^[01]{5}$/.test(raw.r))
    throw new Error('共有問題の形式が正しくありません。');
  const analysis=extractSlots(raw.g);
  if(analysis.width<5||analysis.width>15||analysis.height>15||analysis.slots.length!==raw.c.length)
    throw new Error('共有問題の盤面やカギの数が正しくありません。');
  const ruleSet={};
  RULE_KEYS.forEach((name,i)=>{ruleSet[name]=raw.r[i]==='1';});
  const puzzle={title:raw.t||'クロスワード',rows:analysis.height,cols:analysis.width,
    grid:raw.g.slice(),numbers:analysis.numbers,ruleSet,
    entries:analysis.slots.map((slot,i)=>({...slot,clue:raw.c[i]}))};
  if(analysis.width===analysis.height)puzzle.size=analysis.width;
  assertComplete(puzzle);
  return puzzle;
}
/** Complete puzzles only. Same board + clues produce the same fragment. */
export function encodeSharedPuzzle(puzzle){
  const serialized=JSON.stringify(compact(puzzle));
  if(serialized.length>MAX_INPUT_CHARS)throw new Error('カギの文章が多すぎます。短くしてから共有してください。');
  const packed=packBytes(encoder.encode(serialized));
  const encoded='p='+CODEC_VERSION+'.'+toUrl64(packed);
  if(encoded.length>URL_LIMIT)throw new Error('共有URLが長すぎます。カギを短くするか、問題JSONを保存してください。');
  return '#'+encoded;
}
export function decodeSharedPuzzle(fragment){
  const match=/^#p=1\.([A-Za-z0-9_-]+)$/.exec(fragment);
  if(!match)throw new Error('この共有リンクの形式には対応していません。');
  if(fragment.length>URL_LIMIT+1)throw new Error('共有URLが長すぎます。');
  const bytes=unpackBytes(fromUrl64(match[1]));
  const raw=JSON.parse(decoder.decode(bytes));
  return expand(raw);
}
export function sharedProgressKey(fragment){
  let hash=2166136261;
  for(let i=0;i<fragment.length;i++){hash^=fragment.charCodeAt(i);hash=Math.imul(hash,16777619);}
  return 'jp-crossword-proto-v1:shared-'+(hash>>>0).toString(36);
}
export function makeShareUrl(puzzle,baseUrl){
  const url=new URL('index.html',baseUrl);
  url.hash=encodeSharedPuzzle(puzzle);
  if(url.href.length>URL_LIMIT+200)throw new Error('共有リンクが長すぎます。問題のカギを短くしてください。');
  return url.href;
}
