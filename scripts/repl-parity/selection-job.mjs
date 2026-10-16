// The installed-job part of acceptance 9. Real serializers and readback, scratch HOME, service-manager doubles.
import assert from 'node:assert/strict';
import * as launchd from '../../src/remote/launchd.mjs';
import * as systemd from '../../src/remote/systemd.mjs';
import {fakeLaunchctl,UID} from '../../test/fixtures/fake-launchctl.mjs';
import {fakeSystemctl,fakeLoginctl} from '../../test/fixtures/fake-systemctl.mjs';
export async function checkScratchJob({home,userHome,node,env,platform}){
 const module=platform==='darwin'?launchd:systemd;
 const manager=platform==='darwin'?{launchctl:fakeLaunchctl().run,uid:UID,settleMs:1}:{systemctl:fakeSystemctl({userHome}).run,loginctl:fakeLoginctl({linger:'no'}).run,user:'parity'};
 const install=ambient=>module.installAgent({home,userHome,node,env:ambient,http:'127.0.0.1:7801',surfaces:'browser',...manager});
 await install({...env,CUA_NODE:node});
 const explicit=module.installedJob({userHome});assert.equal(explicit.installed,true);assert.equal(explicit.job.environment.CUA_NODE,node);
 const implicit={...env};delete implicit.CUA_NODE;await install(implicit);
 const omitted=module.installedJob({userHome});assert.equal(omitted.installed,true);assert.equal(Object.hasOwn(omitted.job.environment,'CUA_NODE'),false);
 return {explicitNodePersisted:true,implicitNodeOmitted:true,proof:'scratch-installed-job; service-manager double',platform};
}
