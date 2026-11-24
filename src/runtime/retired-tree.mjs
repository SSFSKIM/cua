// The vendor's Linux release tree an older cua's `cua install` placed, reported and never touched (#171 M6b; ruling
// 1216; docs/doperpowers/specs/2026-10-28-own-linux-engine-m6b-preflight.md §3.1-3.3). cua 0.30.0 runs no session from
// it, and a home keeps it until a person deletes it: `cua install` (linux-install.mjs) prints one sentence per release
// and doctor's informational `runtime.retired` row carries the same (doctor.mjs). Neither launch nor macOS calls this:
// on macOS runtimes/ holds the runtime sessions run from.
//
// It reads, and changes nothing: no write, rename, unlink or exec. Of the home it touches runtimes/ and the two release
// names below by lstat, never listing runtimes/ and never following a link there (N3). Inside a release whose install
// record passes, one open of install.json (no link followed, never blocking, at most 64 KiB), then the size walk's
// lstat and readdir.
//
// A release is named only when the record cua's install wrote there (install.mjs, before M6b) says that release was
// placed from its pinned archive. That shows a cua install recorded placing it, not what the files below are now, so
// the sentence says no more (§3.3). The two archives are this module's own constants, not the provenance records,
// which install may not read (1193 (a)); a test ties each to its record. They carry no URL.
import {closeSync, constants, fstatSync, lstatSync, openSync, readSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {homeLayout, realHome} from './layout.mjs';
import {VENDOR_ENGINE_RETIRED_IN} from './launch.mjs';

// The only Linux releases cua's install ever placed (fe09732c8 pinned both, and no other).
export const RETIRED_RELEASES = Object.freeze({
  '26.928.40906-linux-x64': Object.freeze({sha256: '8094004f1cbccf35deefded15961aa42b4db889121a5d952c5f30cf82bd8ad30', length: 474898954}),
  '26.928.40906-linux-arm64': Object.freeze({sha256: 'ab3eea138b767555aecb2b69f4aa553d843e6c5ef3037645e544aafc72d0f5cd', length: 453477698}),
});

const RECORD_FILE = 'install.json';
const RECORD_MAX_BYTES = 64 * 1024;
// The walk's bound: the real tree holds 2,345 files in 327 directories.
export const WALK_MAX_ENTRIES = 200_000;
const RECORD_KEYS = ['schema', 'release', 'archive', 'source', 'installedAt'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasExactly = (value, keys) => isObject(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const lstatOrNull = path => { try { return lstatSync(path); } catch { return null; } };

// What the home holds of the vendor's Linux releases -> {trees: [{release, path, bytes, installedAt, source}], lines:
// [one sentence per tree]}, `bytes` null where the walk stopped. Nothing when runtimes/ is absent or no real directory.
// `maxEntries` is a seam for tests.
export function retiredTrees({home, maxEntries = WALK_MAX_ENTRIES}) {
  const runtimes = homeLayout(realHome(home)).runtimes;
  const trees = [], lines = [];
  if (!lstatOrNull(runtimes)?.isDirectory()) return {trees, lines};
  for (const release of Object.keys(RETIRED_RELEASES)) {
    const path = join(runtimes, release);
    if (!lstatOrNull(path)?.isDirectory()) continue;
    const record = recordOf(path, release);
    if (!record) continue;
    const size = treeBytes(path, maxEntries);
    trees.push({release, path, bytes: size.bytes, installedAt: record.installedAt, source: record.source});
    lines.push(retiredSentence({path, installedAt: record.installedAt, ...size}));
  }
  return {trees, lines};
}

// The release's install record when it is exactly the one cua's install wrote for that release's archive, else null:
// a regular file by lstat, opened without following a link or blocking, still a regular file, at most 64 KiB.
function recordOf(dir, release) {
  const file = join(dir, RECORD_FILE);
  const stat = lstatOrNull(file);
  if (!stat?.isFile() || stat.size > RECORD_MAX_BYTES) return null;
  let fd;
  try { fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); } catch { return null; }
  let text;
  try {
    const opened = fstatSync(fd);
    if (!opened.isFile() || opened.size > RECORD_MAX_BYTES) return null;
    const buffer = Buffer.alloc(RECORD_MAX_BYTES + 1);
    let length = 0;
    for (let n; length < buffer.length && (n = readSync(fd, buffer, length, buffer.length - length, null)) > 0;) length += n;
    if (length > RECORD_MAX_BYTES) return null;
    text = buffer.subarray(0, length).toString('utf8');
  } catch { return null; } finally { closeSync(fd); }
  let record;
  try { record = JSON.parse(text); } catch { return null; }
  const archive = RETIRED_RELEASES[release];
  const valid = hasExactly(record, RECORD_KEYS) && record.schema === 1 && record.release === release
    && hasExactly(record.archive, ['sha256', 'length']) && record.archive.sha256 === archive.sha256 && record.archive.length === archive.length
    && ['archive', 'download'].includes(record.source)
    && typeof record.installedAt === 'string' && ISO_DATE.test(record.installedAt) && !Number.isNaN(Date.parse(record.installedAt));
  return valid ? record : null;
}

// The tree's size by lstat, following nothing (§3.2) -> {bytes} or {bytes: null, stopped: code}: regular files and
// symbolic links by their own size (a link by its length, not its target's), a file with several links once by device
// and inode, and nothing for a directory or any other entry. It stops at its first error, or past `maxEntries`.
function treeBytes(root, maxEntries) {
  const seen = new Set();
  let bytes = 0, entries = 0;
  const pending = [root];
  try {
    while (pending.length) {
      const dir = pending.pop();
      for (const name of readdirSync(dir)) {
        if (++entries > maxEntries) return {bytes: null, stopped: 'too_many_entries'};
        const path = join(dir, name);
        const stat = lstatSync(path);
        if (stat.isDirectory()) pending.push(path);
        else if (stat.isFile() || stat.isSymbolicLink()) {
          const inode = `${stat.dev}:${stat.ino}`;
          if (stat.nlink > 1 && seen.has(inode)) continue;
          seen.add(inode);
          bytes += stat.size;
        }
      }
    }
  } catch (error) {
    return {bytes: null, stopped: error.code ?? 'error'};
  }
  return {bytes};
}

// §3.3's sentence: what cua knows, and the two checks it hands the person. It names no command, and cua runs none.
export function retiredSentence({path, installedAt, bytes, stopped}) {
  const recorded = `a cua install recorded placing it on ${installedAt.slice(0, 10)}`;
  const size = bytes === null ? `its size could not be measured (${stopped}); ${recorded}` : `${amount(bytes)} as it is now, where ${recorded}`;
  return `cua ${VENDOR_ENGINE_RETIRED_IN} no longer uses the vendor's release at ${path} for sessions: ${size}. cua leaves it in place and has not `
    + 'checked what it holds. Before deleting it by hand, check that no older cua (another checkout on this home) still runs from it, and for files added to it';
}

// 10^6 bytes to the MB, to one decimal; a tree under a tenth of one is said in bytes.
const amount = bytes => (bytes < 100_000 ? `${bytes} bytes` : `${(bytes / 1e6).toFixed(1)} MB`);
