// Remote binder-double lane: real selected facade + real selected tab decorator, service doubles underneath.
// Caller owns runtime provenance, sandbox launch, isolated HOME and host-specific trusted service env.
import {fileURLToPath} from 'node:url';
export function binderServices(){
 const service=fileURLToPath(new URL('./binder-service.mjs',import.meta.url));
 return {services:{sky:service,binder:service},roots:[fileURLToPath(new URL('../../../',import.meta.url))],env:{},close:async()=>{}};
}
// The facades the banner builds, in order. Each emits its own first-call core document, so the lane's first cell
// carries them back to back; scripts/repl-parity/document-comparison.mjs projects each by its facade's surfaces.
export const BINDER_FACADES=[{name:'cua',options:{browser:false}},{name:'binderDisabledCua',options:{browser:false,computer:false}}];
export function binderBanner({facadeURL,bindTabURL,facadeExport='create_tinysky_alt',bindTabExport='bind_tab',stateURL,stateExport='get_state'}={}){
 for(const value of [facadeURL,bindTabURL,stateURL])if(typeof value!=='string'||!value.startsWith('file:'))throw new Error('Binder requires explicit selected module file URLs');
 return `{
 const factory=(await import(${JSON.stringify(facadeURL)}))[${JSON.stringify(facadeExport)}];
 const decorate=(await import(${JSON.stringify(bindTabURL)}))[${JSON.stringify(bindTabExport)}];
${BINDER_FACADES.map(({name,options})=>` globalThis.${name}=await factory(${JSON.stringify(options)});`).join('\n')}
 const {Buffer}=await import("node:buffer");
 const decode=value=>Uint8Array.from(Buffer.from(value.base64,'base64'));
 const call=(tab,method,args)=>nodeRepl.rpc('binder',{type:'tab',tab,method,args});
 const ax={get:async(kind,options)=>{
   const result=await call('ax','get',options===undefined?[kind]:[kind,options]);
   return kind==='screenshot'?decode(result):kind==='both'?{state:result.state,...(result.screenshot===undefined?{}:{screenshot:decode(result.screenshot)})}:result;
 }};
 for(const method of ['click','drag','paste','performSecondaryAction','pressKey','scroll','selectText','setValue','typeText'])ax[method]=async(...args)=>{await call('ax',method,args);};
 globalThis.binderTab=decorate({id:'fixture-ax',ax});
 globalThis.binderDomTab=decorate({id:'fixture-dom',playwright:{domSnapshot:()=>call('dom','domSnapshot',[])},screenshot:async()=>decode(await call('dom','screenshot',[]))});
 globalThis.binderBareTab=decorate({id:'fixture-bare'});
 const collectState=(await import(${JSON.stringify(stateURL)}))[${JSON.stringify(stateExport)}];
 const inventory=(method,id)=>nodeRepl.rpc('binder',{type:'inventory',method,...(id===undefined?{}:{id})});
 const browsers={list:()=>inventory('list'),get:async id=>{await inventory('get',id);return {tabs:{list:()=>inventory('tabs',id)}};}};
 globalThis.binderInventory=()=>collectState({computer:cua.computer,browsers});
 }`;
}
