// The managed Node for cua's own REPL host (spec 2026-10-14-own-repl-host-design.md, Decision Log 2026-10-16): the
// checked-in nodejs.org pins, `cua install`'s Node step (verify the tarball's length and SHA-256 before reading it,
// keep only bin/node and the licence, check the code signature on darwin and `--version`, one rename into
// $CUA_HOME/node/<version>, then the pointer) and its place in the own host's Node resolution. Archives are local
// tarball doubles whose bin/node is a shell script answering --version; nothing reaches the network.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {dirname, join} from 'node:path';
import {fileDigest, loadNodePins, managedNode, parseNodePin, selectNodePin, NODE_PINS_DIR} from '../src/runtime/managed-node.mjs';
import {developerIdRequirement, installNode, verifyNodeSignature} from '../src/runtime/node-install.mjs';
import {ownHostNode, replHostFor} from '../src/runtime/launch.mjs';
import {digest, scratch} from './fixtures/runtime-fixture.mjs';

const expectCode = code => err => { assert.equal(err.code, code, `expected ${code}, got ${err.code}: ${err.message}`); return true; };
const outcome = fn => { try { return fn(); } catch (error) { return {code: error.code, message: error.message}; } };
const LINUX = {platform: 'linux', arch: 'x64'};
const DARWIN = {platform: 'darwin', arch: 'arm64'};
const VERSION = '24.22.0';
const canonicalUrl = (version, {platform, arch}) => `https://nodejs.org/dist/v${version}/node-v${version}-${platform}-${arch}.tar.gz`;

// A nodejs.org-shaped tarball: node-v<version>-<platform>-<arch>/ with bin/node (a script printing `reports`), the
// licence, and what the own host does not need (npm, its symlink, a README) to prove it is left behind.
function nodeTarball(dir, {version = VERSION, host = LINUX, reports = version, omit = [], nodeAsSymlink = false} = {}) {
  const top = `node-v${version}-${host.platform}-${host.arch}`;
  const tree = join(dir, `tree-${Math.random().toString(36).slice(2)}`);
  const root = join(tree, top);
  mkdirSync(join(root, 'bin'), {recursive: true});
  mkdirSync(join(root, 'lib/node_modules/npm/bin'), {recursive: true});
  writeFileSync(join(root, 'lib/node_modules/npm/bin/npm-cli.js'), '// npm\n');
  symlinkSync('../lib/node_modules/npm/bin/npm-cli.js', join(root, 'bin/npm'));
  writeFileSync(join(root, 'README.md'), '# Node.js\n');
  if (!omit.includes('LICENSE')) writeFileSync(join(root, 'LICENSE'), 'Node.js is licensed for use as follows:\n');
  if (nodeAsSymlink) symlinkSync('../lib/node_modules/npm/bin/npm-cli.js', join(root, 'bin/node'));
  else if (!omit.includes('bin/node')) {
    writeFileSync(join(root, 'bin/node'), reports === null ? '#!/bin/sh\nexit 3\n' : `#!/bin/sh\necho v${reports}\n`);
    chmodSync(join(root, 'bin/node'), 0o755);
  }
  const path = join(dir, `${top}-${Math.random().toString(36).slice(2)}.tar.gz`);
  const r = spawnSync('tar', ['-czf', path, '-C', tree, top], {encoding: 'utf8'});
  if (r.status !== 0) throw new Error(`tar failed: ${r.stderr}`);
  rmSync(tree, {recursive: true, force: true});
  return {path, ...digest(readFileSync(path))};
}

const pinJson = ({sha256, length}, {version = VERSION, host = LINUX, ...overrides} = {}) => ({
  schema: 1, version, platform: host.platform, arch: host.arch,
  archive: {url: canonicalUrl(version, host), length, sha256},
  ...(host.platform === 'darwin' ? {signing: {team: 'HX7739G8FX'}} : {}),
  notes: 'fixture pin',
  ...overrides,
});

