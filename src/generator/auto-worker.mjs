import {generateCompleteCrossword} from './auto-fill.mjs';

let lexiconPromise;
async function loadLexicon(){
  if(!lexiconPromise){
    const url=new URL('../../data/lexicon.json',import.meta.url);
    lexiconPromise=fetch(url,{cache:'force-cache'}).then(async response=>{
      if(!response.ok)throw new Error('公開辞書を取得できませんでした (HTTP '+response.status+')');
      const data=await response.json();
      if(data.schemaVersion!==1||!Array.isArray(data.entries))throw new Error('辞書の形式が不正です。');
      return data.entries;
    }).catch(error=>{lexiconPromise=null;throw error;});
  }
  return lexiconPromise;
}
self.addEventListener('message',async ({data})=>{
  if(data?.type!=='generate')return;
  const id=data.id;
  try{
    const entries=await loadLexicon();
    const result=generateCompleteCrossword({entries,required:data.required,size:5,
      difficulty:data.difficulty,seed:data.seed,maxNodes:15000,
      title:'自動生成クロスワード'});
    self.postMessage({id,type:'result',result});
  }catch(error){
    self.postMessage({id,type:'error',message:error.message||String(error)});
  }
});
