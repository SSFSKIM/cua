import {remoteCommand,quote} from '../browser-parity/topology.mjs';
import {linuxSession,ownNodeEnv,preparedHomeEnv} from './topology.mjs';
import {isDeclaredDevice} from './devices.mjs';
// All live fixtures execute in the prepared remote clone; local tests cannot launch the installed runtime.
export function apiCommand({device,checkout,home,host,...facts},{lane='chrome'}={}) {
 if(!isDeclaredDevice(device)||!['vendor','cua'].includes(host))throw new Error('API parity requires a remote selected host');
 const file={chrome:'serve-production.mjs',profiles:'serve-profiles.mjs','binder-double':'serve-binder.mjs','capability-boundary':'serve-capability-api.mjs'}[lane];
 if(!file)throw new Error('Unknown API lane');
 const expectedFacts={device,checkout,home,...facts};
 return {expectedFacts,closeTimeoutMs:15000,...remoteCommand(device,`${linuxSession}\ncd ${quote(checkout)} && exec env ${ownNodeEnv(facts)}${preparedHomeEnv(facts)}CUA_PARITY_EXPECTED=${quote(JSON.stringify(expectedFacts))} CUA_PARITY_REMOTE=1 CUA_HOME=${quote(home)} CUA_REPL_HOST=${quote(host)} CUA_BROWSER_SERVICE=cua CUA_SHIM_SURFACES=browser CUA_SHIM_SECRETS=off node test/repl-parity/${file}`)};
}
// Preserve the M0/M2 metadata vocabulary for their committed controls; M3 names its distinct lanes explicitly.
export function evidenceBackend(scenarios){
 if(scenarios.some(s=>['chrome','binder-double','capability-host','native'].includes(s.backend)))return [...new Set(scenarios.map(s=>s.backend))].sort().join('+');
 return scenarios.some(s=>s.backend==='fixture-services')?(scenarios.every(s=>s.backend==='fixture-services')?'fixture-services':'no-services+fixture-services'):'no-services';
}
