import {normalizeKana} from '../core/kana.mjs';
import {MOTIONS,availableMotions,chooseMotion,delayForCell} from './motion.mjs';
import {parseWordList,generateWordLayout} from '../generator/words.mjs';
import {createDraft,fromPuzzle,normalizeDraft,putCell,putClue,toPuzzle,inspectDraft,EMPTY} from './model.mjs';

const $=id=>document.getElementById(id);
const STORAGE='jp-crossword-maker-draft-m2';
const SAMPLE_WORDS=[
 '図書館 | としょかん | 本を読んだり借りたりする場所',
 '学校 | がっこう | 勉強する場所',
 '教室 | きょうしつ | 授業を受ける部屋',
 '先生 | せんせい | 生徒に教える人',
 'かばん | 荷物を入れるもの',
 'りんご | 赤い果物',
 'みかん | 冬によく食べる果物',
 'ことば | 気持ちを伝えるためのもの',
 'てんき | 晴れや雨などの空のようす',
 'とけい | 時刻を知らせる道具',
 'こくご | 日本語を学ぶ教科'
].join('\n');

let draft=createDraft(7,7), undoStack=[], redoStack=[], tool='letter', selected={r:0,c:0};
let composing=false, lastMotion=null, motionTimer=null;
let pendingAuto=null, runningAutoWorker=null;

function say(message,tone=''){
 const target=$('message');
 target.textContent=message;
 target.classList.remove('notice-pop','notice-warn');
 if(tone==='success'||tone==='error'){
  void target.offsetWidth;
  target.classList.add(tone==='success'?'notice-pop':'notice-warn');
 }
}
function stopMotion(){
 if(motionTimer!==null){clearTimeout(motionTimer);motionTimer=null;}
 const board=$('board');
 board.classList.remove('motion');
 board.removeAttribute('data-motion');
 board.style.removeProperty('--motion');
}
for(const mode of MOTIONS){
 const option=document.createElement('option');
 option.value=mode.id;option.textContent=mode.label;
 $('motion-select').append(option);
}
function remember(){try{localStorage.setItem(STORAGE,JSON.stringify(draft));}catch(_){}}
try{
 const saved=localStorage.getItem(STORAGE);
 if(saved)draft=normalizeDraft(JSON.parse(saved));
}catch(e){say('保存されたデータを読めなかったため、新規盤面で開始しました。');}

