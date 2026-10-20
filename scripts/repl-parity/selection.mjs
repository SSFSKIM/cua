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
const INVALID_REPL_HOST='CUA_REPL_HOST must be cua or vendor',INVALID_ENGINE='CUA_NATIVE_ENGINE must be vendor or cua';
// The engine a macOS computer session drives when nothing selects one: the vendor's until #117's M5 flips it (this
// oracle's own statement of it, flipped with production's).
export const ORACLE_DEFAULT_ENGINE='vendor';
// The independent M5 table of production's REPL host selection (src/runtime/launch.mjs replHostFor): CUA_REPL_HOST, then
// the computer surface on macOS, then the own host's Node. The home's Chrome registration and MAWS client mode take no
// part since #79 removed the ChatGPT extension route and the vendor browser service's selection: either host runs cua's
// browser service, so a home whose registration is the ChatGPT route's (`chatgpt`, `cua-then-chatgpt`) selects as any
// other. The rows keep every registration ordering and MAWS to show exactly that.
// The computer surface on macOS follows #117's engine × host table instead (macosComputer below): a row's `engine` is
// CUA_NATIVE_ENGINE (`unset`, `vendor`, `cua`, or `invalid`), from `engineFrom` `env` or `settings` (~/.config/cua/
// engine.json), `installed` whether the home has an approved engine, and `defaultEngine` the default under test.
export function expectedSelection(row){
 const {platform,override,node24=true,lane='ordinary'}=row;
 const surfaces=lane==='profiles'?['browser']:row.surfaces;
 const availableNode=node24||row.managedNode===true,macosComputer=platform==='darwin'&&surfaces.includes('computer');
 // An invalid value has two refusal boundaries: `cua serve` validates its settings at start (invalid_setting), while
 // the profile listing and doctor resolve the selection itself (invalid_repl_host). Both carry the one sentence.
 if(!['unset','cua','vendor'].includes(override))return {error:lane==='profiles'?'invalid_repl_host':'invalid_setting',doctorError:'invalid_repl_host',sentence:INVALID_REPL_HOST};
 if(macosComputer)return engineTable(row,availableNode);
 if(override==='vendor')return {host:'vendor',reason:'explicit',status:'pass'};
 if(override==='cua')return !availableNode?{error:'repl_host_node'}:{host:'cua',reason:'explicit',status:'pass'};
 if(!availableNode)return {host:'vendor',reason:'own_host_node_unavailable',status:'warn'};
 return {host:'cua',reason:platform==='linux'?'linux':'browser_only',status:'pass'};
}
// #117's table, its refusals in their order: an unknown engine, the host setting, the approved engine, Node. An explicit
// engine (or CUA_REPL_HOST=cua) refuses where a default cua engine keeps the vendor host and engine with a warning.
function engineTable({override,engine='unset',engineFrom='env',installed=false,defaultEngine=ORACLE_DEFAULT_ENGINE},availableNode){
 if(!['unset','vendor','cua'].includes(engine))return {error:'invalid_setting',...(engineFrom==='env'?{sentence:INVALID_ENGINE}:{})};
 const selected=engine==='unset'?defaultEngine:engine,explicit=engine!=='unset'||override==='cua';
 if(selected==='vendor')return override==='cua'?{error:'repl_host_refused'}:{host:'vendor',reason:override==='vendor'?'explicit':'macos_native_peer_requires_vendor',engine:'vendor',status:'pass'};
 if(!installed)return explicit?{error:'engine_not_installed'}:{host:'vendor',reason:'engine_not_installed',engine:'vendor',status:'warn'};
 if(override==='vendor')return {host:'vendor',reason:'explicit',engine:'cua',status:'pass'};
 if(!availableNode)return explicit?{error:'repl_host_node'}:{host:'vendor',reason:'own_host_node_unavailable',engine:'vendor',status:'warn'};
 return {host:'cua',reason:override==='cua'?'explicit':'cua_engine',engine:'cua',status:'pass'};
}
export function selectionCases(platform){
 const rows=[];
 for(const registration of ['none','chatgpt','cua','cua-then-chatgpt','chatgpt-then-cua'])for(const maws of [false,true])for(const surfaces of [['browser'],['computer'],['computer','browser']])for(const lane of ['ordinary','profiles'])for(const override of ['unset','cua','vendor','invalid'])rows.push({platform,registration,maws,surfaces,lane,override,node24:true});
 for(const lane of ['ordinary','profiles'])for(const override of ['unset','cua','vendor'])rows.push({platform,registration:'cua',maws:false,surfaces:['browser'],lane,override,node24:false});
 for(const lane of ['ordinary','profiles'])rows.push({platform,registration:'cua',maws:false,surfaces:['browser'],lane,override:'unset',node24:false,managedNode:true});
 // #117: every cell of the engine × host table a live home can reach (the default is the production one), through the
 // ordinary lane, the only one with the computer surface; on Linux the setting is ignored.
 const engineRow=fields=>({platform,registration:'cua',maws:false,surfaces:['computer'],lane:'ordinary',...fields});
 if(platform==='darwin'){
  for(const engine of ['unset','vendor','cua','invalid'])for(const override of ['unset','vendor','cua'])for(const node24 of [true,false])for(const installed of [false,true])rows.push(engineRow({override,node24,engine,installed}));
  for(const [engine,installed] of [['cua',true],['cua',false],['vendor',true]])rows.push(engineRow({override:'unset',node24:true,engine,engineFrom:'settings',installed}));
  rows.push(engineRow({surfaces:['computer','browser'],override:'unset',node24:true,engine:'cua',installed:true}));
 }else for(const engine of ['cua','invalid'])rows.push(engineRow({override:'unset',node24:true,engine,installed:false}));
 return rows;
}
// Doctor reports ordinary and listing independently in one row; the row's lane reads its own sentence. Rows recorded
// before #79 carry a `. Browser route: ...` clause after the ordinary sentence, which is not part of it.
function laneSentence(row,detail){
 const [ordinary,listing]=detail.split('. The profile listing (browser only): ');
 return row.lane==='profiles'?listing?.split('. CUA_REPL_HOST=')[0]:ordinary.split('. Browser route: ')[0];
}
// A doctor selection sentence: `HOST host (REASON)`, then ` on Node PATH` where the own host's Node was resolved, then `: `
// and the explanation. Only this anchored opening is read; the explanation and the other lane never stand in for it.
function doctorSelection(sentence){
 const m=/^(cua|vendor) host \(([a-z0-9_]+)\)(?: on Node (\/.*?))?: /s.exec(sentence??'');
 return m&&{host:m[1],reason:m[2],node:m[3]??null,engine:/; native engine (cua|vendor) \([a-z_]+\): /.exec(sentence)?.[1]??null};
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
 // The engine (#117): doctor names it, and the real call's result attests it (the proxy's cua/nativeEngine); neither
 // names one outside the computer surface on macOS.
 assert.ok(selected.engine===(expected.engine??null),`Doctor engine ${selected.engine} differs from the independent table's ${expected.engine??'none'}: ${JSON.stringify(detail)}`);
 const attested=observation._meta?.['cua/nativeEngine']??null;
 assert.ok((attested?.engine??null)===(expected.engine??null),`Real call attests engine ${JSON.stringify(attested)} where the independent table expects ${expected.engine??'none'}`);
 if(attested)assert.ok(typeof attested.build==='string'&&attested.build.length>0,`Real call's engine attestation names no build: ${JSON.stringify(attested)}`);
 if(row.managedNode&&expected.host==='cua'){
  const actual=assertManagedNode(observation.executionFacts);
  assert.ok(selected.node===actual.path,`Doctor must name the managed Node that actually answered (${actual.path}) in its on-Node clause, not ${selected.node}`);
 }
 const ordinary=expectedSelection({...row,lane:'ordinary'}),listing=expectedSelection({...row,lane:'profiles'});
 const status=ordinary.error||listing.error?'fail':ordinary.status==='warn'||listing.status==='warn'?'warn':'pass';
 assert.equal(doctor.status,status);
}
const describeRow=r=>[r.platform,`registration ${r.registration}`,...(r.maws?['maws']:[]),r.surfaces.join(','),r.lane,`override ${r.override}`,r.node24?'node24':'node22',...(r.managedNode?['managed Node']:[]),
 ...(r.engine?[`engine ${r.engine}${r.engineFrom==='settings'?' (engine.json)':''}`,r.installed?'installed':'not installed']:[])].join(', ');
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