function setup(t, {host = LINUX, tarball = {}} = {}) {
  const s = scratch();
  t.after(s.cleanup);
  const archive = nodeTarball(s.dir, {host, ...tarball});
  const pin = parseNodePin(pinJson(archive, {host}));
  return {dir: s.dir, home: join(s.dir, 'home'), archive, pin, host};
}
const noSignature = async () => { throw new Error('no code-signature check may run for a linux pin'); };
const acceptSignature = async () => ({valid: true, detail: 'fixture'});
const install = (ctx, extra = {}) => installNode({home: ctx.home, pin: ctx.pin, archivePath: ctx.archive.path, host: ctx.host,
  verifySignature: ctx.host.platform === 'darwin' ? acceptSignature : noSignature, ...extra});
const nodeDir = home => join(realpathSync(home), 'node');
const pointer = home => existsSync(join(nodeDir(home), 'current.json')) ? JSON.parse(readFileSync(join(nodeDir(home), 'current.json'), 'utf8')) : null;
const stagingLeftovers = home => existsSync(join(home, 'staging')) ? readdirSync(join(home, 'staging')) : [];

test('the checked-in Node pins: one official nodejs.org tarball of the same Node 24 LTS per supported platform, each with its provenance', () => {
  const pins = loadNodePins();
  assert.deepEqual(pins.map(p => `${p.platform}-${p.arch}`).sort(), ['darwin-arm64', 'darwin-x64', 'linux-arm64', 'linux-x64']);
  assert.equal(new Set(pins.map(p => p.version)).size, 1, 'every platform pins the same Node');
  for (const pin of pins) {
    assert.match(pin.version, /^24\.\d+\.\d+$/);
    assert.equal(pin.archive.url, canonicalUrl(pin.version, pin));
    assert.match(pin.archive.sha256, /^[0-9a-f]{64}$/);
    assert.match(pin.notes, /SHASUMS256\.txt/);
    assert.match(pin.notes, /GOODSIG/);
    assert.match(pin.notes, /nodejs\/release-keys/);
    assert.match(pin.notes, new RegExp(`${pin.archive.sha256}  node-v${pin.version}-${pin.platform}-${pin.arch}\\.tar\\.gz`), 'the notes quote the signed line the hash came from');
    if (pin.platform === 'darwin') assert.deepEqual(pin.signing, {team: 'HX7739G8FX'});
    else assert.equal(pin.signing, undefined, 'on linux the archive hash is the trust root');
  }
  assert.equal(readdirSync(NODE_PINS_DIR).length, pins.length);
});

test('a Node pin is parsed strictly: the official URL for its version and target, darwin signing only on darwin, provenance notes', () => {
  const base = pinJson({sha256: 'a'.repeat(64), length: 10});
  assert.equal(parseNodePin(base).version, VERSION);
  const darwin = pinJson({sha256: 'a'.repeat(64), length: 10}, {host: DARWIN});
  assert.deepEqual(parseNodePin(darwin).signing, {team: 'HX7739G8FX'});
  for (const [why, json] of [
    ['an unknown field', {...base, extra: 1}],
    ['no notes', (({notes, ...rest}) => rest)(base)],
    ['another URL', {...base, archive: {...base.archive, url: 'https://example.invalid/node.tar.gz'}}],
    ['plain http', {...base, archive: {...base.archive, url: base.archive.url.replace('https:', 'http:')}}],
    ['another version\'s URL', {...base, archive: {...base.archive, url: canonicalUrl('24.21.0', LINUX)}}],
    ['the xz tarball', {...base, archive: {...base.archive, url: base.archive.url.replace('.tar.gz', '.tar.xz')}}],
    ['a bad hash', {...base, archive: {...base.archive, sha256: 'A'.repeat(64)}}],
    ['a zero length', {...base, archive: {...base.archive, length: 0}}],
    ['a Node below the own host\'s floor', pinJson({sha256: 'a'.repeat(64), length: 10}, {version: '22.23.2'})],
    ['not a release version', pinJson({sha256: 'a'.repeat(64), length: 10}, {version: '24.22'})],
    ['signing on linux', {...base, signing: {team: 'HX7739G8FX'}}],
    ['no signing on darwin', (({signing, ...rest}) => rest)(darwin)],
    ['a malformed team', {...darwin, signing: {team: 'hx7739g8fx'}}],
    ['an unknown target', pinJson({sha256: 'a'.repeat(64), length: 10}, {host: {platform: 'win', arch: 'x64'}})],
  ]) assert.throws(() => parseNodePin(json), expectCode('invalid_pin'), why);
});

