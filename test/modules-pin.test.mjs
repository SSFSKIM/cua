// scripts/modules-pin.mjs (#171 M6a T1; the pre-flight's §4.2, "The pin, and who vouches for it"): it writes
// runtime/modules/provenance.json only when every check passes: the deb is a pinned vendor archive, its
// `.pnpm/lock.yaml` is the one thing taken out of it, both architectures' closures computed from package-lock.json equal
// the vendor lockfile's closures by name, version and SHA-512, and each tarball fetched has its SHA-512. Run twice, it
// writes the same bytes. The archive here is a fixture deb built like the real one (an ar archive whose data.tar.xz
// holds the lockfile at the member its record names), the records are provenance records of the new shape (#171 M6b;
// the pre-flight's §4.1, §4.2) written to a directory of the test's and read through the script's own reader, and fetch
// serves the fixture registry.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {PROVENANCE_DIR, loadProvenanceRecords, parseProvenanceRecord, pinModules} from '../scripts/modules-pin.mjs';
import {REPO, arArchive, digest} from './fixtures/runtime-fixture.mjs';
import {FIXTURE_CLOSURES, FIXTURE_PACKAGES, fixtureProvenance, fixturePnpmLock, registry, sha256Of, tarball, writeFixtureModules} from './fixtures/module-registry.mjs';

const LOCK_IN_DEB = 'usr/lib/chatgpt/resources/cua_node/lib/node_modules/.pnpm/lock.yaml';

function fixtureDeb(dir, name, lockYaml, {member = LOCK_IN_DEB} = {}) {
  const tree = join(dir, `${name}-tree`);
  mkdirSync(dirname(join(tree, member)), {recursive: true});
  writeFileSync(join(tree, member), lockYaml);
  mkdirSync(join(tree, 'usr/lib/chatgpt/resources/cua_node'), {recursive: true});
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

// A provenance record of the new shape (§4.1) for a fixture deb, with `over` merged in (a key set to undefined is
// dropped).
function fixtureRecord({arch = 'x64', sha256, length, lockfile = LOCK_IN_DEB, ...over}) {
  const record = {schema: 1, release: `0.0.1-linux-${arch}`, platform: 'linux', arch,
    archive: {format: 'deb', url: `https://example.invalid/chatgpt_0.0.1_${arch}.deb`, length, sha256}, lockfile, notes: 'fixture: no signature was checked', ...over};
  for (const [key, value] of Object.entries(record)) if (value === undefined) delete record[key];
  return record;
}
// Writes `records` to a fresh directory `name` of the test's -> that directory.
function writeRecords(dir, records, name = 'provenance') {
  const out = join(dir, name);
  rmSync(out, {recursive: true, force: true});
  mkdirSync(out);
  for (const record of records) writeFileSync(join(out, `${record.release}.json`), `${JSON.stringify(record, null, 2)}\n`);
  return out;
}

function setup(t, {pnpm = {}, arm64 = false, lock, packages, record = {}} = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'cua-modules-pin-')));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const modules = writeFixtureModules(join(dir, 'modules'), {lock, packages});
  rmSync(join(modules.dir, 'provenance.json'));
  const yaml = fixturePnpmLock({packages, ...pnpm});
  const x64 = fixtureDeb(dir, 'x64', yaml);
  const records = [fixtureRecord({arch: 'x64', sha256: x64.sha256, length: x64.length, ...record})];
  const debs = [x64.path];
  if (arm64) {
    const deb = fixtureDeb(dir, 'arm64', fixturePnpmLock(arm64 === true ? {} : arm64));
    records.push(fixtureRecord({arch: 'arm64', sha256: deb.sha256, length: deb.length}));
    debs.push(deb.path);
  }
  const provenanceDir = writeRecords(dir, records);
  const run = (extra = {}) => pinModules({debs, modulesDir: modules.dir, provenanceDir, fetch: modules.fetch, log: () => {}, ...extra});
  return {dir, modules, records, provenanceDir, debs, run, yaml, x64, out: join(modules.dir, 'provenance.json')};
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
  assert.deepEqual(written.vendor, [{release: s.records[0].release, archiveSha256: s.x64.sha256, lockfileSha256: sha256Of(Buffer.from(s.yaml))}]);
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
  assert.deepEqual(provenance.vendor.map(v => v.release).sort(), s.records.map(r => r.release).sort());
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

