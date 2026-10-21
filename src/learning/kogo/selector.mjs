/**
 * APP-002: candidate selector for the future classical-language mode.
 * This module selects *clues*, not an intersecting crossword puzzle.
 * Preview mode may use source_checked_candidate; student mode may not.
 */
const LEVELS={easy:1,normal:2,hard:3};
const TYPES=new Set(['classical_word','modern_meaning','literary_history','grammar','passage']);
const KANA=/^[ァ-ヴー]{2,15}$/u;

function hash32(value){
  let h=2166136261;
  for(const c of String(value)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}
  return h>>>0;
}
function rank(id,seed){
  // Stable across input ordering and independent of wall-clock time.
  return hash32(String(seed)+'|'+id);
}
function shuffled(items,seed){
  return items.slice().sort((a,b)=>rank(a.clue_id,seed)-rank(b.clue_id,seed)||
    a.clue_id.localeCompare(b.clue_id));
}
function candidate(row,maxDifficulty,audience,works,minLength,maxLength){
  if(!row || typeof row!=='object' || Array.isArray(row))return false;
  if(audience==='student' ? row.review_status!=='human_checked' :
    !['human_checked','source_checked_candidate'].includes(row.review_status))return false;
  if(!Number.isInteger(row.difficulty)||row.difficulty>maxDifficulty||row.difficulty<1)return false;
  if(!KANA.test(row.answer)||row.answer.startsWith('ン')||row.answer.startsWith('ー'))return false;
  if(row.answer.length<minLength||row.answer.length>maxLength)return false;
  if(typeof row.clue_id!=='string'||typeof row.prompt!=='string'||!row.prompt.trim())return false;
  if([...row.prompt].filter(c=>c==='〇').length!==row.answer.length)return false;
  if(!TYPES.has(row.question_type))return false;
  if(!['text_recall','vocabulary_or_knowledge'].includes(row.difficulty_basis))return false;
  if(row.difficulty_basis==='text_recall'&&row.difficulty!==3)return false;
  return !works || works.has(row.work);
}
/**
 * @param {object[]} records source records from kogo_clues.jsonl
 * @param {object} options
 *    audience: 'preview' (drafts allowed) or 'student' (approved only)
 *    difficulty: 'easy' | 'normal' | 'hard' interpreted as max difficulty
 *    vocabularyShare: desired minimum vocabulary/knowledge fraction (0..1)
 *    works: optional list of selected works
 *
 * Returns a deterministic *selection preview*. No puzzle, grading, or
 * student release is implied. The actual count and achieved ratio are reported.
 */
export function selectKogoClues(records,{
  audience='preview',difficulty='normal',count=10,vocabularyShare=0.8,
  works=null,seed=1,minLength=2,maxLength=15
}={}){
  if(!Array.isArray(records))throw new TypeError('問題バンクは配列で指定してください');
  if(!['preview','student'].includes(audience))throw new RangeError('audienceを指定してください');
  if(!Object.hasOwn(LEVELS,difficulty))throw new RangeError('difficultyはeasy/normal/hardです');
  if(!Number.isInteger(count)||count<1||count>30)throw new RangeError('countは1〜30です');
  if(typeof vocabularyShare!=='number'||!Number.isFinite(vocabularyShare)||vocabularyShare<0||vocabularyShare>1)
    throw new RangeError('vocabularyShareは0〜1です');
  if(!Number.isInteger(minLength)||!Number.isInteger(maxLength)||minLength<2||maxLength>15||minLength>maxLength)
    throw new RangeError('文字数は2〜15の範囲で指定してください');
  if(works!==null && (!Array.isArray(works)||!works.every(w=>typeof w==='string'&&w.length>0)))
    throw new TypeError('worksは作品名の配列です');
  if(!['number','string'].includes(typeof seed)||String(seed).length>128)
    throw new TypeError('seedは数字または短い文字列です');
  const allowedWorks=works===null?null:new Set(works);
  const pool=records.filter(r=>candidate(r,LEVELS[difficulty],audience,allowedWorks,minLength,maxLength));
  const wordPool=shuffled(pool.filter(r=>r.difficulty_basis==='vocabulary_or_knowledge'),seed);
  const recallPool=shuffled(pool.filter(r=>r.difficulty_basis==='text_recall'),seed);
  const selected=[],answerSet=new Set(),meaningSet=new Set();
  const tryAdd=row=>{
    if(selected.length>=count||answerSet.has(row.answer))return false;
    if(row.meaning_group_id&&meaningSet.has(row.meaning_group_id))return false;
    selected.push(row);answerSet.add(row.answer);
    if(row.meaning_group_id)meaningSet.add(row.meaning_group_id);
    return true;
  };
  const desiredVocabulary=Math.ceil(count*vocabularyShare);
  for(const row of wordPool){
    if(selected.length>=desiredVocabulary)break;
    tryAdd(row);
  }
  for(const row of recallPool)tryAdd(row);
  for(const row of wordPool)tryAdd(row); // fill shortages without forcing quotations
  const vocabularyCount=selected.filter(x=>x.difficulty_basis==='vocabulary_or_knowledge').length;
  const recallCount=selected.length-vocabularyCount;
  const achievedShare=selected.length?vocabularyCount/selected.length:0;
  const warnings=[];
  if(selected.length<count)warnings.push('条件に合う異なる解答が不足しています（'+selected.length+'/'+count+'件）');
  if(selected.length&&achievedShare<vocabularyShare)
    warnings.push('語彙問題の目標割合に届いていません');
  if(audience==='student'&&!selected.length)
    warnings.push('教員承認済みの問題がないため、生徒向け出題は行いません');
  return {
    status:audience==='preview'?'draft_preview':selected.length?'approved_selection':'no_approved_clues',
    audience,difficulty,requested:count,eligible:pool.length,
    achieved: selected.length,goalVocabularyShare:vocabularyShare,achievedVocabularyShare:achievedShare,
    vocabularyCount,recallCount,warnings,
    // Not an actual crossword; grid placement requires separate validation.
    entries:selected.map(r=>({
      id:r.clue_id,answer:r.answer,clue:r.prompt,question_type:r.question_type,
      difficulty:r.difficulty,difficulty_basis:r.difficulty_basis,
      work:r.work,review_status:r.review_status,
      meaning_group_id:r.meaning_group_id??null
    }))
  };
}
