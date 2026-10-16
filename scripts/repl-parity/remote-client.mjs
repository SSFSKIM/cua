// Direct stdio bridge to the existing remote client, so initialize is the endpoint's real handshake.
// Credentials remain inside deviceDirectory, exactly as for devices_use; no credential/config is read by this harness.
import {createInterface} from 'node:readline';
import {deviceDirectory} from '../../src/remote/directory.mjs';
const name=process.argv[2];if(!/^repl-[a-z0-9-]+$/.test(name))throw new Error('Expected harness device name');
const directory=deviceDirectory();let session,initializing;
const send=message=>process.stdout.write(JSON.stringify(message)+'\n');
const lines=createInterface({input:process.stdin});
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
lines.on('close',async()=>{try{await initializing;await session?.close();}finally{process.exitCode=0;}});
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{lines.close();process.stdin.destroy();});
