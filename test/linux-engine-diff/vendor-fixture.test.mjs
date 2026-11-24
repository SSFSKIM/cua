// The comparator fixture (#171 M6b, its pre-flight §4.4, F7): the gate takes the pinned vendor build and the vendor's
// client from a hash-checked fixture directory outside any cua home, and the one-time pin tool writes a fixture's
// manifest entry only after the fixture's tree equals its authenticated deb's payload. Display-free; nothing fetches.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, afterEach, beforeEach, test } from 'node:test';

import { DECLARED_VENDOR_ENDS } from '../../scripts/linux-engine-diff/scene-ended.mjs';
import { EXTRACTED, SERVICE_PATH, VendorFixtureRefused, binaryPath, fixturePaths, loadFixtureManifest, releaseName, VENDOR_FIXTURE_RELEASE, verifyVendorFixture } from '../../scripts/linux-engine-diff/vendor-fixture.mjs';
import { pinVendorFixture } from '../../scripts/linux-engine-gate/vendor-fixture-pin.mjs';
import { arArchive } from '../fixtures/runtime-fixture.mjs';

const scratch = mkdtempSync(join(tmpdir(), 'cua171-fixture-test-'));
after(() => rmSync(scratch, { recursive: true, force: true }));
let n = 0;
const fresh = (name) => {
  const dir = join(scratch, `${name}-${n++}`);
  mkdirSync(dir, { recursive: true });
  return dir;
};
const mkdirP = (path) => (mkdirSync(path, { recursive: true }), path);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const ARCH = 'x64';
const RELEASE = releaseName(ARCH);

// Nothing here may reach the network: any fetch fails the test that made it.
let fetches = [];
const realFetch = globalThis.fetch;
beforeEach(() => {
  fetches = [];
  globalThis.fetch = async (url) => {
    fetches.push(String(url));
    throw new Error('no network in the fixture tests');
  };
});
afterEach(() => {
  globalThis.fetch = realFetch;
  assert.deepEqual(fetches, [], 'nothing fetched');
});

/** The release tree's files, relative to the release: cua's install.json and a small cua_node. */
const TREE = {
  'install.json': '{"schema":1,"release":"26.928.40906-linux-x64"}\n',
  [binaryPath(ARCH)]: 'the pinned vendor build',
  [SERVICE_PATH]: 'export const service = 1;\n',
  'cua_node/bin/node': 'a node binary',
  'cua_node/lib/node_modules/@oai/sky/package.json': '{"name":"@oai/sky"}\n',
};

function writeTree(root, files, links = {}) {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  for (const [path, target] of Object.entries(links)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    symlinkSync(target, join(root, path));
  }
}
const tarOf = (out, cwd, ...paths) => {
  const r = spawnSync('tar', ['-cf', out, '-C', cwd, ...paths], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`tar failed: ${r.stderr}`);
};
const listOf = (files) => Object.entries(files).sort(([a], [b]) => (a < b ? -1 : 1)).map(([path, text]) => `${sha(Buffer.from(text))}  ./${path}\n`).join('');

/** A fixture directory as the VM holds one: the tar, the list, SHA256SUMS; and the manifest entry that matches it. */
function makeFixture({ files = TREE, links = {}, list = listOf(files) } = {}) {
  const dir = fresh('fixture');
  const src = fresh('src');
  writeTree(join(src, RELEASE), files, links);
  const tar = join(dir, `${RELEASE}.tar`);
  tarOf(tar, src, RELEASE);
  writeFileSync(join(dir, 'tree-sha256.txt'), list);
  const tarBytes = readFileSync(tar);
  writeFileSync(join(dir, 'SHA256SUMS'), `${sha(tarBytes)}  ${RELEASE}.tar\n`);
  const entry = {
    release: RELEASE,
    tar: { name: `${RELEASE}.tar`, sha256: sha(tarBytes), length: tarBytes.length },
    treeList: { sha256: sha(Buffer.from(list)), files: list.split('\n').filter(Boolean).length },
    binary: { path: binaryPath(ARCH), sha256: sha(Buffer.from(files[binaryPath(ARCH)] ?? '')) },
    deb: { release: RELEASE, sha256: 'a'.repeat(64), length: 1 },
  };
  return { dir, tar, manifest: { schema: 1, about: 'test', fixtures: { [ARCH]: entry } } };
}

