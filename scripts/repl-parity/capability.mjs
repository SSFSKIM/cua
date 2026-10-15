import {remoteCommand,quote} from '../browser-parity/topology.mjs';
import {ownedJsonProcess} from '../browser-parity/resources.mjs';
import {assertPreparedFacts} from './provenance.mjs';
import {linuxSession,ownNodeEnv} from './topology.mjs';
// The client's environment is cleared (env -i); the own host's Node prepare recorded is passed explicitly (ownNodeEnv),
// so it can launch where the proxy's and PATH's Node are older than its floor (src/runtime/launch.mjs).
export function capabilityFixtureCommand({device,checkout,home,api=false,...facts}) {
 if(!['mini','cua-linux'].includes(device))throw new Error('Capability live host must run on the remote device; local unit tests use doubles');
 return remoteCommand(device,`${linuxSession}\ncd ${quote(checkout)} && exec env ${ownNodeEnv(facts)}CUA_PARITY_EXPECTED=${quote(JSON.stringify({device,checkout,home,...facts}))} CUA_PARITY_REMOTE=1 CUA_PARITY_API=${api?'1':'0'} CUA_HOME=${quote(home)} node test/repl-parity/serve-capability.mjs`);
}
export async function remoteCapabilityLane({device,checkout,home,host,api=false,...facts},{start=ownedJsonProcess}={}) {
 if(!['vendor','cua'].includes(host))throw new Error('Invalid host');
 const expectedFacts={device,checkout,home,...facts};
 const fixture=await start(capabilityFixtureCommand({...expectedFacts,api}));
 try {
  assertPreparedFacts(expectedFacts,fixture.executionFacts);
  return {...fixture,command:{expectedFacts,...remoteCommand(device,`${linuxSession}\ncd ${quote(checkout)} && exec env -i PATH="$PATH" ${ownNodeEnv(facts)}HOME=${quote(fixture.userHome)} CUA_PARITY_REMOTE=1 CUA_PARITY_API=${api?'1':'0'} CUA_PARITY_EXPECTED=${quote(JSON.stringify(expectedFacts))} CUA_PARITY_SOURCE_HOME=${quote(home)} CUA_HOME=${quote(fixture.home)} CUA_REPL_HOST=${quote(host)} CUA_BROWSER_SERVICE=cua CUA_SHIM_SURFACES=browser CUA_SHIM_SECRETS=off node test/repl-parity/serve-capability-client.mjs`)}};
 }catch(error){await fixture.close();throw error;}
}
