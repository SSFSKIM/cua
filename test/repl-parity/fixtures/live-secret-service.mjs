// Service-boundary double: the actual selected browser client calls the unchanged production secret wrapper,
// then this recorder. This is not an AX/browser-service implementation and never contacts Chrome.
// Setup manifest/selection replies reuse the source-grounded capability fixture (BC:10061-10212).
import {chmod,lstat,mkdir,mkdtemp,realpath,writeFile} from 'node:fs/promises';
import {basename,dirname,join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {createBrowserService,serviceSelection} from '../../../src/services/browser.mjs';
import {fileStore} from '../../../src/secrets/store.mjs';
import {createCapabilityOracleService} from '../../browser-parity/capability-api-fixture.mjs';
import {liveSecretCases,LIVE_SECRET_LABEL,LIVE_SECRET_REFERENCE} from './live-secret-cases.mjs';
const proof='service-boundary-double';
const clean=value=>JSON.parse(JSON.stringify(value));
// Only fixture-created homes UNDER the existing writable run root qualify. The capability root's sibling home
// is intentionally read-only under scoped policy. Realpath checks reject symlink aliases.
export async function assertScratchHome({userHome,capabilityHome,runDirectory}){
 if(typeof userHome!=='string'||typeof capabilityHome!=='string'||typeof runDirectory!=='string'||resolve(userHome)!==join(resolve(runDirectory),'home')||dirname(resolve(runDirectory))!==join(resolve(capabilityHome),'run')||!/^[A-Za-z0-9-]{1,128}$/.test(basename(runDirectory))||!/^cua-cap-/.test(basename(capabilityHome)))throw Error('Live secrets require the capability run-directory scratch HOME');
 const root=await realpath(capabilityHome),home=await realpath(userHome);
 if(await realpath(runDirectory)!==resolve(runDirectory))throw Error('Live secrets require a canonical scratch run directory');
 if(root!==resolve(capabilityHome)||home!==resolve(userHome)||![await realpath('/tmp'),await realpath(tmpdir())].includes(dirname(root))||!(await lstat(home)).isDirectory())throw Error('Live secrets require a real capability scratch HOME');
 return home;
}
// This returns one boolean, never a cleaned copy that might retain an unanticipated value-bearing property.
export function errorIsSafe(error,value){
 const parts=[error?.message,error?.stack,String(error?.cause),JSON.stringify(error)];
 return !parts.some(part=>typeof part==='string'&&part.includes(value));
}
const markerField=request=>request.params.type==='playwright_locator_fill'?['params','value']:['params','action',request.params.action?.kind==='set_value'?'value':'text'];
function replaceField(request,value){const copy=clean(request),path=markerField(copy);let target=copy;for(const k of path.slice(0,-1))target=target[k];const old=target[path.at(-1)];target[path.at(-1)]=value;return {copy,old};}
export async function createLiveSecretOracle(dirs){
 const home=await assertScratchHome(dirs);
 // Unique scratch-only store per trusted service, no fallback to connection/global/project stores.
 const config=join(home,'.config');await mkdir(config,{recursive:true,mode:0o700});
 if(await realpath(config)!==config)throw Error('Live secrets scratch config must not be a symlink');
 const storeRoot=await mkdtemp(join(config,'live-secret-'));
 const privateValue=`synthetic-${randomUUID()}`;
 const boot=createCapabilityOracleService({handleRpc:async()=>{throw Error('Live secret fixture cannot delegate to a live backend');}});
 await boot.handleRpc({method:'oracle.configure',params:{mode:'boundary-double'}});
 // The production selection reads src/browser-service/VERSION; no installed runtime or native helper is loaded.
 const selected=serviceSelection({CUA_BROWSER_SERVICE:'cua'});
 let current=null,wrapped=null,reads=[],inputs=[],outputs=[],substitutions=[],wrapperErrorSafe=true;
 async function configure(id){
  const row=liveSecretCases.find(c=>c.id===id);if(!row)throw Error('Unknown live secret case');
  current=row;reads=[];inputs=[];outputs=[];substitutions=[];wrapperErrorSafe=true;
  const dir=await mkdtemp(join(storeRoot,'case-'));let store=fileStore({dir});
  if(row.store!=='unknown-label')await store.write(LIVE_SECRET_LABEL,privateValue);
  if(row.store==='unsafe-store')await chmod(join(dir,LIVE_SECRET_LABEL),0o644);
  if(row.store==='unreadable-store'){
   // ENOTDIR is deterministic on macOS/Linux, even as root. No chmod-based permission assumption.
   const blocked=join(dir,'not-a-directory');await writeFile(blocked,'fixture',{mode:0o600});store=fileStore({dir:join(blocked,'store')});
  }
  wrapped=createBrowserService({loadService:async()=>({handleRpc:backend}),actualServiceVersion:row.versionMismatch?async()=>'0.0.0':selected.actualServiceVersion,expectedVersion:selected.expectedVersion,serviceName:selected.name,
   secretsUnavailable:row.unavailable,secrets:{read:async label=>{reads.push(label);return store.read(label);}}});
  return {ready:true,boundaryProof:proof};
 }
 const isTarget=request=>current?.requests.some(r=>r.params.type===request.params?.type);
 async function backend(request){
  if(isTarget(request)){
   const expected=current.requests[outputs.length];let normalized=request,substituted=false;
   if(current.substitute){const replaced=replaceField(request,LIVE_SECRET_REFERENCE);normalized=replaced.copy;substituted=replaced.old===privateValue;}
   outputs.push(!!expected&&isDeepStrictEqual(clean(normalized),expected)&&(!current.substitute||substituted));substitutions.push(substituted);
   if(current.error==='secret_input_failed'){
    if(current.tail==='errors/recovery-envelope-sanitized')return {ok:false,error:{reason:'protected_command_failed',echo:privateValue}};
    const error=new Error(privateValue,{cause:new Error(privateValue)});error.echo=privateValue;throw error;
   }
   const value=request.params.type==='playwright_evaluate'?{value:true}:{};
   return request.method==='executeWithRecovery'?{ok:true,value}:value;
  }
  // BC:7216-7249 locator.actionError's diagnostic evaluate; never save its script or echo input.
  if(request.params?.type==='playwright_evaluate'){
   const value={value:{matchCount:1,visibleCount:1,matches:[]}};
   return request.method==='executeWithRecovery'?{ok:true,value}:value;
  }
  if(request.params?.type==='playwright_dom_snapshot')return request.method==='executeWithRecovery'?{ok:true,value:{dom_snapshot:'Fixture input'}}:{dom_snapshot:'Fixture input'};
  if(!['get_browser','get_default_browser','create_tab','get_tab','get_documentation'].includes(request.params?.type))throw Error('Unscripted live secret fixture command');
  return boot.handleRpc(request);
 }
 function observe(error={}){
  if(!current)throw Error('Live secret case not configured');
  const expectedBackend=current.error&&!current.substitute?0:current.requests.length;
  const postRead=current.error==='secret_input_failed';
  return {boundaryProof:proof,requestMatches:inputs.length===current.requests.length&&inputs.every(Boolean),
   readMatches:reads.length===current.reads&&reads.every(label=>label===LIVE_SECRET_LABEL),readLabels:[...reads],
   backendMatches:outputs.length===expectedBackend&&outputs.every(Boolean),backendCalled:outputs.length>0,
   substituted:substitutions.length>0&&substitutions.every(Boolean),
   resultMatches:error.rejected===!!current.error&&(!current.error||typeof error.message==='string'&&error.message.includes(`[${current.error}]`)),
   errorSafe:wrapperErrorSafe&&errorIsSafe(error,privateValue),
   labelReportMatches:!postRead||typeof error.message==='string'&&error.message.includes(LIVE_SECRET_LABEL),
   messageOnly:!current.error||error.messageOnly===true};
 }
 return {async handleRpc(request){
  if(request.method==='secret.configure')return configure(request.params?.id);
  if(request.method==='secret.observe')return observe(request.params);
  if(request.method==='setup'){
   const setup=await boot.handleRpc(request);
   return {...setup,...(current?.method==='executeWithRecovery'?{credentialRecoveryErrorVersion:1}:{})};
  }
  if(!['execute','executeWithRecovery'].includes(request.method))throw Error('Unknown live secret fixture method');
  if(!current)return backend(request);
  if(isTarget(request))inputs.push(isDeepStrictEqual(clean(request),current.requests[inputs.length]));
  try{return await wrapped.handleRpc(request);}catch(error){
   // Do not let a broken wrapper leak through raw MCP recording. This fail-closed guard records the failure bit;
   // the normal path rethrows the REAL sanitized error through the actual trusted worker's message-only boundary.
   if(!errorIsSafe(error,privateValue)){wrapperErrorSafe=false;throw Error('Live secret fixture withheld an unsafe wrapper error');}
   throw error;
  }
 }};
}
let service;
export async function handleRpc(request){
 if(!service){
  const env=globalThis.nodeRepl?.env;
  if(env?.PARITY_LIVE_SECRET_REMOTE!=='1')throw Error('Live secret fixture is remote-only');
  service=await createLiveSecretOracle({userHome:env.PARITY_LIVE_SECRET_HOME,capabilityHome:env.PARITY_LIVE_SECRET_CAPABILITY_HOME,runDirectory:env.PARITY_LIVE_SECRET_RUN_DIRECTORY});
 }
 return service.handleRpc(request);
}
