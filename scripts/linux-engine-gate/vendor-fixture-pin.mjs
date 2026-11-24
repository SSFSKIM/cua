#!/usr/bin/env node
// The comparator fixture's one-time identity check, and only then its manifest entry (#171 M6b, its pre-flight §4.4, T3).
// A development tool, run once per architecture on a machine that holds both the fixture and its pinned deb:
//
//   node scripts/linux-engine-gate/vendor-fixture-pin.mjs <pinned vendor deb> <fixture dir>
//
// A fixture's checksums prove that its tar is the one preserved, not that its tree is the vendor's: each tar was taken
// from an installed home, which could have changed after its install. So the tool
//   1. matches the deb to its record by length and SHA-256, through scripts/modules-pin.mjs's own matcher, over the
//      provenance records its own reader loads (a private snapshot of the deb is hashed, matched and read, so a deb
//      replaced meanwhile changes nothing);
//   2. unpacks the deb's payload under usr/lib/chatgpt/resources/cua_node/ and the fixture's tar (a private snapshot, hashed
//      once: the hash written is that of the bytes compared) to scratch, and compares
//      the deb's cua_node/ with the fixture's: the same names, the same types, the same link targets and the same bytes
//      for every regular file. cua's own receipt, install.json beside cua_node/, is the one entry set aside; nothing
//      else may be extra or missing on either side;
//   3. checks the fixture's tree-sha256.txt against the tar it compared: every regular file once, with its hash, and no
//      link or other entry (the gate's check, vendor-fixture.mjs, accepts regular files only);
//   4. only then writes that architecture's entry of scripts/linux-engine-gate/vendor-fixture.json, the deb's SHA-256
//      beside the tar's. A difference writes nothing: it is printed, and the fixture is rebuilt from the deb.
// It fetches nothing, and writes nowhere but its scratch (removed at its end) and the manifest.
import { execFile } from 'node:child_process';
import { constants as fsConstants, copyFileSync, createReadStream, createWriteStream, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

import { MANIFEST_FILE, TREE_LIST, binaryPath, checkManifestEntry, loadFixtureManifest, parseTreeList, releaseName, sha256Bytes, sha256File, treeDifferences, walkTree } from '../linux-engine-diff/vendor-fixture.mjs';
import { arMember, loadProvenanceRecords, matchRecord } from '../modules-pin.mjs';

/** The deb's payload directory the fixture's cua_node/ is compared with. */
export const DEB_CUA_NODE = 'usr/lib/chatgpt/resources/cua_node';
/** The one entry beside cua_node/ in a release tree that is cua's, not the vendor's. */
export const SET_ASIDE = 'install.json';
const LIMIT = 20;
/** The architectures a fixture is kept for. */
const ARCHES = ['x64', 'arm64'];

const run = (command, args) => new Promise((done, reject) => {
  execFile(command, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => (error ? reject(Object.assign(error, { stderr })) : done(stdout)));
});

/**
 * The tree at `root` by `lstat`, following nothing -> Map(<path relative to root> -> {type: 'file', sha256} | {type:
 * 'link', target} | {type: 'dir'} | {type: 'other'}).
 */
export function treeEntries(root, prefix = '') {
  const entries = new Map();
  const walk = (dir, rel) => {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name);
      const relPath = rel ? `${rel}/${name}` : name;
      const stat = lstatSync(path);
      if (stat.isDirectory()) {
        entries.set(relPath, { type: 'dir' });
        walk(path, relPath);
      } else if (stat.isFile()) entries.set(relPath, { type: 'file', sha256: sha256File(path) });
      else if (stat.isSymbolicLink()) entries.set(relPath, { type: 'link', target: readlinkSync(path) });
      else entries.set(relPath, { type: 'other' });
    }
  };
  walk(root, prefix);
  return entries;
}

