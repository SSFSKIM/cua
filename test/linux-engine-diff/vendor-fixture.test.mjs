// The comparator fixture (#171 M6b, its pre-flight §4.4, F7): the gate takes the pinned vendor build and the vendor's
// client from a hash-checked fixture directory outside any cua home, and the one-time pin tool writes a fixture's
// manifest entry only after the fixture's tree equals its authenticated deb's payload. Display-free; nothing fetches.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, afterEach, beforeEach, test } from 'node:test';

import { DECLARED_VENDOR_ENDS } from '../../scripts/linux-engine-diff/scene-ended.mjs';
import { EXTRACTED, SERVICE_PATH, VendorFixtureRefused, binaryPath, fixturePaths, loadFixtureManifest, releaseName, verifyVendorFixture } from '../../scripts/linux-engine-diff/vendor-fixture.mjs';
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
/** A fixture deb whose payload holds `files` (relative to cua_node/) and `links`, and the pin that names it. */
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
  const pin = { release: RELEASE, platform: 'linux', arch: ARCH, archive: { format: 'deb', url: 'https://example.invalid/chatgpt.deb', length: bytes.length, sha256: sha(bytes) } };
  return { path, pin, sha256: sha(bytes), length: bytes.length };
}
const cuaNode = (files) => Object.fromEntries(Object.entries(files).filter(([p]) => p.startsWith('cua_node/')).map(([p, t]) => [p.slice('cua_node/'.length), t]));

function pinRun({ deb, fixture, pins = [deb.pin] }) {
  const manifestFile = join(fresh('manifest'), 'vendor-fixture.json');
  const log = [];
  const run = () => pinVendorFixture({ deb: deb.path, fixture: fixture.dir, pins, manifestFile, log: (line) => log.push(line) });
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
  const { manifestFile, run } = pinRun({ deb, fixture, pins: [other.pin] });
  await assert.rejects(run(), /is not a pinned vendor deb/);
  assert.equal(existsSync(manifestFile), false);
  // a list that says another hash for a file than the tar holds
  const lying = makeFixture({ list: listOf({ ...TREE, 'cua_node/bin/node': 'something else' }) });
  const second = pinRun({ deb, fixture: lying });
  await assert.rejects(second.run(), /the tree list is not the tar's; nothing was written: 1 changed: cua_node\/bin\/node/);
  assert.equal(existsSync(second.manifestFile), false);
});
