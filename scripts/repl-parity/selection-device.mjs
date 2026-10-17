// Live selection probe on the prepared device. Fresh cua install in an owned home; only route metadata is copied. Each
// row writes its registration fixture (installRoutes: cua's record, the removed ChatGPT route's record, both in either
// order, or none), which the selection must not depend on.
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,realpathSync,writeFileSync,readFileSync,rmSync,symlinkSync,utimesSync,readdirSync,renameSync} from 'node:fs';
import {join,dirname,basename} from 'node:path';
import {homedir} from 'node:os';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {StdioClient} from '../browser-parity/mcp.mjs';
import {selectionCases,assertSelection} from './selection.mjs';
import {executionFacts,assertPreparedFacts} from './provenance.mjs';
import {homeLayout} from '../../src/runtime/layout.mjs';
import {assertManagedNode,nodeEnvironment} from './node-provenance.mjs';
import {checkScratchJob} from './selection-job.mjs';
import {cuaRecordFile,vendorRecordFile} from '../../src/chrome/route.mjs';
import {socketPathFor,socketNameFor,backendDir} from '../../src/chrome/extension.mjs';
export function installRoutes(home,registration){
 for(const file of [cuaRecordFile(home),vendorRecordFile(home)])rmSync(file,{force:true});
 const order={none:[],chatgpt:['vendor'],cua:['cua'],'cua-then-chatgpt':['cua','vendor'],'chatgpt-then-cua':['vendor','cua']}[registration];
 if(!order)throw new Error('Unknown registration fixture');
 mkdirSync(join(home,'chrome'),{recursive:true,mode:0o700});
 for(const [i,route] of order.entries()){
  const file=route==='cua'?cuaRecordFile(home):vendorRecordFile(home);
  writeFileSync(file,JSON.stringify(route==='cua'?{schema:1,route,launcher:null,backendsDir:backendDir(home),browsers:{}}:{schema:1,browsers:{chrome:{manifest:'/fixture/manifest',replaced:false}}}),{mode:0o600});
  utimesSync(file,1700000000+i,1700000000+i);
 }
}
const files=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(dir,e.name)):[join(dir,e.name)]);
// A refused call as {code, message}: the listing's refusal as it reported it, serve's start-time refusal from the
// observation frame (selection-serve.mjs), or a selection code the real server named in its error message. Anything
// else is unexpected_error with its message kept, so a harness or environment failure stays visible in the evidence.
export function refusalOf(error){
 if(error?.refusal)return error.refusal;
 const message=String(error?.message??error);
 const early=/^serve refused before launch \(([a-z_]+)\): (.*)$/s.exec(message);
 if(early)return {code:early[1],message:early[2]};
 return {code:['invalid_repl_host','repl_host_refused','repl_host_node'].find(code=>message.includes(code))??'unexpected_error',message};
}
export function listingOutcome(stdout){
 let parsed;try{parsed=JSON.parse(stdout);}catch{throw new Error(`Selection listing printed no JSON: ${JSON.stringify(stdout.slice(0,200))}`);}
 if(parsed.error)throw Object.assign(new Error(`listing refused (${parsed.error})`),{refusal:{code:parsed.error,message:parsed.message??null}});
 return parsed.observation;
}
// Runs every planned row and then every check whatever an earlier one did, recording each failure (1-based row number
// and its case, or the check's name) in `failures`, which it returns. `around` wraps a row's evaluation in the row's
// environment (the managed Node moved aside); a failure of `around` itself is the environment's, not the row's, and
// stops the lane with the failures recorded so far.
export async function evaluateSelection({cases,evaluateRow,checks,around=(row,run)=>run(),failures=[]}){
 const attempt=async(label,run)=>{try{await run();}catch(error){failures.push({...label,message:error.message});}};
 for(const [index,row] of cases.entries())await around(row,()=>attempt({row:index+1,case:row},()=>evaluateRow(row)));
 for(const [check,run] of Object.entries(checks))await attempt({check},run);
 return failures;
}
export function installSelectionRuntime(home,ambient,{run=execFileSync,inspect=executionFacts}={}){
 const env=nodeEnvironment({...ambient,CUA_HOME:home});
 run(process.execPath,['bin/cua.mjs','install'],{env,stdio:['ignore','ignore','pipe'],timeout:300000,maxBuffer:1024*1024});
 const installed=inspect({source:home,ambient:env});assertManagedNode(installed);return installed;
}
export async function withManagedNodeUnavailable(home,run){
 const node=join(home,'node'),hidden=join(home,'node.unavailable');renameSync(node,hidden);
 try{return await run();}finally{renameSync(hidden,node);}
}
export async function ordinaryCall({home,env,node}){
 let launchNode;
 const client=new StdioClient({command:node,args:['scripts/repl-parity/selection-serve.mjs'],env,cwd:process.cwd(),closeTimeoutMs:15000,onNotification:message=>{if(message.method==='cua/paritySelectionLaunch')launchNode=message.params.node;}});
 try{
  const init=await client.initialize();
  // Production records the handshake only after a live tools/list answers; initialize and reset alone never seed it.
  await client.request('tools/list');
  const result=await client.call('js_reset');if(result.isError)throw new Error('js_reset failed');assert.ok(launchNode,'Missing real launch Node observation');return {serverInfo:init.serverInfo,_meta:result._meta??null,launchNode};
 }
 finally{await client.close();}
}
export async function runSelection({prepared,node22}){
 assertPreparedFacts(prepared,executionFacts({source:prepared.home}));
 if(!/^v22\./.test(execFileSync(node22,['--version'],{encoding:'utf8'}).trim()))throw new Error('--node22 must name a real Node 22 executable');
 const parent=join(homedir(),'.local','share','cua-parity-selection');mkdirSync(parent,{recursive:true,mode:0o700});
 const home=realpathSync(mkdtempSync(join(parent,'m5-'))),userHome=join(home,'home'),nodeBin=join(home,'node22-bin');
 const result={schema:1,commit:prepared.commit,platform:process.platform,load:execFileSync('uptime',[],{encoding:'utf8'}).trim(),complete:false,rows:[]};
 try{
  mkdirSync(userHome,{mode:0o700});mkdirSync(nodeBin,{mode:0o700});symlinkSync(node22,join(nodeBin,'node'));
  mkdirSync(backendDir(home),{recursive:true});const name=socketNameFor(prepared.extensionInstanceId);symlinkSync(socketPathFor(prepared.home,name),socketPathFor(home,name));
  const base=Object.fromEntries(['PATH','TMPDIR','LANG','LC_ALL','USER','LOGNAME','DISPLAY','XAUTHORITY','DBUS_SESSION_BUS_ADDRESS','XDG_RUNTIME_DIR','XDG_DATA_DIRS'].filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]]));
  Object.assign(base,{HOME:userHome,CUA_HOME:home,CUA_SHIM_SECRETS:'off',CUA_PARITY_REMOTE:'1'});
  const installed=installSelectionRuntime(home,base),ownNode=installed.ownNode;
  assert.equal(installed.release,prepared.release,'Fresh install must retain the prepared runtime pin');
  result.installation={method:'cua install',home,ownNode};
  const cases=selectionCases(process.platform).map(planned=>({...planned,managedNode:planned.managedNode??planned.node24}));
  result.planned=cases.length;result.failures=[];
  const evaluateRow=async row=>{
   installRoutes(home,row.registration);
   const node=row.node24?ownNode.path:node22;
   const env={...base,CUA_SHIM_SURFACES:row.surfaces.join(','),...(row.override==='unset'?{}:{CUA_REPL_HOST:row.override}),...(row.maws?{CUA_BROWSER_BACKENDS:join(home,'maws-fixture.sock')}:{})};
   if(!row.node24)env.PATH=nodeBin+':/usr/bin:/bin';
   const doc=spawnSync(node,['bin/cua.mjs','doctor','--json'],{env,encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024});
   let doctor;try{doctor=JSON.parse(doc.stdout).checks.find(c=>c.name==='repl.host');}catch{}
   let observation,refusal;
   try{
    let observed;
    // Run the independent listing in the SAME Node environment as doctor (including the Node 22 rows).
    if(row.lane==='profiles')observed=listingOutcome(spawnSync(node,['scripts/repl-parity/selection-listing.mjs'],{env,encoding:'utf8',timeout:90000,maxBuffer:1024*1024}).stdout);
    else observed=await ordinaryCall({home,env,node});
    const host=observed.serverInfo.name==='cua-repl-host'?'cua':'vendor';
    observation={...observed,host,executionFacts:{commit:installed.commit,dirty:installed.dirty,home,ownNode:host==='cua'?observed.launchNode:null}};
   }catch(e){refusal=refusalOf(e);}
   const evidence={row,doctor:doctor??null,observation,...(refusal?{error:refusal.code,errorMessage:refusal.message}:{})};result.rows.push(evidence);
   if(!doctor)throw new Error(`Doctor returned no JSON repl.host row (exit ${doc.status??doc.signal}${doc.error?`, ${doc.error.message}`:''})`);
   assertSelection(row,evidence,{reviewedCommit:prepared.commit});
  };
  const checks={
   cache:async()=>{
    installRoutes(home,'cua');const env={...base,CUA_SHIM_SURFACES:'browser',CUA_REPL_HOST:'cua'};
    const first=await ordinaryCall({home,env,node:ownNode.path});const again=await ordinaryCall({home,env,node:ownNode.path});assert.deepEqual(first.serverInfo,again.serverInfo);
    const cached=files(homeLayout(home).handshake).filter(f=>f.endsWith('.json'));
    const ownFile=cached.find(f=>f.includes('/cua@')&&f.includes('browser@'));assert.ok(ownFile,'Own handshake was not cached');
    const record=JSON.parse(readFileSync(ownFile,'utf8'));record.host.version='0.0.0-parity-old';record.initialize.serverInfo={name:'cua-repl-host',version:'0.0.0-parity-old'};
    const oldDirectory=join(dirname(dirname(ownFile)),'cua@0.0.0-parity-old');mkdirSync(oldDirectory,{recursive:true});writeFileSync(join(oldDirectory,basename(ownFile)),JSON.stringify(record));rmSync(ownFile);
    const after=await ordinaryCall({home,env,node:ownNode.path});assert.deepEqual(after.serverInfo,first.serverInfo);
    const vendor=await ordinaryCall({home,env:{...env,CUA_REPL_HOST:'vendor'},node:ownNode.path});assert.notEqual(vendor.serverInfo.name,'cua-repl-host');
    result.cache={sameSelection:true,staleVersionMiss:true,crossHostMiss:true};
   },
   // Job serialization only: no launchd/systemd installation, no live enrollment.
   job:async()=>{
    mkdirSync(join(home,'remote'),{recursive:true});writeFileSync(join(home,'remote','device.json'),JSON.stringify({schema:1,deviceId:Buffer.alloc(16,1).toString('base64url'),secret:Buffer.alloc(32,2).toString('base64url'),enrolledAt:'2026-10-16T00:00:00Z'}),{mode:0o600});
    result.job=await checkScratchJob({home,userHome,node:ownNode.path,env:base,platform:process.platform});
   },
  };
  await evaluateSelection({cases,evaluateRow,checks,failures:result.failures,around:(row,run)=>row.managedNode?run():withManagedNodeUnavailable(home,run)});
  result.complete=true;
 }catch(error){result.error=error.message;}finally{rmSync(home,{recursive:true,force:true});}
 return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){if(process.env.CUA_PARITY_REMOTE!=='1')throw new Error('Selection live lane is remote-only');console.log(JSON.stringify(await runSelection(JSON.parse(process.argv[2]))));}