test('a package the installer would refuse is refused at pin time: a tarball without its package.json, and nothing is written', async t => {
  const packages = {...FIXTURE_PACKAGES, 'node_modules/beta': {...FIXTURE_PACKAGES['node_modules/beta'], bytes: tarball([{name: 'package/index.js', data: 'module.exports = 1;\n'}])}};
  const s = setup(t, {packages});
  await assert.rejects(s.run(), refused(/package\.json/));
  assert.equal(existsSync(s.out), false);
});

// ---- the records and their reader (#171 M6b; the pre-flight's §4.1, §4.2) ----

test('the two checked-in records load through the script\'s reader: the release, the length, the SHA-256 and the lockfile member, and no URL', () => {
  assert.equal(PROVENANCE_DIR, join(REPO, 'runtime', 'provenance'));
  assert.deepEqual(readdirSync(PROVENANCE_DIR).sort(), ['26.928.40906-linux-arm64.json', '26.928.40906-linux-x64.json']);
  const records = loadProvenanceRecords();
  assert.deepEqual(records, [
    {release: '26.928.40906-linux-arm64', length: 453477698, sha256: 'ab3eea138b767555aecb2b69f4aa553d843e6c5ef3037645e544aafc72d0f5cd', lockfile: LOCK_IN_DEB},
    {release: '26.928.40906-linux-x64', length: 474898954, sha256: '8094004f1cbccf35deefded15961aa42b4db889121a5d952c5f30cf82bd8ad30', lockfile: LOCK_IN_DEB},
  ]);
  // what a record keeps: where the archive was published, and the record of its signature check
  for (const [arch, deb] of [['x64', 'amd64'], ['arm64', 'arm64']]) {
    const json = JSON.parse(readFileSync(join(PROVENANCE_DIR, `26.928.40906-linux-${arch}.json`), 'utf8'));
    assert.deepEqual(Object.keys(json), ['schema', 'release', 'platform', 'arch', 'archive', 'lockfile', 'notes'], arch);
    assert.equal(json.archive.url, `https://persistent.oaistatic.com/codex-app-prod/linux/deb/pool/main/c/chatgpt/chatgpt_26.928.40906_${deb}.deb`);
    for (const fact of ['_gpgorigin', '3BFA0E4AE8B8CC16A2D9BA684A3B4A566C4660E4', 'GOODSIG', `chatgpt_26.928.40906_${deb}.deb`, 'BADSIG']) assert.ok(json.notes.includes(fact), `${arch}: ${fact}`);
  }
});

test('the reader is strict: exactly the record\'s keys, each in its form, and a lockfile member of plain components ending in /.pnpm/lock.yaml', () => {
  const good = fixtureRecord({sha256: 'a'.repeat(64), length: 1});
  assert.deepEqual(parseProvenanceRecord(good), {release: '0.0.1-linux-x64', length: 1, sha256: 'a'.repeat(64), lockfile: LOCK_IN_DEB});
  assert.deepEqual(parseProvenanceRecord({...good, lockfile: 'opt/@scope/v_1-2/.pnpm/lock.yaml'}).lockfile, 'opt/@scope/v_1-2/.pnpm/lock.yaml');
  // the shape these records had as pins, before the trim: what an installer could act on is no record
  const asPin = {...good, appVersion: '0.0.1', components: {cua_node: 'usr/lib/chatgpt/resources/cua_node'}, runtime: {version: 'x', node: 'y'}, layout: {moduleDir: 'cua_node/lib/node_modules'}, lockfile: undefined};
  delete asPin.lockfile;
  const cases = {
    'the pin\'s shape': asPin,
    'an extra key': {...good, components: {}},
    'an extra archive key': {...good, archive: {...good.archive, mirror: 'https://elsewhere.invalid/x.deb'}},
    'no notes': fixtureRecord({sha256: 'a'.repeat(64), length: 1, notes: undefined}),
    'empty notes': {...good, notes: ''},
    'schema 2': {...good, schema: 2},
    'another platform': {...good, platform: 'darwin'},
    'a release that is not the arch\'s': {...good, release: '0.0.1-linux-arm64'},
    'a release of another form': {...good, release: 'cua-linux-x64'},
    'a zip': {...good, archive: {...good.archive, format: 'zip'}},
    'http': {...good, archive: {...good.archive, url: 'http://example.invalid/x.deb'}},
    'not a URL': {...good, archive: {...good.archive, url: 'chatgpt.deb'}},
    'a short hash': {...good, archive: {...good.archive, sha256: 'abc'}},
    'a length of 0': {...good, archive: {...good.archive, length: 0}},
    'an absolute lockfile': {...good, lockfile: `/${LOCK_IN_DEB}`},
    'a ./ lockfile': {...good, lockfile: `./${LOCK_IN_DEB}`},
    'a lockfile that climbs': {...good, lockfile: 'usr/lib/../../etc/.pnpm/lock.yaml'},
    'a lockfile with a . component': {...good, lockfile: 'usr/./lib/.pnpm/lock.yaml'},
    'a lockfile with an empty component': {...good, lockfile: 'usr//lib/.pnpm/lock.yaml'},
    'a lockfile that ends elsewhere': {...good, lockfile: 'usr/lib/chatgpt/resources/cua_node/manifest.json'},
    'a lockfile named alone': {...good, lockfile: '.pnpm/lock.yaml'},
    'a lockfile with a space': {...good, lockfile: 'usr/lib/chat gpt/.pnpm/lock.yaml'},
    'a lockfile with a wildcard': {...good, lockfile: 'usr/lib/*/.pnpm/lock.yaml'},
    'a lockfile with a newline': {...good, lockfile: 'usr/lib\n/.pnpm/lock.yaml'},
    'a lockfile that is an option': {...good, lockfile: '--to-command=sh/.pnpm/lock.yaml'},
    'a list': [good],
  };
  for (const [name, json] of Object.entries(cases)) assert.throws(() => parseProvenanceRecord(json), {code: 'invalid_provenance'}, name);
});

