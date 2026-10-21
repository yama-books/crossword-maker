import {selectKogoClues} from './selector.mjs';
import {generateCompleteCrossword} from '../../generator/auto-fill.mjs';
import {validatePuzzle} from '../../core/puzzle.mjs';

/**
 * Internal 5x5 integration experiment. Student release is intentionally closed.
 * It is not yet a classroom-ready classical crossword:
 * unreviewed general lexicon may fill other slots.
 */
export function generateKogoPreviewPuzzle({
  clues,lexiconEntries,difficulty='normal',seed=7,count=24,
  vocabularyShare=0.8,maxNodes=12000,maxTries=3,audience='preview'
}={}){
  if(!Array.isArray(clues)||!Array.isArray(lexiconEntries))
    throw new TypeError('古典カギと一般辞書の配列が必要です');
  if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)
    throw new RangeError('seedは0〜4294967295の整数にしてください');
  if(!Number.isInteger(maxNodes)||maxNodes<1||maxNodes>200000)
    throw new RangeError('maxNodesは1〜200000です');
  if(!Number.isInteger(maxTries)||maxTries<1||maxTries>8)
    throw new RangeError('maxTriesは1〜8です');
  if(audience!=='preview'){
    // The general dictionary filler has no classical teacher approval.
    // Even an approved classical clue cannot make this mixed grid student-ready.
    return {status:'student_blocked',audience,attempts:0,selected:0,puzzle:null,
      warnings:['未承認の補助辞書を使用する試作盤面は、生徒向けに公開できません']};
  }
  const selection=selectKogoClues(clues,{
    audience:'preview',difficulty,seed,count,vocabularyShare,maxLength:5
  });
  if(selection.achieved===0)return {
    status:'no_candidate',audience,attempts:0,selected:0,selection,
    puzzle:null,warnings:['対象条件に合う古典カギがありません',...selection.warnings]
  };
  const selected=new Map(selection.entries.map(row=>[row.answer,row]));
  // Meaningful collision handling: a classical "いと" must not inherit
  // the ordinary homonymous "糸" clue. The classical clue replaces its
  // exact-kana general entry in the experimental dictionary only.
  const supplemental=lexiconEntries.filter(row=>row && !selected.has(row.answer));
  const adapted=selection.entries.map(row=>({
    id:row.id,answer:row.answer,normalized:row.answer,clue:row.clue,
    surface:row.answer,category:'kogo_preview',difficulty:row.difficulty
  }));
  const dictionary=[...adapted,...supplemental];
  const failures=[];
  // The existing 5x5 solver has no quota optimization yet. Try one
  // required classical word per attempt and measure the *actual* outcome.
  // A selected clue is not reported as "placed" until validatePuzzle passes.
  for(let i=0;i<Math.min(maxTries,adapted.length);i++){
    const focus=adapted[i];
    const result=generateCompleteCrossword({
      entries:dictionary,required:[focus.answer],size:5,difficulty:2,
      seed:(seed+i)>>>0,maxNodes,title:'古語クロスワード・内部試作'
    });
    if(result.status!=='success'){
      failures.push({id:focus.id,reason:result.status,nodes:result.totalNodes??result.nodes??0});
      continue;
    }
    const validity=validatePuzzle(result.puzzle);
    if(!validity.ok)throw new Error('生成エンジンが無効な完成盤面を返しました');
    const puzzle=result.puzzle;
    const classical=puzzle.entries.filter(e=>selected.has(e.answer) &&
      selected.get(e.answer).clue===e.clue);
    const kogoVocabulary=classical.filter(e=>selected.get(e.answer).difficulty_basis==='vocabulary_or_knowledge').length;
    const kogoTextRecall=classical.length-kogoVocabulary;
    const measured={
      totalSlots:puzzle.entries.length,kogoSlots:classical.length,
      vocabularyKogoSlots:kogoVocabulary,textRecallKogoSlots:kogoTextRecall,
      genericSlots:puzzle.entries.length-classical.length,
      kogoShare:puzzle.entries.length?classical.length/puzzle.entries.length:0,
      vocabularyShareWithinKogo:classical.length?kogoVocabulary/classical.length:0
    };
    return {status:'draft_puzzle',audience,attempts:i+1,
      selected:selection.achieved,selectedCandidateCount:adapted.length,
      selection,requiredClueId:focus.id,measured,
      puzzle,valid:true,solver:{nodes:result.totalNodes,patterns:result.triedPatterns},
      failures,warnings:[
        '内部検証用です。未承認の古典カギと一般辞書を含み、生徒向けに利用できません',
        ...(measured.kogoSlots<puzzle.entries.length?['補助語彙の出題が含まれます']:[]),
        ...(measured.vocabularyShareWithinKogo<vocabularyShare?['配置後の古典カギ内の単語割合が目標に届いていません']:[])
      ]};
  }
  return {status:'not_completed',audience,attempts:failures.length,
    selected:selection.achieved,selection,puzzle:null,failures,
    warnings:['制限した試行では完成盤面が得られませんでした。成功と報告しません']};
}
