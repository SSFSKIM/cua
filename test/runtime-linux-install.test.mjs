// Installing a Linux pin (Phase F): the deb is verified by length and hash, its data tar unpacked with the system `ar`
// and `tar`, the pinned components (one of them a file) and the Chrome plugin kept, and the release activated with no
// code-signature step. Runs on any host: the Linux host is injected, and the fixture deb is a few harmless files.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync, readdirSync, realpathSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {installRuntime, useRuntime} from '../src/runtime/install.mjs';
import {parsePin, resolveRuntime} from '../src/runtime/manifest.mjs';
import {scratch, debFixture, linuxFixturePin, debTools} from './fixtures/runtime-fixture.mjs';

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
  test(`the ${arch} deb installs: only the pinned components (codex a file), the Chrome plugin with its host configuration, then activation`, async t => {
    const ctx = setup(t, {arch});
    const result = await install(ctx);
    const home = realpathSync(ctx.home);
    const root = join(home, 'runtimes', ctx.pin.release);
    assert.equal(result.root, root);
    assert.equal(result.changed, true);
    assert.deepEqual(readdirSync(root).sort(), ['chrome-plugin', 'codex', 'cua_node', 'install.json']);
    assert.ok(statSync(join(root, 'codex')).isFile());
    assert.equal(statSync(join(root, 'codex')).mode & 0o100, 0o100, 'the sandbox CLI stays executable');
    assert.equal(statSync(join(root, 'cua_node/bin/node_repl')).mode & 0o100, 0o100);
    assert.ok(existsSync(join(root, `cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_${arch}`)));
    assert.equal(pointer(ctx.home), ctx.pin.release);
    assert.deepEqual(JSON.parse(readFileSync(join(root, 'install.json'), 'utf8')).archive, {sha256: ctx.archive.sha256, length: ctx.archive.length});
    const hostDir = join(root, 'chrome-plugin', 'extension-host', 'linux', arch);
    assert.ok(existsSync(join(hostDir, 'extension-host')));
    const config = JSON.parse(readFileSync(join(hostDir, 'extension-host-config.json'), 'utf8'));
    assert.equal(config.codexCliPath, join(root, 'codex'));
    assert.equal(config.nodeReplPath, join(root, 'cua_node/bin/node_repl'));
    assert.equal(config.codexHome, join(home, 'state', 'codex'));
    assert.deepEqual(stagingLeftovers(home), []);
  });
}

test('an installed Linux release resolves, re-installs as a no-op without the archive, and runtime use selects it', async t => {
  const ctx = setup(t);
  await install(ctx);
  const runtime = resolveRuntime({home: ctx.home, pins: [ctx.pin], host: ctx.host});
  assert.equal(runtime.paths.codexCli, join(runtime.root, 'codex'));
  assert.equal(runtime.paths.skyLinuxBin, join(runtime.root, 'cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64'));
  const again = await install(ctx, {archivePath: join(ctx.dir, 'gone.deb')});
  assert.equal(again.changed, false);
  assert.equal((await useRuntime({home: ctx.home, release: ctx.pin.release, pins: [ctx.pin], verifySignatures: noSignatures, host: ctx.host})).release, ctx.pin.release);
  assert.throws(() => resolveRuntime({home: ctx.home, pins: [ctx.pin], host: {platform: 'darwin', arch: 'arm64'}}), expectCode('unsupported_platform'));
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

  const noCodex = setup(t, {deb: {omit: ['codex']}});
  await assert.rejects(install(noCodex), expectCode('layout_invalid'));
  const otherArch = setup(t, {deb: {vendor: {arch: 'arm64', target: 'linux-arm64'}}});
  await assert.rejects(install(otherArch), expectCode('vendor_manifest_mismatch'));
  const noPayload = setup(t, {deb: {dataMember: 'data.tar.zst'}});
  await assert.rejects(install(noPayload), expectCode('extract_failed'));
  for (const ctx of [wrong, noCodex, otherArch, noPayload]) {
    assert.equal(pointer(ctx.home), null);
    assert.deepEqual(stagingLeftovers(ctx.home), []);
  }
});

test('a Linux pin is refused on a macOS host before anything is read', async t => {
  const ctx = setup(t);
  await assert.rejects(install(ctx, {host: {platform: 'darwin', arch: 'arm64'}}), expectCode('unsupported_platform'));
  assert.equal(existsSync(ctx.home), false);
});