const refused = (pattern) => (error) => error instanceof VendorFixtureRefused && pattern.test(error.message);

test('a good fixture gives the pinned build and the client, extracted beside the tar on first use and checked on every use', () => {
  const { dir, manifest } = makeFixture();
  const got = verifyVendorFixture({ dir, arch: ARCH, manifest });
  const paths = fixturePaths(dir, ARCH);
  assert.equal(got.vendor, paths.vendor);
  assert.equal(got.vendorJs, paths.vendorJs);
  assert.equal(got.vendor, join(dir, EXTRACTED, RELEASE, 'cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64'));
  assert.equal(readFileSync(got.vendor, 'utf8'), 'the pinned vendor build');
  assert.equal(got.binarySha256, sha(Buffer.from('the pinned vendor build')));
  assert.equal(got.serviceSha256, sha(Buffer.from(TREE[SERVICE_PATH])));
  const extractedAt = statSync(join(dir, EXTRACTED)).mtimeMs;
  // a second use checks again and does not extract again
  let extracted = 0;
  verifyVendorFixture({ dir, arch: ARCH, manifest, extract: () => extracted++ });
  assert.equal(extracted, 0);
  assert.equal(statSync(join(dir, EXTRACTED)).mtimeMs, extractedAt);
});

test('one changed byte in the tar refuses before anything is extracted', () => {
  const { dir, tar, manifest } = makeFixture();
  const bytes = readFileSync(tar);
  bytes[600] ^= 1;
  writeFileSync(tar, bytes);
  assert.throws(() => verifyVendorFixture({ dir, arch: ARCH, manifest }), refused(/tar .* is not the manifest's/));
  assert.equal(existsSync(join(dir, EXTRACTED)), false, 'nothing extracted');
});

test('one changed byte in an extracted file, a file added there, or a link there, refuses the step', () => {
  for (const [what, change, pattern] of [
    ['a changed byte', (root) => writeFileSync(join(root, binaryPath(ARCH)), 'the pinned vendor builT'), /1 changed: cua_node\/lib\/node_modules\/@oai\/sky\/bin\/linux\/sky_linux_x64/],
    ['an added file', (root) => writeFileSync(join(root, 'cua_node/lib/extra.so'), 'planted'), /1 not in the list: cua_node\/lib\/extra\.so/],
    ['a removed file', (root) => rmSync(join(root, 'cua_node/bin/node')), /1 missing: cua_node\/bin\/node/],
    ['a link', (root) => symlinkSync('/etc/passwd', join(root, 'cua_node/bin/link')), /neither a file nor a directory: cua_node\/bin\/link/],
  ]) {
    const { dir, manifest } = makeFixture();
    verifyVendorFixture({ dir, arch: ARCH, manifest });
    change(fixturePaths(dir, ARCH).root);
    assert.throws(() => verifyVendorFixture({ dir, arch: ARCH, manifest }), refused(pattern), what);
  }
});

test('one changed byte in the list refuses, and so does a list that disagrees with the manifest in count or build', () => {
  const { dir, manifest } = makeFixture();
  const list = join(dir, 'tree-sha256.txt');
  const text = readFileSync(list, 'utf8');
  writeFileSync(list, text.replace(/^./, (c) => (c === '0' ? '1' : '0')));
  assert.throws(() => verifyVendorFixture({ dir, arch: ARCH, manifest }), refused(/tree list .* is not the manifest's/));
  writeFileSync(list, text);
  const counted = structuredClone(manifest);
  counted.fixtures[ARCH].treeList.files += 1;
  assert.throws(() => verifyVendorFixture({ dir, arch: ARCH, manifest: counted }), refused(/names 5 files, not the manifest's 6/));
  const build = structuredClone(manifest);
  build.fixtures[ARCH].binary.sha256 = 'b'.repeat(64);
  assert.throws(() => verifyVendorFixture({ dir, arch: ARCH, manifest: build }), refused(/not the manifest's pinned build/));
});

// fix wave 1, finding 2: a cache root that is a link is refused at either level, even when what it leads to holds the
// listed bytes (a cua home's runtimes/ does: the vendor's release as an install placed it)
test("a linked cache root is refused, at the extracted level and at the release level, even onto a home's identical tree", () => {
  for (const level of ['extracted', 'release']) {
    const { dir, manifest } = makeFixture();
    verifyVendorFixture({ dir, arch: ARCH, manifest });
    // a mock cua home holding the same release under runtimes/
    const home = fresh('home');
    renameSync(join(dir, EXTRACTED, RELEASE), join(mkdirP(join(home, 'runtimes')), RELEASE));
    if (level === 'extracted') {
      rmSync(join(dir, EXTRACTED), { recursive: true });
      symlinkSync(join(home, 'runtimes'), join(dir, EXTRACTED));
    } else symlinkSync(join(home, 'runtimes', RELEASE), join(dir, EXTRACTED, RELEASE));
    assert.throws(() => verifyVendorFixture({ dir, arch: ARCH, manifest }), refused(/is a link, not a directory of the fixture's own/), level);
  }
  // a dangling link where the extracted root would be is refused too, never extracted through
  const { dir, manifest } = makeFixture();
  symlinkSync(join(scratch, 'nowhere'), join(dir, EXTRACTED));
  assert.throws(() => verifyVendorFixture({ dir, arch: ARCH, manifest }), refused(/is a link/));
  assert.equal(existsSync(join(scratch, 'nowhere')), false, 'nothing extracted through it');
});

test('no fixture, no manifest entry, or a malformed entry refuses: never a skip, never a fetch', () => {
  const { manifest } = makeFixture();
  assert.throws(() => verifyVendorFixture({ dir: join(scratch, 'absent'), arch: ARCH, manifest }), refused(/no comparator fixture at .*--vendor-fixture/));
  assert.throws(() => verifyVendorFixture({ dir: scratch, arch: 'arm64', manifest }), refused(/no arm64 entry/));
  const bad = structuredClone(manifest);
  bad.fixtures[ARCH].extra = 1;
  assert.throws(() => verifyVendorFixture({ dir: scratch, arch: ARCH, manifest: bad }), refused(/x64 entry is not/));
});

test("the committed manifest holds hashes only, each arch's pinned build the digest the counted evidence names", () => {
  const manifest = loadFixtureManifest();
  assert.deepEqual(Object.keys(manifest.fixtures).sort(), ['arm64', 'x64']);
  const pinnedArm64 = DECLARED_VENDOR_ENDS.find((d) => d.release === '26.928.40906-linux-arm64');
  assert.equal(manifest.fixtures.arm64.binary.sha256, pinnedArm64.sha256, "DECLARED_VENDOR_ENDS' pinned arm64 build");
  // R/A L224's x64 digest, the one this VM's default home holds (the pre-flight's §9)
  assert.equal(manifest.fixtures.x64.binary.sha256, '7ac3c2ae45a3dacc9209063e91d2df4ea9f206b814a9ffd976f5bcf90d73f1cd');
  // each compared with its pinned deb (runtime/modules/provenance.json's vendor entries name the same archives)
  const provenance = JSON.parse(readFileSync(new URL('../../runtime/modules/provenance.json', import.meta.url), 'utf8'));
  for (const arch of ['x64', 'arm64']) {
    const vendor = provenance.vendor.find((v) => v.release === releaseName(arch));
    assert.equal(manifest.fixtures[arch].deb.sha256, vendor.archiveSha256, `${arch}: the deb compared is the pinned one`);
  }
  assert.ok(Buffer.byteLength(readFileSync(new URL('../../scripts/linux-engine-gate/vendor-fixture.json', import.meta.url))) < 4096, 'a manifest, not a payload');
});

// ---- the one-time pin tool --------------------------------------------------------------------------------------------

const DEB_ROOT = 'usr/lib/chatgpt/resources/cua_node';
/** A fixture deb whose payload holds `files` (relative to cua_node/) and `links`, and the provenance record that names it. */
function makeDeb({ files, links = {}, member = DEB_ROOT } = {}) {
  const tree = fresh('deb-tree');
  writeTree(join(tree, member), files, links);
  writeFileSync(join(tree, 'usr/lib/chatgpt/other-file'), 'outside cua_node: not compared');
  const data = join(fresh('deb-data'), 'data.tar.xz');
  const r = spawnSync('tar', ['-cJf', data, '-C', tree, '.'], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`tar failed: ${r.stderr}`);
  const bytes = arArchive([['debian-binary', Buffer.from('2.0\n')], ['control.tar.xz', readFileSync(data)], ['data.tar.xz', readFileSync(data)]]);
  const path = join(fresh('deb'), 'chatgpt.deb');
  writeFileSync(path, bytes);
  const record = { schema: 1, release: RELEASE, platform: 'linux', arch: ARCH, archive: { format: 'deb', url: 'https://example.invalid/chatgpt.deb', length: bytes.length, sha256: sha(bytes) },
    lockfile: `${DEB_ROOT}/lib/node_modules/.pnpm/lock.yaml`, notes: 'fixture' };
  return { path, record, sha256: sha(bytes), length: bytes.length };
}
const cuaNode = (files) => Object.fromEntries(Object.entries(files).filter(([p]) => p.startsWith('cua_node/')).map(([p, t]) => [p.slice('cua_node/'.length), t]));

/** A records directory holding `records`, as modules-pin.mjs's reader takes them. */
function recordsDir(records) {
  const dir = fresh('provenance');
  for (const record of records) writeFileSync(join(dir, `${record.release}.json`), JSON.stringify(record));
  return dir;
}
function pinRun({ deb, fixture, records = [deb.record] }) {
  const manifestFile = join(fresh('manifest'), 'vendor-fixture.json');
  const log = [];
  const provenanceDir = recordsDir(records);
  const run = () => pinVendorFixture({ deb: deb.path, fixture: fixture.dir, provenanceDir, manifestFile, log: (line) => log.push(line) });
  return { manifestFile, log, run };
}

test('the pin tool: a fixture whose cua_node equals the deb\'s payload gets its entry, with the deb\'s hash beside the tar\'s', async () => {
  const fixture = makeFixture();
  const deb = makeDeb({ files: cuaNode(TREE) });
  const { manifestFile, run } = pinRun({ deb, fixture });
  const { entry } = await run();
  const written = JSON.parse(readFileSync(manifestFile, 'utf8'));
  assert.deepEqual(written.fixtures[ARCH], entry);
  assert.deepEqual(entry, { ...fixture.manifest.fixtures[ARCH], deb: { release: RELEASE, sha256: deb.sha256, length: deb.length } });
  // the written manifest is one the gate's module reads
  const manifest = loadFixtureManifest(manifestFile);
  assert.equal(verifyVendorFixture({ dir: fixture.dir, arch: ARCH, manifest }).binarySha256, sha(Buffer.from(TREE[binaryPath(ARCH)])));
});

test('the pin tool writes nothing for one changed byte, an added file, a changed link target or a changed type', async () => {
  const withLink = { 'bin/corepack': '../lib/node_modules/corepack/dist/corepack.js' };
  for (const [what, debFiles, debLinks, fixtureFiles, fixtureLinks, pattern] of [
    ['a changed byte', { ...cuaNode(TREE), 'bin/node': 'a node binarY' }, {}, TREE, {}, /bytes differ: cua_node\/bin\/node/],
    ['a file only in the deb', { ...cuaNode(TREE), 'lib/added.js': 'x' }, {}, TREE, {}, /only in the deb: cua_node\/lib\/added\.js/],
    ['a file only in the fixture', cuaNode(TREE), {}, { ...TREE, 'cua_node/lib/added.js': 'x' }, {}, /only in the fixture: cua_node\/lib\/added\.js/],
    ['a changed link target', cuaNode(TREE), withLink, TREE, { 'cua_node/bin/corepack': '../elsewhere.js' }, /link targets differ: cua_node\/bin\/corepack/],
    ['a changed type', { ...cuaNode(TREE), 'bin/corepack': 'a file' }, {}, TREE, { 'cua_node/bin/corepack': '../x.js' }, /types differ: cua_node\/bin\/corepack \(file in the deb, link in the fixture\)/],
  ]) {
    const fixture = makeFixture({ files: fixtureFiles, links: fixtureLinks });
    const deb = makeDeb({ files: debFiles, links: debLinks });
    const { manifestFile, run } = pinRun({ deb, fixture });
    await assert.rejects(run(), (error) => pattern.test(error.message), what);
    assert.equal(existsSync(manifestFile), false, `${what}: nothing written`);
  }
});

test("the pin tool sets aside cua's install.json alone: anything else beside cua_node is a difference", async () => {
  const deb = makeDeb({ files: cuaNode(TREE) });
  const fixture = makeFixture({ files: { ...TREE, 'notes.txt': 'added after install' } });
  const { manifestFile, run } = pinRun({ deb, fixture });
  await assert.rejects(run(), /only in the fixture: notes\.txt/);
  assert.equal(existsSync(manifestFile), false);
});

test('the pin tool refuses a deb that is no pin\'s before reading it, and a list that is not the tar\'s', async () => {
  const fixture = makeFixture();
  const deb = makeDeb({ files: cuaNode(TREE) });
  const other = makeDeb({ files: { ...cuaNode(TREE), 'bin/node': 'other' } });
  const { manifestFile, run } = pinRun({ deb, fixture, records: [other.record] });
  await assert.rejects(run(), /is not a vendor deb any provenance record pins/);
  assert.equal(existsSync(manifestFile), false);
  // a list that says another hash for a file than the tar holds
  const lying = makeFixture({ list: listOf({ ...TREE, 'cua_node/bin/node': 'something else' }) });
  const second = pinRun({ deb, fixture: lying });
  await assert.rejects(second.run(), /the tree list is not the tar's; nothing was written: 1 changed: cua_node\/bin\/node/);
  assert.equal(existsSync(second.manifestFile), false);
});

// #171 M6b T4: the tool reads the provenance records through modules-pin.mjs's reader, never a pin: a record of the
// pins' old shape naming the deb matches nothing, and a record of a release the fixtures do not hold gets no entry
test('the pin tool takes the deb\'s record through the provenance reader: an old-shape pin is no record, and another release is refused', async () => {
  const fixture = makeFixture();
  const deb = makeDeb({ files: cuaNode(TREE) });
  const asPin = { ...deb.record, lockfile: undefined, appVersion: VENDOR_FIXTURE_RELEASE, components: { cua_node: DEB_ROOT }, runtime: { version: 'x', node: 'y' }, layout: { moduleDir: 'cua_node/lib/node_modules' } };
  const old = pinRun({ deb, fixture, records: [asPin] });
  await assert.rejects(old.run(), (error) => error.code === 'invalid_provenance');
  assert.equal(existsSync(old.manifestFile), false);
  const other = pinRun({ deb, fixture, records: [{ ...deb.record, release: '26.928.40906-linux-riscv64', arch: 'riscv64' }] });
  await assert.rejects(other.run(), /is the pinned 26\.928\.40906-linux-riscv64, not 26\.928\.40906-linux-x64 or 26\.928\.40906-linux-arm64/);
  assert.equal(existsSync(other.manifestFile), false);
});

// fix wave 1, finding 3: the tar hashed is the tar compared. A tar swapped at its path after its hash was taken (here,
// the moment the tool logs that hash) changes nothing the tool reads: it hashes and extracts one private snapshot
test('the pin tool compares the very tar it hashed: one swapped at its path after the hash gets no manifest', async () => {
  const deb = makeDeb({ files: cuaNode(TREE) });
  // the fixture as hashed differs from the deb; the swap puts an equal tar in its place
  const fixture = makeFixture({ files: { ...TREE, 'cua_node/bin/node': 'a node binarY' }, list: listOf(TREE) });
  const good = makeFixture();
  const manifestFile = join(fresh('manifest'), 'vendor-fixture.json');
  const swap = (line) => {
    if (line.startsWith('fixture tar ')) writeFileSync(fixture.tar, readFileSync(good.tar));
  };
  await assert.rejects(pinVendorFixture({ deb: deb.path, fixture: fixture.dir, provenanceDir: recordsDir([deb.record]), manifestFile, log: swap }), /bytes differ: cua_node\/bin\/node/);
  assert.equal(existsSync(manifestFile), false, 'no manifest for a tar it never compared');
});

// fix wave 1, finding 1: the check in a :0 step's launch path (fixture-check.mjs), run here without a display: the
// command after `--` starts only once the fixture checks, and only with the checked fixture's build and client
test("the launch path's check starts the command only for a fixture that checks, and only with that fixture's paths", async () => {
  const { checkThenRun, parseFixtureCheck } = await import('../../scripts/linux-engine-gate/fixture-check.mjs');
  const { dir, manifest } = makeFixture();
  const verify = (opts) => verifyVendorFixture({ ...opts, manifest });
  const paths = fixturePaths(dir, ARCH);
  const marker = join(fresh('marker'), 'started');
  const command = (extra = []) => [process.execPath, '-e', `require('fs').writeFileSync(${JSON.stringify(marker)}, process.argv.slice(1).join(' '))`, '--', ...extra];
  const lines = [];
  const say = (line) => lines.push(line);
  // a fixture that checks: the command runs with the harness's flags, and its exit status is the check's
  assert.equal(await checkThenRun({ dir, arch: ARCH, command: command(['--vendor', paths.vendor, '--vendor-js', paths.vendorJs]) }, { verify, say }), 0);
  assert.equal(readFileSync(marker, 'utf8'), `--vendor ${paths.vendor} --vendor-js ${paths.vendorJs}`);
  assert.match(lines.at(-1), /checks \(tar [0-9a-f]{64}; the pinned build /);
  rmSync(marker);
  // a fixture with one changed byte: nothing starts
  writeFileSync(join(paths.root, binaryPath(ARCH)), 'the pinned vendor builT');
  assert.equal(await checkThenRun({ dir, arch: ARCH, command: command() }, { verify, say }), 2);
  assert.equal(existsSync(marker), false, 'nothing started on a fixture that does not check');
  assert.match(lines.at(-1), /does not check, so the step does not start: .*1 changed/);
  // a command naming another build than the checked fixture's: nothing starts
  const good = makeFixture();
  const goodVerify = (opts) => verifyVendorFixture({ ...opts, manifest: good.manifest });
  assert.equal(await checkThenRun({ dir: good.dir, arch: ARCH, command: command(['--vendor', '/home/u/.local/share/cua/runtimes/26.928.40906-linux-x64/sky_linux_x64']) }, { verify: goodVerify, say }), 2);
  assert.equal(existsSync(marker), false);
  assert.match(lines.at(-1), /--vendor is \/home\/u\/.local\/share\/cua\/runtimes\/.*, not the checked fixture's/);
  // fix wave 2: the harness takes the last of a repeated flag (cli.mjs's VALUE_FLAGS; services.mjs's node:util
  // parseArgs, which also reads `--flag=value`), so a second comparator flag appended to an otherwise valid command
  // would choose the build. Any repeat, in either form, is refused, and nothing starts
  const gp = fixturePaths(good.dir, ARCH);
  const { parseArgs: harnessArgs } = await import('../../scripts/linux-engine-diff/cli.mjs');
  assert.equal(harnessArgs(['--vendor', gp.vendor, '--newest', '/n', '--cua', '/c', '--scene', 'gedit', '--ops', 'all', '--dev', '--vendor', '/alternate/vendor', '--out', '/o']).vendor, '/alternate/vendor', 'the harness takes the last --vendor');
  for (const extra of [['--vendor', '/alternate/vendor'], ['--vendor-js', '/alternate/sky'], ['--vendor=/alternate/vendor'], ['--vendor-js=/alternate/sky'], ['--vendor', gp.vendor]]) {
    const valid = ['--vendor', gp.vendor, '--vendor-js', gp.vendorJs];
    assert.equal(await checkThenRun({ dir: good.dir, arch: ARCH, command: command([...valid, ...extra]) }, { verify: goodVerify, say }), 2, extra.join(' '));
    assert.equal(existsSync(marker), false, `${extra.join(' ')}: nothing started`);
    assert.match(lines.at(-1), /is given more than once|in the form --[a-z-]+=/, extra.join(' '));
  }
  // the `=` form alone, naming the checked path, is refused too: the gate never writes it, and the check reads the
  // separate form only
  assert.equal(await checkThenRun({ dir: good.dir, arch: ARCH, command: command([`--vendor=${gp.vendor}`]) }, { verify: goodVerify, say }), 2);
  assert.equal(existsSync(marker), false);
  // the script itself, on a fixture that is not there: exit 2, nothing started
  const { spawnSync } = await import('node:child_process');
  const script = new URL('../../scripts/linux-engine-gate/fixture-check.mjs', import.meta.url).pathname;
  const run = spawnSync(process.execPath, [script, '--vendor-fixture', join(scratch, 'no-fixture'), '--arch', 'x64', '--', ...command()], { encoding: 'utf8' });
  assert.equal(run.status, 2, run.stderr);
  assert.match(run.stderr, /no comparator fixture at/);
  assert.equal(existsSync(marker), false);
  assert.throws(() => parseFixtureCheck(['--vendor-fixture', '/f', '--', 'x']), /usage/);
  assert.deepEqual(parseFixtureCheck(['--vendor-fixture', '/f', '--arch', 'x64', '--', 'a', 'b']), { dir: '/f', arch: 'x64', command: ['a', 'b'] });
});
