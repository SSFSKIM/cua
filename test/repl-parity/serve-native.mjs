// Linux native lane: unchanged selected production facade + sky service + pinned sky_linux. Each connection owns
// one standalone gedit, a scratch HOME/CUA_HOME and its copied runtime. Never launches or binds a browser.
import {spawn} from 'node:child_process';
import {writeFileSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {openConnection} from '../../src/mcp/connection.mjs';
import {prepareCapabilityHome} from '../../scripts/browser-parity/capability-home.mjs';
import {executionFacts,assertPreparedFacts,attestedOutput} from '../../scripts/repl-parity/provenance.mjs';
import {cellsServeEnv} from './fixture-launch.mjs';
if(process.env.CUA_PARITY_REMOTE!=='1'||process.platform!=='linux')throw Error('Native parity is remote Linux only');
const source=process.env.CUA_HOME,host=process.env.CUA_REPL_HOST,facts=executionFacts({source});
assertPreparedFacts(JSON.parse(process.env.CUA_PARITY_EXPECTED),facts);
const name=process.env.CUA_PARITY_NATIVE_FILENAME;if(!/^cua-m4-[a-f0-9-]{36}\.txt$/.test(name??''))throw Error('Native fixture requires a unique owned filename');
const scratch=prepareCapabilityHome({source,prefix:'cua-m4t1-cap-'}),file=join(scratch.userHome,name);
let child,connection,exited;
try{
 const mode=process.env.CUA_PARITY_NATIVE_MODE;if(!['blank','drag','scroll'].includes(mode))throw Error('Unknown native fixture mode');
 writeFileSync(file,mode==='drag'?'alpha bravo charlie delta echo foxtrot\n':mode==='scroll'?Array.from({length:200},(_,i)=>`line ${String(i).padStart(3,'0')} owned native scroll fixture`).join('\n'):'');
 child=spawn('gedit',['--standalone',file],{stdio:'ignore'});
 exited=new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject);});exited.catch(()=>{});
 const env={...cellsServeEnv(process.env,{scratch,sandbox:'disabled',host}),CUA_SHIM_SURFACES:'computer'};
 connection=await openConnection({home:scratch.dir,env,sessionId:randomUUID(),input:process.stdin,output:attestedOutput(process.stdout,facts),chrome:{profiles:[]},listBackends:async()=>[]});
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
