// Remote-only process/sandbox probes against the real selected host. The control files and every signalled PID belong
// to this process's serve-cells children. Negative preflights are identified as boundary observations, not MCP output.
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,existsSync,rmSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {fileURLToPath} from 'node:url';
import {PassThrough} from 'node:stream';import {createServer} from 'node:net';import {randomUUID} from 'node:crypto';
import {executionFacts,assertPreparedFacts} from '../../scripts/repl-parity/provenance.mjs';
import {AttestedConnections,normalizeRawResult} from '../../scripts/repl-parity/runner.mjs';
import {captureRawResult} from '../../scripts/browser-parity/runner.mjs';
import {createNormalizer} from '../../scripts/browser-parity/normalize.mjs';
import {prepareCapabilityHome} from '../../scripts/browser-parity/capability-home.mjs';
import {openConnection} from '../../src/mcp/connection.mjs';
import {resolveRuntime} from '../../src/runtime/manifest.mjs';
import {boundaryPreflightEnv,boundaryServeEnv,failingSandboxScript} from './fixture-launch.mjs';
import boundaryScenarios from './scenarios/boundaries.mjs';
import {ownedProcesses,killOwnedKernel,alive} from '../../scripts/repl-parity/processes.mjs';
if(process.env.CUA_PARITY_REMOTE!=='1')throw new Error('Boundary probes are remote-only');
const probe=process.argv[2],id=`cells/${probe}`,host=process.env.CUA_REPL_HOST??'vendor';
const facts=executionFacts({source:process.env.CUA_HOME});assertPreparedFacts(JSON.parse(process.env.CUA_PARITY_EXPECTED),facts);
const dir=mkdtempSync(join(tmpdir(),'cua-bounds-'));mkdirSync(join(dir,'tmp'));
const pool=new AttestedConnections(host),clients=[],rows=[],normalize=createNormalizer({imageMode:'exact',schemaFields:false});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check,ms=10000){const deadline=Date.now()+ms;while(!check()){if(Date.now()>deadline)throw new Error('Fixture condition timed out');await delay(20);}}
const text=r=>(r.content??[]).filter(c=>c.type==='text').map(c=>c.text).join('\n');
async function record(label,result){rows.push({case:id,cell:label,ok:true,...await normalizeRawResult(result,{normalize})});return result;}
async function open({sandbox='scoped',witness=false,brokenSandbox=false}={}){
 const control=join(dir,`connection-${clients.length+1}`);mkdirSync(control);
 const sandboxFailure=join(control,'failing-sandbox');if(brokenSandbox){writeFileSync(sandboxFailure,failingSandboxScript(join(control,'sandbox-invoked')));chmodSync(sandboxFailure,0o700);}
 const client=await pool.open({expectedFacts:facts,command:process.execPath,args:[fileURLToPath(new URL('./serve-cells.mjs',import.meta.url))],env:boundaryServeEnv(process.env,{tmp:join(dir,'tmp'),home:process.env.CUA_HOME,host,facts,control,sandbox,witness,brokenSandbox:brokenSandbox?sandboxFailure:''})});
 clients.push({client,control,sandbox,witness,brokenSandbox});return client;
}
async function js(client,label,code,timeoutMs){return record(label,await client.call('js',{code,title:'Owned boundary fixture',...(timeoutMs?{timeout_ms:timeoutMs}:{})}));}
async function close(client){
 const entry=clients.find(x=>x.client===client);if(entry.closed)return entry.closed;
 // Allow the proxy's own 5s completion + 5s teardown budgets; don't kill SSH/a fixture in the middle of its cleanup.
 client.child.stdin.end();let timer;const result=await Promise.race([client.exited,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Fixture close exceeded ownership budget')),15000);})]).finally(()=>clearTimeout(timer));
 assert.ok(existsSync(join(entry.control,'closed.json')),'missing terminal ownership record');
 const closed=JSON.parse(readFileSync(join(entry.control,'closed.json')));assert.equal(closed.teardown?.confirmed,true,'owned teardown not confirmed');
 entry.closed={...closed,exitCode:result.code};return entry.closed;
}
async function negativePreflight(kind){
 const scratch=prepareCapabilityHome({source:process.env.CUA_HOME});let launched=false;
 const env=boundaryPreflightEnv(process.env,{scratch,tmp:join(dir,'tmp'),host});
 if(kind==='trusted-write-root-overlap')env.TMPDIR=resolveRuntime({home:scratch.dir}).paths.moduleDir;
 let code;try{
  const connection=await openConnection({home:scratch.dir,env,sessionId:randomUUID(),input:new PassThrough(),output:new PassThrough(),chrome:{profiles:[]},listBackends:async()=>[],prepareLaunch:launch=>{launched=true;return launch;},...(kind==='linux-fail-closed'?{probeUserns:async()=>({status:'fail',detail:'harness-controlled unavailable namespace'})}:{})});
  await connection.close('unexpected preflight acceptance');
 }catch(error){code=error.code;}finally{scratch.cleanup();}
 assert.equal(code,kind==='trusted-write-root-overlap'?'sandbox_conflict':'sandbox_unavailable');assert.equal(launched,false);
 return {kind:'preflight',code,launched,...(kind==='linux-fail-closed'?{capabilityProbe:'controlled unavailable namespace'}:{})};
}
let server,proof;
try{
 if(['confinement/trusted-write-root-overlap','confinement/linux-fail-closed'].includes(probe))proof=await negativePreflight(probe.split('/')[1]);
 else if(['confinement/default','confinement/scoped','confinement/disabled'].includes(probe)){
  const sandbox=probe.split('/')[1],client=await open({sandbox});server=createServer(socket=>socket.end());await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const outside=join(dir,'outside.txt');
  const result=await js(client,'filesystem-network',`let fs=await import('node:fs');let net=await import('node:net');let write=p=>{try{fs.writeFileSync(p,'fixture');fs.unlinkSync(p);return true;}catch{return false;}};let cwdWrite=write(nodeRepl.cwd+'/write.txt');let outsideWrite=write(${JSON.stringify(outside)});let network=await new Promise(resolve=>{let socket=net.createConnection({host:'127.0.0.1',port:${server.address().port}});let finish=value=>{socket.destroy();resolve(value);};socket.once('connect',()=>finish(true));socket.once('error',()=>finish(false));socket.setTimeout(500,()=>finish(false));});nodeRepl.write(JSON.stringify({cwdWrite,outsideWrite,network}));`);
  assert.equal(result.isError,false);const value=JSON.parse(text(result));assert.deepEqual(value,{cwdWrite:sandbox!=='default',outsideWrite:sandbox==='disabled',network:sandbox==='disabled'});proof={kind:'sandbox-behavior',mode:sandbox,...value};
 }else if(probe==='confinement/no-unsandboxed-fallback'){
  const client=await open({brokenSandbox:true});await record('reset',await client.call('js_reset'));
  const marker=join(dir,'tmp','must-not-run'),outside=join(dir,'outside-policy');
  const result=await js(client,'refused',`let fs=await import('node:fs');fs.writeFileSync(${JSON.stringify(marker)},'executed');let outsideWrite=false;try{fs.writeFileSync(${JSON.stringify(outside)},'executed');outsideWrite=true;}catch{}nodeRepl.write(JSON.stringify({outsideWrite}));`);
  const outsideWrite=existsSync(outside);proof={kind:'sandbox-launch-failure',codeExecuted:existsSync(marker),toolError:result.isError===true,
    ...(process.platform==='linux'?{outsideWrite,launcherInvoked:existsSync(join(clients.at(-1).control,'sandbox-invoked'))}:outsideWrite?{outsideWrite}:{} )};
 }else if(probe==='timeouts/late-reply-generation-fence'||probe==='reset/generation-fence'){
  const client=await open(),marker=join(dir,'tmp','stale');
  const schedule=`let oldBinding=1;let fs=await import('node:fs');setTimeout(()=>{fs.writeFileSync(${JSON.stringify(marker)},'stale');nodeRepl.write('STALE');},1000);`;
  if(probe.startsWith('timeouts/')){const result=await js(client,'timeout',schedule+'await new Promise(()=>{});',50);assert.equal(result.isError,true);}
  else{await js(client,'schedule',schedule+`nodeRepl.write('scheduled');`);await record('reset',await client.call('js_reset'));}
  const result=await js(client,'fresh',`await new Promise(r=>setTimeout(r,1200));nodeRepl.write(typeof oldBinding==='undefined'&&!(await import('node:fs')).existsSync(${JSON.stringify(marker)}));`);assert.equal(result.isError,false);assert.equal(text(result),'true');proof={kind:'generation-fence',freshHeap:true,staleSideEffect:false};
 }else if(probe==='reset/fresh-banner'){
  const client=await open({witness:true});
  assert.equal(text(await js(client,'first',`let savedBanner=__parityBannerWitness;nodeRepl.write(typeof savedBanner==='symbol');`)),'true');
  assert.equal(text(await js(client,'again',`nodeRepl.write(savedBanner===__parityBannerWitness);`)),'true');
  await record('reset',await client.call('js_reset'));
  assert.equal(text(await js(client,'fresh',`nodeRepl.write(typeof savedBanner==='undefined'&&typeof __parityBannerWitness==='symbol');`)),'true');
  assert.equal((await js(client,'timeout','await new Promise(()=>{});',50)).isError,true);
  assert.equal(text(await js(client,'after-timeout',`nodeRepl.write(typeof __parityBannerWitness==='symbol');`)),'true');proof={kind:'no-service-banner-witness',oncePerHeap:true,afterReset:true,afterTimeout:true};
 }else if(probe.startsWith('lifecycle/')){
  const client=await open();await js(client,'warm',`nodeRepl.write('warm');`);
  const entry=clients.at(-1),launch=JSON.parse(readFileSync(join(entry.control,'launch.json'))),owned=ownedProcesses(client.child.pid);
  if(probe==='lifecycle/owned-group-teardown'){
   await js(client,'background',`setInterval(()=>{},1000);nodeRepl.write('background-active');`);const terminal=await close(client);await until(()=>owned.every(p=>!alive(p.pid)));
   proof={kind:'owned-group',confirmed:terminal.teardown.confirmed,allObservedChildrenGone:true};
  }else{
   const counter=join(dir,'tmp','counter'),release=join(dir,'tmp','release');
   const pending=client.call('js',{code:`let fs=await import('node:fs');fs.appendFileSync(${JSON.stringify(counter)},'x');while(!fs.existsSync(${JSON.stringify(release)}))await new Promise(r=>setTimeout(r,20));nodeRepl.write('released');`,title:'Owned interruption fixture'}).then(result=>({result}),error=>({error}));
   await until(()=>existsSync(counter));
   if(probe.endsWith('child-exit-settles'))killOwnedKernel(client.child.pid,launch.cwd,{host,nodePath:launch.nodePath});
   else client.child.stdin.end();
   writeFileSync(release,'release');let timer;
   const settled=await Promise.race([pending,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Interrupted request did not settle')),10000);})]).finally(()=>clearTimeout(timer));
   if(settled.result){await record('interrupted',settled.result);if(probe.endsWith('child-exit-settles'))assert.equal(settled.result.isError,true);}
   else rows.push({case:id,cell:'interrupted',ok:false,error:{code:'transport_closed',message:settled.error.message}});
   await close(client);assert.equal(readFileSync(counter,'utf8'),'x');
   if(probe.endsWith('eof-settles-no-replay')){const reconnected=await open();const result=await js(reconnected,'reconnect',`nodeRepl.write((await import('node:fs')).readFileSync(${JSON.stringify(counter)},'utf8').length);`);assert.equal(text(result),'1');}
   proof={kind:'interrupted-execution',settled:true,executions:1,reconnected:probe.endsWith('eof-settles-no-replay')};
  }
 }else throw new Error('Unknown boundary probe');
 for(const {client} of clients)await close(client);
 rows.push({case:id,cell:'boundary',ok:true,value:proof,evidenceKind:proof.kind},{case:id,assertion:boundaryScenarios.find(s=>s.id===id).assert({results:[proof]})});
 const observations=pool.metadata();for(const [i,a] of observations.hostAttestations.entries())a.fixture={sandbox:clients[i].sandbox,bannerWitness:clients[i].witness,brokenSandbox:clients[i].brokenSandbox};
 console.log(JSON.stringify({rows,observations,executionFacts:facts}));
}catch(error){process.stderr.write(`Boundary ${probe} failed: ${error.message}\n`);process.exitCode=1;}
finally{for(const {client,closed} of clients)if(!closed)await close(client).catch(()=>{process.exitCode=1;});if(server)await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true});}
