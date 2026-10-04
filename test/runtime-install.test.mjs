import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, existsSync, lstatSync, readlinkSync, readdirSync, statSync, rmSync, mkdirSync, realpathSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {installRuntime, useRuntime} from '../src/runtime/install.mjs';
import {parsePin, resolveRuntime} from '../src/runtime/manifest.mjs';
import {verifyCodeSignatures} from '../src/runtime/checks.mjs';
import {scratch, zipFixture, fixturePin, acceptSignatures, XATTR_NAME} from './fixtures/runtime-fixture.mjs';

const darwin = process.platform === 'darwin';
const HOST = {platform: 'darwin', arch: 'arm64'};
const expectCode = code => err => { assert.equal(err.code, code, `expected ${code}, got ${err.code}: ${err.message}`); return true; };

// One fixture archive plus a pin that matches it, in a scratch directory with its own CUA_HOME.
function setup(t, {release, archive: archiveOptions, pin: pinOverrides} = {}) {
  const s = scratch();
  t.after(s.cleanup);
  const archive = zipFixture(s.dir, archiveOptions);
  const pin = parsePin(fixturePin({release, sha256: archive.sha256, length: archive.length, ...pinOverrides}));
  const home = join(s.dir, 'home');
  return {dir: s.dir, home, archive, pin};
}
const install = (ctx, extra = {}) => installRuntime({home: ctx.home, manifest: ctx.pin, archivePath: ctx.archive.zip, verifySignatures: acceptSignatures, host: HOST, ...extra});
const pointer = home => existsSync(join(home, 'current.json')) ? JSON.parse(readFileSync(join(home, 'current.json'), 'utf8')).release : null;
const stagingLeftovers = home => existsSync(join(home, 'staging')) ? readdirSync(join(home, 'staging')) : [];

test('install extracts only the pinned components, preserving modes, symlinks and extended attributes, then activates', {skip: !darwin}, async t => {
  const ctx = setup(t);
  const result = await install(ctx);
  const root = join(realpathSync(ctx.home), 'runtimes', ctx.pin.release);
  assert.equal(result.release, ctx.pin.release);
  assert.equal(result.root, root);
  assert.equal(result.changed, true);
  assert.deepEqual(readdirSync(root).sort(), ['CodexCLI.app', 'chrome-plugin', 'cua_node', 'install.json']);
  assert.equal(pointer(ctx.home), ctx.pin.release);
  assert.equal(statSync(join(root, 'cua_node/bin/node')).mode & 0o777, 0o755);
  assert.ok(lstatSync(join(root, 'cua_node/bin/corepack')).isSymbolicLink());
  assert.equal(readlinkSync(join(root, 'cua_node/bin/corepack')), '../lib/node_modules/corepack/dist/corepack.js');
  const xattr = spawnSync('xattr', ['-p', XATTR_NAME, join(root, 'cua_node/bin/node_repl')], {encoding: 'utf8'});
  assert.equal(xattr.stdout.trim(), 'kept');
  assert.equal(existsSync(join(root, 'ChatGPT.app')), false);
  const record = JSON.parse(readFileSync(join(root, 'install.json'), 'utf8'));
  assert.equal(record.release, ctx.pin.release);
  assert.deepEqual(record.archive, {sha256: ctx.archive.sha256, length: ctx.archive.length});
  assert.equal(record.source, 'archive');
  assert.deepEqual(stagingLeftovers(ctx.home), []);
});

test('installing a verified release again re-verifies it without touching its files', {skip: !darwin}, async t => {
  const ctx = setup(t);
  await install(ctx);
  const root = join(realpathSync(ctx.home), 'runtimes', ctx.pin.release);
  const before = ['install.json', 'cua_node/bin/node', 'CodexCLI.app/Contents/MacOS/codex'].map(p => statSync(join(root, p)));
  const pointerBefore = statSync(join(ctx.home, 'current.json'));
  let verified = 0;
  // The archive is gone: a second install must not need to read or extract it.
  rmSync(ctx.archive.zip);
  const again = await install(ctx, {verifySignatures: async (...a) => { verified++; return acceptSignatures(...a); }});
  assert.equal(again.changed, false);
  assert.equal(verified, 2, 'the base release and its Chrome host component');
  const after = ['install.json', 'cua_node/bin/node', 'CodexCLI.app/Contents/MacOS/codex'].map(p => statSync(join(root, p)));
  assert.deepEqual(after.map(s => [s.ino, s.mtimeMs]), before.map(s => [s.ino, s.mtimeMs]));
  assert.equal(statSync(join(ctx.home, 'current.json')).mtimeMs, pointerBefore.mtimeMs);
});