test('the Node pin for a host is the newest one for its platform and arch, or none', () => {
  const pin = (version, host) => parseNodePin(pinJson({sha256: 'a'.repeat(64), length: 10}, {version, host}));
  const pins = [pin('24.9.0', LINUX), pin('24.22.0', LINUX), pin('24.10.1', LINUX), pin('24.30.0', DARWIN)];
  assert.equal(selectNodePin(pins, LINUX).version, '24.22.0');
  assert.equal(selectNodePin(pins, DARWIN).version, '24.30.0');
  assert.equal(selectNodePin(pins, {platform: 'linux', arch: 'arm64'}), null);
  assert.equal(selectNodePin(loadNodePins(), {platform: 'freebsd', arch: 'x64'}), null);
});

for (const host of [LINUX, DARWIN]) {
  test(`install (${host.platform}) keeps only bin/node and the licence, moves them into node/<version> with one rename, then writes the pointer`, async t => {
    const ctx = setup(t, {host});
    let signatureChecks = 0;
    const result = await install(ctx, host.platform === 'darwin' ? {verifySignature: async (path, team) => {
      signatureChecks++;
      assert.equal(team, 'HX7739G8FX');
      assert.match(path, /\/staging\/.*\/bin\/node$/, 'the signature is checked in staging, before the rename');
      return {valid: true, detail: 'fixture'};
    }} : {});
    const root = join(nodeDir(ctx.home), VERSION);
    assert.deepEqual(result, {version: VERSION, root, node: join(root, 'bin', 'node'), changed: true, activated: true, source: 'archive'});
    assert.deepEqual(readdirSync(root).sort(), ['LICENSE', 'bin', 'install.json']);
    assert.deepEqual(readdirSync(join(root, 'bin')), ['node']);
    assert.equal(statSync(join(root, 'bin/node')).mode & 0o111, 0o111);
    assert.match(readFileSync(join(root, 'LICENSE'), 'utf8'), /Node\.js is licensed/);
    const record = JSON.parse(readFileSync(join(root, 'install.json'), 'utf8'));
    assert.deepEqual({...record, installedAt: undefined}, {schema: 1, version: VERSION, platform: host.platform, arch: host.arch,
      archive: {sha256: ctx.archive.sha256, length: ctx.archive.length}, node: fileDigest(join(root, 'bin/node')), source: 'archive', installedAt: undefined});
    assert.equal(record.node.size, statSync(join(root, 'bin/node')).size, 'the record binds the verified bin/node by SHA-256 and size');
    assert.deepEqual(pointer(ctx.home), {schema: 1, version: VERSION});
    assert.equal(signatureChecks, host.platform === 'darwin' ? 1 : 0);
    assert.deepEqual(stagingLeftovers(ctx.home), []);
    assert.deepEqual(managedNode(ctx.home, {host}), {path: join(root, 'bin', 'node'), version: VERSION});
  });
}

test('installing the same verified Node again re-verifies it and changes nothing, without the archive', async t => {
  const ctx = setup(t, {host: DARWIN});
  await install(ctx);
  const root = join(nodeDir(ctx.home), VERSION);
  const files = ['install.json', 'bin/node', 'LICENSE'];
  const before = files.map(p => statSync(join(root, p)));
  const pointerBefore = statSync(join(nodeDir(ctx.home), 'current.json'));
  rmSync(ctx.archive.path);
  let checks = 0;
  const again = await install(ctx, {verifySignature: async () => { checks++; return {valid: true, detail: 'fixture'}; }});
  assert.deepEqual(again, {version: VERSION, root, node: join(root, 'bin', 'node'), changed: false, activated: false, source: 'archive'});
  assert.equal(checks, 1, 'the installed binary is verified again');
  assert.deepEqual(files.map(p => statSync(join(root, p))).map(s => [s.ino, s.mtimeMs]), before.map(s => [s.ino, s.mtimeMs]));
  assert.equal(statSync(join(nodeDir(ctx.home), 'current.json')).mtimeMs, pointerBefore.mtimeMs);
});

