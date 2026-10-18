import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {parseTsv,validateRecords,checkFiles,selectOneCluePerAnswer,toLegacyWordList} from '../scripts/check-lexicon.mjs';
import {parseWordList} from '../src/generator/words.mjs';
import {normalizeKana} from '../src/core/kana.mjs';

const approvedPath = fileURLToPath(new URL('../data/lexicon/approved_lexicon.tsv',import.meta.url));
const approved=parseTsv(readFileSync(approvedPath,'utf8'));

test('2000 editorially checked meanings pass lexical structural checks',()=>{
 const check=checkFiles();
 assert.equal(check.candidates.count,2000);
 assert.equal(check.approved.count,2000);
 assert.equal(check.approved.uniqueAnswers,1936);
 assert.equal(Object.keys(check.approved.homonymGroups).length,51);
 for(const answer of ['カシ','ヒヨウシ','ハシ','ツル','スイセイ'])
   assert.ok(check.approved.homonymGroups[answer]);
 assert.deepEqual(check.errors,[]);
 assert.equal(Object.keys(check.approved.byCategory).length,100);
 assert.ok(Object.values(check.approved.byCategory).every(n=>n===20));
 assert.equal(Object.entries(check.approved.byLength).filter(([n])=>Number(n)<=5).reduce((n,[,value])=>n+value,0),1826);
 assert.ok(approved.every(word=>word.review_status==='editor_checked'));
});
test('small kana expansion agrees with shared M1 function',()=>{
 const row=approved.find(word=>word.surface==='学校');
 assert.equal(row.normalized,normalizeKana(row.reading,{strict:true}));
 assert.equal(row.normalized,'ガツコウ');
 assert.equal(normalizeKana('ふぁすなー',{strict:true}),'フアスナー');
});
test('lexicon validator rejects repeated identical senses and clue leakage',()=>{
 const duplicate={...approved[0],id:'LEX-9999'};
 const dup=validateRecords([...approved,duplicate],{approved:true});
 assert.ok(dup.errors.some(message=>message.includes('duplicate answer/surface/clue')));
 const leaking={...approved[0],clue:approved[0].clue+' '+approved[0].surface};
 const checked=validateRecords([leaking],{approved:true});
 assert.ok(checked.errors.some(message=>message.includes('direct surface')));
});


test('one-cell words are invalid and legacy normalized spellings stay stable',()=>{
  const map = new Map(approved.map(row=>[row.normalized,row.surface]));
  assert.equal(map.get(normalizeKana('びよういん',{strict:true})),'病院');
  assert.ok(approved.some(row=>row.normalized===normalizeKana('まつ',{strict:true})&&row.surface==='松'));
  assert.ok(approved.some(row=>row.normalized===normalizeKana('まつ',{strict:true})&&row.surface==='待つ'));
  assert.equal(map.get(normalizeKana('りょうし',{strict:true})),'理容師');
  assert.ok(approved.some(row=>row.normalized===normalizeKana('すいせい',{strict:true})&&row.surface==='水星'));
  assert.ok(approved.some(row=>row.normalized===normalizeKana('すいせい',{strict:true})&&row.surface==='彗星'));
  const invalid={...approved[0],id:'LEX-9001',surface:'酢',reading:'す',normalized:'ス',length:'1',clue:'料理を酸っぱくする調味料'};
  assert.ok(validateRecords([invalid],{approved:true}).errors.length>0);
});

