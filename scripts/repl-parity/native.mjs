import {randomUUID} from 'node:crypto';
import {remoteCommand,quote,linuxSession,ownNodeEnv,preparedHomeEnv} from './topology.mjs';
import {runRawScenario} from './runner.mjs';
export function nativeCommand({device,checkout,home,host,fixtureMode='blank',...facts}){
 if(device!=='cua-linux'||facts.platform!=='linux'||!['vendor','cua'].includes(host))throw Error('Native parity requires prepared cua-linux');
 if(!['blank','drag','scroll'].includes(fixtureMode))throw Error('Unknown native fixture mode');
 const expectedFacts={device,checkout,home,...facts},nativeFilename=`cua-m4-${randomUUID()}.txt`;
 return {expectedFacts,nativeFilename,closeTimeoutMs:20000,...remoteCommand(device,`${linuxSession}\ncd ${quote(checkout)} && exec env ${ownNodeEnv(facts)}${preparedHomeEnv(facts)}CUA_PARITY_EXPECTED=${quote(JSON.stringify(expectedFacts))} CUA_PARITY_REMOTE=1 CUA_PARITY_NATIVE_FILENAME=${quote(nativeFilename)} CUA_PARITY_NATIVE_MODE=${quote(fixtureMode)} CUA_HOME=${quote(home)} CUA_REPL_HOST=${quote(host)} node test/repl-parity/serve-native.mjs`)};
}
export const nativeSetup=`globalThis.nativeFilename="@@NATIVE_FILENAME@@";globalThis.nativeSay=v=>nodeRepl.write('NATIVE:'+JSON.stringify(v));
var nativeEnd=Date.now()+20000;var nativeWindow;
while(!nativeWindow&&Date.now()<nativeEnd){nativeWindow=(await cua.listWindows({emit:false})).find(w=>w.title?.includes(nativeFilename));if(!nativeWindow)await new Promise(r=>setTimeout(r,100));}
if(!nativeWindow)throw Error('Harness-owned gedit did not appear');
globalThis.app=await cua.getApp({windowId:nativeWindow.id});
globalThis.nativeAX=()=>app.getAXState({emit:false});
globalThis.nativeCheck=async expected=>{let end=Date.now()+10000;do{if((await nativeAX()).includes(expected))return true;}while(Date.now()<end);return false;};
nodeRepl.write('NATIVE_READY');`;
export async function runNativeScenario(scenario,{pool,prepared,host,emit}){
 const command=nativeCommand({...prepared,host,fixtureMode:scenario.fixtureMode}),client=await pool.open(command);
 client.setElicitationAnswer(async()=>({action:'decline'}));
 try{
  const ready=await client.call('js',{code:nativeSetup.replaceAll('@@NATIVE_FILENAME@@',command.nativeFilename),title:'Bind harness-owned gedit',timeout_ms:60000});
  if(ready.isError||!ready.content?.some(c=>c.text?.endsWith('NATIVE_READY')))throw Error('Native setup failed: '+ready.content?.filter(c=>c.type==='text').map(c=>c.text).join('\n'));
  return await runRawScenario(scenario,{client,emit,checkout:prepared.checkout,reset:false});
 }finally{await client.call('end_task');const status=await client.close();if(status.code!==0)throw Error('Native cleanup failed');}
}
