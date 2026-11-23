// scripts/modules-pin.mjs (#171 M6a T1; the pre-flight's §4.2, "The pin, and who vouches for it"): it writes
// runtime/modules/provenance.json only when every check passes: the deb is a pinned vendor archive, its
// `.pnpm/lock.yaml` is the one thing taken out of it, both architectures' closures computed from package-lock.json equal
// the vendor lockfile's closures by name, version and SHA-512, and each tarball fetched has its SHA-512. Run twice, it
// writes the same bytes. The archive here is a fixture deb built like the real one (an ar archive whose data.tar.xz
// holds the lockfile at the pin's module directory), the pins are fixture pins naming it, and fetch serves the fixture
// registry.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {pinModules} from '../scripts/modules-pin.mjs';
import {arArchive, digest, linuxFixturePin} from './fixtures/runtime-fixture.mjs';
import {FIXTURE_CLOSURES, fixtureProvenance, fixturePnpmLock, registry, sha256Of, writeFixtureModules} from './fixtures/module-registry.mjs';

const LOCK_IN_DEB = 'usr/lib/chatgpt/resources/cua_node/lib/node_modules/.pnpm/lock.yaml';

function fixtureDeb(dir, name, lockYaml) {
  const tree = join(dir, `${name}-tree`);
  mkdirSync(dirname(join(tree, LOCK_IN_DEB)), {recursive: true});
  writeFileSync(join(tree, LOCK_IN_DEB), lockYaml);
  writeFileSync(join(tree, 'usr/lib/chatgpt/resources/cua_node/other-file'), `not taken out: ${name}`);
  const tar = (out, ...paths) => {
    const r = spawnSync('tar', ['-cJf', join(dir, out), '-C', tree, ...paths], {encoding: 'utf8'});
    if (r.status !== 0) throw new Error(`tar failed: ${r.stderr}`);
    const bytes = readFileSync(join(dir, out));
    rmSync(join(dir, out));
    return bytes;
  };
  const data = tar('data.tar.xz', '.');
  rmSync(tree, {recursive: true, force: true});
  const bytes = arArchive([['debian-binary', Buffer.from('2.0\n')], ['control.tar.xz', data], ['data.tar.xz', data]]);
  const path = join(dir, `${name}.deb`);
  writeFileSync(path, bytes);
  return {path, ...digest(bytes)};
}

function setup(t, {pnpm = {}, arm64 = false, lock} = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'cua-modules-pin-')));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const modules = writeFixtureModules(join(dir, 'modules'), {lock});
  rmSync(join(modules.dir, 'provenance.json'));
  const yaml = fixturePnpmLock(pnpm);
  const x64 = fixtureDeb(dir, 'x64', yaml);
  const pins = [linuxFixturePin({arch: 'x64', sha256: x64.sha256, length: x64.length})];
  const debs = [x64.path];
  if (arm64) {
    const deb = fixtureDeb(dir, 'arm64', fixturePnpmLock(arm64 === true ? {} : arm64));
    pins.push(linuxFixturePin({arch: 'arm64', sha256: deb.sha256, length: deb.length}));
    debs.push(deb.path);
  }
  const run = (extra = {}) => pinModules({debs, modulesDir: modules.dir, pins, fetch: modules.fetch, log: () => {}, ...extra});
  return {dir, modules, pins, debs, run, yaml, x64, out: join(modules.dir, 'provenance.json')};
}
const refused = pattern => error => { assert.ok(error.code, error.message); if (pattern) assert.match(error.message, pattern); return true; };

test('against a pinned deb whose lockfile agrees, it writes the provenance: both closures, each tarball\'s length, and the archive it checked', async t => {
  const s = setup(t);
  const {provenance} = await s.run();
  const written = JSON.parse(readFileSync(s.out, 'utf8'));
  assert.deepEqual(written, provenance);
  const expected = fixtureProvenance(s.modules.lockText, s.modules.tarballs);
  assert.deepEqual(written.targets, expected.targets);
  assert.equal(written.lock, sha256Of(Buffer.from(s.modules.lockText)));
  assert.deepEqual(written.vendor, [{release: s.pins[0].release, archiveSha256: s.x64.sha256, lockfileSha256: sha256Of(Buffer.from(s.yaml))}]);
  const fetched = new Set([...FIXTURE_CLOSURES.x64, ...FIXTURE_CLOSURES.arm64].map(path => s.modules.lock.packages[path].resolved));
  assert.deepEqual([...s.modules.urls].sort(), [...fetched].sort(), 'each tarball of either closure fetched once');
});

test('the same input twice writes the same bytes', async t => {
  const s = setup(t);
  await s.run();
  const first = readFileSync(s.out);
  await s.run();
  assert.deepEqual(readFileSync(s.out), first);
});

test('given the arm64 deb as well, it compares against that lockfile too and records that it did', async t => {
  const s = setup(t, {arm64: true});
  const {provenance} = await s.run();
  assert.deepEqual(provenance.vendor.map(v => v.release).sort(), s.pins.map(p => p.release).sort());
});