test('homonyms keep both their distinct definitions and difficulty',()=>{
  const groups=Map.groupBy(approved,row=>row.normalized);
  assert.deepEqual(groups.get('カシ').map(row=>[row.surface,row.difficulty]).sort((a,b)=>a[0].localeCompare(b[0])),[['樫','2'],['歌詞','1']].sort((a,b)=>a[0].localeCompare(b[0])));
  assert.deepEqual(new Set(groups.get('ヒヨウシ').map(row=>row.surface)),new Set(['表紙','拍子']));
  const differentClue={...approved.find(row=>row.surface==='歌詞'),id:'LEX-9999',clue:'旋律に合わせて声に出す文章'};
  const validation=validateRecords([...approved,differentClue],{approved:true});
  assert.deepEqual(validation.errors,[]);
  assert.equal(validation.uniqueAnswers,1936);
});
test('one unique answer per generated puzzle, with an easy/hard clue variant',()=>{
  const easy=selectOneCluePerAnswer(approved,{difficulty:1});
  const harder=selectOneCluePerAnswer(approved,{difficulty:2});
  assert.equal(easy.length,1936);
  assert.equal(harder.length,1936);
  assert.equal(new Set(easy.map(row=>row.normalized)).size,easy.length);
  assert.equal(new Set(harder.map(row=>row.normalized)).size,harder.length);
  assert.equal(easy.find(row=>row.normalized==='カシ').surface,'歌詞');
  assert.equal(harder.find(row=>row.normalized==='カシ').surface,'樫');
  assert.equal(easy.find(row=>row.normalized==='ヒヨウシ').surface,'表紙');
  assert.equal(harder.find(row=>row.normalized==='ヒヨウシ').surface,'拍子');
  assert.throws(()=>selectOneCluePerAnswer(approved,{difficulty:0}),RangeError);
  const kashiAndHyoshi=approved.filter(row=>['カシ','ヒヨウシ'].includes(row.normalized));
  const parsed=parseWordList(toLegacyWordList(kashiAndHyoshi,{difficulty:2}));
  assert.deepEqual(parsed.errors,[]);
  assert.deepEqual(new Set(parsed.entries.map(row=>row.value)),new Set(['カシ','ヒヨウシ']));
  assert.equal(parsed.entries.find(row=>row.value==='カシ').display,'樫');
  // Genre filtering selects the appropriate meaning regardless of difficulty.
  const trees=selectOneCluePerAnswer(approved,{difficulty:1,category:'木の種類'});
  const music=selectOneCluePerAnswer(approved,{difficulty:2,category:'音楽のことば'});
  const books=selectOneCluePerAnswer(approved,{category:'本と美術'});
  assert.equal(trees.find(row=>row.normalized==='カシ').surface,'樫');
  assert.equal(music.find(row=>row.normalized==='カシ').surface,'歌詞');
  assert.equal(music.find(row=>row.normalized==='ヒヨウシ').surface,'拍子');
  assert.equal(books.find(row=>row.normalized==='ヒヨウシ').surface,'表紙');
  assert.ok(trees.every(row=>row.category==='木の種類'));
  assert.ok(music.every(row=>row.category==='音楽のことば'));
  assert.ok(books.every(row=>row.category==='本と美術'));
  const mixed=selectOneCluePerAnswer(approved,{category:['木の種類','音楽のことば'],difficulty:2});
  assert.equal(mixed.find(row=>row.normalized==='カシ').surface,'樫');
  assert.equal(new Set(mixed.map(row=>row.normalized)).size,mixed.length);
  assert.throws(()=>selectOneCluePerAnswer(approved,{category:[]}),TypeError);
  const musicParsed=parseWordList(toLegacyWordList(approved.filter(row=>['カシ','ヒヨウシ'].includes(row.normalized)),{category:'音楽のことば'}));
  assert.deepEqual(musicParsed.errors,[]);
  assert.deepEqual(new Set(musicParsed.entries.map(row=>row.display)),new Set(['歌詞','拍子']));
});

test('homonyms may share answer and surface when their explanations differ',()=>{
 const groups=Map.groupBy(approved,row=>row.normalized);
 assert.deepEqual(new Set(groups.get('ハシ').map(x=>x.surface)),new Set(['箸','橋','端']));
 assert.deepEqual(new Set(groups.get('ツル').map(x=>x.category)),new Set(['野山の生き物','植物のしくみ']));
 assert.equal(groups.get('スイセイ').length,2);
 const plants=selectOneCluePerAnswer(approved,{category:'植物のしくみ'});
 const birds=selectOneCluePerAnswer(approved,{category:'野山の生き物'});
 assert.equal(plants.find(x=>x.normalized==='ツル').category,'植物のしくみ');
 assert.equal(birds.find(x=>x.normalized==='ツル').category,'野山の生き物');
});

test('expanded sense clusters survive genre selection',()=>{
 const byAnswer=Map.groupBy(approved,row=>row.normalized);
 assert.deepEqual(new Set(byAnswer.get('キル').map(row=>row.surface)),new Set(['着る','切る']));
 assert.deepEqual(new Set(byAnswer.get('ハク').map(row=>row.surface)),new Set(['履く','掃く','吐く']));
 assert.deepEqual(new Set(byAnswer.get('イシ').map(row=>row.surface)),new Set(['石','意思','医師']));
 assert.deepEqual(new Set(byAnswer.get('シリヨウ').map(row=>row.surface)),new Set(['資料','史料']));
 assert.deepEqual(new Set(byAnswer.get('シヨウセツ').map(row=>row.surface)),new Set(['小説','小雪']));
 const history=selectOneCluePerAnswer(approved,{category:'歴史と建築',difficulty:2});
 const seasonal=selectOneCluePerAnswer(approved,{category:'二十四節気',difficulty:3});
 assert.equal(history.find(row=>row.normalized==='シリヨウ').surface,'史料');
 assert.equal(seasonal.find(row=>row.normalized==='シヨウセツ').surface,'小雪');
 assert.equal(seasonal.length,20);
 assert.equal(new Set(seasonal.map(row=>row.normalized)).size,20);
});

test('2000-sense milestone retains distinct homonym clues',()=>{
 const byAnswer=Map.groupBy(approved,row=>row.normalized);
 assert.deepEqual(new Set(byAnswer.get('カネ').map(r=>r.surface)),new Set(['鐘','金']));
 assert.deepEqual(new Set(byAnswer.get('コウジ').map(r=>r.surface)),new Set(['麹','工事']));
 assert.deepEqual(new Set(byAnswer.get('ハカル').map(r=>r.surface)),new Set(['量る','測る','計る']));
 assert.deepEqual(new Set(byAnswer.get('カエル').map(r=>r.surface)),new Set(['かえる','帰る','変える']));
 assert.equal(approved.find(r=>r.surface==='風切羽').reading,'かざきりばね');
 const theatre=selectOneCluePerAnswer(approved,{category:'舞台と演劇'});
 assert.equal(theatre.length,20);
 assert.equal(new Set(theatre.map(r=>r.normalized)).size,20);
 const homonyms=selectOneCluePerAnswer(approved,{category:'同音異義の名詞と動詞'});
 assert.equal(homonyms.length,11);
 assert.equal(new Set(homonyms.map(r=>r.normalized)).size,homonyms.length);
});
