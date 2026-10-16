import { normalizeKana } from './kana.mjs';

export const DEFAULT_RULES = Object.freeze({
  forbidAdjacentBlacks: true,
  requireConnectedWhite: true,
  rotationalSymmetry: true,
  forbidLeadingNOrBar: true,
  forbidDuplicateAnswers: true
});

const keyOf = (r, c) => r+','+c;
const error = (code, detail = '') => ({ code, detail });

/** Extract all two-or-more-letter word slots and row-major clue numbering. */
export function extractSlots(grid) {
  if (!Array.isArray(grid) || grid.length < 2 || grid.length > 40) {
    throw new Error('Expected 2–40 rows');
  }
  const rows = grid.map(row => typeof row === 'string' ? [...row] : row);
  const width = rows[0]?.length;
  if (!Number.isInteger(width) || width < 2 || width > 40 ||
      rows.some(row => !Array.isArray(row) || row.length !== width || row.some(x => typeof x !== 'string' || [...x].length !== 1))) {
    throw new Error('Grid must be rectangular with one character per cell');
  }
  const slots = [];
  const byStart = new Map();
  const covered = new Set();
  for (let r = 0; r < rows.length; r++) for (let c = 0; c < width; c++) {
    if (rows[r][c] === '■') continue;
    for (const direction of ['A', 'D']) {
      const dr = direction === 'D' ? 1 : 0;
      const dc = direction === 'A' ? 1 : 0;
      if (r - dr >= 0 && c - dc >= 0 && rows[r-dr][c-dc] !== '■') continue;
      const cells = [];
      for (let y = r, x = c; y < rows.length && x < width && rows[y][x] !== '■'; y += dr, x += dc) {
        cells.push([y,x]);
      }
      if (cells.length < 2) continue;
      const slot = { direction, start: [r,c], cells, answer: cells.map(([y,x]) => rows[y][x]).join('') };
      slots.push(slot);
      for (const [y,x] of cells) covered.add(keyOf(y,x));
      const id = keyOf(r,c);
      if (!byStart.has(id)) byStart.set(id, []);
      byStart.get(id).push(slot);
    }
  }
  const numbers = {};
  let number = 0;
  for (let r = 0; r < rows.length; r++) for (let c = 0; c < width; c++) {
    const id = keyOf(r,c);
    if (!byStart.has(id)) continue;
    numbers[id] = ++number;
    for (const slot of byStart.get(id)) slot.number = number;
  }
  return { rows, width, height: rows.length, slots, numbers, covered };
}

/** Structural validation only: dictionary meaning and clue quality require human review. */
export function validatePuzzle(puzzle, overrides = {}) {
  const errors = [];
  if (!puzzle || typeof puzzle !== 'object') return {ok:false,errors:[error('invalid_puzzle')]};
  let analysis;
  try { analysis = extractSlots(puzzle.grid); }
  catch (e) { return {ok:false,errors:[error('invalid_grid', e.message)]}; }
  const { rows, width, height, slots, numbers, covered } = analysis;
  const rules = { ...DEFAULT_RULES, ...(puzzle.ruleSet ?? {}), ...overrides };
  if (puzzle.size !== undefined && (height !== puzzle.size || width !== puzzle.size)) errors.push(error('size_mismatch'));
  if (puzzle.rows !== undefined && height !== puzzle.rows) errors.push(error('size_mismatch', 'rows'));
  if (puzzle.cols !== undefined && width !== puzzle.cols) errors.push(error('size_mismatch', 'cols'));
  const whiteCells = [];
  for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) {
    const character = rows[r][c];
    if (character === '■') {
      if (rules.forbidAdjacentBlacks && ((r > 0 && rows[r-1][c] === '■') || (c > 0 && rows[r][c-1] === '■'))) {
        errors.push(error('black_adjacent', keyOf(r,c)));
      }
      if (rules.rotationalSymmetry && rows[height-r-1][width-c-1] !== '■') errors.push(error('asymmetry', keyOf(r,c)));
    } else {
      whiteCells.push(keyOf(r,c));
      try { if (normalizeKana(character, {strict:true}) !== character) errors.push(error('invalid_kana', keyOf(r,c))); }
      catch { errors.push(error('invalid_kana', keyOf(r,c))); }
      if (!covered.has(keyOf(r,c))) errors.push(error('orphan_white', keyOf(r,c)));
    }
  }
  if (!whiteCells.length) errors.push(error('empty_board'));
  else if (rules.requireConnectedWhite) {
    const visited = new Set([whiteCells[0]]);
    const queue = [whiteCells[0]];
    for (let i = 0; i < queue.length; i++) {
      const [r,c] = queue[i].split(',').map(Number);
      for (const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const y=r+dr,x=c+dc,k=keyOf(y,x);
        if (y>=0&&x>=0&&y<height&&x<width&&rows[y][x]!=='■'&&!visited.has(k)) { visited.add(k);queue.push(k); }
      }
    }
    if (visited.size !== whiteCells.length) errors.push(error('disconnected'));
  }
  const seenAnswers = new Set();
  for (const slot of slots) {
    if (rules.forbidLeadingNOrBar && /^[ンー]/u.test(slot.answer)) errors.push(error('invalid_start', slot.direction+':'+slot.number));
    if (rules.forbidDuplicateAnswers && seenAnswers.has(slot.answer)) errors.push(error('duplicate_answer', slot.answer));
    seenAnswers.add(slot.answer);
  }
  const actualNumbers = puzzle.numbers ?? {};
  if (JSON.stringify(Object.entries(numbers).sort()) !== JSON.stringify(Object.entries(actualNumbers).sort())) errors.push(error('number_mismatch'));
  const expected = new Map(slots.map(slot => [slot.direction+':'+keyOf(...slot.start), slot]));
  const claimed = new Set();
  if (!Array.isArray(puzzle.entries)) errors.push(error('missing_entries'));
  else for (const entry of puzzle.entries) {
    const id = entry.direction+':'+(Array.isArray(entry.start) ? keyOf(...entry.start) : '?');
    if (claimed.has(id)) errors.push(error('duplicate_entry', id));
    claimed.add(id);
    const slot = expected.get(id);
    if (!slot) {errors.push(error('extra_entry', id));continue;}
    if (entry.number !== slot.number || entry.answer !== slot.answer ||
        JSON.stringify(entry.cells) !== JSON.stringify(slot.cells)) errors.push(error('entry_mismatch', id));
    if (typeof entry.clue !== 'string' || !entry.clue.trim()) errors.push(error('missing_clue', id));
  }
  if (Array.isArray(puzzle.entries)) for (const id of expected.keys()) if (!claimed.has(id)) errors.push(error('missing_entry', id));
  if (Array.isArray(puzzle.requiredWords)) for (const word of puzzle.requiredWords) {
    try {
      if (!seenAnswers.has(normalizeKana(word, {strict:true}))) errors.push(error('missing_required_word', word));
    } catch { errors.push(error('invalid_required_word', String(word))); }
  }
  return {ok:errors.length === 0,errors,analysis};
}