test('a vendor lockfile whose version, integrity or name differs from the lock\'s closure is refused, and nothing is written', async t => {
  const swap = (from, to, change) => specs => {
    const spec = specs[from];
    delete specs[from];
    specs[to] = change ? change(spec) : spec;
    for (const other of Object.values(specs)) for (const edges of [other.deps, other.optional]) for (const [name, version] of Object.entries(edges ?? {}))
      if (`${name}@${version}` === from) { delete edges[name]; edges[to.slice(0, to.lastIndexOf('@'))] = to.slice(to.lastIndexOf('@') + 1); }
    return specs;
  };
  const cases = {
    'a version': [swap('beta@1.1.0', 'beta@1.1.1'), /beta/],
    'an integrity': [specs => { specs['lev@3.0.0'].integrity = `sha512-${Buffer.alloc(64, 7).toString('base64')}`; return specs; }, /lev/],
    'a name': [swap('@fx/vips-linux-x64@8.1.0', '@fx/libvips-linux-x64@8.1.0'), /vips-linux-x64/],
    'a closure without libc on the platform packages': [specs => { for (const spec of Object.values(specs)) delete spec.platform.libc; return specs; }, /linuxmusl/],
  };
  for (const [name, [edit, pattern]] of Object.entries(cases)) {
    const s = setup(t, {pnpm: {edit}});
    await assert.rejects(s.run(), refused(pattern), name);
    assert.equal(existsSync(s.out), false, `${name}: nothing written`);
  }
  // A lock written by an npm that drops libc admits the musl builds, which the vendor's closure does not hold.
  const noLibc = setup(t, {lock: lock => { for (const entry of Object.values(lock.packages)) delete entry.libc; }});
  await assert.rejects(noLibc.run(), refused(/linuxmusl-x64.* is in the lock's closure, not the vendor's/));
  assert.equal(existsSync(noLibc.out), false);
  // The arm64 deb's lockfile is compared too: one that disagrees refuses even when the x64 one agrees.
  const s = setup(t, {arm64: {edit: specs => { specs['beta@1.1.0'].integrity = `sha512-${Buffer.alloc(64, 1).toString('base64')}`; return specs; }}});
  await assert.rejects(s.run(), refused(/beta/));
  assert.equal(existsSync(s.out), false);
});

test('a deb that is not a pinned archive is refused before anything is read from it, and nothing is written', async t => {
  const s = setup(t);
  const other = join(s.dir, 'other.deb');
  writeFileSync(other, Buffer.concat([readFileSync(s.debs[0]), Buffer.from('x')]));
  await assert.rejects(s.run({debs: [other]}), refused(/pin/));
  const same = join(s.dir, 'same-length.deb');
  const bytes = readFileSync(s.debs[0]);
  bytes[bytes.length - 1] ^= 1;
  writeFileSync(same, bytes);
  await assert.rejects(s.run({debs: [same]}), refused(/pin/));
  assert.equal(existsSync(s.out), false);
  assert.deepEqual(s.modules.urls, [], 'nothing fetched');
});

test('a fetched tarball whose SHA-512 is not the lock\'s is refused, and nothing is written', async t => {
  const s = setup(t);
  const url = s.modules.lock.packages['node_modules/beta'].resolved;
  const {fetch} = registry(s.modules.tarballs, href => href === url ? new Response(Buffer.from('other bytes')) : null);
  await assert.rejects(s.run({fetch}), refused(/beta|SHA-512|sha512/i));
  assert.equal(existsSync(s.out), false);
});

test('a provenance already there is replaced only by a run whose checks all pass', async t => {
  const s = setup(t);
  writeFileSync(s.out, 'previous\n');
  const bad = registry(new Map());
  await assert.rejects(s.run({fetch: bad.fetch}));
  assert.equal(readFileSync(s.out, 'utf8'), 'previous\n');
});

// Fix wave 1: the bytes that are hashed are the bytes that are parsed, and what the registry sends is bounded.

test('the deb is snapshotted first: one replaced after its hash is checked changes nothing the run reads', async t => {
  const s = setup(t);
  const other = fixtureDeb(s.dir, 'swapped', fixturePnpmLock({edit: specs => { specs['lev@3.0.0'].integrity = `sha512-${Buffer.alloc(64, 9).toString('base64')}`; return specs; }}));
  const log = message => { if (message.includes('the pinned')) writeFileSync(s.debs[0], readFileSync(other.path)); };
  const {provenance} = await s.run({log});
  assert.equal(provenance.vendor[0].lockfileSha256, sha256Of(Buffer.from(s.yaml)), 'the lockfile read is the pinned deb\'s');
});

test('each tarball comes from its canonical URL itself, under a size cap: a redirect, or a body past the cap, is refused and nothing written', async t => {
  const s = setup(t);
  const asked = [];
  await s.run({fetch: async (url, init) => { asked.push(init?.redirect); return s.modules.fetch(url, init); }});
  assert.ok(asked.length && asked.every(redirect => redirect === 'error'), JSON.stringify(asked));
  rmSync(s.out);
  const moved = registry(s.modules.tarballs, () => new Response(null, {status: 301, headers: {location: 'https://example.invalid/'}}));
  await assert.rejects(s.run({fetch: moved.fetch}), refused(/301/));
  const endless = registry(s.modules.tarballs, () => new Response(new ReadableStream({pull(controller) { controller.enqueue(new Uint8Array(64 * 1024)); }})));
  await assert.rejects(s.run({fetch: endless.fetch, maxTarballBytes: 1024 * 1024}), refused(/bound/));
  const declared = registry(s.modules.tarballs, () => new Response('x', {headers: {'content-length': String(2 * 1024 * 1024)}}));
  await assert.rejects(s.run({fetch: declared.fetch, maxTarballBytes: 1024 * 1024}), refused(/bound/));
  assert.equal(existsSync(s.out), false);
});
