import {declaredDevice} from './devices.mjs';
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
// The X display whose session the device side takes: CUA_PARITY_DISPLAY in the harness's environment, a private display
// the run started (#171 M4, T18: the suites run on one, beside the person's `:0`), else none named, and the device takes
// the first session it finds (./desktop.mjs). Never `:0`, which is the person's.
export function parityDisplay(env){
 const display=env.CUA_PARITY_DISPLAY;
 if(display===undefined)return undefined;
 if(!/^:\d+$/.test(display)||display===':0')throw new Error(`Invalid CUA_PARITY_DISPLAY ${JSON.stringify(display)}: a private display's :<number>, never :0`);
 return display;
}
// Obtain only X-session keys, never dump the process environment (which may contain credentials).
export const linuxSessionFor=env=>`if [ "$(uname -s)" = Linux ]; then
 cua_parity_desktop_env=$(node --input-type=module -e ${quote(`import * as fs from 'node:fs';const env=(${discoverDesktopEnvironment.toString()})(fs,${JSON.stringify(parityDisplay(env)===undefined?{}:{display:parityDisplay(env)})});for(const [key,value] of Object.entries(env))console.log('export '+key+'='+(${quote.toString()})(value));`)} ) || exit 1
 eval "$cua_parity_desktop_env"
 export CUA_PARITY_SCRATCH_PREFIX=${parityScratchPrefix(env)}
fi`;
export const linuxSession=linuxSessionFor(process.env);
// A resolved Node is an observation, never an override. Clear ambient CUA_NODE; only prepare --node diagnostics
// explicitly reintroduce it. This string is env options followed by assignments, so it precedes other assignments.
// Every lane's serve also keeps its runtime warm (CUA_RUNTIME_IDLE_MS=0, on both hosts): a run paused for CI (MAWS DL 58,
// scripts/mini-pause.mjs) can hold a cell past the 15-minute idle stop, and a stopped runtime restarts for the next call
// with a restart notice in its output and its REPL state gone, a difference the pause made, not either host (#157).
export const WARM_RUNTIME_ENV='CUA_RUNTIME_IDLE_MS=0 ';
export const ownNodeEnv=facts=>'-u CUA_NODE -u CUA_PARITY_NODE_MODE '+WARM_RUNTIME_ENV+(['managed','diagnostic-override'].includes(facts?.nodeMode)?`CUA_PARITY_NODE_MODE=${quote(facts.nodeMode)} `:'')+(facts?.nodeOverride?`CUA_NODE=${quote(facts.nodeOverride)} `:'')+(facts?.chromeLaunch?'CUA_PARITY_CAPTURE_CHROME=1 ':'');
export const preparedHomeEnv=facts=>facts?.userHome?`HOME=${quote(facts.userHome)} CHROME_CONFIG_HOME=${quote(facts.userHome+'/.config')} XDG_CONFIG_HOME=${quote(facts.userHome+'/.config')} `:'';
// `nativeOnly`: a preparation for the native suite alone, which binds no Chrome profile (./prepare-device.mjs).
export function prepareCommand({device,commit,profile,node,nativeOnly=false,home=nativeOnly?undefined:declaredDevice(device).discoveryHome}) {
  const declaration=declaredDevice(device);
  if(nativeOnly&&(profile!==undefined||declaration.platform!=='linux'))throw new Error('a native-only preparation is of a Linux device and names no profile');
  if(home!==undefined&&!/^\/[^\0\n]*$/.test(home))throw new Error('prepare --home needs an absolute path');
  if(node!==undefined&&!/^\/[^\0\n]*$/.test(node))throw new Error('prepare --node needs the absolute path of the device\'s Node');
  // Keep the clone/fetch/cleanliness discipline, replacing only its inline readiness with fresh owned preparation.
  const base=miniPrepareCommand({device,commit,profile:profile??'discovery'});
  const script=base.args.at(-1),start=script.indexOf('node --input-type=module');
  const options=['--device',device,...(profile?['--profile',profile]:[]),...(home?['--home',home]:[]),...(node?['--node',node]:[]),...(nativeOnly?['--native-only']:[])];
  base.args[base.args.length-1]=script.slice(0,start)+linuxSession+'\nunset CUA_NODE CUA_PARITY_NODE_MODE\n'+(declaration.captureChrome?'export CUA_PARITY_CAPTURE_CHROME=1\n':'')+`CUA_PARITY_REMOTE=1 node scripts/repl-parity/prepare-device.mjs prepare ${options.map(quote).join(' ')}`;
  return base;
}
export function cellsCommand({device,checkout,home,host,fixtureServices=false,fixtureCase='',...facts}) {
  if(!['vendor','cua'].includes(host))throw new Error('Invalid host');
  if(device==='local')throw new Error('Local live runtime forbidden: use the double lane');
  const expectedFacts={device,checkout,home,...facts};
  return {closeTimeoutMs:15000,...remoteCommand(device,`${linuxSession}\ncd ${quote(checkout)} && exec env ${ownNodeEnv(facts)}${preparedHomeEnv(facts)}CUA_PARITY_EXPECTED=${quote(JSON.stringify(expectedFacts))} CUA_PARITY_REMOTE=1 CUA_PARITY_FIXTURE_CASE=${quote(fixtureCase)} CUA_PARITY_FIXTURE_SERVICES=${fixtureServices?'1':'0'} CUA_HOME=${quote(home)} CUA_REPL_HOST=${quote(host)} node test/repl-parity/serve-cells.mjs`),expectedFacts};
}

// Native preparation needs no Chrome profile or H4 registration, just the clean pinned clone.
export function nativePrepareCommand({device,commit}) {
  declaredDevice(device);
  const base=miniPrepareCommand({device,commit,profile:'native-only'});
  const script=base.args.at(-1);
  base.args[base.args.length-1]=script.slice(0,script.indexOf('node --input-type=module'))+'git rev-parse HEAD';
  return base;
}
