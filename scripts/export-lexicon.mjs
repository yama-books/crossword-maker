import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {parseTsv,selectOneCluePerAnswer} from './check-lexicon.mjs';

const SOURCE=fileURLToPath(new URL('../data/lexicon/approved_lexicon.tsv',import.meta.url));
const HELP='Usage: node scripts/export-lexicon.mjs [--category="木の種類"] [--difficulty=1] [--count=12] [--seed=1] [--min-length=2] [--max-length=8]\n'
  +'Options: --category may be repeated or comma-separated; --help prints help.\n'
  +'Output: display | reading | clue, one per line; maximum 60 answers for M3a.\n';
const INTEGER=/^\d+$/u;
function integer(value,label,min,max){
 const s=String(value);
 if(!INTEGER.test(s)||!Number.isSafeInteger(Number(s))||Number(s)<min||Number(s)>max)
   throw new RangeError(label+' must be an integer from '+min+' to '+max);
 return Number(s);
}
export function parseExportArgs(args){
 const settings={category:[],difficulty:1,count:12,seed:1,minLength:2,maxLength:8};
 let help=false;
 const allowed=new Set(['category','difficulty','count','seed','min-length','max-length']);
 for(let i=0;i<args.length;i++){
   const raw=args[i];
   if(raw==='--help'||raw==='-h'){help=true;continue}
   if(!raw.startsWith('--'))throw new Error('Unknown argument: '+raw);
   const eq=raw.indexOf('='),key=raw.slice(2,eq<0?undefined:eq);
   if(!allowed.has(key))throw new Error('Unknown option: '+key);
   const value=eq>=0?raw.slice(eq+1):args[++i];
   if(value===undefined||value==='')throw new Error('Missing value for --'+key);
   if(key==='category'){
     const parts=value.split(',').map(x=>x.trim());
     if(parts.some(x=>!x))throw new Error('Empty category');
     settings.category.push(...parts);
   }else{
     const bounds=key==='difficulty'?[1,3]:key==='count'?[2,60]:key==='seed'?[0,4294967295]:[2,15];
     const parsed=integer(value,key,...bounds);
     if(key==='min-length')settings.minLength=parsed;
     else if(key==='max-length')settings.maxLength=parsed;
     else settings[key]=parsed;
   }
 }
 if(settings.minLength>settings.maxLength)throw new RangeError('min-length must not exceed max-length');
 settings.category=settings.category.length?[...new Set(settings.category)]:null;
 return {help,settings};
}
function shuffleStable(items,seed){
 let state=seed>>>0;
 const next=()=>{
   state=(state+0x6d2b79f5)>>>0;
   let t=state;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);
   return ((t^(t>>>14))>>>0)/4294967296;
 };
 const a=items.slice();
 for(let i=a.length-1;i>0;i--){
   const j=Math.floor(next()*(i+1));[a[i],a[j]]=[a[j],a[i]];
 }
 return a;
}
/** Pick distinct crossword answers, retaining all source senses in the TSV. */
export function createLexiconExport(rows,opts={}){
 const {category=null,difficulty=1,count=12,seed=1,minLength=2,maxLength=8}=opts;
 integer(difficulty,'difficulty',1,3);
 integer(count,'count',2,60);
 integer(seed,'seed',0,4294967295);
 integer(minLength,'minLength',2,15);
 integer(maxLength,'maxLength',2,15);
 if(minLength>maxLength)throw new RangeError('minLength must not exceed maxLength');
 if(!Array.isArray(rows))throw new TypeError('rows must be an array');
 const categoryFilter=category===null?null:(Array.isArray(category)?category:[category]);
 if(categoryFilter!==null){
   if(!categoryFilter.length||categoryFilter.some(x=>typeof x!=='string'||!x.trim()))
     throw new TypeError('category must be nonempty');
   const known=new Set(rows.map(row=>row.category));
   const missing=categoryFilter.filter(name=>!known.has(name));
   if(missing.length)throw new Error('Unknown category: '+missing.join(', '));
 }
 const distinct=selectOneCluePerAnswer(rows,{category:categoryFilter,difficulty});
 const valid=distinct.filter(r=>Number(r.length)>=minLength&&Number(r.length)<=maxLength);
 if(valid.length<count)throw new RangeError('Only '+valid.length+' matching distinct answers; requested '+count);
 const selected=shuffleStable(valid,seed).slice(0,count);
 return {selected,available:valid.length,
   text:selected.map(row=>[row.surface,row.reading,row.clue].join(' | ')).join('\n')};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
   const {help,settings}=parseExportArgs(process.argv.slice(2));
   if(help)process.stdout.write(HELP);
   else{
     const rows=parseTsv(readFileSync(SOURCE,'utf8'));
     process.stdout.write(createLexiconExport(rows,settings).text+'\n');
   }
 }catch(error){
   process.stderr.write('Lexicon export error: '+error.message+'\n');
   process.exitCode=1;
 }
}
