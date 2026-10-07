// The Linux Chrome fixture (scripts/accept/linux-chrome.mjs) names the live host it drove: on the cua route the bound
// profile's own host (its socket at the pre-listed path, its status file naming the instance id, its pid running
// host.mjs); on the vendor route OpenAI's hosts running from $CUA_HOME/runtimes, as before. Spec
// docs/doperpowers/specs/2026-10-07-own-chrome-extension-design.md, "What users see change", H4.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {socketNameFor} from '../src/chrome/extension.mjs';
import {cuaHostStep, ownedTabs, vendorHostStep} from '../scripts/accept/linux-chrome-lib.mjs';

const home = '/home/u/.local/share/cua';
const id = 'e579ff6c-ef9c-40c7-8134-265f45c366e2';
const name = socketNameFor(id);
const sock = join(home, 'chrome', 'b', `${name}.sock`);
const statusPath = join(home, 'chrome', 'b', `${name}.json`);
const status = {instanceId: id, extensionVersion: '0.1.0', protocolVersion: 1, pid: 4242, sessions: []};
const ps = ['4242 /usr/bin/node /opt/cua/src/chrome/host.mjs', '77 /opt/google/chrome/chrome --profile-directory=Default'];
const files = (map) => ({exists: path => path in map, readJson: path => (path in map ? map[path] : null)});

test('cua route: the bound profile\'s host serves at its pre-listed socket, its status names the id, its pid runs host.mjs', () => {
  const ok = cuaHostStep({home, instanceId: id, psLines: ps, ...files({[sock]: true, [statusPath]: status})});
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.detail, {socket: sock, pid: 4242, extensionVersion: '0.1.0', process: ps[0]});

  for (const [why, input] of [
    ['no socket', files({[statusPath]: status})],
    ['no status', files({[sock]: true})],
    ['another id', files({[sock]: true, [statusPath]: {...status, instanceId: 'other'}})],
    ['pid not host.mjs', files({[sock]: true, [statusPath]: {...status, pid: 77}})],
  ]) assert.equal(cuaHostStep({home, instanceId: id, psLines: ps, ...input}).ok, false, why);
});

test('vendor route: every OpenAI host runs from $CUA_HOME/runtimes (unchanged)', () => {
  const host = `9 ${home}/runtimes/26.928.40906-linux-arm64/chrome-plugin/extension-host/linux/arm64/extension-host chrome-extension://x/`;
  assert.equal(vendorHostStep({home, psLines: [host]}).ok, true);
  assert.equal(vendorHostStep({home, psLines: []}).ok, false);
  assert.equal(vendorHostStep({home, psLines: [host, '10 /elsewhere/chrome-plugin/extension-host/linux/arm64/extension-host']}).ok, false);
});

test('ownedTabs lists every tab a session still owns in a host status', () => {
  assert.deepEqual(ownedTabs({sessions: []}), []);
  assert.deepEqual(ownedTabs({sessions: [{session_id: 's', tabs: []}, {session_id: 't', tabs: [{tabId: 3, mark: 'handoff'}]}]}), [{session_id: 't', tabId: 3, mark: 'handoff'}]);
  assert.deepEqual(ownedTabs(null), []);
});