/** What differs between the deb's entries and the fixture's -> sentences, each kind with the first LIMIT paths. */
export function identityDifferences(deb, fixture) {
  const onlyDeb = [...deb.keys()].filter((p) => !fixture.has(p));
  const onlyFixture = [...fixture.keys()].filter((p) => !deb.has(p));
  const both = [...deb.keys()].filter((p) => fixture.has(p));
  const types = both.filter((p) => deb.get(p).type !== fixture.get(p).type).map((p) => `${p} (${deb.get(p).type} in the deb, ${fixture.get(p).type} in the fixture)`);
  const targets = both.filter((p) => deb.get(p).type === 'link' && fixture.get(p).type === 'link' && deb.get(p).target !== fixture.get(p).target).map((p) => `${p} (${deb.get(p).target} in the deb, ${fixture.get(p).target} in the fixture)`);
  const bytes = both.filter((p) => deb.get(p).type === 'file' && fixture.get(p).type === 'file' && deb.get(p).sha256 !== fixture.get(p).sha256);
  const other = both.filter((p) => deb.get(p).type === 'other');
  const out = [];
  const say = (what, list) => list.length && out.push(`${list.length} ${what}: ${list.slice(0, LIMIT).join(', ')}${list.length > LIMIT ? ', …' : ''}`);
  say('only in the deb', onlyDeb);
  say('only in the fixture', onlyFixture);
  say('types differ', types);
  say('link targets differ', targets);
  say('bytes differ', bytes);
  say('neither file, directory nor link', other);
  return out;
}

/** The deb snapshot's payload directory `member` extracted under `into`, by way of its data.tar.xz copied beside it. */
async function extractDebPayload(snapshot, into, member, tar) {
  const { start, length } = arMember(snapshot, 'data.tar.xz');
  const payload = join(into, 'data.tar.xz');
  await pipeline(createReadStream(snapshot, { start, end: start + length - 1 }), createWriteStream(payload));
  const out = join(into, 'deb');
  mkdirSync(out);
  try {
    await run(tar, ['-xJf', payload, '-C', out, `./${member}`]);
  } catch (error) {
    throw new Error(`could not take ./${member} out of the deb: ${String(error.stderr || error.message).trim().split('\n').at(-1)}`);
  } finally {
    rmSync(payload, { force: true });
  }
  return join(out, member);
}

class IdentityDiffers extends Error {
  constructor(message, differences) {
    super(`${message}: ${differences.join('; ')}`);
    this.name = 'IdentityDiffers';
    this.differences = differences;
  }
}

/**
 * The check and the entry. `provenanceDir` the records' directory the matcher reads (modules-pin.mjs's own, by
 * default), `manifestFile` the manifest written, `log` one line a step. -> {entry, manifest}; throws on any difference
 * with nothing written.
 */