test('an installed Node that is not the active one is verified and re-activated, not re-extracted', async t => {
  const ctx = setup(t);
  await install(ctx);
  writeFileSync(join(nodeDir(ctx.home), 'current.json'), JSON.stringify({schema: 1, version: '24.9.0'}));
  rmSync(ctx.archive.path);
  const result = await install(ctx);
  assert.deepEqual([result.changed, result.activated], [false, true]);
  assert.deepEqual(pointer(ctx.home), {schema: 1, version: VERSION});
});

test('a wrong-length or wrong-hash tarball is refused before anything reads it, and nothing is placed', async t => {
  const ctx = setup(t);
  const wrong = overrides => parseNodePin(pinJson({...ctx.archive, ...overrides}));
  await assert.rejects(install(ctx, {pin: wrong({sha256: 'a'.repeat(64)})}), expectCode('archive_hash_mismatch'));
  await assert.rejects(install(ctx, {pin: wrong({length: ctx.archive.length + 1})}), expectCode('archive_length_mismatch'));
  await assert.rejects(install(ctx, {archivePath: join(ctx.dir, 'absent.tar.gz')}), expectCode('archive_missing'));
  assert.equal(existsSync(join(nodeDir(ctx.home), VERSION)), false);
  assert.equal(pointer(ctx.home), null);
  assert.deepEqual(stagingLeftovers(ctx.home), []);
});

test('a tarball whose Node reports another version, lacks bin/node or the licence, or links bin/node elsewhere is refused and leaves everything untouched', async t => {
  for (const [code, tarball] of [
    ['node_version_mismatch', {reports: '24.21.0'}],
    ['node_version_mismatch', {reports: null}],
    ['extract_failed', {omit: ['bin/node']}],
    ['extract_failed', {omit: ['LICENSE']}],
    ['layout_invalid', {nodeAsSymlink: true}],
  ]) {
    const ctx = setup(t, {tarball});
    await assert.rejects(install(ctx), expectCode(code), JSON.stringify(tarball));
    assert.equal(existsSync(join(nodeDir(ctx.home), VERSION)), false, JSON.stringify(tarball));
    assert.equal(pointer(ctx.home), null);
    assert.deepEqual(stagingLeftovers(ctx.home), []);
  }
});

test('on darwin a binary that is not the pinned Developer ID\'s is refused before it is ever run', async t => {
  const ctx = setup(t, {host: DARWIN});
  let versionAsked = 0;
  await assert.rejects(install(ctx, {verifySignature: async () => ({valid: false, detail: 'code failed to satisfy specified code requirement(s)'}),
    versionOf: () => { versionAsked++; return `v${VERSION}`; }}), expectCode('signature_invalid'));
  assert.equal(versionAsked, 0);
  assert.equal(existsSync(join(nodeDir(ctx.home), VERSION)), false);
  assert.equal(pointer(ctx.home), null);
});

test('the production darwin check demands the pinned team\'s Developer ID Application certificate and rejects an unsigned binary', {skip: process.platform !== 'darwin'}, async t => {
  assert.equal(developerIdRequirement('HX7739G8FX'), 'anchor apple generic and certificate 1[field.1.2.840.113635.100.6.2.6] exists and certificate leaf[field.1.2.840.113635.100.6.1.13] exists and certificate leaf[subject.OU] = "HX7739G8FX"');
  const s = scratch();
  t.after(s.cleanup);
  const script = fakeNode(s.dir, 'bin/node', VERSION);
  const result = await verifyNodeSignature(script, 'HX7739G8FX');
  assert.equal(result.valid, false);
  assert.ok(result.detail);
});

