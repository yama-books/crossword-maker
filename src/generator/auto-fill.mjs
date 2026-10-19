import {normalizeKana} from '../core/kana.mjs';
import {extractSlots,validatePuzzle,DEFAULT_RULES} from '../core/puzzle.mjs';
import {buildLexiconIndex} from './lexicon.mjs';

export const STARTER_MASKS_5=[
  ['■□□□□','□□□□□','■□■□■','□□□□□','□□□□■'],
  ['□■□□■','□□□■□','□□□□□','□■□□□','■□□■□'],
  ['□□□□■','□■□■□','□□□□□','□■□■□','■□□□□']
];

const key=s=>s.direction+':'+s.start.join(',');
const hash=(value,seed)=>{
  let h=(2166136261^seed)>>>0;
  for(const c of value){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}
  return h>>>0;
};
function normalRequired(required) {
  if(!Array.isArray(required)||required.length>5)throw new RangeError('必須語は最大5語です。');
  const words=required.map(word=>normalizeKana(String(word),{strict:true}));
  if(words.some(w=>w.length<2||!/^[ァ-ヴー]+$/u.test(w))||new Set(words).size!==words.length)
    throw new Error('必須語の読みが不正、または重複しています。');
  return words;
}
function checkPattern(grid,rules,analysis){
  const rows=analysis.rows,h=analysis.height,w=analysis.width;
  const cells=[];
  for(let r=0;r<h;r++)for(let c=0;c<w;c++){
    const v=rows[r][c];
    if(v==='■'){
      if(rules.forbidAdjacentBlacks && ((r>0&&rows[r-1][c]==='■')||(c>0&&rows[r][c-1]==='■')))
        return '黒マスが縦横に隣接しています。';
      if(rules.rotationalSymmetry && rows[h-1-r][w-1-c]!=='■')return '黒マスが180度対称ではありません。';
    }else{
      try{if(v!=='□'&&normalizeKana(v,{strict:true})!==v)return '不正な入力文字があります。';}
      catch{return '不正な入力文字があります。';}
      cells.push([r,c]);
      if(!analysis.covered.has(r+','+c))return 'どの語枠にも属さない白マスがあります。';
    }
  }
  if(!cells.length)return '白マスがありません。';
  if(rules.requireConnectedWhite){
    const seen=new Set([cells[0].join(',')]),q=[cells[0]];
    for(let i=0;i<q.length;i++){
      const [r,c]=q[i];
      for(const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]){
        const y=r+dr,x=c+dc,k=y+','+x;
        if(y>=0&&x>=0&&y<h&&x<w&&rows[y][x]!=='■'&&!seen.has(k)){seen.add(k);q.push([y,x]);}
      }
    }
    if(seen.size!==cells.length)return '白マスが分断されています。';
  }
  return null;
}

/**
 * Fill a fixed black-cell pattern from curated vocabulary while keeping
 * every already-entered white-cell letter unchanged.
 *
 * No substitution of invented strings; success is accepted only after
 * validatePuzzle confirms every across/down slot and required answer.
 * Computation is bounded by maxNodes, which may return exhausted (not unsat).
 */
