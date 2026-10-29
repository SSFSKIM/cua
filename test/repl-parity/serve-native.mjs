// Linux native lane: unchanged selected production facade + sky service + the lane's engine (CUA_NATIVE_ENGINE: the
// pinned sky_linux, or cua-engine, installed or named by CUA_LINUX_ENGINE_BIN). Each connection owns one standalone
// gedit, a scratch HOME/CUA_HOME and its copied runtime. Never launches or binds a browser. Before every tool result the
// serve reports which engine processes run below it, by executable (../../scripts/repl-parity/engine-answered.mjs).
import {spawn} from 'node:child_process';
import {writeFileSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {openConnection} from '../../src/mcp/connection.mjs';
import {prepareCapabilityHome} from '../../scripts/browser-parity/capability-home.mjs';
import {executionFacts,assertPreparedFacts,attestedOutput} from '../../scripts/repl-parity/provenance.mjs';
import {cellsServeEnv} from './fixture-launch.mjs';
import {LINUX_COMPUTER_DEFAULT} from '../../scripts/repl-parity/compare.mjs';
import {attestFixtureLaunch,fixtureNodeEnvironment} from './serve-cells.mjs';
import {ENGINES,engineProcesses,engineWitness,expectedEngine} from '../../scripts/repl-parity/engine-answered.mjs';
if(process.env.CUA_PARITY_REMOTE!=='1'||process.platform!=='linux')throw Error('Native parity is remote Linux only');
const source=process.env.CUA_HOME,host=process.env.CUA_REPL_HOST,facts=executionFacts({source});
const engine=process.env.CUA_NATIVE_ENGINE,engineBin=process.env.CUA_LINUX_ENGINE_BIN||undefined;
if(!ENGINES.includes(engine))throw Error('The native lane names its engine: CUA_NATIVE_ENGINE vendor|cua');
if(engineBin!==undefined&&(engine!=='cua'||!engineBin.startsWith('/')))throw Error('CUA_LINUX_ENGINE_BIN names an absolute cua-engine, on the cua engine lane only');
assertPreparedFacts(JSON.parse(process.env.CUA_PARITY_EXPECTED),facts);
const name=process.env.CUA_PARITY_NATIVE_FILENAME;if(!/^cua-m4-[a-f0-9-]{36}\.txt$/.test(name??''))throw Error('Native fixture requires a unique owned filename');
const scratch=prepareCapabilityHome({source,prefix:(process.env.CUA_PARITY_SCRATCH_PREFIX??'cua-m4t1-')+'cap-'}),file=join(scratch.userHome,name);
let child,connection,exited;
try{
 const mode=process.env.CUA_PARITY_NATIVE_MODE;if(!['blank','drag','scroll'].includes(mode))throw Error('Unknown native fixture mode');
 writeFileSync(file,mode==='drag'?'alpha bravo charlie delta echo foxtrot\n':mode==='scroll'?Array.from({length:200},(_,i)=>`line ${String(i).padStart(3,'0')} owned native scroll fixture`).join('\n'):'');
 child=spawn('gedit',['--standalone',file],{stdio:'ignore'});
 exited=new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject);});exited.catch(()=>{});
 // The Linux computer default since #115 M3 (scoped: the kernel confined, the trusted worker with the network); M0's
 // vendor control ran the fixture's earlier forced disabled (scripts/repl-parity/compare.mjs NATIVE_FIXTURE).
 const env={...cellsServeEnv(fixtureNodeEnvironment(process.env),{scratch,sandbox:LINUX_COMPUTER_DEFAULT.sandbox,host}),CUA_SHIM_SURFACES:LINUX_COMPUTER_DEFAULT.surfaces.join(','),CUA_NATIVE_ENGINE:engine,...(engineBin?{CUA_LINUX_ENGINE_BIN:engineBin}:{})};
 const witness=engineWitness(process.stdout,{record:expectedEngine({engine,home:scratch.dir,engineBin}),sample:()=>engineProcesses(process.pid)});
 connection=await openConnection({home:scratch.dir,env,sessionId:randomUUID(),input:process.stdin,output:attestedOutput(witness,facts),chrome:{profiles:[]},listBackends:async()=>[],prepareLaunch:launch=>attestFixtureLaunch(launch,{host,facts,home:scratch.dir})});
 const stop=()=>connection.close('signal');process.once('SIGTERM',stop);process.once('SIGINT',stop);
 try{process.exitCode=(await connection.closed).code;}finally{process.off('SIGTERM',stop);process.off('SIGINT',stop);}
}finally{
 // ChildProcess ownership plus the original argv guard excludes reused PIDs. Never pgrep/kill a shared gedit/helper.
 const ours=()=>{try{return child?.exitCode===null&&child?.signalCode===null&&readFileSync(`/proc/${child.pid}/cmdline`,'utf8').split('\0').includes(file);}catch{return false;}};
 try{
  if(ours())child.kill('SIGTERM');
  let timer;try{await Promise.race([exited??Promise.resolve(),new Promise(resolve=>{timer=setTimeout(resolve,3000);})]);}finally{clearTimeout(timer);}
  if(ours()){child.kill('SIGKILL');await exited;}
 }finally{scratch.cleanup();}
}