test('resolving an installed release returns relocated paths under its own tree plus the checked pin', {skip: !darwin}, async t => {
  const ctx = setup(t);
  await install(ctx);
  const runtime = resolveRuntime({home: ctx.home, pins: [ctx.pin], host: HOST});
  const home = realpathSync(ctx.home);
  const root = join(home, 'runtimes', ctx.pin.release);
  assert.equal(runtime.release, ctx.pin.release);
  assert.equal(runtime.root, root);
  assert.equal(runtime.home, home);
  assert.deepEqual(runtime.manifest, ctx.pin);
  assert.equal(runtime.paths.node, join(root, 'cua_node/bin/node'));
  assert.equal(runtime.paths.cuaRepl, join(root, 'cua_node/lib/node_modules/@oai/cua-repl/bin/cua-repl.mjs'));
  assert.equal(runtime.paths.codexCli, join(root, 'CodexCLI.app/Contents/MacOS/codex'));
  for (const [key, path] of Object.entries(runtime.paths)) assert.ok(path.startsWith(root + '/'), `${key} escapes the release: ${path}`);
  // The scratch home sits below a symlinked temp directory on macOS; resolved paths are real paths.
  assert.equal(realpathSync(runtime.paths.node), runtime.paths.node);
});

test('resolution refuses a pointer to a release with no checked-in pin, or a record that disagrees with the pin', {skip: !darwin}, async t => {
  const ctx = setup(t);
  await install(ctx);
  assert.throws(() => resolveRuntime({home: ctx.home, pins: [], host: HOST}), expectCode('unknown_release'));
  assert.throws(() => resolveRuntime({home: ctx.home, pins: [ctx.pin], release: '9.9.9-darwin-arm64', host: HOST}), expectCode('unknown_release'));
  const other = parsePin({...fixturePin({sha256: 'f'.repeat(64), length: ctx.archive.length})});
  assert.throws(() => resolveRuntime({home: ctx.home, pins: [other], host: HOST}), expectCode('installed_record_invalid'));
  rmSync(join(realpathSync(ctx.home), 'runtimes', ctx.pin.release, 'cua_node/bin/node_repl'));
  assert.throws(() => resolveRuntime({home: ctx.home, pins: [ctx.pin], host: HOST}), expectCode('layout_invalid'));
});

test('a wrong-length or wrong-hash archive is refused before extraction and activates nothing', {skip: !darwin}, async t => {
  const ctx = setup(t);
  const wrongHash = parsePin(fixturePin({sha256: 'a'.repeat(64), length: ctx.archive.length}));
  await assert.rejects(install(ctx, {manifest: wrongHash}), expectCode('archive_hash_mismatch'));
  const wrongLength = parsePin(fixturePin({sha256: ctx.archive.sha256, length: ctx.archive.length + 1}));
  await assert.rejects(install(ctx, {manifest: wrongLength}), expectCode('archive_length_mismatch'));
  await assert.rejects(install(ctx, {archivePath: join(ctx.dir, 'absent.zip')}), expectCode('archive_missing'));
  assert.equal(pointer(ctx.home), null);
  assert.equal(existsSync(join(ctx.home, 'runtimes', ctx.pin.release)), false);
  assert.deepEqual(stagingLeftovers(ctx.home), []);
});