export function fillCrossword({grid,entries,required=[],difficulty=2,categories=null,
  rules=DEFAULT_RULES,seed=1,maxNodes=15000,title='自動生成クロスワード'}={}) {
  if(!Array.isArray(grid)||!grid.length||!grid.every(x=>typeof x==='string'))
    throw new Error('盤面を指定してください。');
  if(!Number.isInteger(maxNodes)||maxNodes<1||maxNodes>200000)throw new RangeError('maxNodes は1〜200000です。');
  const requiredWords=normalRequired(required);
  const effectiveRules={...DEFAULT_RULES,...rules};
  const index=buildLexiconIndex(entries,{difficulty,categories});
  let analysis;
  try{analysis=extractSlots(grid);}
  catch(e){return {status:'invalid_pattern',reason:e.message,nodes:0};}
  const issue=checkPattern(grid,effectiveRules,analysis);
  if(issue)return {status:'invalid_pattern',reason:issue,nodes:0};
  const slots=analysis.slots;
  if(!slots.length)return {status:'invalid_pattern',reason:'語枠がありません。',nodes:0};
  for(const slot of slots)if(!index.byLength.has(slot.cells.length))
    return {status:'no_candidate',reason:slot.cells.length+'文字の登録語がありません。',nodes:0};
  for(const word of requiredWords){
    if(!index.byAnswer.has(word))return {status:'no_candidate',reason:'必須語「'+word+'」が選択した辞書にありません。',nodes:0};
    if(!slots.some(s=>s.cells.length===word.length))
      return {status:'contradiction',reason:'必須語「'+word+'」が入る語枠がありません。',nodes:0};
  }
  const board=analysis.rows.map(r=>r.slice()),selected=new Map(),used=new Set();
  const sorted=new Map();
  for(const [length,list] of index.byLength){
    sorted.set(length,list.slice().sort((a,b)=>{
      const scoreA=Math.abs(a.difficulty-difficulty),scoreB=Math.abs(b.difficulty-difficulty);
      return scoreA-scoreB || hash(a.answer,seed)-hash(b.answer,seed);
    }));
  }
  const compatible=(slot,word)=>{
    if(used.has(word.answer))return false;
    for(let i=0;i<slot.cells.length;i++){
      const [r,c]=slot.cells[i],v=board[r][c];
      if(v!=='□'&&v!==word.answer[i])return false;
    }
    return true;
  };
  const choices=slot=>(sorted.get(slot.cells.length)||[]).filter(word=>compatible(slot,word));
  const put=(slot,word)=>{
    const changed=[];
    for(let i=0;i<slot.cells.length;i++){
      const [r,c]=slot.cells[i];
      if(board[r][c]==='□'){board[r][c]=word.answer[i];changed.push([r,c]);}
    }
    selected.set(key(slot),word);used.add(word.answer);
    return ()=>{
      selected.delete(key(slot));used.delete(word.answer);
      for(const [r,c] of changed)board[r][c]='□';
    };
  };
  let nodes=0,exhausted=false,solution=null;
  const build=()=>{
    const finalGrid=board.map(r=>r.join(''));
    const final=extractSlots(finalGrid);
    const puzzle={title,rows:final.height,cols:final.width,grid:finalGrid,
      numbers:final.numbers,ruleSet:effectiveRules,requiredWords,
      entries:final.slots.map(s=>{
        const row=selected.get(key(s));
        return {...s,clue:row?.clue??''};
      })};
    if(final.height===final.width)puzzle.size=final.width;
    if(!validatePuzzle(puzzle).ok)return false;
    solution=puzzle;
    return true;
  };
  function search(){
    if(nodes>=maxNodes){exhausted=true;return false;}
    nodes++;
    if(selected.size===slots.length)return build();
    let chosen=null,optionList=null;
    for(const slot of slots){
      if(selected.has(key(slot)))continue;
      const current=choices(slot);
      if(!current.length)return false;
      if(!optionList||current.length<optionList.length){chosen=slot;optionList=current;}
      if(optionList.length===1)break;
    }
    for(const row of optionList){
      const undo=put(chosen,row);
      if(search())return true;
      undo();
      if(exhausted)return false;
    }
    return false;
  }
  const orderedRequired=requiredWords.slice().sort((a,b)=>b.length-a.length);
  function assignRequired(i){
    if(exhausted)return false;
    if(i===orderedRequired.length)return search();
    const answer=orderedRequired[i],word=index.byAnswer.get(answer);
    for(const slot of slots){
      if(selected.has(key(slot))||slot.cells.length!==answer.length||!compatible(slot,word))continue;
      const undo=put(slot,word);
      if(assignRequired(i+1))return true;
      undo();
      if(exhausted)return false;
    }
    return false;
  }
  const ok=assignRequired(0);
  if(ok)return {status:'success',puzzle:solution,nodes,
    matchedRequired:requiredWords.slice(),dictionaryAnswers:index.uniqueAnswers};
  return {status:exhausted?'exhausted':'contradiction',
    reason:exhausted?'探索上限に達しました。語の数や盤面を調整してください。':'現在の交差条件を満たす完成盤面が見つかりません。',
    nodes,dictionaryAnswers:index.uniqueAnswers};
}

/** Find a complete crossword from curated 5x5 layouts (never a draft). */
export function generateCompleteCrossword({entries,required=[],size=5,difficulty=2,
  seed=1,maxNodes=15000,title='自動生成クロスワード'}={}) {
  if(size!==5)return {status:'unsupported',reason:'完成生成の初期版は5×5のみ対応します。'};
  let spent=0,last={status:'contradiction',reason:'成立する配置が見つかりません。'};
  for(let i=0;i<STARTER_MASKS_5.length;i++){
    const mask=STARTER_MASKS_5[(i+(seed%STARTER_MASKS_5.length))%STARTER_MASKS_5.length];
    const res=fillCrossword({grid:mask,entries,required,difficulty,seed:seed+i,
      maxNodes,title});
    spent+=res.nodes??0;
    if(res.status==='success')return {...res,layout:i+1,totalNodes:spent};
    last=res;
  }
  return {...last,totalNodes:spent};
}