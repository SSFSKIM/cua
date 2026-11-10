// Real trusted substitution + native service from each pinned source tree. The only store is a fresh synthetic HOME.
// The supplied execute callback is the engine socket boundary, never a substitute reader or confirmation predicate.
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomBytes} from 'node:crypto';
import {format,isDeepStrictEqual} from 'node:util';
export async function createSyntheticSecretProbe({sourceRoot,parent,clock=()=>performance.now()}){
 const load=p=>import(pathToFileURL(join(sourceRoot,p)).href);
 const [{createSkyService},{createService},{fileStore,storeDir},{serverError}]=await Promise.all([load('src/services/sky.mjs'),load('src/services/engine/service.mjs'),load('src/secrets/store.mjs'),load('src/services/engine/protocol.mjs')]);
 const home=mkdtempSync(join(parent,'probe354-secret-home-')),env={HOME:home},secret=randomBytes(32).toString('hex');
 const store=fileStore({dir:storeDir(env)});await store.write('PROBE354',secret);
 const fragments=Array.from({length:secret.length-7},(_,i)=>secret.slice(i,i+8));
 const contains=v=>typeof v==='string'&&fragments.some(s=>v.includes(s));
 const forbidden=(k,x)=>/^(before|actual|expected|value|.*excerpt|expectedLength|actualLength|(?:cua\/)?(?:entered|checkpoints))$/i.test(k)||(/^(?:cua\/)?keysUnconfirmed$/i.test(k)&&typeof x!=='boolean');
 const returnMetadata=new Map(),selectionMetadata=new Map();
 // Only pre-secret snapshot timing is excluded; raw records stay intact in each reply.
 const comparisonRecord=r=>r!=null&&typeof r==='object'?structuredClone(Object.fromEntries(Object.entries(r).filter(([k])=>k!=='snapshotMs'))):null;
 const compare=(map,pair,r)=>map.has(pair)&&map.get(pair)!=null&&r!=null&&isDeepStrictEqual(map.get(pair),r);
 let logLeaks=0;
 function inspect(value){const found=[],seen=new WeakSet();
  function walk(v,path=[]){if(typeof v==='string'){
   if(contains(v))found.push('secret bytes at '+path.join('.'));
   // Log payloads may be serialized objects, not just objects passed directly to console.
   try{const parsed=JSON.parse(v);if(parsed!=null&&typeof parsed==='object')walk(parsed,[...path,'structured'])}catch{}
   return;
  }if(v==null||typeof v!=='object'||seen.has(v))return;seen.add(v);
   for(const [k,x] of Object.entries(v)){const p=[...path,k];if(x!=null&&forbidden(k,x))found.push('private value/length at '+p.join('.'));walk(x,p)}
  }walk(value);return found;
 }
 function safe(value){const seen=new WeakSet();
  function copy(v){if(typeof v==='string')return inspect(v).length?'[redacted private synthetic-secret-bearing string]':v;if(v==null||typeof v!=='object')return v;if(seen.has(v))return '[cycle]';seen.add(v);
   const out=Array.isArray(v)?v.map(copy):Object.fromEntries(Object.entries(v).map(([k,x])=>[k,x!=null&&forbidden(k,x)?null:copy(x)]));seen.delete(v);return out;
  }return copy(value);
 }
 function errorObject(e){return e?{...Object.fromEntries(Object.getOwnPropertyNames(e).map(k=>[k,e[k]])),name:e.name,message:e.message}:null}
 return {
  home,get logLeaks(){return logLeaks},inspect,
  // Private preparation only: callers send this directly to the hidden fixture, never copy it into a row.
  fixture(variant){return {text:variant==='equal'?secret:'x'.repeat(secret.length),selection:[0,secret.length]}},
  checkFixture(state,intended,id){
   if(state.matchesExpected!==true||state.length!==intended.text.length||!state.focused||state.cell!==id||JSON.stringify(state.selection)!==JSON.stringify(intended.selection))throw Error('Private fixture state not established.');
  },
  sanitizeFixture(row){
   const out=safe(row),keep=['doc','cell','editor','at','focused','secure','matchesExpected','rpcStartedAt','rpcReturnedAt','delay','returnedAt','actualDelayMs'];
   for(const state of [out.reset,out.setup,out.settledSetup,out.priorKeyEffect,...(out.samples??[])])if(state)for(const key of Object.keys(state))if(!keep.includes(key))delete state[key];
   out.final=null;out.finalLength=null;out.finalSelection=null;out.trace=[];
   if(out.problem!=null)out.problem='Private fixture operation failed.';
   if(out.rebindProblem!=null)out.rebindProblem='Private fixture rebinding failed.';
   return out;
  },
  expected(before,[start,length]){return before.slice(0,start)+secret+before.slice(start+length)},
  log(line){if(inspect(line).length){logLeaks++;return '[redacted private synthetic-secret log line]'}return line},
  async run({execute,identity,app,bundle,pid,id,returnUnits=0,pair,selectionVariant}){
   const trustedStartedAt=Date.now(),trustedStart=clock();
   // CR survives the real store's single trailing-LF trim. The field expectation keeps only the common prefix.
   await store.write('PROBE354',secret+'\r'.repeat(returnUnits));
   let engineRaw=null,engineTiming=null,responseMeta={},content=[],reply=null,failure=null;
   const nodeRepl={env,setResponseMeta:m=>Object.assign(responseMeta,m),emitContentItem:x=>content.push(x),createElicitation:async q=>{
    if(q.meta?.tool_params?.app!==bundle)throw Error('secret probe resolved an unexpected application');return {action:'accept'};
   }};
   const client={identity,async execute(method,args){
    const startedAt=Date.now(),started=clock(),raw=await execute(method,{...args,...(method==='type_text'?{probe354Audit:id}:{})}),endedAt=Date.now(),durationMs=clock()-started;
    if(method==='resolve_app'&&raw.result?.pid!==pid)throw Error('secret probe resolved an unexpected process');
    if(method==='type_text'){engineRaw=raw;engineTiming={startedAt,endedAt,durationMs}}
    if(raw.error)throw serverError(raw.error);return {result:raw.result,engineMs:durationMs};
   }};
   const native=createService({nodeRepl,client});
   const sky=createSkyService({platform:'darwin',env,nodeRepl,secrets:store,loadVendor:async()=>native,setResponseMeta:nodeRepl.setResponseMeta});
   const originalHome=process.env.HOME,logs=[],consoleLeaks=[],originalConsole={};process.env.HOME=home;
   for(const method of ['log','warn','error','info','debug']){originalConsole[method]=console[method];console[method]=(...args)=>{
    const line=format(...args),findings=[...inspect(args),...inspect(line)];
    if(findings.length){logLeaks++;consoleLeaks.push('private trusted-service console: '+findings.join('; '));logs.push('[redacted private synthetic-secret console line]')}else logs.push(line);
   }}
   try{reply=await sky.handleRpc({type:'execute',method:'type_text',args:[{app,text:'{{secret:PROBE354}}'}]})}
   catch(e){failure=errorObject(e)}
   finally{Object.assign(console,originalConsole);if(originalHome===undefined)delete process.env.HOME;else process.env.HOME=originalHome}
   if(!engineRaw)throw Error('secret probe did not reach type_text; no result may be claimed');
   const result={engineRaw,service:{result:reply??null,error:failure,meta:responseMeta,content,logs}};
   const readback=comparisonRecord((engineRaw.result?.meta??engineRaw.error?.meta)?.typeReadback);
   let returnMetadataEqual=null,selectionMetadataEqual=null;
   if(returnUnits===1)returnMetadata.set(pair,readback);
   if(returnUnits===3){returnMetadataEqual=compare(returnMetadata,pair,readback);returnMetadata.delete(pair)}
   if(selectionVariant==='equal')selectionMetadata.set(pair,readback);
   if(selectionVariant==='different'){selectionMetadataEqual=compare(selectionMetadata,pair,readback);selectionMetadata.delete(pair)}
   return {...safe(result),returnMetadataEqual,selectionMetadataEqual,
    timing:{engine:engineTiming,trusted:{startedAt:trustedStartedAt,endedAt:Date.now(),durationMs:clock()-trustedStart}},findings:[...inspect(result),...consoleLeaks]};
  },
  close(){rmSync(home,{recursive:true,force:true})},
 };
}
