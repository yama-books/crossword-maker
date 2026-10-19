import {normalizeKana} from '../core/kana.mjs';
import {extractSlots} from '../core/puzzle.mjs';
import {createDraft,inspectDraft} from '../editor/model.mjs';

const REQUIRED_COLUMNS=['id','surface','reading','normalized','length','clue','category','difficulty','source','review_status'];
const MAX_SIZE=5;
const EMPTY='□';
function assert(condition,message){if(!condition)throw new Error(message);}

export function parseLexiconTsv(text){
  const lines=String(text).replace(/\r\n/g,'\n').trimEnd().split('\n');
  assert(lines[0]===REQUIRED_COLUMNS.join('\t'),'辞書の列定義が不正です。');
  return lines.slice(1).filter(Boolean).map((line,i)=>{
    const values=line.split('\t');
    assert(values.length===REQUIRED_COLUMNS.length,'辞書の'+(i+2)+'行目が不正です。');
    const row=Object.fromEntries(REQUIRED_COLUMNS.map((key,j)=>[key,values[j]]));
    row.difficulty=Number(row.difficulty);
    assert(row.normalized===normalizeKana(row.reading,{strict:true}),'辞書の読みが不正です。'+row.id);
    return row;
  });
}
export function normalizeRequiredWords(values){
  assert(Array.isArray(values),'必須語の配列が必要です。');
  const out=[],seen=new Set();
  for(const value of values){
    const word=normalizeKana(String(value).trim(),{strict:true});
    assert(word.length>=2&&word.length<=MAX_SIZE&&!/^[ンー]/u.test(word),'必須語が5×5の範囲外です: '+value);
    assert(!seen.has(word),'必須語が重複しています: '+value);
    seen.add(word);out.push(word);
  }
  assert(out.length<=3,'初期版の必須語は最大3語です。');
  return out;
}
function prepareDictionary(rows,difficulty){
  const words=new Map();
  for(const row of rows){
    if(!row || !/^[ァ-ヴー]+$/u.test(row.normalized) || !row.clue || 
       !['editor_checked','human_checked'].includes(row.review_status))continue;
    if(row.normalized.length>MAX_SIZE||row.normalized.length<2)continue;
    const old=words.get(row.normalized);
    if(!old || Math.abs(Number(row.difficulty)-difficulty)<Math.abs(Number(old.difficulty)-difficulty))
      words.set(row.normalized,row);
  }
  const byLength=new Map();
  for(const row of words.values()){
    const n=row.normalized.length;
    if(!byLength.has(n))byLength.set(n,[]);
    byLength.get(n).push(row);
  }
  return {words,byLength};
}
function boardSlots(grid){
  return extractSlots(grid).slots.map(slot=>({
    ...slot, positions:slot.cells.map(([r,c])=>r*grid.length+c)
  }));
}
function connected(grid){
  const n=grid.length,white=[];
  for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(grid[r][c]!=='■')white.push(r*n+c);
  if(!white.length)return false;
  const visited=new Set([white[0]]),queue=[white[0]];
  for(let i=0;i<queue.length;i++){
    const p=queue[i],r=Math.floor(p/n),c=p%n;
    for(const [dr,dc] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const y=r+dr,x=c+dc,k=y*n+x;
      if(y>=0&&x>=0&&y<n&&x<n&&grid[y][x]!=='■'&&!visited.has(k)){
        visited.add(k);queue.push(k);
      }
    }
  }
  return visited.size===white.length;
}
export function enumerateFiveByFiveMasks(lengths=[]){
  const n=5,pairs=[];
  for(let i=0;i<25;i++)if(i<=24-i)pairs.push([i,24-i]);
  const shapes=[];
  for(let bits=0;bits<(1<<pairs.length);bits++){
    const black=Array(25).fill(false);
    for(let i=0;i<pairs.length;i++)if(bits&(1<<i))pairs[i].forEach(p=>{black[p]=true});
    const blackCount=black.filter(Boolean).length;
    if(blackCount>10)continue;
    let valid=true;
    for(let p=0;p<25;p++)if(black[p]){
      if((p>=5&&black[p-5])||(p%5&&black[p-1])){valid=false;break}
    }
    if(!valid)continue;
    const grid=Array.from({length:n},(_,r)=>Array.from({length:n},(_,c)=>
      black[r*n+c]?'■':EMPTY).join(''));
    if(!connected(grid))continue;
    const slots=boardSlots(grid),covered=new Set(slots.flatMap(s=>s.positions));
    if(covered.size!==25-blackCount || slots.length<2)continue;
    if(slots.some(s=>s.positions.length>MAX_SIZE))continue;
    if(lengths.some(length=>!slots.some(s=>s.positions.length===length)))continue;
    shapes.push({grid,slots,blackCount});
  }
  shapes.sort((a,b)=>
    a.slots.length-b.slots.length||
    Math.abs(a.blackCount-5)-Math.abs(b.blackCount-5)||
    a.grid.join('').localeCompare(b.grid.join('')));
  return shapes;
}
function seededRank(word,seed){
  let h=(2166136261^seed)>>>0;
  for(const c of word){h^=c.codePointAt(0);h=Math.imul(h,16777619)}
  return h>>>0;
}
/** This first complete generator is intentionally bounded to 5×5.
 * Every success must pass the same publishable validation as the editor.
 * A budget exhaustion is never reported as a proof of no solution.
 */