test('a corrupt archive whose bytes match the pin fails extraction cleanly', {skip: !darwin}, async t => {
  const ctx = setup(t);
  const corrupt = join(ctx.dir, 'corrupt.zip');
  writeFileSync(corrupt, readFileSync(ctx.archive.zip).subarray(0, 200));
  const bytes = readFileSync(corrupt);
  const {createHash} = await import('node:crypto');
  const pin = parsePin(fixturePin({sha256: createHash('sha256').update(bytes).digest('hex'), length: bytes.length}));
  await assert.rejects(install(ctx, {manifest: pin, archivePath: corrupt}), expectCode('extract_failed'));
  assert.equal(pointer(ctx.home), null);
  assert.deepEqual(stagingLeftovers(ctx.home), []);
});

test('an archive built for another platform, missing a component file, or speaking another IPC version cannot activate', {skip: !darwin}, async t => {
  const cases = [
    ['wrong platform', {vendor: {target: 'darwin-x64', arch: 'x64'}}, 'vendor_manifest_mismatch'],
    ['other runtime version', {vendor: {runtime_archive_version: '0.0.26/x'}}, 'vendor_manifest_mismatch'],
    ['vendor manifest is JSON null', {vendorRaw: 'null'}, 'vendor_manifest_mismatch'],
    ['missing node_repl', {omit: ['cua_node/bin/node_repl']}, 'layout_invalid'],
    ['other ipc', {ipc: 'CodexComputerUseIPC-4'}, 'ipc_mismatch'],
  ];
  for (const [name, archive, code] of cases) {
    const ctx = setup(t, {archive});
    await assert.rejects(install(ctx), expectCode(code), name);
    assert.equal(pointer(ctx.home), null, name);
    assert.equal(existsSync(join(ctx.home, 'runtimes', ctx.pin.release)), false, name);
    assert.deepEqual(stagingLeftovers(ctx.home), [], name);
  }
});

test('the production signature check rejects unsigned components, so a fixture cannot pass as the vendor runtime', {skip: !darwin}, async t => {
  const ctx = setup(t);
  await assert.rejects(installRuntime({home: ctx.home, manifest: ctx.pin, archivePath: ctx.archive.zip, host: HOST}), err => {
    assert.equal(err.code, 'signature_invalid');
    assert.match(err.message, /cua_node\/bin\/node/);
    return true;
  });
  assert.equal(pointer(ctx.home), null);
  assert.deepEqual(stagingLeftovers(ctx.home), []);
});

test('the production signature check requires the pinned team, not merely a valid Apple signature', {skip: !darwin}, async () => {
  const pin = parsePin(fixturePin({sha256: 'a'.repeat(64), length: 1, signing: {team: '2DC432GLL2', components: ['cua_node/bin/node']}}));
  // /usr/bin/true is validly signed by Apple, so only the team requirement can reject it.
  const s = scratch();
  try {
    mkdirSync(join(s.dir, 'cua_node/bin'), {recursive: true});
    writeFileSync(join(s.dir, 'cua_node/bin/node'), readFileSync('/usr/bin/true'));
    const results = await verifyCodeSignatures(s.dir, pin);
    assert.equal(results.length, 1);
    assert.equal(results[0].valid, false);
  } finally { s.cleanup(); }
});

test('a failed activation of a second release leaves the first release active and its tree untouched', {skip: !darwin}, async t => {
  const first = setup(t, {release: '0.0.1-darwin-arm64'});
  await install(first);
  const second = setup(t, {release: '0.0.2-darwin-arm64'});
  second.home = first.home;
  // Validation failure of the second release.
  await assert.rejects(install(second, {verifySignatures: async (root, pin) => pin.signing.components.map(c => ({component: c, valid: false, detail: 'bad'}))}), expectCode('signature_invalid'));
  assert.equal(pointer(first.home), '0.0.1-darwin-arm64');
  assert.equal(existsSync(join(first.home, 'runtimes', '0.0.2-darwin-arm64')), false);
  // Something unowned occupies the release path.
  writeFileSync(join(first.home, 'runtimes', '0.0.2-darwin-arm64'), 'not ours');
  await assert.rejects(install(second), expectCode('target_occupied'));
  assert.equal(pointer(first.home), '0.0.1-darwin-arm64');
  assert.equal(readFileSync(join(first.home, 'runtimes', '0.0.2-darwin-arm64'), 'utf8'), 'not ours');
  assert.deepEqual(stagingLeftovers(first.home), []);
  assert.equal(resolveRuntime({home: first.home, pins: [first.pin, second.pin], host: HOST}).release, '0.0.1-darwin-arm64');
});