test('an installed Node that no longer verifies is reported, never repaired in place; a foreign directory at the target is left alone', async t => {
  const ctx = setup(t);
  await install(ctx);
  const root = join(nodeDir(ctx.home), VERSION);
  writeFileSync(join(root, 'bin/node'), '#!/bin/sh\necho v24.0.0\n');
  writeFileSync(join(nodeDir(ctx.home), 'current.json'), JSON.stringify({schema: 1, version: '24.9.0'}));
  await assert.rejects(install(ctx), err => {
    expectCode('node_install_invalid')(err);
    assert.match(err.hint, new RegExp(`remove ${root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}, then run \`cua install\``));
    return true;
  });
  assert.equal(readFileSync(join(root, 'bin/node'), 'utf8'), '#!/bin/sh\necho v24.0.0\n', 'not repaired');
  assert.deepEqual(pointer(ctx.home), {schema: 1, version: '24.9.0'}, 'not activated');

  const other = setup(t);
  const target = join(realpathSync(dirname(other.home)), 'home', 'node', VERSION);
  mkdirSync(target, {recursive: true});
  writeFileSync(join(target, 'mine.txt'), 'a user file');
  await assert.rejects(install(other), expectCode('target_occupied'));
  assert.deepEqual(readdirSync(target), ['mine.txt']);
});

test('without a local archive the tarball is downloaded from the pinned URL and verified the same way', async t => {
  const ctx = setup(t);
  const bytes = readFileSync(ctx.archive.path);
  const urls = [];
  const fetch = async url => { urls.push(url); return new Response(bytes, {headers: {'content-length': String(bytes.length)}}); };
  const result = await install(ctx, {archivePath: undefined, fetch});
  assert.deepEqual(urls, [ctx.pin.archive.url]);
  assert.equal(result.source, 'download');
  assert.equal(JSON.parse(readFileSync(join(result.root, 'install.json'), 'utf8')).source, 'download');

  const failing = setup(t);
  await assert.rejects(install(failing, {archivePath: undefined, fetch: async () => { throw Object.assign(new Error('fetch failed'), {cause: {code: 'ENOTFOUND'}}); }}), expectCode('download_failed'));
  const short = readFileSync(failing.archive.path).subarray(1);
  await assert.rejects(install(failing, {archivePath: undefined, fetch: async () => new Response(short)}), expectCode('archive_length_mismatch'));
  assert.equal(pointer(failing.home), null);
  assert.deepEqual(stagingLeftovers(failing.home), []);
});

test('without tar or gzip the install is refused naming the package, before anything is downloaded', async t => {
  const ctx = setup(t);
  let fetched = 0;
  await assert.rejects(install(ctx, {archivePath: undefined, fetch: async () => { fetched++; throw new Error('no'); }, tools: name => (name === 'gzip' ? null : `/usr/bin/${name}`)}), err => {
    expectCode('missing_tool')(err);
    assert.match(err.message, /gzip/);
    assert.match(err.hint, /apt-get install gzip/);
    return true;
  });
  assert.equal(fetched, 0);
  assert.deepEqual(stagingLeftovers(ctx.home), []);
});

test('a pin for another target is refused', async t => {
  const ctx = setup(t);
  await assert.rejects(install(ctx, {host: {platform: 'linux', arch: 'arm64'}}), expectCode('unsupported_platform'));
});

test('a replaced bin/node is never run: not on reinstall, even when it prints the pinned version, and not by the resolution', async t => {
  const ctx = setup(t, {host: thisHost});
  await install(ctx);
  const root = join(nodeDir(ctx.home), VERSION);
  writeFileSync(join(root, 'bin/node'), `#!/bin/sh\ntouch "$0.ran"\necho v${VERSION}\n`);
  const probed = [];
  const versionOf = path => { probed.push(path); return `v${VERSION}`; };
  await assert.rejects(install(ctx, {versionOf}), err => {
    expectCode('node_install_invalid')(err);
    assert.equal(err.cause.code, 'node_binary_mismatch');
    return true;
  });
  assert.deepEqual(probed, [], 'not run on reinstall');
  assert.deepEqual(managedNode(ctx.home), {missing: `${join(root, 'bin/node')} is not the binary its install record names`});
  const none = outcome(() => ownHostNode({ambient: {}, home: ctx.home, execPath: '/nonexistent', versionOf}));
  assert.equal(none.code, 'repl_host_node');
  assert.match(none.message, /the cua-installed Node \(.* is not the binary its install record names\)/);
  assert.deepEqual(probed, [], 'the resolution never probes it either');
  assert.equal(existsSync(join(root, 'bin/node.ran')), false, 'the replaced binary never ran');
  // A symlink in its place, even to the recorded bytes elsewhere, is not the install either.
  const s = scratch();
  t.after(s.cleanup);
  const original = setup(t);
  await install(original);
  const kept = join(s.dir, 'node');
  writeFileSync(kept, readFileSync(join(nodeDir(original.home), VERSION, 'bin/node')));
  rmSync(join(nodeDir(original.home), VERSION, 'bin/node'));
  symlinkSync(kept, join(nodeDir(original.home), VERSION, 'bin/node'));
  assert.match(managedNode(original.home, {host: LINUX}).missing, /is not the binary its install record names/);
});