export async function pinVendorFixture({ deb, fixture, provenanceDir, manifestFile = MANIFEST_FILE, tar = 'tar', log = (line) => console.log(line) }) {
  const records = loadProvenanceRecords(provenanceDir);
  const scratch = mkdtempSync(join(tmpdir(), 'cua-vendor-fixture-pin-'));
  try {
    const snapshot = join(scratch, 'archive.deb');
    try {
      copyFileSync(deb, snapshot, fsConstants.COPYFILE_FICLONE);
    } catch (error) {
      throw new Error(`${deb} is not readable: ${error.code ?? error.message}`);
    }
    const { record, sha256: debSha256 } = await matchRecord(deb, snapshot, records);
    const arch = ARCHES.find((a) => releaseName(a) === record.release);
    if (!arch) throw new Error(`${deb} is the pinned ${record.release}, not ${ARCHES.map(releaseName).join(' or ')}, the releases the fixtures hold`);
    const release = record.release;
    const debLength = lstatSync(snapshot).size;
    log(`deb ${deb}: ${debLength} bytes, SHA-256 ${debSha256}: the pinned ${record.release}`);

    const tarName = `${release}.tar`;
    const tarPath = join(fixture, tarName);
    // the tar is snapshotted as the deb is: the one private copy is hashed, then extracted and compared, so a tar replaced
    // at its path meanwhile cannot pair this hash with other bytes (fix wave 1, finding 3)
    const tarSnapshot = join(scratch, 'fixture.tar');
    try {
      copyFileSync(tarPath, tarSnapshot, fsConstants.COPYFILE_FICLONE);
    } catch (error) {
      throw new Error(`${tarPath} is not readable: ${error.code ?? error.message}`);
    }
    const tarSha256 = sha256File(tarSnapshot);
    const tarLength = lstatSync(tarSnapshot).size;
    log(`fixture tar ${tarPath}: ${tarLength} bytes, SHA-256 ${tarSha256} (its private snapshot, which is what is compared)`);
    const sums = existsSync(join(fixture, 'SHA256SUMS')) ? readFileSync(join(fixture, 'SHA256SUMS'), 'utf8') : '';
    log(`fixture SHA256SUMS ${sums.includes(`${tarSha256}  ${tarName}`) ? 'names that hash' : 'does not name that hash'}`);

    const debRoot = await extractDebPayload(snapshot, scratch, DEB_CUA_NODE, tar);
    rmSync(snapshot, { force: true });
    const fromTar = join(scratch, 'tar');
    mkdirSync(fromTar);
    await run(tar, ['-xf', tarSnapshot, '-C', fromTar]);
    rmSync(tarSnapshot, { force: true });
    const top = readdirSync(fromTar);
    if (top.length !== 1 || top[0] !== release) throw new Error(`the fixture's tar holds ${JSON.stringify(top)}, not the one release ${release}`);
    const fixtureRoot = join(fromTar, release);

    const debEntries = treeEntries(debRoot, 'cua_node');
    debEntries.set('cua_node', { type: 'dir' });
    const fixtureEntries = treeEntries(fixtureRoot);
    const aside = fixtureEntries.get(SET_ASIDE);
    if (aside?.type === 'file') fixtureEntries.delete(SET_ASIDE);
    const count = (entries, type) => [...entries.values()].filter((e) => e.type === type).length;
    log(`compared: the deb's cua_node ${count(debEntries, 'file')} files, ${count(debEntries, 'dir')} directories, ${count(debEntries, 'link')} links; the fixture's ${count(fixtureEntries, 'file')} files, ${count(fixtureEntries, 'dir')} directories, ${count(fixtureEntries, 'link')} links, beside ${aside?.type === 'file' ? 'install.json, set aside' : 'no install.json'}`);
    const differences = identityDifferences(debEntries, fixtureEntries);
    if (differences.length) throw new IdentityDiffers(`the fixture at ${fixture} is not the deb's payload; nothing was written`, differences);
    log('identity: the same names, types, link targets and bytes on both sides, install.json alone set aside');

    const listFile = join(fixture, TREE_LIST);
    const listBytes = readFileSync(listFile);
    const listed = parseTreeList(listBytes.toString('utf8'));
    const listDifferences = treeDifferences(walkTree(fixtureRoot), listed);
    if (listDifferences.length) throw new IdentityDiffers(`the tree list is not the tar's; nothing was written`, listDifferences);
    log(`tree list ${listFile}: ${listed.size} files, SHA-256 ${sha256Bytes(listBytes)}, every one the tar's`);

    const entry = checkManifestEntry(arch, {
      release,
      tar: { name: tarName, sha256: tarSha256, length: tarLength },
      treeList: { sha256: sha256Bytes(listBytes), files: listed.size },
      binary: { path: binaryPath(arch), sha256: listed.get(binaryPath(arch)) ?? '' },
      deb: { release: record.release, sha256: debSha256, length: debLength },
    });
    const manifest = existsSync(manifestFile) ? loadFixtureManifest(manifestFile) : {
      schema: 1,
      about: 'The comparator fixtures (#171 M6b, its pre-flight §4.4): hashes only, each entry written by vendor-fixture-pin.mjs after the fixture\'s tree equalled its pinned deb\'s payload. The fixtures themselves are never in this repository (ruling 1217, N7).',
      fixtures: {},
    };
    manifest.fixtures = Object.fromEntries(Object.entries({ ...manifest.fixtures, [arch]: entry }).sort(([a], [b]) => (a < b ? -1 : 1)));
    const out = manifestFile instanceof URL ? fileURLToPath(manifestFile) : manifestFile;
    const temp = `${out}.${process.pid}.tmp`;
    writeFileSync(temp, `${JSON.stringify(manifest, null, 2)}\n`);
    renameSync(temp, out);
    log(`wrote the ${arch} entry of ${out}`);
    return { entry, manifest };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [deb, fixture] = process.argv.slice(2);
  if (!deb || !fixture) {
    console.error('usage: vendor-fixture-pin.mjs <pinned vendor deb> <fixture dir>');
    process.exitCode = 2;
  } else {
    try {
      await pinVendorFixture({ deb: resolve(deb), fixture: resolve(fixture) });
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
