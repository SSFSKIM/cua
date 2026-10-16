// Device-side private lifecycle boundary. Invoked only in the prepared parity clone over SSH.
import {spawn,execFileSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdirSync,mkdtempSync,realpathSync,writeFileSync,readFileSync,rmSync,openSync,closeSync,symlinkSync,existsSync} from 'node:fs';
import {homedir,tmpdir} from 'node:os';
import {join,dirname,basename} from 'node:path';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {readRegistry} from '../../src/profiles/registry.mjs';
import {socketPathFor,socketNameFor,backendDir} from '../../src/chrome/extension.mjs';
import {cuaRecordFile} from '../../src/chrome/route.mjs';
import {clientSecretKey} from '../../src/remote/device.mjs';
import {readAgentState} from '../../src/remote/health.mjs';
import {executionFacts,assertPreparedFacts} from './provenance.mjs';
import {endpointPlan,safeEnrollment} from './remote.mjs';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
export async function until(check,{timeoutMs=30000}={}){const end=Date.now()+timeoutMs;do{const value=await check();if(value)return value;await pause(100);}while(Date.now()<end);throw new Error('Remote proof readiness deadline expired');}
const base=()=>join(homedir(),'.local','share','cua-parity-remote');
function ownership(e){
 if(dirname(e.home)!==realpathSync(base())||!basename(e.home).startsWith(e.experiment+'-'))throw new Error('Not an owned remote scratch home');
 const marker=JSON.parse(readFileSync(join(e.home,'proof-owner.json'),'utf8'));
 if(marker.token!==e.token||marker.experiment!==e.experiment)throw new Error('Remote scratch ownership mismatch');
}
function cli(home,args,{file}={}){
 const fd=file?openSync(file,'wx',0o600):undefined;
 try{return execFileSync(process.execPath,['bin/cua.mjs',...args],{env:{...process.env,CUA_HOME:home},encoding:'utf8',timeout:300000,stdio:['ignore',fd??'pipe','pipe'],maxBuffer:1024*1024});}
 catch(error){throw new Error(`Remote cua ${args.slice(0,2).join(' ')} failed (${error.status??error.code}); inspect privately on device`);}
 finally{if(fd!==undefined)closeSync(fd);}
}
export function prepareEndpoint({experiment,relay,plan,prepared}){
 endpointPlan(experiment,plan.device);assertPreparedFacts(prepared,executionFacts({source:prepared.home}));
 mkdirSync(base(),{recursive:true,mode:0o700});const parent=realpathSync(base());
 if(parent===realpathSync(tmpdir())||parent.startsWith(realpathSync(tmpdir())+'/'))throw new Error('Remote home must be outside TMPDIR');
 const home=mkdtempSync(join(parent,experiment+'-')),token=randomUUID(),endpoint={...plan,experiment,home,token};
 writeFileSync(join(home,'proof-owner.json'),JSON.stringify({experiment,token}),{mode:0o600,flag:'wx'});
 try{
  cli(home,['install']);
  // Discovery aliases only. Never copy profile contents or register/rebind an extension.
  const binding=readRegistry(prepared.home).profiles[prepared.profile];
  if(!binding||binding.route!=='cua'||binding.extensionInstanceId!==prepared.extensionInstanceId)throw new Error('Prepared cua profile binding changed');
  mkdirSync(backendDir(home),{recursive:true,mode:0o700});
  const name=socketNameFor(binding.extensionInstanceId);
  symlinkSync(socketPathFor(prepared.home,name),socketPathFor(home,name));
  writeFileSync(cuaRecordFile(home),JSON.stringify({schema:1,route:'cua',launcher:null,backendsDir:backendDir(home),browsers:{}}),{mode:0o600});
  writeFileSync(join(home,'profiles.json'),JSON.stringify({version:1,profiles:{[prepared.profile]:binding}}),{mode:0o600});
  // Enrollment stdout goes directly to a private file. Only `remote show` is read; it has no credential.
  cli(home,['remote','enroll','--relay',relay,'--json'],{file:join(home,'enroll.json')});
  const shown=JSON.parse(cli(home,['remote','show','--json']));
  return {...endpoint,...safeEnrollment({...shown,clientSecretKey:clientSecretKey(shown.deviceId)}),release:executionFacts({source:home}).release,commit:prepared.commit};
 }catch(error){rmSync(home,{recursive:true,force:true});throw error;}
}
export async function deviceSession(endpoint,{spawnAgent=spawn,stateOf=readAgentState,assertOwner=ownership,facts=executionFacts,timeoutMs=30000,stopTimeoutMs=10000}={}){
 assertOwner(endpoint);let child,exit,fixture;
 async function stop(){
  if(!child)return;
  const current=child;current.kill('SIGTERM');let timer;
  const graceful=await Promise.race([exit.then(()=>true),new Promise(r=>{timer=setTimeout(()=>r(false),stopTimeoutMs);})]);clearTimeout(timer);
  if(!graceful){current.kill('SIGKILL');await exit;}
  child=null;return {stopped:true};
 }
 return {
  async start({host}){
   if(child||!['cua','vendor'].includes(host))throw new Error('Invalid endpoint start');
   if(endpoint.device!=='mini'&&host!=='cua')throw new Error('Linux endpoint requires cua host');
   child=spawnAgent(process.execPath,['bin/cua.mjs','agent','run','--relay'],{env:{...process.env,CUA_HOME:endpoint.home,CUA_REPL_HOST:host,CUA_BROWSER_SERVICE:'cua',CUA_SHIM_SURFACES:endpoint.surfaces.join(','),CUA_SHIM_SECRETS:'off',CUA_AGENT_MAX_SESSIONS:'2'},stdio:['ignore','ignore','ignore']});
   exit=new Promise(resolve=>{child.once('exit',resolve);child.once('error',resolve);});
   try{await until(()=>{if(child.exitCode!==null||!child.pid)throw new Error('Owned endpoint exited before relay readiness');const state=stateOf(endpoint.home);return state?.pid===child.pid&&state.relay?.status==='connected';},{timeoutMs});return {pid:child.pid,ready:true,executionFacts:facts({source:endpoint.home})};}
   catch(e){await stop();throw e;}
  },
  stop,
  fixture(){if(fixture)throw new Error('Disconnect fixture already exists');fixture=realpathSync(mkdtempSync(join(tmpdir(),'cua-remote-proof-')));return {directory:fixture};},
  async started(){if(!fixture)throw new Error('No fixture');await until(()=>existsSync(join(fixture,'started')));return {started:true};},
  release(){if(!fixture)throw new Error('No fixture');writeFileSync(join(fixture,'release'),'release',{flag:'wx',mode:0o600});return {released:true};},
  async count(){if(!fixture)throw new Error('No fixture');await until(()=>existsSync(join(fixture,'done')));return {count:readFileSync(join(fixture,'counter'),'utf8').split('\n').filter(Boolean).length};},
  async close(){await stop();if(fixture)rmSync(fixture,{recursive:true,force:true});},
 };
}
export function removeEndpoint(endpoint){ownership(endpoint);if(readAgentState(endpoint.home)?.pid){const pid=readAgentState(endpoint.home).pid;try{process.kill(pid,0);throw new Error('Refusing to remove a home whose recorded agent PID is still live');}catch(e){if(e.code!=='ESRCH')throw e;}}rmSync(endpoint.home,{recursive:true,force:true});return {removed:true};}
async function main(){
 if(process.env.CUA_PARITY_REMOTE!=='1'||basename(process.cwd())!=='cua-parity')throw new Error('Remote proof helper requires the prepared parity clone');
 const lines=createInterface({input:process.stdin});let session;
 const stop=()=>{lines.close();process.stdin.destroy();};
 for(const signal of ['SIGTERM','SIGINT','SIGHUP'])process.once(signal,stop);
 try{for await(const line of lines){const {id,method:op,params:args}=JSON.parse(line);try{let result;
  if(op==='prepare')result=prepareEndpoint(args);
  else if(op==='attach'){if(session)throw new Error('Already attached');session=await deviceSession(args);result={attached:true};}
  else if(op==='remove')result=removeEndpoint(args);
  else if(session&&['start','stop','fixture','started','release','count'].includes(op))result=await session[op](args);
  else throw new Error('Unknown remote proof operation');
  console.log(JSON.stringify({id,result}));
 }catch(e){console.log(JSON.stringify({id,error:{code:-32000,message:e.message}}));}}}finally{await session?.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{process.exitCode=1;});
