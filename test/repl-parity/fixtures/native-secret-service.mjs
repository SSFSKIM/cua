// Real selected Linux facade, trusted worker, production Sky wrapper and scratch fileStore. Only the downstream
// Sky service is a recorder double; it never loads sky_linux or puts the synthetic secret into a real window. The
// wrapper's Linux approvals go through the worker's real createElicitation (the harness answers the fixture window's
// app only); the oracle counts them, keyed by the window's app, and the double answers the policy's window lookup.
import {mkdir,mkdtemp,realpath,chmod,writeFile} from 'node:fs/promises';
import {join,basename,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {createSkyService} from '../../../src/services/sky.mjs';
import {fileStore} from '../../../src/secrets/store.mjs';
import {errorIsSafe} from './live-secret-service.mjs';
import {nativeSecretCases,LABEL,REFERENCE,WINDOW} from './native-secret-cases.mjs';
// The scratch HOME a native lane made: <TMPDIR>/<parity scratch prefix>cap-XXXXXX/run/<id>/home, where the prefix is
// scripts/repl-parity/topology.mjs parityScratchPrefix's grammar (cua-, or a run's cua-<label>-).
// `nodeRepl` is the worker's (the approvals' route); a test outside the worker passes its own.
// Every request that passes the wrapper's own refusals is approved first, the store read after: none of a row refused
// before its read, each of every other's, all for the fixture window's app. `approvals` lists the apps the wrapper asked.
export const approvalsMatch=(row,approvals)=>approvals.length===(row.error&&row.reads===0?0:row.requests.length)&&approvals.every(app=>app===WINDOW.app);
export async function createNativeSecretOracle(home,{nodeRepl=globalThis.nodeRepl}={}){
 if(!/^cua-(?:[a-z0-9]+-)*cap-/.test(basename(dirname(dirname(dirname(home)))))||basename(home)!=='home'||basename(dirname(dirname(home)))!=='run'||await realpath(home)!==home)throw Error('Native secret fixture requires its canonical scratch HOME');
 const value='synthetic-'+randomUUID(),root=await mkdtemp(join(home,'native-secret-'));let row,wrapped,reads=[],inputs=[],outputs=[],approvals=[],safe=true;
 const counted={get requestMeta(){return nodeRepl?.requestMeta;},createElicitation:request=>{approvals.push(request?.meta?.tool_params?.app??null);return nodeRepl.createElicitation(request);}};
 async function configure(id){
  row=nativeSecretCases.find(r=>r.id===id);if(!row)throw Error('Unknown native secret case');reads=[];inputs=[];outputs=[];approvals=[];safe=true;
  const dir=await mkdtemp(join(root,'case-'));let store=fileStore({dir});
  if(row.store!=='unknown-label')await store.write(LABEL,value);
  if(row.store==='unsafe-store')await chmod(join(dir,LABEL),0o644);
  if(row.store==='unreadable-store'){const blocked=join(dir,'file');await writeFile(blocked,'fixture',{mode:0o600});store=fileStore({dir:join(blocked,'store')});}
  wrapped=createSkyService({platform:'linux',nodeRepl:counted,loadVendor:async()=>({handleRpc:backend}),secretsUnavailable:row.unavailable,secrets:{read:async label=>{reads.push(label);return store.read(label);}}});
  return {ready:true};
 }
 async function backend(request){
  if(request.type==='execute'&&request.method==='list_windows')return [WINDOW];
  const expected=row.requests[outputs.length],copy=structuredClone(request);let substituted=false;
  if(row.substitute){substituted=copy.args[0].text===value;copy.args[0].text=REFERENCE;}
  outputs.push(isDeepStrictEqual(copy,expected)&&(!row.substitute||substituted));
  if(row.error==='secret_input_failed'){const e=new Error(value,{cause:new Error(value)});e.extra=value;throw e;}return null;
 }
 return {async handleRpc(request){
  if(request.type==='secret.configure')return configure(request.id);
  if(request.type==='secret.observe'){
   // The approvals are folded into requestMatches, not reported as a key of their own: the printed report is compared
   // with the vendor control's text (the parity diff), which predates Linux approvals (#117 M3), so a new key would be a
   // difference in every case. A wrong approval still fails the case: requestMatches turns false.
   const error=request.outcome,expectedBackend=row.error&&!row.substitute?0:row.requests.length;
   return {requestMatches:inputs.length===row.requests.length&&inputs.every(Boolean)&&approvalsMatch(row,approvals),readMatches:reads.length===row.reads&&reads.every(l=>l===LABEL),readLabels:reads,backendMatches:outputs.length===expectedBackend&&outputs.every(Boolean),backendCalled:outputs.length>0,resultMatches:error.rejected===!!row.error&&(!row.error||error.message?.includes(`[${row.error}]`)),errorSafe:safe&&errorIsSafe(error,value),labelReportMatches:row.error!=='secret_input_failed'||error.message.includes(LABEL),messageOnly:!row.error||error.messageOnly===true};
  }
  if(request.type==='setup')return {target:'linux',methods:['list_windows','get_window_state','type_text','press_key']};
  if(request.type==='execute'&&request.method==='list_windows')return [WINDOW];
  if(request.type==='execute'&&request.method==='get_window_state')return {window:WINDOW,ax_tree_source:'at_spi',ax_tree:{id:'0',role:'text',name:'Fixture',children:[]},screenshots:[]};
  if(!row)throw Error('Native secret fixture must be configured');
  inputs.push(isDeepStrictEqual(request,row.requests[inputs.length]));
  try{return await wrapped.handleRpc(request);}catch(error){if(!errorIsSafe(error,value)){safe=false;throw Error('Native secret oracle withheld unsafe error');}throw error;}
 }};
}
let service;
export async function handleRpc(request){
 if(nodeRepl.env.PARITY_NATIVE_SECRET_FIXTURE!=='1')throw Error('Native secret fixture is remote only');
 service??=await createNativeSecretOracle(nodeRepl.env.HOME);return service.handleRpc(request);
}
