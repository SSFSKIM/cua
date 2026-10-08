// cua doctor's MAWS row (docs/doperpowers/specs/2026-10-08-maws-in-app-browser-design.md, "Client mode"): the
// client-mode hosts cua processes run for MAWS backends, read from their status files in chrome/b (instance maws:…)
// and sockets in chrome/m; a host whose process is gone is stale, and its leftovers are removed.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {mawsHostCheck} from '../src/profiles/checks.mjs';
import {backendDir, clientModeDir} from '../src/chrome/extension.mjs';
import {scratch} from './fixtures/runtime-fixture.mjs';

function home(t) {
  const s = scratch();
  t.after(s.cleanup);
  mkdirSync(backendDir(s.dir), {recursive: true});
  mkdirSync(clientModeDir(s.dir), {recursive: true});
  return s.dir;
}
const status = (h, name, instanceId, pid) => writeFileSync(join(backendDir(h), `${name}.json`), JSON.stringify({instanceId, pid, sessions: []}));
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
  assert.match(row.detail, /^1 MAWS client-mode host\(s\) connected: maws:app-1 \(pid 1001\)/);
  assert.match(row.detail, /removed 1 stale host record\(s\) of processes that are gone/);
  assert.equal(existsSync(join(backendDir(h), 'bbbbbbbbbbbb-1002.json')), false);
  assert.equal(existsSync(join(clientModeDir(h), 'bbbbbbbbbbbb-1002.sock')), false);
  assert.equal(existsSync(join(backendDir(h), 'bbbbbbbbbbbb-1001.json')), true);
});
