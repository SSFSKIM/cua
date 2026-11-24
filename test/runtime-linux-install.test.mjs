// Installing a Linux pin (Phase F): the deb is verified by length and hash, its data tar unpacked with the system `ar`
// and `tar`, the pinned component kept (the deb's Chrome plugin is not, since #79, nor its Codex CLI, since #115 M3), and the release
// activated with no code-signature step. Runs on any host: the Linux host is injected, and the fixture deb is a few harmless files.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {installRuntime, useRuntime} from '../src/runtime/install.mjs';
import {parsePin, vendorLinuxRuntime} from '../src/runtime/manifest.mjs';
import {scratch, debFixture, fixturePin, linuxFixturePin, debTools} from './fixtures/runtime-fixture.mjs';

const expectCode = code => err => { assert.equal(err.code, code, `expected ${code}, got ${err.code}: ${err.message}`); return true; };
const noSignatures = async () => { throw new Error('no code-signature check may run for a linux pin'); };
const pointer = home => existsSync(join(home, 'current.json')) ? JSON.parse(readFileSync(join(home, 'current.json'), 'utf8')).release : null;
const stagingLeftovers = home => existsSync(join(home, 'staging')) ? readdirSync(join(home, 'staging')) : [];

function setup(t, {arch = 'x64', deb: debOptions = {}, pin: pinOverrides = {}} = {}) {
  const s = scratch();
  t.after(s.cleanup);
  const archive = debFixture(s.dir, {arch, ...debOptions});
  const pin = parsePin(linuxFixturePin({arch, sha256: archive.sha256, length: archive.length, ...pinOverrides}));
  return {dir: s.dir, home: join(s.dir, 'home'), archive, pin, host: {platform: 'linux', arch}};
}
const install = (ctx, extra = {}) => installRuntime({home: ctx.home, manifest: ctx.pin, archivePath: ctx.archive.deb, verifySignatures: noSignatures, host: ctx.host, tools: debTools(), ...extra});

for (const arch of ['x64', 'arm64']) {
  test(`the ${arch} deb installs: only the pinned component (no Codex CLI), then activation`, async t => {
    const ctx = setup(t, {arch});
    const result = await install(ctx);
    const home = realpathSync(ctx.home);
    const root = join(home, 'runtimes', ctx.pin.release);
    assert.equal(result.root, root);
    assert.equal(result.changed, true);
    assert.deepEqual(readdirSync(root).sort(), ['cua_node', 'install.json'], 'the deb\'s codex is not placed');
    assert.equal(statSync(join(root, 'cua_node/bin/node_repl')).mode & 0o100, 0o100);
    assert.ok(existsSync(join(root, `cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_${arch}`)));
    assert.equal(pointer(ctx.home), ctx.pin.release);
    assert.deepEqual(JSON.parse(readFileSync(join(root, 'install.json'), 'utf8')).archive, {sha256: ctx.archive.sha256, length: ctx.archive.length});
    assert.equal(existsSync(join(home, 'state', 'codex')), false, 'install creates no CODEX_HOME');
    assert.deepEqual(stagingLeftovers(home), []);
  });
}

test('an installed Linux release resolves, re-installs as a no-op without the archive; runtime use refuses it, naming CUA_NATIVE_ENGINE=vendor', async t => {
  const ctx = setup(t);
  await install(ctx);
  const runtime = vendorLinuxRuntime({home: ctx.home, pins: [ctx.pin], host: ctx.host});
  assert.equal('codexCli' in runtime.paths, false);
  assert.equal(runtime.paths.skyLinuxBin, join(runtime.root, 'cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64'));
  const again = await install(ctx, {archivePath: join(ctx.dir, 'gone.deb')});
  assert.equal(again.changed, false);
  // On Linux the pointer names cua's own runtime (#171 M6a, the pre-flight's §4.3): the vendor's tree serves only the
  // vendor's engine.
  await assert.rejects(useRuntime({home: ctx.home, release: ctx.pin.release, pins: [ctx.pin], verifySignatures: noSignatures, host: ctx.host}), err => {
    assert.equal(err.code, 'release_refused');
    assert.match(err.hint, /CUA_NATIVE_ENGINE=vendor/);
    return true;
  });
  assert.throws(() => vendorLinuxRuntime({home: ctx.home, pins: [ctx.pin], host: {platform: 'darwin', arch: 'arm64'}}), expectCode('unsupported_platform'));
});

