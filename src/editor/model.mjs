import { normalizeKana } from '../core/kana.mjs';
import { extractSlots, validatePuzzle, DEFAULT_RULES } from '../core/puzzle.mjs';

export const EMPTY = '□';
export const DRAFT_VERSION = 2;
export const MIN_SIZE = 5;
export const MAX_SIZE = 15;
const allowedRules = Object.keys(DEFAULT_RULES);
const key = slot => slot.direction + ':' + slot.start[0] + ',' + slot.start[1];

function dimensions(rows, cols) {
  if (!Number.isInteger(rows) || !Number.isInteger(cols) ||
      rows < MIN_SIZE || cols < MIN_SIZE || rows > MAX_SIZE || cols > MAX_SIZE) {
    throw new Error('盤面サイズは縦・横とも5〜15マスにしてください。');
  }
}
function cleanCell(cell) {
  if (cell === '■' || cell === EMPTY) return cell;
  if (typeof cell !== 'string' || !cell) throw new Error('不正なマスの文字です。');
  const normalized = normalizeKana(cell, {strict: true});
  if ([...normalized].length !== 1) throw new Error('1マスには1文字だけ入力できます。');
  return normalized;
}
function rulesFrom(raw) {
  const rules = {...DEFAULT_RULES};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const k of allowedRules) if (typeof raw[k] === 'boolean') rules[k] = raw[k];
  }
  return rules;
}
export function createDraft(rows = 7, cols = 7) {
  dimensions(rows, cols);
  return {schemaVersion: DRAFT_VERSION, kind: 'crossword-draft',
    title: 'わたしのクロスワード', grid: Array(rows).fill(EMPTY.repeat(cols)),
    clues: {}, rules: rulesFrom()};
}
export function fromPuzzle(puzzle) {
  if (!validatePuzzle(puzzle).ok) throw new Error('読み込む完成問題の盤面またはカギが不正です。');
  const {height, width} = extractSlots(puzzle.grid);
  dimensions(height, width);
  const clues = {};
  for (const entry of puzzle.entries) clues[key(entry)] = entry.clue;
  return {schemaVersion: DRAFT_VERSION, kind: 'crossword-draft',
    title: String(puzzle.title || '無題のクロスワード').slice(0,80),
    grid: puzzle.grid.slice(), clues, rules: rulesFrom(puzzle.ruleSet)};
}
export function normalizeDraft(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('JSONの形式が違います。');
  if (source.kind !== 'crossword-draft' && Array.isArray(source.entries) && Array.isArray(source.grid)) return fromPuzzle(source);
  if (source.kind !== 'crossword-draft' || source.schemaVersion !== DRAFT_VERSION) throw new Error('未対応の保存形式です。');
  if (!Array.isArray(source.grid) || !source.grid.every(x => typeof x === 'string')) throw new Error('盤面データがありません。');
  const rows = source.grid.length, cols = [...(source.grid[0] || '')].length;
  dimensions(rows, cols);
  if (source.grid.some(line => [...line].length !== cols)) throw new Error('行ごとのマス数が違います。');
  const grid = source.grid.map(line => [...line].map(cleanCell).join(''));
  const clues = {};
  if (source.clues && typeof source.clues === 'object' && !Array.isArray(source.clues)) {
    for (const [k,v] of Object.entries(source.clues)) {
      if (/^[AD]:\d+,\d+$/.test(k) && typeof v === 'string') clues[k] = v.slice(0,500);
    }
  }
  const draft={schemaVersion:DRAFT_VERSION,kind:'crossword-draft',
    title:String(source.title || '無題のクロスワード').slice(0,80),
    grid, clues, rules:rulesFrom(source.rules)};
  if(source.generation?.kind==='words-first'){
    const g=source.generation;
    draft.generation={kind:'words-first',source:String(g.source??'').slice(0,36000),
      total:Math.max(0,Math.min(60,Number(g.total)||0)),
      used:Array.isArray(g.used)?g.used.slice(0,60).map(v=>String(v).slice(0,100)):[],
      unplaced:Array.isArray(g.unplaced)?g.unplaced.slice(0,60).map(v=>String(v).slice(0,100)):[],
      crosses:Number.isInteger(g.crosses)?g.crosses:0,
      seed:Number.isInteger(g.seed)?g.seed>>>0:0,
      attempts:Number.isInteger(g.attempts)?g.attempts:0,
      edited:Boolean(g.edited)};
  }
  return draft;
}
export function putCell(draft,r,c,value) {
  const rows=draft.grid.length, cols=[...draft.grid[0]].length;
  if (!Number.isInteger(r)||!Number.isInteger(c)||r<0||c<0||r>=rows||c>=cols) throw new RangeError('範囲外のマスです。');
  const letter = value === '' ? EMPTY : cleanCell(value);
  const grid = draft.grid.slice(), line = [...grid[r]];
  line[c]=letter;grid[r]=line.join('');
  return draft.generation?{...draft,grid,generation:{...draft.generation,edited:true}}:{...draft,grid};
}
export function putClue(draft,slotId,clue) {
  if (!/^[AD]:\d+,\d+$/.test(slotId)) throw new Error('不正なカギ番号です。');
  const clues={...draft.clues,[slotId]:String(clue).slice(0,500)};
  return draft.generation?{...draft,clues,generation:{...draft.generation,edited:true}}:{...draft,clues};
}
export function toPuzzle(draft) {
  const {slots,numbers,height,width}=extractSlots(draft.grid);
  const entries=slots.map(slot=>({
    direction:slot.direction,start:slot.start,number:slot.number,
    cells:slot.cells,answer:slot.answer,clue:(draft.clues[key(slot)]||'').trim()
  }));
  const puzzle={title:draft.title, rows:height,cols:width,
    grid:draft.grid.slice(),numbers,entries,ruleSet:{...draft.rules}};
  if (width===height) puzzle.size=width;
  return puzzle;
}
export function inspectDraft(draft) {
  const analysis=extractSlots(draft.grid);
  const chars=draft.grid.flatMap(line=>[...line]);
  const blanks=chars.filter(ch=>ch===EMPTY).length;
  const whiteCount=chars.filter(ch=>ch!=='■').length;
  const missingClues=analysis.slots.filter(slot=>!(draft.clues[key(slot)]||'').trim());
  const issues=[];
  if (!whiteCount) issues.push('白マスがありません。');
  if (!analysis.slots.length) issues.push('2文字以上のヨコ・タテの語枠がありません。');
  const orphan=whiteCount-analysis.covered.size;
  if (orphan) issues.push('どの語枠にも属さない白マスが'+orphan+'個あります。');
  if (blanks) issues.push('未入力のマス：'+blanks+'個');
  if (missingClues.length) issues.push('カギが未入力：'+missingClues.length+'件');
  // Check structural rules even while blanks remain. Incomplete is not the same as invalid.
  const height=analysis.height,width=analysis.width,rows=analysis.rows;
  let blackAdjacent=0,asymmetric=0;
  const white=[];
  for(let r=0;r<height;r++)for(let c=0;c<width;c++){
    if(rows[r][c]!=='■'){white.push([r,c]);continue;}
    if(draft.rules.forbidAdjacentBlacks &&
      ((r+1<height&&rows[r+1][c]==='■')||(c+1<width&&rows[r][c+1]==='■')))blackAdjacent++;
    if(draft.rules.rotationalSymmetry && rows[height-1-r][width-1-c]!=='■')asymmetric++;
  }
  if(blackAdjacent)issues.push('隣接する黒マスが'+blackAdjacent+'組あります。');
  if(asymmetric)issues.push('180度対称でない黒マスが'+asymmetric+'個あります。');
  if(draft.rules.requireConnectedWhite&&white.length){
    const visited=new Set([white[0].join(',')]),queue=[white[0]];
    for(let p=0;p<queue.length;p++){
      const [r,c]=queue[p];
      for(const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]){
        const y=r+dr,x=c+dc,k=y+','+x;
        if(y>=0&&x>=0&&y<height&&x<width&&rows[y][x]!=='■'&&!visited.has(k)){
          visited.add(k);queue.push([y,x]);
        }
      }
    }
    if(visited.size!==white.length)issues.push('白マスが分断されています。');
  }
  const puzzle=toPuzzle(draft);
  // A draft can be saved at any time. Only a fully populated puzzle is publishable.
  const validation=blanks===0 ? validatePuzzle(puzzle) : null;
  if (validation) for (const e of validation.errors) issues.push('盤面ルール違反：'+e.code+(e.detail?' ('+e.detail+')':''));
  return {ok:blanks===0 && !!validation?.ok, issues:[...new Set(issues)],
    blanks,whiteCount,slotCount:analysis.slots.length,missingClues:missingClues.length,
    analysis,puzzle};
}
