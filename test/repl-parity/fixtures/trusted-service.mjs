// Oracle fixtures grounded in chatgpt-26.928.40906 NR:privileged-node-repl.js:14-129,200-472,528-647
// and NR:trusted-worker.js:134-230. Not a host implementation; the selected real host supplies nodeRepl.
import {createBrowserService,PINNED_VENDOR_VERSION} from '../../../src/services/browser.mjs';
import {createSkyService} from '../../../src/services/sky.mjs';
import {writeFileSync} from 'node:fs';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const events=[];let calls=0,completedHooks=0;
const request={message:'Synthetic fixture approval',requestedSchema:{type:'object',properties:{fixture:{type:'string'}}},meta:{fixture:'request'}};
export async function handleRpc(r){
 switch(r.op){
 case 'echo':await delay(r.delay??0);return {value:r.value,meta:nodeRepl.requestMeta?.fixture??null};
 case 'cache':return ++calls;
 case 'events':return [...events];
 case 'hook':{
  for(const h of r.hooks){const unregister=nodeRepl[h.turn?'addTurnEndedHandler':'addAfterSubmittedCodeHook']({timeoutMs:h.timeout??1000,run:async()=>{
   events.push(`${h.name}:start`);if(h.write)nodeRepl.write(`${h.name}:start|`);
   if(h.hang)await new Promise(()=>{});else await delay(h.delay??0);
   if(h.error)throw new Error('fixture hook rejection');
   events.push(`${h.name}:end`);if(h.write)nodeRepl.write(`${h.name}:end|`);
   if(h.meta)nodeRepl.setResponseMeta(h.meta);
   if(h.witness)writeFileSync(nodeRepl.cwd+'/.parity-turn-completed.json',JSON.stringify({count:++completedHooks,atNs:process.hrtime.bigint().toString()}));
  }});if(h.unregister)unregister();}return 'registered';
 }
 case 'invalid-hooks':return [0,-1,1.5,null].map(timeoutMs=>{try{nodeRepl.addAfterSubmittedCodeHook({run(){},timeoutMs});return false;}catch{return true;}});
 case 'background':nodeRepl.withSuspendedTimeout(async()=>{await delay(80);nodeRepl.write('background|');events.push('background');});return 'submitted';
 case 'elicit':return nodeRepl.createElicitation(request);
 case 'suspend':return nodeRepl.withSuspendedTimeout(async()=>{await delay(r.wait??200);if(r.nested)await nodeRepl.withSuspendedTimeout(async()=>{await delay(150);});await delay(r.after??0);return 'resumed';});
 case 'approval-wait':return nodeRepl.withSuspendedTimeout(async()=>{await delay(150);return nodeRepl.createElicitation(request);});
 case 'meta-patch':nodeRepl.setResponseMeta(r.meta);return 'patched';
 case 'meta':{const first={fixture:{one:1},replace:'old'};nodeRepl.setResponseMeta(first);first.fixture.one=999;nodeRepl.setResponseMeta({replace:'new',second:true});return 'meta-set';}
 case 'content':nodeRepl.emitContentItem('item-one');nodeRepl.write('worker-write|');nodeRepl.emitContentItem('item-two');return 'content-set';
 case 'env':return {frozen:Object.isFrozen(nodeRepl.env),worker:nodeRepl.env.PARITY_WORKER_ONLY,cellMarker:nodeRepl.env.PARITY_CELL_VISIBLE};
 case 'privileges':return {elicitation:typeof nodeRepl.createElicitation,hooks:typeof nodeRepl.addAfterSubmittedCodeHook,native:typeof nodeRepl.nativePipe};
 case 'error':{const error=new Error('fixture-message');error.stack='private-stack';error.cause={secret:'private-cause'};error.custom='private-field';throw error;}
 case 'outside':return import(nodeRepl.env.PARITY_OUTSIDE_URL);
 case 'symlink':return import(nodeRepl.env.PARITY_SYMLINK_URL);
 case 'secret-error':{
  // Synthetic in-memory store only; real wrappers, real worker/kernel error serialization, no filesystem secret reads.
  const sentinel='fixture-private-value',secrets={read:async()=>sentinel};
  const backend={handleRpc:async()=>{const e=new Error(sentinel);e.cause={value:sentinel};e.stack=sentinel;e.custom=sentinel;throw e;}};
  if(r.surface==='browser')return createBrowserService({loadService:async()=>backend,actualServiceVersion:async()=>PINNED_VENDOR_VERSION,expectedVersion:PINNED_VENDOR_VERSION,serviceName:'vendor',secrets}).handleRpc({method:'execute',params:{type:'playwright_locator_fill',browser_id:'fixture',tab_id:'1',selector:'#fixture',value:'{{secret:PARITY_SYNTHETIC}}',replace:true}});
  return createSkyService({loadVendor:async()=>backend,secrets,platform:'darwin'}).handleRpc({type:'execute',method:'type_text',args:[{app:'fixture',text:'{{secret:PARITY_SYNTHETIC}}'}]});
 }
 case 'pipe':{
  if(r.mode==='relative')return nodeRepl.nativePipe.createConnection(nodeRepl.env.PARITY_PIPE_RELATIVE);
  if(r.mode==='timeout'){try{await nodeRepl.nativePipe.createConnection(nodeRepl.env.PARITY_PIPE_BLOCKED);return {refused:false};}catch(e){return {refused:true,budget:Number(nodeRepl.env.NODE_REPL_NATIVE_PIPE_CONNECT_TIMEOUT_MS??nodeRepl.env.CUA_REPL_NATIVE_PIPE_CONNECT_TIMEOUT_MS),observation:/timed out|timeout/i.test(e.message)?'timer-expired':/refused|temporarily unavailable/i.test(e.message)?'saturated-peer-refused':'unexpected-error',platform:process.platform};}}
  if(r.mode==='missing')return nodeRepl.nativePipe.createConnection(nodeRepl.env.PARITY_PIPE_MISSING);
  const socket=await nodeRepl.nativePipe.createConnection(r.mode==='transport-error'?nodeRepl.env.PARITY_PIPE_ERROR:nodeRepl.env.PARITY_PIPE);
  if(r.mode==='transport-error')return await new Promise(resolve=>{
   const events=[],lateEvents=[];let message;
   socket.on('error',e=>{events.push('error');message=e.message;});
   socket.on('close',()=>{events.push('close');socket.on('error',e=>lateEvents.push({event:'error',message:e.message}));socket.on('close',()=>lateEvents.push({event:'close'}));queueMicrotask(()=>resolve({events,lateEvents,message:message??null}));});
   socket.write(new Uint8Array(2*1024*1024).fill(65));
  });
  if(r.mode==='interface'){
   const value={frozen:Object.isFrozen(socket),keys:Object.keys(socket).sort(),destroy:typeof socket.destroy};
   try{socket.on('end',()=>{});value.endAccepted=true;}catch{value.endAccepted=false;}
   socket.end();return value;
  }
  return await new Promise((resolve,reject)=>{
   const got=[];let removedCalled=false,writeError;
   if(r.mode==='terminal')try{socket.write('not bytes');}catch(e){writeError=e.message;}const removed=()=>{removedCalled=true;};socket.on('data',removed);socket.off('data',removed);
   socket.on('data',data=>{got.push(...data);socket.end();});socket.on('error',reject);
   socket.on('close',()=>{if(r.mode==='terminal')socket.on('close',()=>resolve({bytes:got,removedCalled,writeError,lateClose:true}));else resolve({bytes:got,removedCalled});});socket.write(new Uint8Array([0,255,128,10,13,65]));
  });
 }
 case 'launch-invalid':{
  const errors=[];for(const target of [null,{}, {applicationPath:'x',bundleIdentifier:'y'},{other:true}])try{await nodeRepl.launchServices.openApplication(target);errors.push('ACCEPTED');}catch(e){errors.push(e.message);}return errors;
 }
 default:throw new Error('Unknown fixture operation');
 }
}