export function generateCompleteFiveByFive({
  requiredWords=[],lexiconRows=[],difficulty=3,seed=20261019,maxNodes=250000,maxShapes=100
}={}){
  assert([1,2,3].includes(difficulty),'難易度は1〜3です。');
  assert(Number.isInteger(maxNodes)&&maxNodes>=1,'探索上限が不正です。');
  const mandatory=normalizeRequiredWords(requiredWords);
  const {words,byLength}=prepareDictionary(lexiconRows,difficulty);
  const absent=mandatory.filter(w=>!words.has(w));
  if(absent.length)return {status:'no_candidate',message:'辞書に必須語がありません: '+absent.join('、'),missing:absent};
  const shapes=enumerateFiveByFiveMasks(mandatory.map(w=>w.length)).slice(0,maxShapes);
  if(!shapes.length)return {status:'contradiction',message:'必須語の長さに対応した5×5盤面がありません。'};
  let nodes=0,examinedShapes=0;
  for(const shape of shapes){
    examinedShapes++;
    const slots=shape.slots,letters=shape.grid.join('').split('').map(x=>x==='■'?null:'');
    const selected=Array(slots.length).fill(null),used=new Set();
    function fits(slot,value){
      return [...value].every((ch,k)=>!letters[slot.positions[k]] || letters[slot.positions[k]]===ch);
    }
    function place(i,row){
      const changed=[];
      [...row.normalized].forEach((ch,k)=>{
        const p=slots[i].positions[k];
        if(!letters[p]){letters[p]=ch;changed.push(p)}
      });
      selected[i]=row;used.add(row.normalized);
      return changed;
    }
    function unplace(i,row,changed){
      for(const p of changed)letters[p]='';
      selected[i]=null;used.delete(row.normalized);
    }
    function solve(left){
      if(nodes>=maxNodes)return false;
      nodes++;
      if(left===0)return true;
      let best=-1,options=null;
      for(let i=0;i<slots.length;i++){
        if(selected[i])continue;
        const candidates=[];
        for(const row of byLength.get(slots[i].positions.length)??[]){
          if(used.has(row.normalized)||!fits(slots[i],row.normalized))continue;
          candidates.push(row);
          if(options&&candidates.length>options.length)break;
        }
        if(!candidates.length)return false;
        if(!options||candidates.length<options.length){
          best=i;options=candidates;
          if(options.length===1)break;
        }
      }
      if(best<0)return false;
      options.sort((a,b)=>Math.abs(a.difficulty-difficulty)-Math.abs(b.difficulty-difficulty)||
        seededRank(a.normalized,seed)-seededRank(b.normalized,seed));
      for(const row of options){
        const changed=place(best,row);
        if(solve(left-1))return true;
        unplace(best,row,changed);
        if(nodes>=maxNodes)break;
      }
      return false;
    }
    function anchor(index){
      if(nodes>=maxNodes)return false;
      if(index===mandatory.length)return solve(slots.length-index);
      const word=mandatory[index],row=words.get(word);
      for(let i=0;i<slots.length;i++){
        if(selected[i]||slots[i].positions.length!==word.length||!fits(slots[i],word))continue;
        const changed=place(i,row);
        if(anchor(index+1))return true;
        unplace(i,row,changed);
        if(nodes>=maxNodes)break;
      }
      return false;
    }
    if(anchor(0)){
      const grid=shape.grid.map((row,r)=>[...row].map((ch,c)=>ch==='■'?'■':letters[r*5+c]).join(''));
      const clues=Object.fromEntries(slots.map((s,i)=>[s.direction+':'+s.start.join(','),selected[i].clue]));
      const draft={...createDraft(5,5),title:'自動生成クロスワード',grid,clues};
      const review=inspectDraft(draft);
      if(!review.ok)throw new Error('生成結果が完成盤面検証に失敗: '+review.issues.join(' / '));
      return {status:'success',draft,requiredWords:mandatory,
        words:slots.map((s,i)=>({answer:selected[i].normalized,display:selected[i].surface,
          difficulty:selected[i].difficulty,direction:s.direction,start:s.start,clue:selected[i].clue})),
        nodes,examinedShapes,seed,difficulty};
    }
    if(nodes>=maxNodes)break;
  }
  return nodes>=maxNodes?
    {status:'exhausted',message:'探索上限に達しました。語数や配置の制約を調整してください。',nodes,examinedShapes}:
    {status:'contradiction',message:'探索した盤面形状では全ての語枠を埋められませんでした。',nodes,examinedShapes};
}
