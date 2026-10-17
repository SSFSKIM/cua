// What the npm package carries for cua's own REPL host (spec docs/doperpowers/specs/2026-10-14-own-repl-host-design.md,
// acceptance 10: "shipped package contains the owned document/parser"): an installed plugin has no source tree, so the
// first-call documents the owned facade emits, the tool text the supervisor serves, and the vendored parser and validator
// assets must be in `npm pack`'s file list, each with its VERSION (and licence where it is a separate file). And the
// package's own Node floor: cua installs and runs on Node 22, while the own host needs Node 24 or later, resolved per
// connection (a session without one keeps the vendor host), so the package floor is deliberately not raised.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync, execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {NODE_FLOOR} from '../src/runtime/launch.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OWNED = ['docs/cua-api/', 'src/cua-api/', 'src/repl-host/'];

const packed = () => {
  const listing = spawnSync('npm', ['pack', '--dry-run', '--json'], {cwd: ROOT, encoding: 'utf8'});
  assert.equal(listing.status, 0, listing.stderr);
  const listed = JSON.parse(listing.stdout);  // an array before npm 12, an object keyed by package name since
  return new Set((Array.isArray(listed) ? listed[0] : Object.values(listed)[0]).files.map(f => f.path));
};

test('the npm package carries every tracked file of the own host, its facade and its first-call documents, the vendored parser and validator among them', () => {
  const files = packed();
  const tracked = execFileSync('git', ['ls-files', '--', ...OWNED], {cwd: ROOT, encoding: 'utf8'}).split('\n').filter(Boolean);
  assert.ok(tracked.length > 40, `the owned trees are tracked (${tracked.length})`);
  assert.deepEqual(tracked.filter(path => !files.has(path)), [], 'every tracked owned file is packed');
  // Named, so the check cannot pass on an emptied tree: the documents the first call emits, the tool text the supervisor
  // serves, and the pinned Meriyah (its ISC licence is in the bundle's header) and Zod (licence beside it) assets.
  for (const path of ['docs/cua-api/core.md', 'docs/cua-api/confirmations.md', 'docs/cua-api/other-browser-apis.md', 'docs/cua-api/PROVENANCE.md',
    'src/cua-api/bootstrap.mjs', 'src/repl-host/supervisor.mjs', 'src/repl-host/instructions/server.md',
    'src/repl-host/vendor/meriyah/meriyah.mjs', 'src/repl-host/vendor/meriyah/VERSION',
    'src/cua-api/vendor/zod/types.js', 'src/cua-api/vendor/zod/VERSION', 'src/cua-api/vendor/zod/LICENSE'])
    assert.ok(files.has(path), path);
  assert.match(readFileSync(new URL('../src/repl-host/vendor/meriyah/meriyah.mjs', import.meta.url), 'utf8').slice(0, 2000), /ISC License/);
});

test('the npm package carries the Node pins `cua install` installs the own host\'s Node from', () => {
  const files = packed();
  const pins = execFileSync('git', ['ls-files', '--', 'runtime/releases/node/'], {cwd: ROOT, encoding: 'utf8'}).split('\n').filter(Boolean);
  assert.equal(pins.length, 4, 'darwin and linux, arm64 and x64');
  assert.deepEqual(pins.filter(path => !files.has(path)), []);
});

test('the package floor stays Node 22 while the own host\'s floor is Node 24, resolved per connection', () => {
  const {engines} = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(engines.node, '^22.14 || >=23.7', 'cua itself, and the vendor host route, keep running on Node 22');
  assert.equal(NODE_FLOOR, 24);
});