test('runtime use switches between verified installed releases and refuses anything else without moving the pointer', {skip: !darwin}, async t => {
  const first = setup(t, {release: '0.0.1-darwin-arm64'});
  await install(first);
  const second = setup(t, {release: '0.0.2-darwin-arm64'});
  second.home = first.home;
  await install(second);
  const pins = [first.pin, second.pin];
  assert.equal(pointer(first.home), '0.0.2-darwin-arm64');
  const used = await useRuntime({home: first.home, release: '0.0.1-darwin-arm64', pins, verifySignatures: acceptSignatures, host: HOST});
  assert.equal(used.release, '0.0.1-darwin-arm64');
  assert.equal(pointer(first.home), '0.0.1-darwin-arm64');
  await assert.rejects(useRuntime({home: first.home, release: '0.0.3-darwin-arm64', pins, verifySignatures: acceptSignatures, host: HOST}), expectCode('unknown_release'));
  const third = parsePin(fixturePin({release: '0.0.3-darwin-arm64', sha256: 'b'.repeat(64), length: 1}));
  await assert.rejects(useRuntime({home: first.home, release: '0.0.3-darwin-arm64', pins: [...pins, third], verifySignatures: acceptSignatures, host: HOST}), expectCode('release_not_installed'));
  await assert.rejects(useRuntime({home: first.home, release: '0.0.2-darwin-arm64', pins, verifySignatures: async (root, pin) => pin.signing.components.map(c => ({component: c, valid: false, detail: 'bad'})), host: HOST}), expectCode('signature_invalid'));
  rmSync(join(realpathSync(first.home), 'runtimes', '0.0.2-darwin-arm64', 'cua_node/manifest.json'));
  await assert.rejects(useRuntime({home: first.home, release: '0.0.2-darwin-arm64', pins, verifySignatures: acceptSignatures, host: HOST}), expectCode('layout_invalid'));
  assert.equal(pointer(first.home), '0.0.1-darwin-arm64');
});

test('install never repairs a damaged installed release in place: it stays byte-for-byte and recovery is offline', {skip: !darwin}, async t => {
  const first = setup(t, {release: '0.0.1-darwin-arm64'});
  await install(first);
  const second = setup(t, {release: '0.0.2-darwin-arm64'});
  second.home = first.home;
  await install(second);
  const root = join(realpathSync(first.home), 'runtimes', '0.0.1-darwin-arm64');
  const client = join(root, 'cua_node/lib/node_modules/@oai/sky/dist/project/cua/sky_js/src/targets/mac/client.js');
  writeFileSync(client, 'tampered');
  const before = statSync(root).ino;
  let fetched = false;
  await assert.rejects(install(first, {archivePath: undefined, fetch: async () => { fetched = true; }}), err => {
    assert.equal(err.code, 'installed_release_invalid');
    assert.match(err.hint, /stop any `cua serve`/);
    assert.ok(err.hint.includes(root), err.hint);
    return true;
  });
  assert.equal(fetched, false);
  assert.equal(readFileSync(client, 'utf8'), 'tampered');
  assert.equal(statSync(root).ino, before);
  assert.equal(pointer(first.home), '0.0.2-darwin-arm64');
  assert.deepEqual(stagingLeftovers(first.home), []);
});

