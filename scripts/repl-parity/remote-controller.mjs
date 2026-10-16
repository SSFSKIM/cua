import {readFileSync,writeFileSync,mkdirSync,renameSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createInterface} from 'node:readline';
import {execFileSync} from 'node:child_process';
import {RemoteProof,disconnectProbe,checkHost} from './remote.mjs';
import {readDevices,endpointOf} from '../../src/remote/devices.mjs';
import {root,remoteCommand,quote,linuxSession,ownNodeEnv} from './topology.mjs';
import {StdioClient,textOf} from '../browser-parity/mcp.mjs';
const json=file=>JSON.parse(readFileSync(file,'utf8'));
export function assertRegisteredEndpoint(endpoint,entry){
 if(!entry||entry.deviceId!==endpoint.deviceId||endpointOf(entry)!==endpoint.relayEndpoint)throw new Error('Client registration identity does not match the prepared endpoint');
}
const clientFor=e=>{assertRegisteredEndpoint(e,readDevices()[e.name]);return new StdioClient({command:process.execPath,args:[join(root,'scripts/repl-parity/remote-client.mjs'),e.name],timeoutMs:150000});};
async function observedClient(e){const client=clientFor(e);try{const init=await client.initialize();const result=await client.call('js',{title:'Remote answering host',code:'nodeRepl.write("remote-proof");'});if(result.isError||!textOf(result).includes('remote-proof'))throw new Error('Remote real call failed');return {client,observation:checkHost(e.host,{host:e.host,serverInfo:init.serverInfo,_meta:result._meta??null,executionFacts:e.executionFacts})};}catch(error){await client.close();throw error;}}
export function disconnectCell(directory){return `var fs=await import('node:fs');var proofDir=${JSON.stringify(directory)};fs.appendFileSync(proofDir+'/counter','1\\n');fs.writeFileSync(proofDir+'/started','started');var deadline=Date.now()+60000;while(!fs.existsSync(proofDir+'/release')){if(Date.now()>deadline)throw new Error('fixture release deadline');await new Promise(r=>setTimeout(r,50));}fs.writeFileSync(proofDir+'/done','done');`;}
export async function liveDisconnect(e,helper){
 const {directory}=await helper.request('fixture');let original,replacement,pending;
 const io={
  open:async()=>{original=(await observedClient(e)).client;return {pid:original.child.pid};},
  submit:async c=>{pending=original.call('js',{title:'Disconnect count-one fixture',code:disconnectCell(directory),timeout_ms:70000});c.requestId=pending.requestId;pending.catch(()=>{});},
  started:()=>helper.request('started'),
  kill:async(pid,signal)=>{if(pid!==original.child.pid)throw new Error('Not the owned client');original.child.kill(signal);await original.exited;},
  reconnect:async()=>{replacement=(await observedClient(e)).client;return replacement;},
  release:()=>helper.request('release'),
  observe:async()=>{const result=await helper.request('count');const call=await replacement.call('js',{title:'Observe one execution',code:`nodeRepl.write((await import('node:fs')).readFileSync(${JSON.stringify(directory+'/counter')},'utf8').split('\\n').filter(Boolean).length);`});if(call.isError||textOf(call)!==String(result.count))throw new Error('Counter differs between device and reconnected client');return result.count;},
  end:async()=>{try{if(replacement)await replacement.call('end_task');}finally{await replacement?.close();await original?.close();}},
 };
 return disconnectProbe(io);
}
export async function runRemoteProof(v){
 const out=resolve(v.out),journal=join(out,'endpoints.json');mkdirSync(out,{recursive:true,mode:0o700});
 const state=existsSync(journal)?json(journal):undefined,helpers=new Map();
 const prepared=device=>json(join(root,'.doperpowers/sde/repl-parity',device+'.json'));
 async function helper(device){
  if(!helpers.has(device)){const facts=prepared(device);helpers.set(device,new StdioClient({...remoteCommand(device,`${linuxSession}\ncd ${quote(facts.checkout)} && exec env ${ownNodeEnv(facts)}CUA_PARITY_REMOTE=1 node scripts/repl-parity/remote-device.mjs`),timeoutMs:360000,closeTimeoutMs:15000}));}
  return helpers.get(device);
 }
 const io={
  save:async state=>{writeFileSync(journal+'.tmp',JSON.stringify(state,null,2)+'\n',{mode:0o600});renameSync(journal+'.tmp',journal);},
  prepare:async plan=>{const h=await helper(plan.device);return h.request('prepare',{experiment:v.experiment,relay:v.relay,plan,prepared:prepared(plan.device)});},
  start:async(e,host)=>{const h=await helper(e.device);if(!h.attached){await h.request('attach',e);h.attached=true;}return h.request('start',{host});},
  attest:async e=>{const {client,observation}=await observedClient(e);try{
   const profiles=await client.call('profiles_list');
   if(!profiles.structuredContent?.profiles?.some(p=>p.key===e.profile&&p.ready&&p.extensionInstanceId===e.extensionInstanceId))throw new Error('host_not_live: prepared profile is not ready; only the session may restore its Chrome window');
   await client.call('end_task');return observation;
  }finally{await client.close();}},
  stop:async e=>{const h=helpers.get(e.device);if(!h?.attached)throw new Error('No live ownership handle; do not signal a journal PID. Close the original foreground controller first.');await h.request('stop');},
  remove:async e=>{
   const registered=readDevices()[e.name];
   if(registered)assertRegisteredEndpoint(e,registered);
   if(registered)execFileSync(process.execPath,[join(root,'bin/cua.mjs'),'devices','remove',e.name],{stdio:'ignore'});
   await (await helper(e.device)).request('remove',e);
  },
 };
 const proof=new RemoteProof({experiment:v.experiment,relay:v.relay,io,state});
 const handoff=()=>{for(const e of proof.state.endpoints)console.log(JSON.stringify({name:e.name,device:e.device,deviceId:e.deviceId,relayEndpoint:e.relayEndpoint,clientSecretKey:e.clientSecretKey,devicesEntry:e.devicesEntry,needed:[`Relay operator: merge devicesEntry for ${e.name} into the current table; preserve other devices; apply relay/deploy/update.sh --devices <merged-table>.`,`Owner: transfer the credential privately from ${e.home}/enroll.json into /secret ${e.clientSecretKey}; do not paste it into this session.`,`After transfer: node bin/cua.mjs devices add ${e.name} --relay ${new URL(e.relayEndpoint).origin} --device ${e.deviceId}`]}));};
 try{
  if(v.action==='prepare'){await proof.prepare(v.device??['cua-linux','mini']);handoff();return;}
  if(!state)throw new Error('Prepare first');
  if(v.action==='cleanup'){await proof.cleanup();}
  else if(v.action==='start'){
   await proof.start({operatorReady:v['operator-ready'],ownerReady:v['owner-ready']});
   console.log('Endpoints ready and attested. Foreground controller owns their lifetime. stdin JSON commands: {"op":"restart","device":"mini","host":"vendor|cua"}, {"op":"probe","device":"mini|cua-linux"}, {"op":"stop"}. EOF stops agents, keeping enrollment for a later start.');
   const lines=createInterface({input:process.stdin});
   for await(const line of lines){const command=JSON.parse(line);if(command.op==='stop')break;
    if(command.op==='restart')await proof.restart(command.device,command.host);
    else if(command.op==='probe'){const e=proof.state.endpoints.find(e=>e.device===command.device);if(!e)throw new Error('Unknown experiment endpoint');const load=execFileSync('ssh',['-o','BatchMode=yes',e.device,'uptime'],{encoding:'utf8'}).trim();const result=await liveDisconnect(e,await helper(e.device));e.disconnect={...result,load};await proof.save();console.log(JSON.stringify({device:e.device,...result}));}
    else throw new Error('Unknown foreground command');
   }
  }else throw new Error('Unknown remote proof action');
 }finally{
  for(const e of proof.state.endpoints)if(e.pid&&helpers.get(e.device)?.attached){try{await io.stop(e);delete e.pid;e.ready=false;}catch{proof.state.phase='cleanup-failed';}}
  for(const h of helpers.values())await h.close();
  if(proof.state.phase==='running')proof.state.phase='handoff';await proof.save();
 }
 if(v.action==='cleanup')for(const e of proof.state.endpoints)console.log(JSON.stringify({name:e.name,deviceId:e.deviceId,clientRegistration:'removed if present and identity matched',needed:[`Relay operator: remove only ${e.deviceId} from the current merged table; apply relay/deploy/update.sh --devices <merged-table>.`,`Owner: remove temporary key ${e.clientSecretKey} through the existing secret UI.`]}));
}
