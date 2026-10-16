import {normalizeKana} from '../core/kana.mjs';
import {createDraft,fromPuzzle,normalizeDraft,putCell,putClue,toPuzzle,inspectDraft,EMPTY} from './model.mjs';

const $=id=>document.getElementById(id);
const STORAGE='jp-crossword-maker-draft-m2';
const motions=['cw-slide','cw-mask','cw-pixel','cw-shape','cw-liquid','cw-wave'];
let draft=createDraft(7,7), undoStack=[], redoStack=[], tool='letter', selected={r:0,c:0};
let composing=false, lastMotion=-1;

function say(message){$('message').textContent=message;}
function remember(){try{localStorage.setItem(STORAGE,JSON.stringify(draft));}catch(_){}}
try{
 const saved=localStorage.getItem(STORAGE);
 if(saved)draft=normalizeDraft(JSON.parse(saved));
}catch(e){say('保存されたデータを読めなかったため、新規盤面で開始しました。');}

function commit(next,opts={}){
 if(JSON.stringify(next)===JSON.stringify(draft))return;
 undoStack.push(structuredClone(draft));
 if(undoStack.length>60)undoStack.shift();
 redoStack=[];
 draft=next;remember();render();
 if(opts.motion)showMotion();
}
function doUndo(){
 if(!undoStack.length)return;
 redoStack.push(structuredClone(draft));
 draft=undoStack.pop();remember();render();say('ひとつ前の操作に戻しました。');
}
function doRedo(){
 if(!redoStack.length)return;
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
 const text=normalizeKana(String(raw||''));
 if(raw && text.length!==1){say('1マスにつき、カナ1文字を入力してください。');return false;}
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
 const board=$('board'),count=draft.grid.length*[...draft.grid[0]].length;
 const candidates=count>121?[0,2,5]:[0,1,2,3,4,5];
 let pick=candidates[Math.floor(Math.random()*candidates.length)];
 if(pick===lastMotion&&candidates.length>1)pick=candidates[(candidates.indexOf(pick)+1)%candidates.length];
 lastMotion=pick;
 board.style.setProperty('--motion',motions[pick]);
 board.classList.remove('motion');void board.offsetWidth;board.classList.add('motion');
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
 const review=inspectDraft(draft),rows=draft.grid.length,cols=[...draft.grid[0]].length;
 $('rows').value=String(rows);$('cols').value=String(cols);
 if(document.activeElement!==$('puzzle-title'))$('puzzle-title').value=draft.title;
 $('symmetry').checked=draft.rules.rotationalSymmetry;
 $('no-adjacent').checked=draft.rules.forbidAdjacentBlacks;
 $('undo').disabled=undoStack.length===0;$('redo').disabled=redoStack.length===0;
 $('export-puzzle').disabled=!review.ok;
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
 const board=$('board');board.classList.remove('motion');board.replaceChildren();
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
  const delay=Math.round((cols-1-c)/Math.max(1,cols-1)*350+((r*7+c*3)%5)*17);
  cell.style.setProperty('--delay',delay+'ms');
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
$('tool-letter').addEventListener('click',()=>setTool('letter'));
$('tool-black').addEventListener('click',()=>setTool('black'));
$('new').addEventListener('click',()=>{
 if(!window.confirm('新しい盤面に切り替えますか？ 現在の作業はUndoで戻せます。'))return;
 commit(createDraft(Number($('rows').value),Number($('cols').value)),{motion:true});
 selected={r:0,c:0};render();showMotion();say('新しい盤面を作りました。');
});
$('sample').addEventListener('click',async()=>{
 if(!window.confirm('例題で盤面を置き換えますか？ Undoで戻せます。'))return;
 try{
  const response=await fetch('./puzzle.json',{cache:'no-store'});
  if(!response.ok)throw new Error('サンプルを取得できません ('+response.status+')');
  const sample=fromPuzzle(await response.json());
  commit(sample,{motion:true});selected={r:0,c:1};render();showMotion();say('既存の14問を編集用に読み込みました。');
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
$('cell-entry').addEventListener('compositionstart',()=>{composing=true;});
$('cell-entry').addEventListener('compositionend',()=>{
 composing=false;
 const value=$('cell-entry').value;
 if(setLetter(value))$('cell-entry').value='';
});
$('cell-entry').addEventListener('input',()=>{
 if(composing)return;
 const value=$('cell-entry').value;
 if(setLetter(value))$('cell-entry').value='';
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
 downloadJSON(draft,'-draft');say('作業JSONを書き出しました。');
});
$('export-puzzle').addEventListener('click',()=>{
 const review=inspectDraft(draft);
 if(!review.ok){say('未完成です。右側の盤面チェックを確認してください。');return;}
 downloadJSON(toPuzzle(draft),'-puzzle');say('検証済みの完成問題JSONを書き出しました。');
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
render();
