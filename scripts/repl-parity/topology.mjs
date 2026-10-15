import {discoverDesktopEnvironment} from './desktop.mjs';
import {remoteCommand,quote,root,execute,miniPrepareCommand} from '../browser-parity/topology.mjs';
export {root,execute,quote,remoteCommand};
// The prefix of every scratch path the device side creates under its TMPDIR, so a run cleans up and audits only its
// own: CUA_PARITY_SCRATCH_PREFIX in the harness's environment (a run's label, such as cua-m4t3-), else M4 task 1's.
export function parityScratchPrefix(env){
 const prefix=env.CUA_PARITY_SCRATCH_PREFIX??'cua-m4t1-';
 if(!/^cua-[a-z0-9]+(-[a-z0-9]+)*-$/.test(prefix))throw new Error(`Invalid parity scratch prefix ${JSON.stringify(prefix)}: lower-case cua-<label>- only`);
 return prefix;
}
// Obtain only X-session keys, never dump the process environment (which may contain credentials).
export const linuxSession=`if [ "$(uname -s)" = Linux ]; then
 cua_parity_desktop_env=$(node --input-type=module -e ${quote(`import * as fs from 'node:fs';const env=(${discoverDesktopEnvironment.toString()})(fs);for(const [key,value] of Object.entries(env))console.log('export '+key+'='+(${quote.toString()})(value));`)} ) || exit 1
 eval "$cua_parity_desktop_env"
 export CUA_PARITY_SCRATCH_PREFIX=${parityScratchPrefix(process.env)}
fi`;
// The device's own-host Node, passed in the harness's remote command environment (never a shell profile): the path
// `prepare --node` named and recorded (facts.ownNode), or nothing, leaving the device's PATH to resolve it.
export const ownNodeEnv=facts=>(facts?.ownNode?.path?`CUA_NODE=${quote(facts.ownNode.path)} `:'')+(facts?.chromeLaunch?'CUA_PARITY_CAPTURE_CHROME=1 ':'');
export function prepareCommand({device,commit,profile,node,home=device==='cua-linux'?'/home/admin/.local/share/cua-h4':undefined}) {
  if(!['mini','cua-linux'].includes(device))throw new Error('prepare requires a remote device');
  if(home!==undefined&&!/^\/[^\0\n]*$/.test(home))throw new Error('prepare --home needs an absolute path');
  if(node!==undefined&&!/^\/[^\0\n]*$/.test(node))throw new Error('prepare --node needs the absolute path of the device\'s Node');
  // Reuse clone/fetch/cleanliness/installation policy; readiness below also supports discovery on Linux.
  const base=miniPrepareCommand({device,commit,profile:profile??'discovery'});
  const script=base.args.at(-1),start=script.indexOf('node --input-type=module');
  base.args[base.args.length-1]=script.slice(0,start)+linuxSession+'\n'+(home?`export CUA_HOME=${quote(home)}\n`:'')+(device==='cua-linux'?'export CUA_PARITY_CAPTURE_CHROME=1\n':'')+(node?`export CUA_NODE=${quote(node)}\n`:'')+`node --input-type=module -e ${quote(`import {execFileSync} from 'node:child_process';import {defaultHome,readPointer} from './src/runtime/layout.mjs';import {executionFacts} from './scripts/repl-parity/provenance.mjs';const r=JSON.parse(execFileSync(process.execPath,['bin/cua.mjs','profiles','list','--json'],{encoding:'utf8',env:{...process.env,CUA_SHIM_SECRETS:'off',CUA_SHIM_SURFACES:'browser',CUA_REPL_HOST:'vendor',CUA_BROWSER_SERVICE:'cua'}}));const ready=r.profiles?.filter(p=>p.ready&&p.extensionInstanceId)??[];const requested=${JSON.stringify(profile??null)};const selected=requested?ready.find(p=>p.key===requested):ready.length===1?ready[0]:null;if(!selected)throw new Error('prepare requires one ready bound profile; candidates: '+ready.map(p=>p.key).join(', '));console.log(JSON.stringify({...executionFacts({source:defaultHome()}),device:${JSON.stringify(device)},checkout:process.cwd(),commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),node:process.version,platform:process.platform,home:defaultHome(),release:readPointer(defaultHome()),profile:selected.key,chromeProfileDirectory:selected.chromeProfileDirectory??null,extensionInstanceId:selected.extensionInstanceId,display:process.env.DISPLAY??null,xSession:Object.fromEntries(['DISPLAY','XAUTHORITY','DBUS_SESSION_BUS_ADDRESS','XDG_RUNTIME_DIR','XDG_DATA_DIRS'].filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]]))}));`)}`;
  return base;
}
export function cellsCommand({device,checkout,home,host,fixtureServices=false,fixtureCase='',...facts}) {
  if(!['vendor','cua'].includes(host))throw new Error('Invalid host');
  if(device==='local')throw new Error('Local live runtime forbidden: use the double lane');
  const expectedFacts={device,checkout,home,...facts};
  return {closeTimeoutMs:15000,...remoteCommand(device,`${linuxSession}\ncd ${quote(checkout)} && exec env ${ownNodeEnv(facts)}CUA_PARITY_EXPECTED=${quote(JSON.stringify(expectedFacts))} CUA_PARITY_REMOTE=1 CUA_PARITY_FIXTURE_CASE=${quote(fixtureCase)} CUA_PARITY_FIXTURE_SERVICES=${fixtureServices?'1':'0'} CUA_HOME=${quote(home)} CUA_REPL_HOST=${quote(host)} node test/repl-parity/serve-cells.mjs`),expectedFacts};
}