test('a missing ar, tar or xz is refused before any download, naming the tool and the package that provides it', async t => {
  const ctx = setup(t);
  let fetched = false;
  const fetch = async () => { fetched = true; throw new Error('no network in tests'); };
  await assert.rejects(install(ctx, {archivePath: undefined, fetch, tools: debTools({missing: ['xz']})}), err => {
    assert.equal(err.code, 'missing_tool');
    assert.match(err.message, /\bxz\b/);
    assert.match(`${err.message} ${err.hint}`, /xz-utils/);
    return true;
  });
  await assert.rejects(install(ctx, {tools: debTools({missing: ['ar', 'tar']})}), err => {
    assert.equal(err.code, 'missing_tool');
    assert.match(`${err.message} ${err.hint}`, /\bar\b.*binutils/s);
    assert.match(`${err.message} ${err.hint}`, /\btar\b/);
    return true;
  });
  assert.equal(fetched, false);
  assert.equal(pointer(ctx.home), null);
  assert.deepEqual(stagingLeftovers(ctx.home), []);
});

test('a deb with the wrong hash is refused before extraction; one missing a component, or built for another arch, cannot activate', async t => {
  const wrong = setup(t, {pin: {}});
  const tampered = parsePin(linuxFixturePin({sha256: 'f'.repeat(64), length: wrong.archive.length}));
  await assert.rejects(install({...wrong, pin: tampered}), expectCode('archive_hash_mismatch'));

  const noNodeRepl = setup(t, {deb: {omit: ['cua_node/bin/node_repl']}});
  await assert.rejects(install(noNodeRepl), expectCode('layout_invalid'));
  const otherArch = setup(t, {deb: {vendor: {arch: 'arm64', target: 'linux-arm64'}}});
  await assert.rejects(install(otherArch), expectCode('vendor_manifest_mismatch'));
  const noPayload = setup(t, {deb: {dataMember: 'data.tar.zst'}});
  await assert.rejects(install(noPayload), expectCode('extract_failed'));
  for (const ctx of [wrong, noNodeRepl, otherArch, noPayload]) {
    assert.equal(pointer(ctx.home), null);
    assert.deepEqual(stagingLeftovers(ctx.home), []);
  }
});

test('a Linux pin is refused on a macOS host before anything is read', async t => {
  const ctx = setup(t);
  await assert.rejects(install(ctx, {host: {platform: 'darwin', arch: 'arm64'}}), expectCode('unsupported_platform'));
  assert.equal(existsSync(ctx.home), false);
});

// #171 M6a: on Linux the vendor's tree is a lane of cua install, kept for CUA_NATIVE_ENGINE=vendor; it never takes the
// pointer, which names cua's own runtime there (src/runtime/linux-install.mjs).
test('with activate false the vendor\'s tree is placed and verified, and the pointer is left as it was', async t => {
  const ctx = setup(t);
  const fresh = await install(ctx, {activate: false});
  assert.equal(fresh.changed, true);
  assert.equal(pointer(ctx.home), null);
  const own = 'cua-linux-x64-e0.4.3-n24.22.0-s0.163.0-m000000000000';
  writeFileSync(join(ctx.home, 'current.json'), JSON.stringify({schema: 1, release: own}));
  const again = await install(ctx, {activate: false});
  assert.equal(again.changed, false);
  assert.equal(pointer(ctx.home), own);
});

// A runtimes/ that is a file blocks every release under it: the refusal names that file, never a runtimes/<release> that
// cannot exist (T2's deferred Minor, where install surfaces it).
test('a runtimes/ that is a file is refused as what stands in the way, and left as it is', async t => {
  const ctx = setup(t);
  mkdirSync(ctx.home, {recursive: true});
  writeFileSync(join(ctx.home, 'runtimes'), 'not a directory');
  const blocking = join(realpathSync(ctx.home), 'runtimes');
  await assert.rejects(install(ctx), err => {
    assert.equal(err.code, 'target_occupied');
    assert.equal(err.message, `${blocking} exists and was not installed by cua; it is left untouched`);
    assert.doesNotMatch(`${err.message} ${err.hint}`, /runtimes\/0\.0\.1/);
    return true;
  });
  assert.equal(readFileSync(blocking, 'utf8'), 'not a directory');
});

// Fix wave 1 (b): macOS's install is as it was: that check is the Linux vendor lane's.
test('on macOS a runtimes/ that is a file fails as it did, with the filesystem\'s own error', async t => {
  const ctx = setup(t);
  mkdirSync(ctx.home, {recursive: true});
  writeFileSync(join(ctx.home, 'runtimes'), 'not a directory');
  const darwin = {platform: 'darwin', arch: 'arm64'};
  await assert.rejects(installRuntime({home: ctx.home, manifest: parsePin(fixturePin({sha256: 'a'.repeat(64), length: 1})), archivePath: ctx.archive.deb, host: darwin, verifySignatures: noSignatures}),
    err => { assert.equal(err.code, 'EEXIST', err.message); return true; });
});
