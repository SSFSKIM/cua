import {randomUUID} from 'node:crypto';
import {remoteCommand,quote,linuxSession,ownNodeEnv,preparedHomeEnv} from './topology.mjs';
import {runRawScenario} from './runner.mjs';
import {declaredDevice} from './devices.mjs';
import {serveCommand} from '../native-baseline/remote.mjs';
import {assertEngineOptions} from '../native-baseline/engine.mjs';
import {pinnedApprovals} from '../accept/lib.mjs';
// The native lane runs on the declared Linux device it was prepared on (cua-gce, or the paused cua-linux VM).
export function nativeCommand({device,checkout,home,host,fixtureMode='blank',...facts}){
 if(declaredDevice(device).platform!=='linux'||facts.platform!=='linux'||!['vendor','cua'].includes(host))throw Error('Native parity requires a prepared declared Linux device');
 if(!['blank','drag','scroll'].includes(fixtureMode))throw Error('Unknown native fixture mode');
 const expectedFacts={device,checkout,home,...facts},nativeFilename=`cua-m4-${randomUUID()}.txt`;
 return {expectedFacts,nativeFilename,closeTimeoutMs:20000,...remoteCommand(device,`${linuxSession}\ncd ${quote(checkout)} && exec env ${ownNodeEnv(facts)}${preparedHomeEnv(facts)}CUA_PARITY_EXPECTED=${quote(JSON.stringify(expectedFacts))} CUA_PARITY_REMOTE=1 CUA_PARITY_NATIVE_FILENAME=${quote(nativeFilename)} CUA_PARITY_NATIVE_MODE=${quote(fixtureMode)} CUA_HOME=${quote(home)} CUA_REPL_HOST=${quote(host)} node test/repl-parity/serve-native.mjs`)};
}
// The harness-owned gedit window, found by its unique file name, reports its app before anything is bound: the lane
// accepts exactly that app's approval (Linux approvals, src/services/engine/policy.mjs) and declines everything else.
export const nativeFind=`globalThis.nativeFilename="@@NATIVE_FILENAME@@";globalThis.nativeSay=v=>nodeRepl.write('NATIVE:'+JSON.stringify(v));
var nativeEnd=Date.now()+20000;var nativeWindow;
while(!nativeWindow&&Date.now()<nativeEnd){nativeWindow=(await cua.listWindows({emit:false})).find(w=>w.title?.includes(nativeFilename));if(!nativeWindow)await new Promise(r=>setTimeout(r,100));}
if(!nativeWindow)throw Error('Harness-owned gedit did not appear');
globalThis.nativeWindow=nativeWindow;nodeRepl.write('NATIVE_WINDOW:'+JSON.stringify({app:nativeWindow.app}));`;
export const nativeBind=`globalThis.app=await cua.getApp({windowId:nativeWindow.id});
globalThis.nativeAX=()=>app.getAXState({emit:false});
globalThis.nativeCheck=async expected=>{let end=Date.now()+10000;do{if((await nativeAX()).includes(expected))return true;}while(Date.now()<end);return false;};
nodeRepl.write('NATIVE_READY');`;
const cellText=result=>result.content?.filter(c=>c.type==='text').map(c=>c.text).join('\n')??'';
// -> the owned window's app from nativeFind's result; throws unless it names one.
export function nativeWindowApp(result){
 const line=cellText(result).split('\n').find(t=>t.startsWith('NATIVE_WINDOW:'));
 const app=!result.isError&&line?JSON.parse(line.slice(14)).app:null;
 if(typeof app!=='string'||!app)throw Error('Native setup failed: '+cellText(result));
 return app;
}
export async function runNativeScenario(scenario,{pool,prepared,host,emit}){
 const command=nativeCommand({...prepared,host,fixtureMode:scenario.fixtureMode}),client=await pool.open(command);
 const pinned=new Set();
 client.setElicitationAnswer(pinnedApprovals(()=>pinned));
 try{
  const found=await client.call('js',{code:nativeFind.replaceAll('@@NATIVE_FILENAME@@',command.nativeFilename),title:'Find harness-owned gedit',timeout_ms:60000});
  pinned.add(nativeWindowApp(found));
  const ready=await client.call('js',{code:nativeBind,title:'Bind harness-owned gedit',timeout_ms:60000});
  if(ready.isError||!ready.content?.some(c=>c.text?.endsWith('NATIVE_READY')))throw Error('Native setup failed: '+cellText(ready));
  return await runRawScenario(scenario,{client,emit,checkout:prepared.checkout,reset:false});
 }finally{await client.call('end_task');const status=await client.close();if(status.code!==0)throw Error('Native cleanup failed');}
}
// The darwin native command (#117's native-mac suite, ./native-mac.mjs): the native baseline's serve of the harness
// checkout on the approved home prepare.mjs admitted (its token presented, HOME the account's, so the serve's selection
// finds the approved engine), the computer surface alone, the REPL host and the native engine each named, never left to
// a default or to the account's ~/.config/cua/engine.json (CUA_NATIVE_ENGINE, the Decision Log's whole-M1b rule).
export function nativeMacCommand({device,host,engine,approvedEngine,pre,prepared}){
 if(declaredDevice(device).platform!=='darwin')throw Error('The macOS native lane runs on a declared macOS device');
 assertEngineOptions({platform:'darwin',surface:'computer',host,engine,approvedEngine});
 if(!prepared?.runtimeReuse||!prepared.admission)throw Error('The macOS native lane serves the approved runtime in place: its preparation is the approved home scripts/native-baseline/prepare.mjs admitted');
 return serveCommand({device,checkout:pre.checkout,home:pre.home,userHome:prepared.userHome,configHome:prepared.configHome,tmpdir:prepared.tmpdir,admission:prepared.admission,xSession:{},host,engine,platform:'darwin',surface:'computer'});
}
