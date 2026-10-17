// Direct stdio bridge to the existing remote client, so initialize is the endpoint's real handshake.
// Credentials remain inside deviceDirectory, exactly as for devices_use; no credential/config is read by this harness.
import {createInterface} from 'node:readline';
import {pathToFileURL} from 'node:url';
import {deviceDirectory} from '../../src/remote/directory.mjs';
export function remoteBridge({name,input,output,directory}){
 if(!/^repl-[a-z0-9-]+$/.test(name))throw new Error('Expected harness device name');
 let session,initializing,resolveClosed;
 const closed=new Promise(resolve=>{resolveClosed=resolve;});
 const send=message=>output.write(JSON.stringify(message)+'\n');
 const lines=createInterface({input});
 lines.on('line',async line=>{
  const message=JSON.parse(line);
  try{
   if(message.method==='initialize'){
    if(initializing)throw new Error('Already initialized');
    initializing=directory.open(name,{initializeParams:message.params,onMessage:send});session=await initializing;
    send({jsonrpc:'2.0',id:message.id,result:session.initializeResult});return;
   }
   await initializing;if(!session)throw new Error('Not initialized');
   if(!message.method){await session.respond(message.id,message);return;}
   if(message.id===undefined){if(message.method!=='notifications/initialized')await session.notify(message.method,message.params);return;}
   const reply=await session.request(message.method,message.params);send({jsonrpc:'2.0',id:message.id,...reply});
  }catch(error){if(message.id!==undefined)send({jsonrpc:'2.0',id:message.id,error:{code:-32000,message:error.code??'remote_proof_client_failed'}});}
 });
 lines.on('close',async()=>{try{await initializing?.catch(()=>{});await session?.close();}finally{resolveClosed();}});
 return {closed,close(){lines.close();input.destroy();}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const bridge=remoteBridge({name:process.argv[2],input:process.stdin,output:process.stdout,directory:deviceDirectory()});
 for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>bridge.close());
 await bridge.closed;
}
