import {remoteCommand,quote} from '../browser-parity/topology.mjs';
import {ownedJsonProcess} from '../browser-parity/resources.mjs';
import {linuxSession} from './topology.mjs';
export function capabilityFixtureCommand({device,checkout,home}) {
 if(!['mini','cua-linux'].includes(device))throw new Error('Capability live host must run on the remote device; local unit tests use doubles');
 return remoteCommand(device,`${linuxSession}\ncd ${quote(checkout)} && exec env CUA_HOME=${quote(home)} node test/repl-parity/serve-capability.mjs`);
}
export async function remoteCapabilityLane({device,checkout,home,host}) {
 if(!['vendor','cua'].includes(host))throw new Error('Invalid host');
 const fixture=await ownedJsonProcess(capabilityFixtureCommand({device,checkout,home}));
 return {...fixture,command:remoteCommand(device,`${linuxSession}\ncd ${quote(checkout)} && exec env -i PATH="$PATH" HOME=${quote(fixture.userHome)} CUA_HOME=${quote(fixture.home)} CUA_REPL_HOST=${quote(host)} CUA_BROWSER_SERVICE=cua CUA_SHIM_SURFACES=browser CUA_SHIM_SECRETS=off node bin/cua.mjs serve`)};
}
