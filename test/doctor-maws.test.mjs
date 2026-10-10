// cua doctor's MAWS row (docs/doperpowers/specs/2026-10-08-maws-in-app-browser-design.md, "Client mode"): the
// client-mode hosts cua processes run for MAWS backends, read from their status files in chrome/b (instance maws:…)
// and sockets in chrome/m; a host whose process is gone is stale, and its leftovers are removed. Each host's status says
// whether its relay checks its peers (docs/doperpowers/specs/2026-10-09-maws-socket-peer-auth-design.md), and the row is
// blocked when the peer identity addon does not load on Apple silicon macOS: every vendor connection would be refused.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {mawsHostCheck} from '../src/profiles/checks.mjs';
import {backendDir, clientModeDir} from '../src/chrome/extension.mjs';
import {REPO, scratch} from './fixtures/runtime-fixture.mjs';

function home(t) {
  const s = scratch();
  t.after(s.cleanup);
  mkdirSync(backendDir(s.dir), {recursive: true});
  mkdirSync(clientModeDir(s.dir), {recursive: true});
  return s.dir;
}
const status = (h, name, instanceId, pid, peerCheck = 'on') => writeFileSync(join(backendDir(h), `${name}.json`), JSON.stringify({instanceId, pid, sessions: [], ...(peerCheck ? {peerCheck} : {})}));
const APPLE_SILICON = {platform: 'darwin', arch: 'arm64'};
const MISSING = join(REPO, 'native', 'peer-auth', 'missing.node');
const socket = (h, name) => writeFileSync(join(clientModeDir(h), `${name}.sock`), '');

test('no MAWS host: skip, saying where the backends come from; Chrome hosts\' status files are not MAWS\'s', t => {
  const h = home(t);
  status(h, 'aaaaaaaaaaaa', 'chrome-inst', process.pid);
  const row = mawsHostCheck({home: h});
  assert.equal(row.name, 'maws.hosts');
  assert.equal(row.status, 'skip');
  assert.match(row.detail, /CUA_BROWSER_BACKENDS/);
});

test('live hosts are listed with their instance and process; a dead process\'s status file and socket are removed', t => {
  const h = home(t);
  status(h, 'bbbbbbbbbbbb-1001', 'maws:app-1', 1001);
  socket(h, 'bbbbbbbbbbbb-1001');
  status(h, 'bbbbbbbbbbbb-1002', 'maws:app-1', 1002);
  socket(h, 'bbbbbbbbbbbb-1002');
  const row = mawsHostCheck({home: h, alive: pid => pid === 1001});
  assert.equal(row.status, 'pass');
  assert.match(row.detail, /^1 MAWS client-mode host\(s\) connected: maws:app-1 \(pid 1001, peer check on\)/);
  assert.match(row.detail, /removed 1 stale host record\(s\) of processes that are gone/);
  assert.equal(existsSync(join(backendDir(h), 'bbbbbbbbbbbb-1002.json')), false);
  assert.equal(existsSync(join(clientModeDir(h), 'bbbbbbbbbbbb-1002.sock')), false);
  assert.equal(existsSync(join(backendDir(h), 'bbbbbbbbbbbb-1001.json')), true);
});

test('the peer check: a host whose relay could not load the addon blocks the row; one from before the check reads off', t => {
  const h = home(t);
  status(h, 'cccccccccccc-1001', 'maws:app-1', 1001, 'unavailable');
  status(h, 'cccccccccccc-1002', 'maws:app-1', 1002, null);
  const row = mawsHostCheck({home: h, alive: () => true});
  assert.equal(row.status, 'blocked');
  assert.match(row.detail, /maws:app-1 \(pid 1001, peer check unavailable\), maws:app-1 \(pid 1002, peer check off\)/);
  assert.match(row.detail, /every vendor browser connection to it is refused/);
  assert.match(row.detail, /scripts\/build-peer-auth\.sh/);
});

test('cua doctor reports the peer check unavailable when the addon does not load on Apple silicon macOS, with or without a host', t => {
  const h = home(t);
  const none = mawsHostCheck({home: h, addonPath: MISSING, host: APPLE_SILICON});
  assert.equal(none.status, 'blocked');
  assert.match(none.detail, /peer check is unavailable/);
  assert.match(none.detail, new RegExp(`${MISSING.replaceAll('/', '\\/').replaceAll('.', '\\.')} does not load`));
  status(h, 'dddddddddddd-1001', 'maws:app-1', 1001);
  const live = mawsHostCheck({home: h, alive: () => true, addonPath: MISSING, host: APPLE_SILICON});
  assert.equal(live.status, 'blocked');
  assert.match(live.detail, /peer check is unavailable/);
});

test('off Apple silicon macOS the addon is not tried and the row is as before', t => {
  const h = home(t);
  const row = mawsHostCheck({home: h, addonPath: MISSING, host: {platform: 'linux', arch: 'x64'}});
  assert.equal(row.status, 'skip');
});