test('an install record is read strictly: without the binary\'s digest, or with an empty archive, nothing is offered or reused', async t => {
  const ctx = setup(t);
  await install(ctx);
  const root = join(nodeDir(ctx.home), VERSION);
  const record = JSON.parse(readFileSync(join(root, 'install.json'), 'utf8'));
  for (const broken of [{...record, archive: {}}, (({node, ...rest}) => rest)(record), {...record, node: {sha256: record.node.sha256}}, {...record, node: {...record.node, size: 0}},
    {...record, extra: true}, {...record, source: 'elsewhere'}]) {
    writeFileSync(join(root, 'install.json'), JSON.stringify(broken));
    assert.deepEqual(managedNode(ctx.home, {host: LINUX}), {missing: `${root} is not a recorded install for linux-x64`}, JSON.stringify(broken));
    await assert.rejects(install(ctx), expectCode('target_occupied'), 'an unrecorded tree is not cua\'s to reuse');
  }
});

test('activation is checked before anything is published: a pointer path that is not a file fails classified and leaves the pointer and the tree untouched', async t => {
  const ctx = setup(t);
  mkdirSync(join(realpathSync(dirname(ctx.home)), 'home', 'node', 'current.json'), {recursive: true});
  await assert.rejects(install(ctx), err => {
    expectCode('activation_failed')(err);
    assert.match(err.message, /current\.json is not a file/);
    return true;
  });
  assert.deepEqual(readdirSync(nodeDir(ctx.home)), ['current.json'], 'nothing published, no temporary pointer left');
  assert.ok(statSync(join(nodeDir(ctx.home), 'current.json')).isDirectory(), 'the pointer path is as it was');
  assert.deepEqual(stagingLeftovers(ctx.home), []);
  assert.deepEqual(managedNode(ctx.home, {host: LINUX}), {missing: `${join(nodeDir(ctx.home), 'current.json')} cannot be read (EISDIR)`});
  // The same for an installed Node being re-activated: classified, nothing changed.
  rmSync(join(nodeDir(ctx.home), 'current.json'), {recursive: true});
  await install(ctx);
  rmSync(join(nodeDir(ctx.home), 'current.json'));
  mkdirSync(join(nodeDir(ctx.home), 'current.json'));
  await assert.rejects(install(ctx), expectCode('activation_failed'));
  assert.deepEqual(readdirSync(nodeDir(ctx.home)).sort(), [VERSION, 'current.json']);
});

test('the managed Node a home points at: only a recorded install for this host, else why not', async t => {
  const ctx = setup(t);
  assert.deepEqual(managedNode(ctx.home, {host: LINUX}), {missing: 'not installed'});
  await install(ctx);
  const root = join(nodeDir(ctx.home), VERSION);
  assert.deepEqual(managedNode(ctx.home, {host: LINUX}), {path: join(root, 'bin/node'), version: VERSION});
  assert.deepEqual(managedNode(ctx.home, {host: {platform: 'linux', arch: 'arm64'}}), {missing: `${root} is not a recorded install for linux-arm64`});
  const record = readFileSync(join(root, 'install.json'), 'utf8');
  writeFileSync(join(root, 'install.json'), '{');
  assert.deepEqual(managedNode(ctx.home, {host: LINUX}), {missing: `${root} is not a recorded install for linux-x64`});
  writeFileSync(join(root, 'install.json'), record);
  writeFileSync(join(nodeDir(ctx.home), 'current.json'), 'garbage');
  assert.deepEqual(managedNode(ctx.home, {host: LINUX}), {missing: `${join(nodeDir(ctx.home), 'current.json')} is not a valid pointer`});
  writeFileSync(join(nodeDir(ctx.home), 'current.json'), JSON.stringify({schema: 1, version: '../escape'}));
  assert.deepEqual(managedNode(ctx.home, {host: LINUX}), {missing: `${join(nodeDir(ctx.home), 'current.json')} is not a valid pointer`});
  writeFileSync(join(nodeDir(ctx.home), 'current.json'), JSON.stringify({schema: 1, version: '24.9.0'}));
  assert.deepEqual(managedNode(ctx.home, {host: LINUX}), {missing: `${join(nodeDir(ctx.home), '24.9.0')} is not a recorded install for linux-x64`});
});

