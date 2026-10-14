import {discoverDesktopEnvironment} from './desktop.mjs';
import {remoteCommand,quote,root,execute,miniPrepareCommand} from '../browser-parity/topology.mjs';
export {root,execute,quote,remoteCommand};
// Obtain only X-session keys, never dump the process environment (which may contain credentials).
export const linuxSession=`if [ "$(uname -s)" = Linux ]; then
 cua_parity_desktop_env=$(node --input-type=module -e ${quote(`import * as fs from 'node:fs';const env=(${discoverDesktopEnvironment.toString()})(fs);for(const [key,value] of Object.entries(env))console.log('export '+key+'='+(${quote.toString()})(value));`)} ) || exit 1
 eval "$cua_parity_desktop_env"
fi`;
export function prepareCommand({device,commit,profile}) {
  if(!['mini','cua-linux'].includes(device))throw new Error('prepare requires a remote device');
  // Reuse clone/fetch/cleanliness/installation policy; readiness below also supports discovery on Linux.
  const base=miniPrepareCommand({device,commit,profile:profile??'discovery'});
  const script=base.args.at(-1),start=script.indexOf('node --input-type=module');
  base.args[base.args.length-1]=script.slice(0,start)+linuxSession+'\n'+`node --input-type=module -e ${quote(`import {execFileSync} from 'node:child_process';import {defaultHome,readPointer} from './src/runtime/layout.mjs';const r=JSON.parse(execFileSync(process.execPath,['bin/cua.mjs','profiles','list','--json'],{encoding:'utf8',env:{...process.env,CUA_SHIM_SECRETS:'off'}}));const ready=r.profiles?.filter(p=>p.ready&&p.extensionInstanceId)??[];const requested=${JSON.stringify(profile??null)};const selected=requested?ready.find(p=>p.key===requested):ready.length===1?ready[0]:null;if(!selected)throw new Error('prepare requires one ready bound profile; candidates: '+ready.map(p=>p.key).join(', '));console.log(JSON.stringify({device:${JSON.stringify(device)},checkout:process.cwd(),commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),node:process.version,platform:process.platform,home:defaultHome(),release:readPointer(defaultHome()),profile:selected.key,extensionInstanceId:selected.extensionInstanceId,display:process.env.DISPLAY??null,xSession:Object.fromEntries(['DISPLAY','XAUTHORITY','DBUS_SESSION_BUS_ADDRESS','XDG_RUNTIME_DIR','XDG_DATA_DIRS'].filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]]))}));`)}`;
  return base;
}
export function cellsCommand({device,checkout,home,host}) {
  if(!['vendor','cua'].includes(host))throw new Error('Invalid host');
  if(device==='local')throw new Error('Local live runtime forbidden: use the double lane');
  return remoteCommand(device,`${linuxSession}\ncd ${quote(checkout)} && exec env CUA_PARITY_REMOTE=1 CUA_HOME=${quote(home)} CUA_REPL_HOST=${quote(host)} node test/repl-parity/serve-cells.mjs`);
}
