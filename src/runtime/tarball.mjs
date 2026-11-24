// cua's own reader of an npm package tarball (#171 M6a; docs/doperpowers/specs/2026-10-28-own-linux-engine-m6a-
// preflight.md §4.2): gzip through node:zlib, then the tar headers, in memory. It is given bytes whose SHA-512 the
// caller has already checked against the pin, so what it guards against is not tampering but a package shape cua will
// not write: only regular files and directories under the package's one top directory (npm's `package/`, which is
// stripped) are accepted. A link of either kind, a device, a FIFO, an absolute path, a path with `..`, `.`, an empty
// part or a NUL, a member outside the top directory, a duplicate (the top directory's own header included, or a path
// that is both a file and a directory), a header whose checksum fails, a body cut short, an end that is not two zero
// blocks with only zeros after them, or a size past the bounds refuses the whole package, and the whole archive is
// read and checked before anything is written. Nothing is followed, since nothing but files and directories is ever written; no
// `tar` and no package script runs.
//
// Pax extended headers (`x`) supply a member's path or size; global ones (`g`) and the GNU long name (`L`) are read
// for what they are and nothing else.
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {mkdirSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fail} from './errors.mjs';

// The largest member and the largest unpacked package cua accepts. The largest file of the pinned tree is libvips at
// about 18.6 MB; the largest package is about 40 MB unpacked.
export const MAX_MEMBER_BYTES = 64 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 256 * 1024 * 1024;

const BLOCK = 512;
const refuse = why => fail('tarball_invalid', `package tarball refused: ${why}`);
const REFUSED_TYPES = {1: 'a hard link', 2: 'a symbolic link', K: 'a link', 3: 'a character device', 4: 'a block device', 6: 'a FIFO'};

function text(header, offset, width) {
  const end = header.indexOf(0, offset);
  return header.toString('utf8', offset, end === -1 || end > offset + width ? offset + width : end);
}

function number(header, offset, width, what) {
  const raw = text(header, offset, width).trim();
  if (!/^[0-7]*$/.test(raw)) refuse(`a header's ${what} is not octal`);
  return raw ? parseInt(raw, 8) : 0;
}

function checksumOk(header) {
  let sum = 0;
  for (let i = 0; i < BLOCK; i++) sum += i >= 148 && i < 156 ? 0x20 : header[i];
  return sum === number(header, 148, 8, 'checksum');
}

// "<length> <key>=<value>\n" records.
function paxRecords(body) {
  const records = {};
  let at = 0;
  while (at < body.length) {
    const space = body.indexOf(0x20, at);
    const length = space === -1 ? NaN : Number(body.toString('utf8', at, space));
    if (!Number.isInteger(length) || length <= 0 || at + length > body.length) refuse('a pax header is malformed');
    const record = body.toString('utf8', space + 1, at + length - 1);
    const equals = record.indexOf('=');
    if (equals === -1) refuse('a pax header is malformed');
    records[record.slice(0, equals)] = record.slice(equals + 1);
    at += length;
  }
  return records;
}

function safeParts(path) {
  if (path.includes('\0')) refuse(`a NUL inside the path ${JSON.stringify(path)}`);
  if (path.startsWith('/')) refuse(`an absolute path ${JSON.stringify(path)}`);
  const parts = path.replace(/\/$/, '').split('/');
  if (parts.some(part => part === '' || part === '.' || part === '..')) refuse(`an unsafe path ${JSON.stringify(path)}`);
  return parts;
}

