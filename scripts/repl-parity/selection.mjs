#!/usr/bin/env node
// Acceptance 9 oracle: intentionally does not import launch.mjs or the production default table.
import assert from 'node:assert/strict';
import {parseArgs} from 'node:util';
import {pathToFileURL} from 'node:url';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {root,remoteCommand,quote,linuxSession,ownNodeEnv,execute} from './topology.mjs';
import {checkHost} from './remote.mjs';
import {assertManagedNode} from './node-provenance.mjs';
export function expectedSelection(row){
 const {platform,registration,override,node24=true,maws=false,lane='ordinary'}=row;
 const surfaces=lane==='profiles'?['browser']:row.surfaces;
 const browser=surfaces.includes('browser'),availableNode=node24||row.managedNode===true;
 const route=row.browserService??(maws||['cua','chatgpt-then-cua'].includes(registration)?'cua':'vendor');
 if(!['unset','cua','vendor'].includes(override))return {error:'invalid_repl_host'};
 if(override==='vendor')return {host:'vendor',reason:'explicit',status:'pass'};
 const refused=browser&&route==='vendor'||platform==='darwin'&&surfaces.includes('computer');
 if(override==='cua')return refused?{error:'repl_host_refused'}:!availableNode?{error:'repl_host_node'}:{host:'cua',reason:'explicit',status:'pass'};
 if(browser&&route==='vendor')return {host:'vendor',reason:'vendor_browser_route',status:'pass'};
 if(platform==='darwin'&&surfaces.includes('computer'))return {host:'vendor',reason:'macos_native_peer_requires_vendor',status:'pass'};
 if(!availableNode)return {host:'vendor',reason:'own_host_node_unavailable',status:'warn'};
 return {host:'cua',reason:platform==='linux'?'linux':'browser_only',status:'pass'};
}
export function selectionCases(platform){
 const rows=[];
 for(const registration of ['none','chatgpt','cua','cua-then-chatgpt','chatgpt-then-cua'])for(const maws of [false,true])for(const surfaces of [['browser'],['computer'],['computer','browser']])for(const lane of ['ordinary','profiles'])for(const override of ['unset','cua','vendor','invalid'])rows.push({platform,registration,maws,surfaces,lane,override,node24:true});
 for(const lane of ['ordinary','profiles'])for(const override of ['unset','cua','vendor'])rows.push({platform,registration:'cua',maws:false,surfaces:['browser'],lane,override,node24:false});
 for(const browserService of ['cua','vendor'])for(const lane of ['ordinary','profiles'])for(const override of ['unset','cua','vendor'])rows.push({platform,registration:browserService==='cua'?'none':'cua',maws:false,surfaces:['browser'],lane,override,node24:true,browserService});
 for(const lane of ['ordinary','profiles'])rows.push({platform,registration:'cua',maws:false,surfaces:['browser'],lane,override:'unset',node24:false,managedNode:true});
 return rows;
}
export function assertSelection(row,{doctor,observation,error},reviewedSource){
 const expected=expectedSelection(row);assert.ok(doctor,'Missing doctor repl.host row');
 if(expected.error){assert.equal(error,expected.error);assert.equal(doctor.status,'fail');assert.ok(doctor.detail.includes(expected.error));return;}
 assert.equal(error,undefined);checkHost(expected.host,observation,reviewedSource);
 // Doctor reports ordinary and listing independently in one row; use the relevant sentence.
 const detail=row.lane==='profiles'?doctor.detail.split('The profile listing (browser only): ')[1]?.split('. CUA_REPL_HOST=')[0]:doctor.detail.split('. Browser route:')[0];
 assert.ok(detail?.startsWith(`${expected.host} host (${expected.reason}):`),'Doctor host/reason differs from independent M5 table');
 if(row.managedNode&&expected.host==='cua'){
  const actual=assertManagedNode(observation.executionFacts);
  assert.ok(detail.includes(actual.path),'Doctor must name the managed Node that actually answered');
 }
 const ordinary=expectedSelection({...row,lane:'ordinary'}),listing=expectedSelection({...row,lane:'profiles'});
 const status=ordinary.error||listing.error?'fail':ordinary.status==='warn'||listing.status==='warn'?'warn':'pass';
 assert.equal(doctor.status,status);
 if(!row.surfaces.includes('browser'))assert.match(doctor.detail,/no browser surface/);
 else if(row.browserService)assert.ok(doctor.detail.includes('CUA_BROWSER_SERVICE='+row.browserService));
 else if(row.maws)assert.match(doctor.detail,/MAWS/);
 else if(row.registration==='none')assert.match(doctor.detail,/no Chrome registration/);
 else {
  assert.match(doctor.detail,/registration/);
  assert.match(doctor.detail,['cua','chatgpt-then-cua'].includes(row.registration)?/cua route|route cua/:/ChatGPT extension route/);
 }
}
export async function main(argv=process.argv.slice(2)){
 const {values:v}=parseArgs({args:argv,options:{device:{type:'string'},out:{type:'string'},node22:{type:'string'}}});
 if(!['mini','cua-linux'].includes(v.device)||!v.out||!v.node22?.startsWith('/'))throw new Error('selection.mjs --device mini|cua-linux --node22 <device Node 22> --out <new dir>');
 const prepared=JSON.parse(readFileSync(join(root,'.doperpowers/sde/repl-parity',v.device+'.json'),'utf8'));
 const out=resolve(v.out);mkdirSync(out,{recursive:false});
 const command=remoteCommand(v.device,`${linuxSession}\ncd ${quote(prepared.checkout)} && exec env ${ownNodeEnv(prepared)}CUA_PARITY_REMOTE=1 node scripts/repl-parity/selection-device.mjs ${quote(JSON.stringify({prepared,node22:v.node22}))}`);
 const evidence=JSON.parse(execute(command));writeFileSync(join(out,'selection.json'),JSON.stringify(evidence,null,2)+'\n');
 if(!evidence.complete)throw new Error(`Selection oracle failed: ${evidence.error??'incomplete'}`);
 console.log(JSON.stringify({complete:true,rows:evidence.rows.length,cache:evidence.cache,job:evidence.job}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
