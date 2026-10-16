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
const INVALID_REPL_HOST='CUA_REPL_HOST must be cua or vendor';
export function expectedSelection(row){
 const {platform,registration,override,node24=true,maws=false,lane='ordinary'}=row;
 const surfaces=lane==='profiles'?['browser']:row.surfaces;
 const browser=surfaces.includes('browser'),availableNode=node24||row.managedNode===true;
 const route=row.browserService??(maws||['cua','chatgpt-then-cua'].includes(registration)?'cua':'vendor');
 // An invalid value has two refusal boundaries: `cua serve` validates its settings at start (invalid_setting), while
 // the profile listing and doctor resolve the selection itself (invalid_repl_host). Both carry the one sentence.
 if(!['unset','cua','vendor'].includes(override))return {error:lane==='profiles'?'invalid_repl_host':'invalid_setting',doctorError:'invalid_repl_host',sentence:INVALID_REPL_HOST};
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
// Doctor reports ordinary and listing independently in one row; the row's lane reads its own sentence.
function laneSentence(row,detail){
 return row.lane==='profiles'?detail.split('The profile listing (browser only): ')[1]?.split('. CUA_REPL_HOST=')[0]:detail.split('. Browser route:')[0];
}
// A doctor selection sentence: `HOST host (REASON)`, then ` on Node PATH` where the own host's Node was resolved, then `: `
// and the explanation. Only this anchored opening is read; the explanation and the other lane never stand in for it.
function doctorSelection(sentence){
 const m=/^(cua|vendor) host \(([a-z0-9_]+)\)(?: on Node (\/.*?))?: /s.exec(sentence??'');
 return m&&{host:m[1],reason:m[2],node:m[3]??null};
}
export function assertSelection(row,{doctor,observation,error,errorMessage},reviewedSource){
 const expected=expectedSelection(row);assert.ok(doctor,'Missing doctor repl.host row');
 const detail=laneSentence(row,doctor.detail);
 if(expected.error){
  assert.ok(error===expected.error,`Real ${row.lane??'ordinary'} call ${error===undefined?'was not refused':`refused with ${error}`} where the independent M5 table expects ${expected.error}`);
  if(expected.sentence)assert.ok(errorMessage===expected.sentence,`Real call refusal sentence ${JSON.stringify(errorMessage)} differs from ${JSON.stringify(expected.sentence)}`);
  assert.equal(doctor.status,'fail');
  const refused=`refused (${expected.doctorError??expected.error}): `;
  assert.ok(detail?.startsWith(refused),`Doctor ${row.lane??'ordinary'} sentence ${JSON.stringify(detail)} does not open with ${JSON.stringify(refused)}`);
  if(expected.sentence)assert.ok(detail===refused+expected.sentence,`Doctor refusal sentence ${JSON.stringify(detail)} differs from ${JSON.stringify(refused+expected.sentence)}`);
  return;
 }
 assert.equal(error,undefined);checkHost(expected.host,observation,reviewedSource);
 const selected=doctorSelection(detail);
 assert.ok(selected?.host===expected.host&&selected.reason===expected.reason,`Doctor host/reason differs from independent M5 table: ${JSON.stringify(detail)} where ${expected.host} host (${expected.reason}) is expected`);
 if(row.managedNode&&expected.host==='cua'){
  const actual=assertManagedNode(observation.executionFacts);
  assert.ok(selected.node===actual.path,`Doctor must name the managed Node that actually answered (${actual.path}) in its on-Node clause, not ${selected.node}`);
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
const describeRow=r=>[r.platform,`registration ${r.registration}`,...(r.maws?['maws']:[]),r.surfaces.join(','),r.lane,`override ${r.override}`,r.node24?'node24':'node22',...(r.managedNode?['managed Node']:[]),...(r.browserService?[`CUA_BROWSER_SERVICE=${r.browserService}`]:[])].join(', ');
// Every failing row and check, by name; a lane that stopped early or recorded fewer rows than planned never passes.
export function selectionVerdict(evidence){
 const failures=evidence.failures??[];
 const lines=failures.map(f=>f.check?`check ${f.check}: ${f.message}`:`row ${f.row}/${evidence.planned} (${describeRow(f.case)}): ${f.message}`);
 if(!evidence.complete)lines.push(`lane stopped before finishing: ${evidence.error??'no reason recorded'}`);
 else if(evidence.rows?.length!==evidence.planned)lines.push(`lane recorded ${evidence.rows?.length} of ${evidence.planned} planned rows`);
 return {ok:lines.length===0,lines};
}
export async function main(argv=process.argv.slice(2)){
 const {values:v}=parseArgs({args:argv,options:{device:{type:'string'},out:{type:'string'},node22:{type:'string'}}});
 if(!['mini','cua-linux'].includes(v.device)||!v.out||!v.node22?.startsWith('/'))throw new Error('selection.mjs --device mini|cua-linux --node22 <device Node 22> --out <new dir>');
 const prepared=JSON.parse(readFileSync(join(root,'.doperpowers/sde/repl-parity',v.device+'.json'),'utf8'));
 const out=resolve(v.out);mkdirSync(out,{recursive:false});
 const command=remoteCommand(v.device,`${linuxSession}\ncd ${quote(prepared.checkout)} && exec env ${ownNodeEnv(prepared)}CUA_PARITY_REMOTE=1 node scripts/repl-parity/selection-device.mjs ${quote(JSON.stringify({prepared,node22:v.node22}))}`);
 const evidence=JSON.parse(execute(command));writeFileSync(join(out,'selection.json'),JSON.stringify(evidence,null,2)+'\n');
 const verdict=selectionVerdict(evidence);
 if(!verdict.ok)throw new Error(`Selection oracle failed (${verdict.lines.length}):\n${verdict.lines.join('\n')}`);
 console.log(JSON.stringify({complete:true,rows:evidence.rows.length,cache:evidence.cache,job:evidence.job}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