// -> {top, entries: [{path, type: 'file'|'dir', mode, data}]}, paths relative to the top directory, in archive order.
export function readTarball(bytes, {maxMemberBytes = MAX_MEMBER_BYTES, maxTotalBytes = MAX_TOTAL_BYTES} = {}) {
  let tar;
  try {
    tar = gunzipSync(bytes, {maxOutputLength: maxTotalBytes + 64 * 1024 * 1024});
  } catch (error) {
    if (error.code === 'ERR_BUFFER_TOO_LARGE') refuse('it unpacks past the size bound');
    refuse(`it is not gzip data (${error.code ?? error.message})`);
  }
  const entries = [];
  // path -> 'file', 'dir' (a member) or 'implied' (a directory only a deeper member names). A path may be a directory
  // member once and implied any number of times, and a file only once and never a directory.
  const seen = new Map();
  let top = null;
  let topSeen = false;
  let total = 0;
  let pax = {};
  let longName = null;
  let at = 0;
  const claim = (path, kind) => {
    const had = seen.get(path);
    const clash = kind === 'file' ? had : kind === 'dir' ? had === 'file' || had === 'dir' : had === 'file';
    if (clash) refuse(`a duplicate member ${JSON.stringify(path)}`);
    if (kind !== 'implied' || !had) seen.set(path, kind);
  };
  while (true) {
    if (at + BLOCK > tar.length) refuse('the archive is truncated before its end');
    const header = tar.subarray(at, at + BLOCK);
    if (header.every(byte => byte === 0)) {
      // The end: a second zero block, and nothing after it but the zeros that pad the last record.
      if (at + 2 * BLOCK > tar.length || !tar.subarray(at + BLOCK).every(byte => byte === 0)) refuse('the archive does not end with two zero blocks and nothing after them');
      if (Object.keys(pax).length || longName !== null) refuse('the archive ends after an extended header, before its member');
      break;
    }
    if (!checksumOk(header)) refuse('a header checksum fails');
    const flag = String.fromCharCode(header[156] || 0x30);
    if (pax.size !== undefined && !/^\d+$/.test(pax.size)) refuse('a pax size is malformed');
    const size = pax.size !== undefined ? Number(pax.size) : number(header, 124, 12, 'size');
    if (!Number.isSafeInteger(size) || size < 0) refuse('a member size is malformed');
    if (size > maxMemberBytes) refuse(`a member of ${size} bytes passes the ${maxMemberBytes}-byte bound`);
    const bodyStart = at + BLOCK;
    if (bodyStart + size > tar.length) refuse('a member body is truncated');
    const body = tar.subarray(bodyStart, bodyStart + size);
    at = bodyStart + Math.ceil(size / BLOCK) * BLOCK;

    if (flag === 'x') { pax = paxRecords(body); continue; }
    if (flag === 'g') { paxRecords(body); continue; }
    if (flag === 'L') { longName = body.toString('utf8').replace(/\0+$/, ''); safeParts(longName); continue; }
    if (REFUSED_TYPES[flag]) refuse(`${REFUSED_TYPES[flag]} ${JSON.stringify(text(header, 0, 100))}`);
    if (flag !== '0' && flag !== '5') refuse(`a member of type ${JSON.stringify(flag)}`);

    const prefix = text(header, 345, 155);
    const name = pax.path ?? longName ?? (prefix ? `${prefix}/${text(header, 0, 100)}` : text(header, 0, 100));
    pax = {};
    longName = null;
    const isDir = flag === '5';
    if (!isDir && name.endsWith('/')) refuse(`a file named as a directory ${JSON.stringify(name)}`);
    const parts = safeParts(name);
    if (top === null) top = parts[0];
    if (parts[0] !== top) refuse(`a member outside the one top directory ${JSON.stringify(top)}: ${JSON.stringify(name)}`);
    if (parts.length === 1) {
      if (!isDir) refuse(`a file outside the top directory: ${JSON.stringify(name)}`);
      if (topSeen) refuse(`a duplicate member ${JSON.stringify(name)}`);
      topSeen = true;
      continue;
    }
    const path = parts.slice(1).join('/');
    for (let i = 2; i < parts.length; i++) claim(parts.slice(1, i).join('/'), 'implied');
    claim(path, isDir ? 'dir' : 'file');
    total += size;
    if (total > maxTotalBytes) refuse(`the package unpacks past the ${maxTotalBytes}-byte bound`);
    const mode = number(header, 100, 8, 'mode');
    entries.push(isDir ? {path, type: 'dir', mode} : {path, type: 'file', mode, data: body});
  }
  if (!entries.some(entry => entry.type === 'file')) refuse('it holds no files');
  return {top, entries};
}

// The npm package shape, shared by the installer and the pin script (scripts/modules-pin.mjs), so a package the pin
// accepts is one the install accepts: a valid archive (readTarball) whose top directory holds a package.json file.
export function readPackageTarball(bytes, limits) {
  const read = readTarball(bytes, limits);
  if (!read.entries.some(entry => entry.type === 'file' && entry.path === 'package.json')) refuse('it has no package.json at its top');
  return read;
}

// Reads the whole archive as an npm package (readPackageTarball), then writes it into `dest`, which must not exist (its parents are made) -> {files: [{path, size,
// sha256}]}, sorted by path: the payload as it was written. Files are 0644, or 0755 when the archive gives any execute
// bit; directories 0755.
export function unpackTarball(bytes, dest, limits) {
  const {entries} = readPackageTarball(bytes, limits);
  mkdirSync(dirname(dest), {recursive: true, mode: 0o755});
  mkdirSync(dest, {mode: 0o755});
  const files = [];
  for (const entry of entries) {
    const target = join(dest, entry.path);
    if (entry.type === 'dir') { mkdirSync(target, {recursive: true, mode: 0o755}); continue; }
    const slash = entry.path.lastIndexOf('/');
    if (slash !== -1) mkdirSync(join(dest, entry.path.slice(0, slash)), {recursive: true, mode: 0o755});
    writeFileSync(target, entry.data, {flag: 'wx', mode: entry.mode & 0o111 ? 0o755 : 0o644});
    files.push({path: entry.path, size: entry.data.length, sha256: createHash('sha256').update(entry.data).digest('hex')});
  }
  return {files: files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)};
}