test('a record whose lockfile is absolute, climbs or ends elsewhere refuses the run before the deb is read, and nothing is written', async t => {
  for (const lockfile of [`/${LOCK_IN_DEB}`, 'usr/lib/../../etc/.pnpm/lock.yaml', 'usr/lib/chatgpt/resources/cua_node/manifest.json']) {
    const s = setup(t, {record: {lockfile}});
    const read = [];
    await assert.rejects(s.run({log: line => read.push(line)}), {code: 'invalid_provenance'}, lockfile);
    assert.deepEqual(read, [], `${lockfile}: no deb matched`);
    assert.equal(existsSync(s.out), false, lockfile);
    assert.deepEqual(s.modules.urls, [], 'nothing fetched');
  }
});

test('the lockfile is the member the record names: a deb that lacks it is refused, and one holding it elsewhere is read there', async t => {
  const s = setup(t, {record: {lockfile: 'usr/lib/chatgpt/resources/elsewhere/lib/node_modules/.pnpm/lock.yaml'}});
  await assert.rejects(s.run(), refused(/could not take \.\/usr\/lib\/chatgpt\/resources\/elsewhere\/lib\/node_modules\/\.pnpm\/lock\.yaml out of/));
  assert.equal(existsSync(s.out), false);
  const member = 'opt/vendor/lib/node_modules/.pnpm/lock.yaml';
  const deb = fixtureDeb(s.dir, 'moved', s.yaml, {member});
  const provenanceDir = writeRecords(s.dir, [fixtureRecord({sha256: deb.sha256, length: deb.length, lockfile: member})], 'moved');
  const {provenance} = await s.run({debs: [deb.path], provenanceDir});
  assert.equal(provenance.vendor[0].lockfileSha256, sha256Of(Buffer.from(s.yaml)));
});

test('pinModules takes no pins: one of the old shape naming the deb is not read, and only the records directory can match it', async t => {
  const s = setup(t);
  const oldShape = {schema: 1, release: s.records[0].release, appVersion: '0.0.1', platform: 'linux', arch: 'x64',
    archive: {format: 'deb', url: 'https://example.invalid/x.deb', length: s.x64.length, sha256: s.x64.sha256},
    components: {cua_node: 'usr/lib/chatgpt/resources/cua_node'}, runtime: {version: 'x', node: 'y'}, layout: {moduleDir: 'cua_node/lib/node_modules'}};
  await assert.rejects(s.run({pins: [oldShape], provenanceDir: writeRecords(s.dir, [], 'empty')}), {code: 'archive_not_pinned'});
  // a record of the old shape in the directory is no record
  await assert.rejects(s.run({provenanceDir: writeRecords(s.dir, [oldShape], 'old')}), {code: 'invalid_provenance'});
  // nor is one whose file is not named for its release
  const misnamed = writeRecords(s.dir, [], 'misnamed');
  writeFileSync(join(misnamed, 'other.json'), JSON.stringify(s.records[0]));
  await assert.rejects(s.run({provenanceDir: misnamed}), {code: 'invalid_provenance'});
  assert.equal(existsSync(s.out), false);
  assert.deepEqual(s.modules.urls, [], 'nothing fetched');
});