test('an occupied release path that is not positively a cua release is refused and left exactly as it was', {skip: !darwin}, async t => {
  const {symlinkSync} = await import('node:fs');
  const occupants = {
    'regular file': target => writeFileSync(target, 'not ours'),
    'empty directory': target => mkdirSync(target),
    'symlink to a directory': (target, dir) => { mkdirSync(join(dir, 'elsewhere')); writeFileSync(join(dir, 'elsewhere', 'keep'), 'x'); symlinkSync(join(dir, 'elsewhere'), target); },
    'directory with an invalid install.json': target => { mkdirSync(target); writeFileSync(join(target, 'install.json'), '{}'); writeFileSync(join(target, 'keep'), 'x'); },
    'directory with an empty install.json': target => { mkdirSync(target); writeFileSync(join(target, 'install.json'), ''); },
  };
  for (const [name, occupy] of Object.entries(occupants)) {
    const ctx = setup(t);
    const runtimes = join(ctx.home, 'runtimes');
    mkdirSync(runtimes, {recursive: true});
    const target = join(runtimes, ctx.pin.release);
    occupy(target, ctx.dir);
    const snapshot = () => spawnSync('/bin/ls', ['-laR', target], {encoding: 'utf8'}).stdout + lstatSync(target).ino;
    const before = snapshot();
    await assert.rejects(install(ctx), expectCode('target_occupied'), name);
    assert.equal(snapshot(), before, name);
    assert.equal(pointer(ctx.home), null, name);
    assert.deepEqual(stagingLeftovers(ctx.home), [], name);
  }
});

test('resolution and runtime use refuse a release pinned for another host before anything can launch or activate it', {skip: !darwin}, async t => {
  const first = setup(t, {release: '0.0.1-darwin-arm64'});
  await install(first);
  const second = setup(t, {release: '0.0.2-darwin-arm64'});
  second.home = first.home;
  await install(second);
  const pins = [first.pin, second.pin];
  const x64 = {platform: 'darwin', arch: 'x64'};
  assert.throws(() => resolveRuntime({home: first.home, pins, host: x64}), expectCode('unsupported_platform'));
  await assert.rejects(useRuntime({home: first.home, release: '0.0.1-darwin-arm64', pins, verifySignatures: acceptSignatures, host: x64}), expectCode('unsupported_platform'));
  assert.equal(pointer(first.home), '0.0.2-darwin-arm64');
  assert.equal(resolveRuntime({home: first.home, pins, host: HOST}).release, '0.0.2-darwin-arm64');
});

test('download mode fetches the pinned URL, verifies it like a local archive, and reports HTTP or size failures', {skip: !darwin}, async t => {
  const ctx = setup(t);
  const bytes = readFileSync(ctx.archive.zip);
  const requested = [];
  const fetchOk = async url => { requested.push(String(url)); return new Response(bytes, {status: 200, headers: {'content-length': String(bytes.length)}}); };
  const result = await install(ctx, {archivePath: undefined, fetch: fetchOk});
  assert.deepEqual(requested, [ctx.pin.archive.url]);
  assert.equal(result.record.source, 'download');
  assert.equal(pointer(ctx.home), ctx.pin.release);

  const fresh = setup(t);
  await assert.rejects(install(fresh, {archivePath: undefined, fetch: async () => new Response('gone', {status: 404})}), expectCode('download_failed'));
  await assert.rejects(install(fresh, {archivePath: undefined, fetch: async () => new Response(Buffer.concat([bytes, Buffer.from('x')]))}), expectCode('archive_length_mismatch'));
  await assert.rejects(install(fresh, {archivePath: undefined, fetch: async () => { throw new TypeError('fetch failed'); }}), expectCode('download_failed'));
  const tampered = Buffer.from(bytes);
  tampered[tampered.length - 1] ^= 0xff;
  await assert.rejects(install(fresh, {archivePath: undefined, fetch: async () => new Response(tampered)}), expectCode('archive_hash_mismatch'));
  assert.equal(pointer(fresh.home), null);
  assert.deepEqual(stagingLeftovers(fresh.home), []);
});

test('install on an unsupported host refuses before touching the network or the home', async () => {
  const s = scratch();
  try {
    const pin = parsePin(fixturePin({sha256: 'a'.repeat(64), length: 1}));
    let fetched = false;
    await assert.rejects(installRuntime({home: join(s.dir, 'home'), manifest: pin, host: {platform: 'linux', arch: 'x64'}, fetch: async () => { fetched = true; }}), expectCode('unsupported_platform'));
    assert.equal(fetched, false);
    assert.equal(existsSync(join(s.dir, 'home')), false);
  } finally { s.cleanup(); }
});
