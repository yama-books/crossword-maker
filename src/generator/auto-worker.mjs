import {fillCrossword,generateCompleteCrossword} from './auto-fill.mjs';
import {extractSlots,validatePuzzle} from '../core/puzzle.mjs';
import {resolveRequiredWords} from './lexicon.mjs';

let cachedEntries=null;
async function loadEntries(){
  if(cachedEntries)return cachedEntries;
  const response=await fetch(new URL('../../data/lexicon.json',import.meta.url),{cache:'force-cache'});
  if(!response.ok)throw new Error('辞書を取得できません（HTTP '+response.status+'）。');
  const data=await response.json();
  if(data.schemaVersion!==1||!Array.isArray(data.entries))throw new Error('辞書の形式が違います。');
  cachedEntries=data.entries;
  return cachedEntries;
}
self.addEventListener('message',async event=>{
  const {id,mode,grid,required=[],difficulty=2,title='クロスワード',clues={}}=event.data??{};
  try {
    const entries=await loadEntries();
    const normalizedRequired=resolveRequiredWords(required,entries);
    const request={entries,required:normalizedRequired,difficulty,title,seed:20261019,maxNodes:22000};
    const result=mode==='new'?generateCompleteCrossword(request):
      mode==='fill'?fillCrossword({...request,grid}):{status:'invalid_mode',reason:'操作の種類が不明です。'};
    // A manually authored clue for a fully fixed slot must not be lost.
    if(mode==='fill'&&result.status==='success'&&grid&&clues){
      const before=extractSlots(grid);
      const authored=new Map(before.slots.filter(s=>!s.answer.includes('□'))
        .map(s=>[s.direction+':'+s.start.join(','),{answer:s.answer,
          clue:clues[s.direction+':'+s.start.join(',')]}]));
      for(const entry of result.puzzle.entries){
        const saved=authored.get(entry.direction+':'+entry.start.join(','));
        if(saved?.clue && saved.answer===entry.answer)entry.clue=saved.clue;
      }
      if(!validatePuzzle(result.puzzle).ok)throw new Error('カギの復元後の盤面検証に失敗しました。');
    }
    self.postMessage({id,result});
  } catch(error) {
    self.postMessage({id,result:{status:'error',reason:String(error?.message??error)}});
  }
});