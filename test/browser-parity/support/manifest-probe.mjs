// A separate scratch-HOME process imports the installed service. No real browser discovery or networking.
import assert from 'node:assert/strict';
import {extractWireUnion} from './wire-union.mjs';
import {existsSync, mkdtempSync, rmSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {defaultHome, readPointer} from '../../../src/runtime/layout.mjs';
export function vendorPath() {
  if (process.env.CUA_PARITY_VENDOR_MODULE) return existsSync(process.env.CUA_PARITY_VENDOR_MODULE) ? process.env.CUA_PARITY_VENDOR_MODULE : null;
  const home=defaultHome(), release=readPointer(home);
  if(!release)return null;
  const path=join(home,'runtimes',release,'cua_node/lib/node_modules/@oai/browser-desktop/scripts/browser-service.mjs');
  return existsSync(path)?path:null;
}
export function probe(path, registryCheck=null) {
  const home=mkdtempSync(join(tmpdir(),'cua-manifest-'));
  try {
    const output=execFileSync(process.execPath,[fileURLToPath(new URL('./probe-worker.mjs',import.meta.url)),path,JSON.stringify(registryCheck)],{
      env:{PATH:process.env.PATH,HOME:home,TMPDIR:home},encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024});
    return JSON.parse(output.split('\n').find(l=>l.startsWith('MANIFEST ')).slice(9));
  } finally {rmSync(home,{recursive:true,force:true});}
}
export const members = manifest => Object.entries(manifest.interfaces).flatMap(([name, entries])=>Object.keys(entries).map(member=>`${name}.${member}`)).sort();
export async function checkVendor(path, inventory) {
  const result=probe(path);
  assert.deepEqual(result.sessionNames,['inventory/naming'],'name_session must reach the backend; success alone is not an oracle');
  assert.ok(result.backendRequests.includes('getInfo'),'manifest probe must select the fake cua extension backend');
  assert.deepEqual(result.capabilities.browser.map(c=>c.id),['viewport']);
  assert.deepEqual(result.capabilities.tab,[]);
  for(const member of ['Tab.ax','Tabs.content','ContentAPI.export','BrowserUser.getTabContext']) {
    const [iface,key]=member.split('.');
    assert.ok(result.setup.apiManifest.interfaces[iface][key].unsupportedByDefaultIn.includes('extension'),member);
  }
  // Every declared row must be a schema literal in the pinned executable, not merely a corpus label.
  const source=readFileSync(path,'utf8');
  assert.deepEqual(inventory.filter(r=>r.type!=='tab_content_export').map(r=>r.type).sort(),extractWireUnion(source),'inventory differs from Rf + zN + capability fallback union');
  for(const {type} of inventory) assert.ok(source.includes(JSON.stringify(type)),`vendor lacks wire schema ${type}`);
}
export async function checkOwnService(inventory,current) {
  const own=fileURLToPath(new URL('../../../src/browser-service/index.mjs',import.meta.url));
  const milestones=['M0','M1a','M1b','M1c','M2','M3'];
  assert.ok(milestones.includes(current),`unknown current milestone ${current}`);
  const rows=inventory.filter(r=>milestones.indexOf(r.milestone)<=milestones.indexOf(current));
  const result=probe(own,{inventory:rows,current});
  assert.deepEqual(result.sessionNames,['inventory/naming'],'name_session must reach the backend');
  const vendor=vendorPath();
  if(!vendor) {console.log('# SKIP vendor module absent: own/vendor manifest comparison');return;}
  const expected=probe(vendor);
  assert.deepEqual(members(result.setup.apiManifest),members(expected.setup.apiManifest));
  assert.deepEqual([...result.setup.disabledMemberIds].sort(),[...expected.setup.disabledMemberIds].sort());
  assert.deepEqual(result.capabilities,expected.capabilities);
  for(const [iface,entries] of Object.entries(expected.setup.apiManifest.interfaces))for(const [member,definition] of Object.entries(entries)) {
    assert.equal(result.setup.apiManifest.interfaces[iface][member].unsupportedByDefaultIn?.includes('extension')??false,definition.unsupportedByDefaultIn?.includes('extension')??false,`${iface}.${member}: extension reachability differs`);
  }
}
