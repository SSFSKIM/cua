// Live selection probe on the prepared device. Runtime and route metadata only are copied; HOME is empty.
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,realpathSync,writeFileSync,readFileSync,rmSync,symlinkSync,utimesSync,readdirSync} from 'node:fs';
import {join,dirname,basename} from 'node:path';
import {homedir} from 'node:os';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {StdioClient} from '../browser-parity/mcp.mjs';
import {selectionCases,assertSelection} from './selection.mjs';
import {executionFacts,assertPreparedFacts} from './provenance.mjs';
import {readPointer,writePointer,homeLayout} from '../../src/runtime/layout.mjs';
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
  writeFileSync(file,JSON.stringify(route==='cua'?{schema:1,route,launcher:null,backendsDir:backendDir(home),browsers:{}}:{schema:1,browsers:{chrome:{manifestPath:'/fixture/manifest',previous:null}}}),{mode:0o600});
  utimesSync(file,1700000000+i,1700000000+i);
 }
}
const files=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(dir,e.name)):[join(dir,e.name)]);
function errorCode(error){for(const code of ['invalid_repl_host','repl_host_refused','repl_host_node'])if(String(error?.message??error).includes(code))return code;return error?.code??'unexpected_error';}
export async function ordinaryCall({home,env,node}){
 const client=new StdioClient({command:node,args:['scripts/repl-parity/selection-serve.mjs'],env,cwd:process.cwd(),closeTimeoutMs:15000});
 try{const init=await client.initialize(),result=await client.call('js_reset');if(result.isError)throw new Error('js_reset failed');return {serverInfo:init.serverInfo,_meta:result._meta??null};}
 finally{await client.close();}
}
export async function runSelection({prepared,node22}){
 assertPreparedFacts(prepared,executionFacts({source:prepared.home}));
 if(!/^v22\./.test(execFileSync(node22,['--version'],{encoding:'utf8'}).trim()))throw new Error('--node22 must name a real Node 22 executable');
 const parent=join(homedir(),'.local','share','cua-parity-selection');mkdirSync(parent,{recursive:true,mode:0o700});
 const home=realpathSync(mkdtempSync(join(parent,'m5-'))),userHome=join(home,'home'),nodeBin=join(home,'node22-bin');
 const ownNode=prepared.ownNode;
 assert.ok(ownNode?.path&&Number(/^v(\d+)\./.exec(ownNode.version)?.[1])>=24,'Prepared Node 24 required');
 const result={schema:1,commit:prepared.commit,platform:process.platform,load:execFileSync('uptime',[],{encoding:'utf8'}).trim(),complete:false,rows:[]};
 try{
  mkdirSync(userHome,{mode:0o700});mkdirSync(nodeBin,{mode:0o700});symlinkSync(node22,join(nodeBin,'node'));
  mkdirSync(homeLayout(home).runtimes,{recursive:true});const release=readPointer(prepared.home);
  execFileSync('cp',[...(process.platform==='darwin'?['-c']:[]),'-R',join(homeLayout(prepared.home).runtimes,release),homeLayout(home).runtimes]);writePointer(home,release);
  mkdirSync(backendDir(home),{recursive:true});const name=socketNameFor(prepared.extensionInstanceId);symlinkSync(socketPathFor(prepared.home,name),socketPathFor(home,name));
  const base=Object.fromEntries(['PATH','TMPDIR','LANG','LC_ALL','USER','LOGNAME','DISPLAY','XAUTHORITY','DBUS_SESSION_BUS_ADDRESS','XDG_RUNTIME_DIR','XDG_DATA_DIRS'].filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]]));
  Object.assign(base,{HOME:userHome,CUA_HOME:home,CUA_SHIM_SECRETS:'off',CUA_PARITY_REMOTE:'1'});
  for(const row of selectionCases(process.platform)){
   installRoutes(home,row.registration);
   const node=row.node24?ownNode.path:node22;
   const env={...base,CUA_SHIM_SURFACES:row.surfaces.join(','),...(row.browserService?{CUA_BROWSER_SERVICE:row.browserService}:{}),...(row.override==='unset'?{}:{CUA_REPL_HOST:row.override}),...(row.maws?{CUA_BROWSER_BACKENDS:join(home,'maws-fixture.sock')}:{})};
   if(!row.node24)env.PATH=nodeBin+':/usr/bin:/bin';else if(process.env.CUA_NODE)env.CUA_NODE=process.env.CUA_NODE;
   const doc=spawnSync(node,['bin/cua.mjs','doctor','--json'],{env,encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024});
   let doctor;try{doctor=JSON.parse(doc.stdout).checks.find(c=>c.name==='repl.host');}catch{throw new Error('Doctor returned no JSON repl.host row');}
   let observation,error;
   try{
    let observed;
    if(row.lane==='profiles'){
     // Run the independent listing in the SAME Node environment as doctor (including the Node 22 rows).
     const listing=spawnSync(node,['scripts/repl-parity/selection-listing.mjs'],{env,encoding:'utf8',timeout:90000,maxBuffer:1024*1024});
     const parsed=JSON.parse(listing.stdout);if(parsed.error)throw Object.assign(new Error(parsed.error),{code:parsed.error});observed=parsed.observation;
    }else observed=await ordinaryCall({home,env,node});
    observation={...observed,host:observed.serverInfo.name==='cua-repl-host'?'cua':'vendor',executionFacts:{ownNode}};
   }catch(e){error=errorCode(e);}
   const evidence={row,doctor,observation,...(error?{error}:{})};result.rows.push(evidence);assertSelection(row,evidence);
  }
  installRoutes(home,'cua');const env={...base,CUA_SHIM_SURFACES:'browser',CUA_REPL_HOST:'cua',...(process.env.CUA_NODE?{CUA_NODE:process.env.CUA_NODE}:{})};
  const first=await ordinaryCall({home,env,node:ownNode.path});const again=await ordinaryCall({home,env,node:ownNode.path});assert.deepEqual(first.serverInfo,again.serverInfo);
  const cached=files(homeLayout(home).handshake).filter(f=>f.endsWith('.json'));
  const ownFile=cached.find(f=>f.includes('/cua@')&&f.includes('browser@'));assert.ok(ownFile,'Own handshake was not cached');
  const record=JSON.parse(readFileSync(ownFile,'utf8'));record.host.version='0.0.0-parity-old';record.initialize.serverInfo={name:'cua-repl-host',version:'0.0.0-parity-old'};
  const oldDirectory=join(dirname(dirname(ownFile)),'cua@0.0.0-parity-old');mkdirSync(oldDirectory,{recursive:true});writeFileSync(join(oldDirectory,basename(ownFile)),JSON.stringify(record));rmSync(ownFile);
  const after=await ordinaryCall({home,env,node:ownNode.path});assert.deepEqual(after.serverInfo,first.serverInfo);
  const vendor=await ordinaryCall({home,env:{...env,CUA_REPL_HOST:'vendor'},node:ownNode.path});assert.notEqual(vendor.serverInfo.name,'cua-repl-host');
  result.cache={sameSelection:true,staleVersionMiss:true,crossHostMiss:true};
  // Job serialization only: no launchd/systemd installation, no live enrollment.
  mkdirSync(join(home,'remote'),{recursive:true});writeFileSync(join(home,'remote','device.json'),JSON.stringify({schema:1,deviceId:Buffer.alloc(16,1).toString('base64url'),secret:Buffer.alloc(32,2).toString('base64url'),enrolledAt:'2026-10-16T00:00:00Z'}),{mode:0o600});
  result.job=await checkScratchJob({home,userHome,node:ownNode.path,env:base,platform:process.platform});
  result.complete=true;
 }catch(error){result.error=error.message;}finally{rmSync(home,{recursive:true,force:true});}
 return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){if(process.env.CUA_PARITY_REMOTE!=='1')throw new Error('Selection live lane is remote-only');console.log(JSON.stringify(await runSelection(JSON.parse(process.argv[2]))));}