// A scratch Node stand-in answering --version, as test/runtime-launch.test.mjs's.
function fakeNode(dir, name, version) {
  const path = join(dir, name);
  mkdirSync(dirname(path), {recursive: true});
  writeFileSync(path, `#!/bin/sh\necho v${version}\n`);
  chmodSync(path, 0o755);
  return path;
}
const thisHost = {platform: process.platform, arch: process.arch};

test('the own host\'s Node: CUA_NODE, then the cua-installed Node, then the node running cua, then node on PATH', async t => {
  const ctx = setup(t, {host: thisHost});
  const dir = realpathSync(ctx.dir);
  const v26 = fakeNode(dir, 'a/node', '26.0.0'), v22 = fakeNode(dir, 'c/node', '22.23.2'), path22 = fakeNode(dir, 'p/node', '22.23.2');
  const ambient = {PATH: dirname(path22)};
  const none = outcome(() => ownHostNode({ambient, home: ctx.home, execPath: v22}));
  assert.equal(none.code, 'repl_host_node');
  assert.match(none.message, /the cua-installed Node \(not installed\)/);
  assert.match(none.message, /run `cua install`/, 'the remedy names cua install first');
  await install(ctx, {verifySignature: acceptSignature});
  const managed = join(nodeDir(ctx.home), VERSION, 'bin/node');
  assert.equal(ownHostNode({ambient: {...ambient, CUA_NODE: v26}, home: ctx.home, execPath: v22}), v26, 'an explicit CUA_NODE comes first');
  assert.equal(ownHostNode({ambient: {...ambient, CUA_NODE: v22}, home: ctx.home, execPath: v26}), managed, 'then the cua-installed Node, before the node running cua');
  assert.equal(ownHostNode({ambient, home: ctx.home, execPath: v22}), managed);
  // A caller that names no home (a test harness) has no cua-installed Node to try.
  const homeless = outcome(() => ownHostNode({ambient, execPath: v22}));
  assert.equal(homeless.code, 'repl_host_node');
  assert.doesNotMatch(homeless.message, /cua-installed/);
});

test('acceptance 9\'s fifth case: no CUA_NODE, Node 22 on PATH and running cua, the managed Node installed: an implicit default selects cua\'s own host on it', async t => {
  const ctx = setup(t, {host: thisHost});
  const dir = realpathSync(ctx.dir);
  const node22 = fakeNode(dir, 'p/node', '22.23.2');
  const ambient = {PATH: dirname(node22)};
  const select = platform => replHostFor({platform, surfaces: ['computer'], ambient, home: ctx.home, browserSelection: null,
    resolveOwnNode: () => ownHostNode({ambient, home: ctx.home, execPath: node22})});
  assert.deepEqual(select('linux'), {host: 'vendor', reason: 'own_host_node_unavailable',
    nodeTried: ['CUA_NODE (unset)', 'the cua-installed Node (not installed)', `the node running cua ${node22} (v22.23.2)`, `node on PATH ${node22} (v22.23.2)`]});
  await install(ctx, {verifySignature: acceptSignature});
  assert.deepEqual(select('linux'), {host: 'cua', reason: 'linux', node: join(nodeDir(ctx.home), VERSION, 'bin/node')});
  // The production default resolver reads the home it is given.
  assert.equal(replHostFor({platform: 'linux', surfaces: ['computer'], ambient: {PATH: dirname(node22)}, home: ctx.home, browserSelection: null}).node,
    join(nodeDir(ctx.home), VERSION, 'bin/node'));
});
