import {EventEmitter} from 'node:events';
import {pathToFileURL} from 'node:url';
const backendRequests=[];
const info={type:'extension',family:'chrome',name:'cua',version:'0.3.0',capabilities:{browser:[{id:'viewport',description:'Viewport override'}],tab:[]},metadata:{extensionInstanceId:'parity-fake-extension',profileName:'scratch'}};
class Pipe extends EventEmitter {
  write(frame) {
    const message=JSON.parse(Buffer.from(frame).subarray(4).toString());
    backendRequests.push(message.method);
    if(message.id==null)return;
    let result;
    if(message.method==='getInfo')result=info;
    else if(message.method==='ping')result='pong';
    else if(message.method==='getTabs'||message.method==='getUserTabs')result=[];
    else result={};
    const body=Buffer.from(JSON.stringify({jsonrpc:'2.0',id:message.id,result}));
    const header=Buffer.alloc(4);header.writeUInt32LE(body.length);
    queueMicrotask(()=>this.emit('data',Buffer.concat([header,body])));
  }
  end(){this.emit('close');}
}
globalThis.fetch=()=>{throw new Error('network forbidden in inventory probe');};
globalThis.nodeRepl={
  env:{HOME:process.env.HOME,BROWSER_USE_BACKEND_PATHS:'/parity-fake.sock',BROWSER_USE_AVAILABLE_BACKENDS:'chrome'},cwd:process.env.HOME,
  requestMeta:{'x-codex-turn-metadata':{session_id:'parity_inventory',turn_id:'inventory'}},
  config:{read:async()=>({config:{}}),readRequirements:async()=>({requirements:null}),readToml:async()=>({}),writeToml:async()=>{}},
  nativePipe:{createConnection:async path=>{if(path!=='/parity-fake.sock')throw new Error('unexpected native path');return new Pipe();}},
  fetch:async()=>new Response('{}',{status:503}),telemetry:{emit(){},logEvent(){},recordCounter(){},recordHistogram(){}},
  createElicitation:async()=>({action:'accept'}),addAfterSubmittedCodeHook:()=>()=>{},addTurnEndedHandler:()=>()=>{},
  setResponseMeta(){},emitContentItem(){},emitImage(){},write(){},
};
try {
  const service=await import(pathToFileURL(process.argv[2]));
  const setup=await service.handleRpc({method:'setup',params:{environment:'codex-app'}});
  const browsers=await service.handleRpc({method:'execute',params:{type:'list_browsers'}});
  if(browsers.length!==1)throw new Error(`expected one fake backend, got ${browsers.length}`);
  const browser=await service.handleRpc({method:'execute',params:{type:'get_browser',id:browsers[0].id}});
  const commands={};
  for(const type of JSON.parse(process.argv[3]??'[]')) {
    try {await service.handleRpc({method:'execute',params:{type,browser_id:browser.id,tab_id:'999'}});commands[type]={ok:true};}
    catch(e){commands[type]={code:e.code??e.reason??e.name,message:e.message};}
  }
  console.log('MANIFEST '+JSON.stringify({setup,capabilities:browser.capabilities,backendRequests,commands}));
  process.exit(0);
} catch(e) {console.error(e.stack);process.exit(1);}
