// Oracle fixtures grounded in chatgpt-26.928.40906 NR:privileged-node-repl.js:14-129,200-472,528-647
// and NR:trusted-worker.js:134-230. Not a host implementation; the selected real host supplies nodeRepl.
import {createBrowserService,PINNED_CUA_VERSION} from '../../../src/services/browser.mjs';
import {createSkyService} from '../../../src/services/sky.mjs';
import {writeFileSync,readFileSync} from 'node:fs';
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
  if(r.surface==='browser')return createBrowserService({loadService:async()=>backend,actualServiceVersion:async()=>PINNED_CUA_VERSION,secrets}).handleRpc({method:'execute',params:{type:'playwright_locator_fill',browser_id:'fixture',tab_id:'1',selector:'#fixture',value:'{{secret:PARITY_SYNTHETIC}}',replace:true}});
  return createSkyService({loadVendor:async()=>backend,secrets,platform:'darwin'}).handleRpc({type:'execute',method:'type_text',args:[{app:'fixture',text:'{{secret:PARITY_SYNTHETIC}}'}]});
 }
 case 'pipe':{
  if(r.mode==='long-path'){
   const path=nodeRepl.env.PARITY_PIPE_LONG,metadata={platform:process.platform,pathBytes:Buffer.byteLength(path),sunPathBytes:process.platform==='darwin'?104:108};
   // `peer` is the owned listener's own journal (fixtures/long-pipe.mjs), read from disk once the subject's socket has
   // settled; the nativePipe under test never touches it, so a success the listener did not see cannot be reported.
   const journal=nodeRepl.env.PARITY_PIPE_LONG_PEER;if(!journal)throw new Error('The long-path peer witness is harness-only');
   const peer=()=>JSON.parse(readFileSync(journal,'utf8'));
   let socket;try{socket=await nodeRepl.nativePipe.createConnection(path);}catch(error){return {...metadata,status:'refused',bytes:[],message:error.message,peer:peer()};}
   return await new Promise((resolve,reject)=>{
    const bytes=[];let message=null,finished=false;
    const finish=status=>{if(finished)return;finished=true;clearTimeout(timer);try{resolve({...metadata,status,bytes,message,peer:peer()});}catch(error){reject(error);}};
    const timer=setTimeout(()=>{socket.end();finish('fixture-timeout');},5000);
    socket.on('data',chunk=>bytes.push(...chunk));socket.on('error',error=>{message=error.message;});
    socket.on('close',()=>finish(message===null?'connected':'transport-error'));
    socket.write(new Uint8Array([0,255,128,10,13,65]));
   });
  }
  if(r.mode==='wire-error'&&nodeRepl.env.PARITY_FIXTURE_WIRE_INJECTION!=='1')throw new Error('Native wire injection is harness-only');
  if(r.mode==='relative')return nodeRepl.nativePipe.createConnection(nodeRepl.env.PARITY_PIPE_RELATIVE);
  if(r.mode==='timeout'){const start=performance.now();try{await nodeRepl.nativePipe.createConnection(nodeRepl.env.PARITY_PIPE_BLOCKED);return {refused:false};}catch(e){return {refused:true,budget:Number(nodeRepl.env.NODE_REPL_NATIVE_PIPE_CONNECT_TIMEOUT_MS??nodeRepl.env.CUA_REPL_NATIVE_PIPE_CONNECT_TIMEOUT_MS),observation:/timed out|timeout/i.test(e.message)?'timer-expired':/refused|temporarily unavailable/i.test(e.message)?'saturated-peer-refused':'unexpected-error',platform:process.platform,...(process.platform==='linux'?{message:e.message,boundedRefusal:performance.now()-start<1000}:{})};}}
  if(r.mode==='missing')return nodeRepl.nativePipe.createConnection(nodeRepl.env.PARITY_PIPE_MISSING);
  // Observe only this fixture's connection response; never inspect or persist unrelated wire payloads.
  let connectionId,pending='';const observe=chunk=>{pending+=chunk.toString();let end;while((end=pending.indexOf('\n'))>=0){const message=JSON.parse(pending.slice(0,end));pending=pending.slice(end+1);if(message.type==='native_pipe_response'&&message.ok&&typeof message.result?.connection_id==='string')connectionId=message.result.connection_id;}};
  if(r.mode==='wire-error')process.stdin.on('data',observe);
  let socket;try{socket=await nodeRepl.nativePipe.createConnection(r.mode==='transport-error'?nodeRepl.env.PARITY_PIPE_ERROR:nodeRepl.env.PARITY_PIPE);}finally{if(r.mode==='wire-error')process.stdin.off('data',observe);}
  if(r.mode==='wire-error'&&(!connectionId||pending))throw new Error('Fixture requires an observed connection id at a complete worker frame boundary');
  if(r.mode==='transport-error'||r.mode==='wire-error')return await new Promise(resolve=>{
   const events=[],lateEvents=[];let message;
   socket.on('error',e=>{events.push('error');message=e.message;});
   socket.on('close',()=>{events.push('close');socket.on('error',e=>lateEvents.push({event:'error',message:e.message}));socket.on('close',()=>lateEvents.push({event:'close'}));queueMicrotask(()=>{if(r.mode==='wire-error')socket.end();resolve({proof:r.mode==='wire-error'?'boundary-double':'live-abort',events,lateEvents,message:message??null,...(r.mode==='wire-error'?{entry:'worker-stdin',observedConnection:true}:{})});});});
   if(r.mode==='wire-error')process.stdin.emit('data',Buffer.from(JSON.stringify({type:'native_pipe_closed',connection_id:connectionId,error:'fixture transport error'})+'\n'));
   else socket.write(new Uint8Array(2*1024*1024).fill(65));
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