function clearPendingAuto(){
 pendingAuto=null;
 $('auto-preview').hidden=true;
 $('auto-apply').disabled=true;
 $('auto-preview-grid').replaceChildren();
}
function commit(next,opts={}){
 if(JSON.stringify(next)===JSON.stringify(draft))return;
 clearPendingAuto();
 undoStack.push(structuredClone(draft));
 if(undoStack.length>60)undoStack.shift();
 redoStack=[];
 draft=next;remember();render();
 if(opts.motion)showMotion();
}
function doUndo(){
 if(!undoStack.length)return;
 clearPendingAuto();
 redoStack.push(structuredClone(draft));
 draft=undoStack.pop();remember();render();say('ひとつ前の操作に戻しました。');
}
function doRedo(){
 if(!redoStack.length)return;
 clearPendingAuto();
 undoStack.push(structuredClone(draft));
 draft=redoStack.pop();remember();render();say('操作をやり直しました。');
}
function setTool(next){
 tool=next;
 for(const [name,id] of [['letter','tool-letter'],['black','tool-black']]){
  const active=name===tool;
  $(id).classList.toggle('active',active);
  $(id).setAttribute('aria-pressed',String(active));
 }
 $('cell-entry').disabled=tool==='black';
 say(tool==='black'?'黒マスツール：マスをタップすると黒白が切り替わります。':'文字ツール：マスをタップしてカナを入力してください。');
}
function makeChoice(select){
 for(let i=5;i<=15;i++){
  const opt=document.createElement('option');opt.value=String(i);
  opt.textContent=i+'マス';select.append(opt);
 }
}
makeChoice($('rows'));makeChoice($('cols'));
function moveSelection(r,c,focusCell=false){
 const rows=draft.grid.length,cols=[...draft.grid[0]].length;
 selected={r:Math.max(0,Math.min(rows-1,r)),c:Math.max(0,Math.min(cols-1,c))};
 render();
 if(focusCell) $('board').querySelector('[data-r="'+selected.r+'"][data-c="'+selected.c+'"]')?.focus();
}
function setLetter(raw){
 if(!selected)return;
 const {r,c}=selected;
 let text='';
 try{if(raw)text=normalizeKana(String(raw),{strict:true});}
 catch{say('ひらがな・カタカナ1文字を入力してください。','error');return false;}
 if(raw && text.length!==1){say('1マスにつき、カナ1文字を入力してください。','error');return false;}
 const next=putCell(draft,r,c,text||EMPTY);
 commit(next);
 say(text?'「'+text+'」を入力しました。':'選択マスを消しました。');
 return true;
}
function handleCellClick(r,c){
 selected={r,c};
 if(tool==='black'){
  const ch=[...draft.grid[r]][c];
  commit(putCell(draft,r,c,ch==='■'?EMPTY:'■'));
  say(ch==='■'?'白マスに戻しました。':'黒マスを置きました。');
 }else{
  render();
  $('cell-entry').focus({preventScroll:true});
 }
}
function showMotion(){
 stopMotion();
 const board=$('board');
 const rows=draft.grid.length,cols=[...draft.grid[0]].length;
 const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false;
 const chosen=chooseMotion({rows,cols,requested:$('motion-select').value,
    previous:lastMotion,reduced});
 $('motion-caption').textContent=chosen.id?'✦ '+chosen.label:'動きを減らす設定を優先しています';
 if(!chosen.id)return;
 lastMotion=chosen.id;
 board.dataset.motion=chosen.id;
 const animations={slide:'cw-slide',mask:'cw-mask',pixel:'cw-pixel',shape:'cw-shape',
   liquid:'cw-liquid',wave:'cw-wave',checker:'cw-checker',diagonal:'cw-diagonal'};
 if(animations[chosen.id])board.style.setProperty('--motion',animations[chosen.id]);
 // A whole-board reveal must never translate the individual cells.
 if(chosen.group==='cells')for(const cell of board.children){
  const r=Number(cell.dataset.r),c=Number(cell.dataset.c);
  cell.style.setProperty('--delay',delayForCell(chosen.id,r,c,rows,cols)+'ms');
 }
 void board.offsetWidth;
 board.classList.add('motion');
 motionTimer=setTimeout(stopMotion,chosen.duration+35);
}
function makeClueRow(slot){
 const label=document.createElement('label');label.className='clue-line';
 const n=document.createElement('span');n.className='clue-id';
 n.textContent=slot.number+'.';
 const input=document.createElement('input');input.className='input';input.type='text';input.maxLength=500;
 const slotId=slot.direction+':'+slot.start[0]+','+slot.start[1];
 input.value=draft.clues[slotId]||'';
 input.placeholder=slot.answer.includes(EMPTY)?'ヒントを入力（未完成）':'ヒントを入力';
 input.setAttribute('aria-label',(slot.direction==='A'?'ヨコ':'タテ')+slot.number+'番のカギ');
 input.addEventListener('change',()=>commit(putClue(draft,slotId,input.value)));
 label.append(n,input);return label;
}
function render(){
 const rows=draft.grid.length,cols=[...draft.grid[0]].length;
 selected={r:Math.min(rows-1,Math.max(0,selected?.r ?? 0)),c:Math.min(cols-1,Math.max(0,selected?.c ?? 0))};
 const review=inspectDraft(draft);
 $('rows').value=String(rows);$('cols').value=String(cols);
 if(document.activeElement!==$('puzzle-title'))$('puzzle-title').value=draft.title;
 $('symmetry').checked=draft.rules.rotationalSymmetry;
 $('no-adjacent').checked=draft.rules.forbidAdjacentBlacks;
 $('undo').disabled=undoStack.length===0;$('redo').disabled=redoStack.length===0;
 $('export-puzzle').disabled=!review.ok;
 const report=$('word-result'),unplaced=$('unplaced-words');
 unplaced.replaceChildren();
 const generation=draft.generation;
 report.hidden=!generation;
 if(generation){
  report.classList.toggle('warning',generation.unplaced.length>0||!review.ok);
  report.textContent='前回の配置案：'+generation.used.length+' / '+generation.total+
    '語、交差'+generation.crosses+'マス。'+
    (generation.edited?' 編集後の配置数は再計算していません。':'')+
    (review.ok?' 完成問題として出力可能です。':' 未完成のため盤面チェックも確認してください。');
  for(const word of generation.unplaced){
   const li=document.createElement('li');li.textContent=word;unplaced.append(li);
  }
 }
 $('size-label').textContent=cols+' × '+rows+' マス';
 $('stats').textContent='白マス '+review.whiteCount+' / 未入力 '+review.blanks+' / 解答枠 '+review.slotCount;
 const validation=$('validation');
 validation.classList.toggle('warning',!review.ok);
 validation.textContent=review.ok?'✓ 完成問題として保存できます。':'編集中：未完成でも作業を保存できます。';
 const issues=$('issues');issues.replaceChildren();
 for(const issue of review.issues.slice(0,9)){
  const li=document.createElement('li');li.textContent=issue;issues.append(li);
 }
 if(review.issues.length>9){
  const li=document.createElement('li');li.textContent='ほか '+(review.issues.length-9)+' 件';issues.append(li);
 }
 const board=$('board');stopMotion();board.replaceChildren();
 const allowed=new Set(availableMotions(rows,cols).map(effect=>effect.id));
 for(const option of $('motion-select').options){
  if(option.value!=='random')option.disabled=!allowed.has(option.value);
 }
 if($('motion-select').selectedOptions[0]?.disabled){
  $('motion-select').value='random';
 }
 board.style.setProperty('--cols',cols);
 for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
  const ch=[...draft.grid[r]][c];
  const cell=document.createElement('button');cell.type='button';
  cell.className='cell'+(ch==='■'?' black':ch===EMPTY?' empty':'')+(selected?.r===r&&selected?.c===c?' selected':'');
  cell.dataset.r=String(r);cell.dataset.c=String(c);
  cell.setAttribute('role','gridcell');
  cell.setAttribute('aria-label',(r+1)+'行'+(c+1)+'列 '+(ch===EMPTY?'未入力':ch==='■'?'黒マス':ch));
  const number=review.analysis.numbers[r+','+c];
  if(ch!=='■'&&number){
   const small=document.createElement('span');small.className='num';small.textContent=number;cell.append(small);
  }
  if(ch!=='■'){
   const txt=document.createElement('span');txt.textContent=ch===EMPTY?'':ch;cell.append(txt);
  }
  // Motion timing is assigned only when explicitly revealing a new board.
  cell.addEventListener('click',()=>handleCellClick(r,c));
  board.append(cell);
 }
 $('cell-label').textContent=selected?(selected.r+1)+'行 '+(selected.c+1)+'列':'マスを選択';
 $('cell-entry').placeholder=selected&&[...draft.grid[selected.r]][selected.c]==='■'?'黒マス':'カナ1文字';
 $('cell-entry').disabled=tool==='black'||(selected&&[...draft.grid[selected.r]][selected.c]==='■');
 for(const [dir,id] of [['A','across'],['D','down']]){
  const target=$(id);target.replaceChildren();
  const slots=review.analysis.slots.filter(s=>s.direction===dir);
  if(!slots.length){const p=document.createElement('p');p.className='help';p.textContent='まだ語枠がありません。';target.append(p);}
  for(const slot of slots)target.append(makeClueRow(slot));
 }
}
$('word-source').value=draft.generation?.source||'';
$('word-sample').addEventListener('click',()=>{
 if($('word-source').value.trim() &&
    !window.confirm('入力中の単語リストを例に置き換えますか？'))return;
 $('word-source').value=SAMPLE_WORDS;
 say('例の単語を入力しました。盤面を選んで配置案を生成できます。');
});
$('generate-words').addEventListener('click',async()=>{
 const button=$('generate-words'),source=$('word-source').value;
 const parsed=parseWordList(source);
 if(parsed.errors.length){
  const report=$('word-result');report.hidden=false;
  report.classList.add('warning');
  report.textContent=parsed.errors.slice(0,5).join(' / ')+
    (parsed.errors.length>5?' 他'+(parsed.errors.length-5)+'件':'');
  say('単語の読みやカギを修正してください。');
  return;
 }
 if(!window.confirm('現在の盤面を配置案で置き換えますか？ Undoで戻せます。'))return;
 button.disabled=true;
 button.setAttribute('aria-busy','true');
 button.textContent='配置を探索中…';
 await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
 try{
  const rows=Number($('rows').value),cols=Number($('cols').value);
  const result=generateWordLayout(parsed.entries,rows,cols);
  if(!result.placed.length){
   say('この盤面サイズでは配置できませんでした。サイズや単語を調整してください。');return;
  }
  const metadata={kind:'words-first',source,total:parsed.entries.length,
   used:result.placed.map(w=>w.display),
   unplaced:result.unplaced.map(w=>w.display+'（'+w.value+'）'),
   crosses:result.crosses,attempts:result.attempts,seed:result.seed,edited:false};
  selected={r:0,c:0};
  const next={...createDraft(rows,cols),title:draft.title,
    rules:{...draft.rules},grid:result.grid,
    clues:result.clues,generation:metadata};
  commit(next,{motion:true});
  say('配置案を作成しました。'+result.placed.length+'語を配置、未配置'+
    result.unplaced.length+'語。完成問題にするには盤面チェックを確認してください。','success');
 }catch(e){say('配置案の生成に失敗しました：'+e.message);}
 finally{
  button.disabled=false;
  button.removeAttribute('aria-busy');
  button.textContent='✦ 配置案をつくる';
 }
});
$('tool-letter').addEventListener('click',()=>setTool('letter'));
$('tool-black').addEventListener('click',()=>setTool('black'));
$('new').addEventListener('click',()=>{
 if(!window.confirm('新しい盤面に切り替えますか？ 現在の作業はUndoで戻せます。'))return;
 selected={r:0,c:0};commit(createDraft(Number($('rows').value),Number($('cols').value)),{motion:true});
 say('新しい盤面を作りました。','success');
});
$('sample').addEventListener('click',async()=>{
 if(!window.confirm('例題で盤面を置き換えますか？ Undoで戻せます。'))return;
 try{
  const response=await fetch('./puzzle.json',{cache:'no-store'});
  if(!response.ok)throw new Error('サンプルを取得できません ('+response.status+')');
  const sample=fromPuzzle(await response.json());
  selected={r:0,c:1};commit(sample,{motion:true});say('既存の14問を編集用に読み込みました。');
 }catch(e){say('例題の読み込みに失敗しました：'+e.message);}
});
$('puzzle-title').addEventListener('change',()=>{
 commit({...draft,title:$('puzzle-title').value.trim().slice(0,80)||'無題のクロスワード'});
});
$('symmetry').addEventListener('change',()=>commit({...draft,rules:{...draft.rules,rotationalSymmetry:$('symmetry').checked}}));
$('no-adjacent').addEventListener('change',()=>commit({...draft,rules:{...draft.rules,forbidAdjacentBlacks:$('no-adjacent').checked}}));
$('undo').addEventListener('click',doUndo);
$('redo').addEventListener('click',doRedo);
$('erase').addEventListener('click',()=>setLetter(''));
$('motion-preview').addEventListener('click',showMotion);
$('board').addEventListener('pointerdown',stopMotion,{capture:true});
$('board').addEventListener('focusin',stopMotion,{capture:true});
$('cell-entry').addEventListener('compositionstart',()=>{composing=true;});
$('cell-entry').addEventListener('compositionend',()=>{
 composing=false;
 const value=$('cell-entry').value;
 if(value && setLetter(value))$('cell-entry').value='';
});
$('cell-entry').addEventListener('input',()=>{
 if(composing)return;
 const value=$('cell-entry').value;
 if(value && setLetter(value))$('cell-entry').value='';
});
$('board').addEventListener('keydown',event=>{
 const cell=event.target.closest('.cell');if(!cell)return;
 const r=Number(cell.dataset.r),c=Number(cell.dataset.c);
 const dirs={ArrowRight:[0,1],ArrowLeft:[0,-1],ArrowDown:[1,0],ArrowUp:[-1,0]};
 if(dirs[event.key]){event.preventDefault();moveSelection(r+dirs[event.key][0],c+dirs[event.key][1],true);return;}
 if(event.key==='Backspace'||event.key==='Delete'){
  event.preventDefault();selected={r,c};setLetter('');$('board').querySelector('[data-r="'+r+'"][data-c="'+c+'"]')?.focus();return;
 }
 if(event.key.length===1&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&tool==='letter'){
  const ch=normalizeKana(event.key);
  if(ch.length===1){event.preventDefault();selected={r,c};setLetter(ch);$('board').querySelector('[data-r="'+r+'"][data-c="'+c+'"]')?.focus();}
 }
});
document.addEventListener('keydown',e=>{
 if(!(e.ctrlKey||e.metaKey)||e.altKey)return;
 if(['INPUT','TEXTAREA'].includes(document.activeElement?.tagName))return;
 if(e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?doRedo():doUndo();}
 if(e.key.toLowerCase()==='y'){e.preventDefault();doRedo();}
});
function downloadJSON(data,suffix){
 const content=JSON.stringify(data,null,2)+'\n',blob=new Blob([content],{type:'application/json;charset=utf-8'});
 const url=URL.createObjectURL(blob),anchor=document.createElement('a');
 const safe=draft.title.replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').slice(0,45)||'crossword';
 anchor.href=url;anchor.download=safe+suffix+'.json';document.body.append(anchor);anchor.click();anchor.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
$('save').addEventListener('click',()=>{
 downloadJSON(draft,'-draft');say('作業JSONを書き出しました。','success');
});
$('export-puzzle').addEventListener('click',()=>{
 const review=inspectDraft(draft);
 if(!review.ok){say('未完成です。右側の盤面チェックを確認してください。');return;}
 downloadJSON(toPuzzle(draft),'-puzzle');say('検証済みの完成問題JSONを書き出しました。','success');
});
$('load').addEventListener('click',()=>$('file').click());
$('file').addEventListener('change',async()=>{
 const file=$('file').files?.[0];if(!file)return;
 try{
  if(file.size>1024*1024)throw new Error('1MB以内のJSONファイルを選んでください。');
  const next=normalizeDraft(JSON.parse(await file.text()));
  if(!window.confirm('読み込んだ内容に切り替えますか？ 現在の作業はUndoで戻せます。'))return;
  selected={r:0,c:0};commit(next,{motion:true});say('JSONファイルを読み込みました。');
 }catch(e){say('読み込み失敗：'+e.message);}
 finally{$('file').value='';}
});

function previewAutoPuzzle(puzzle){
  const container=$('auto-preview-grid');
  container.replaceChildren();
  container.style.setProperty('--cols',puzzle.cols);
  for(const line of puzzle.grid)for(const ch of line){
    const cell=document.createElement('span');
    cell.className='auto-preview-cell'+(ch==='■'?' black':'');
    cell.textContent=ch==='■'?'':ch;
    container.append(cell);
  }
  $('auto-preview').hidden=false;
  $('auto-apply').disabled=false;
}
function setAutoBusy(busy){
  $('auto-start').disabled=busy;
  $('auto-fill').disabled=busy;
  $('auto-cancel').hidden=!busy;
}
function runAutoFill(mode){
  if(runningAutoWorker)return;
  const required=$('auto-required').value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  const status=$('auto-status');
  clearPendingAuto();
  status.hidden=false;
  status.classList.remove('warning');
  if(required.length>5){
    status.classList.add('warning');
    status.textContent='必須語は最大5語にしてください。';
    return;
  }
  if(typeof Worker!=='function'){
    status.classList.add('warning');
    status.textContent='このブラウザは非同期の自動生成に対応していません。';
    return;
  }
  status.textContent='辞書を読み込み、交差条件を探索しています…';
  let worker;
  try{worker=new Worker(new URL('../generator/auto-worker.mjs',import.meta.url),{type:'module'});}
  catch(error){status.textContent='自動生成を開始できません：'+error.message;status.classList.add('warning');return;}
  runningAutoWorker=worker;
  setAutoBusy(true);
  const cleanup=()=>{
    if(runningAutoWorker!==worker)return;
    worker.terminate();
    runningAutoWorker=null;
    setAutoBusy(false);
  };
  worker.onmessage=event=>{
    if(runningAutoWorker!==worker || event.data?.id!==1)return;
    const result=event.data.result??{status:'error',reason:'予期しない応答です。'};
    cleanup();
    if(result.status==='success'){
      pendingAuto=result.puzzle;
      previewAutoPuzzle(result.puzzle);
      const n=result.puzzle.entries.length;
      status.textContent='完成候補が見つかりました。'+n+'問、探索'+result.totalNodes??result.nodes+'回。採用するまで今の編集内容は変わりません。';
    }else{
      status.classList.add('warning');
      status.textContent='今回は完成盤面が見つかりませんでした（'+result.status+'）。'+(result.reason??'')+
        ' 必須語や黒マスの配置を変更するか、別の難易度を試してください。';
    }
  };
  worker.onerror=event=>{
    if(runningAutoWorker!==worker)return;
    cleanup();status.classList.add('warning');
    status.textContent='自動生成でエラーが発生しました。操作中の盤面は変更していません。';
  };
  worker.postMessage({id:1,mode,grid:draft.grid.slice(),clues:{...draft.clues},
    required,difficulty:Number($('auto-difficulty').value),title:draft.title});
}
$('auto-start').addEventListener('click',()=>runAutoFill('new'));
$('auto-fill').addEventListener('click',()=>runAutoFill('fill'));
$('auto-cancel').addEventListener('click',()=>{
  if(runningAutoWorker){runningAutoWorker.terminate();runningAutoWorker=null;}
  setAutoBusy(false);
  const status=$('auto-status');
  status.hidden=false;status.textContent='探索を中止しました。現在の盤面は変更していません。';
});
$('auto-apply').addEventListener('click',()=>{
  if(!pendingAuto)return;
  const chosen=pendingAuto;
  try {
    commit(fromPuzzle(chosen),{motion:true});
    say('辞書で生成した完成問題を採用しました。Undoで戻せます。','success');
    $('auto-status').textContent='完成問題を採用しました。カギや盤面を編集できます。';
  }catch(e){say('完成候補を採用できませんでした：'+e.message,'error');}
});

render();
