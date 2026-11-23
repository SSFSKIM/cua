// cua's own reader of a package tarball (#171 M6a T1; the pre-flight's §4.2, "The install"): gzip through node:zlib,
// then the tar headers, writing regular files and directories only. Every member that is not a plain file or directory
// under the package's one top directory refuses the whole package, and the refusal comes before anything is written.
// The tarballs are the tests' own (test/fixtures/module-registry.mjs), so each malformed member is exactly the one named.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {gzipSync} from 'node:zlib';
import {readPackageTarball, readTarball, unpackTarball} from '../src/runtime/tarball.mjs';
import {packageTarball, paxRecord, sha256Of, tarBytes, tarHeader, tarball} from './fixtures/module-registry.mjs';

function setup(t) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'cua-tarball-')));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  return dir;
}
const refused = pattern => error => { assert.equal(error.code, 'tarball_invalid', `${error.code}: ${error.message}`); if (pattern) assert.match(error.message, pattern); return true; };
const listAll = dir => readdirSync(dir, {recursive: true}).sort();
// A tar stream's members without its two end blocks.
const withoutEnd = entries => { const bytes = tarBytes(entries); return bytes.subarray(0, bytes.length - 1024); };

test('a package tarball reads as its files and directories under the top directory, which is stripped', () => {
  const bytes = packageTarball('sharp', '0.35.4', {'lib/index.js': 'module.exports = 1;\n', 'lib/sharp.node': 'addon'});
  const {top, entries} = readTarball(bytes);
  assert.equal(top, 'package');
  assert.deepEqual(entries.map(e => [e.type, e.path]), [['file', 'package.json'], ['file', 'lib/index.js'], ['file', 'lib/sharp.node']]);
  assert.equal(entries.find(e => e.path === 'lib/sharp.node').mode & 0o111, 0o111, 'the executable bit is kept');
});

test('unpacking writes the files into a new directory and returns each file\'s path, size and SHA-256', t => {
  const dir = setup(t);
  const bytes = tarball([
    {name: 'package/package.json', data: '{"name":"a","version":"1.0.0"}\n'},
    {name: 'package/bin/', type: 'dir', mode: 0o755},
    {name: 'package/bin/run', data: '#!/bin/sh\n', mode: 0o755},
    {name: 'package/lib/deep/x.js', data: 'x'},
  ]);
  const dest = join(dir, 'node_modules', 'a');
  const {files} = unpackTarball(bytes, dest);
  assert.deepEqual(files, [
    {path: 'bin/run', size: 10, sha256: sha256Of(Buffer.from('#!/bin/sh\n'))},
    {path: 'lib/deep/x.js', size: 1, sha256: sha256Of(Buffer.from('x'))},
    {path: 'package.json', size: 31, sha256: sha256Of(Buffer.from('{"name":"a","version":"1.0.0"}\n'))},
  ]);
  assert.equal(readFileSync(join(dest, 'lib/deep/x.js'), 'utf8'), 'x');
  assert.equal(statSync(join(dest, 'bin/run')).mode & 0o100, 0o100);
  assert.equal(statSync(join(dest, 'package.json')).mode & 0o111, 0, 'a file without an execute bit gets none');
});

test('long names through a pax header and through the ustar prefix are read', () => {
  const long = `package/${'d'.repeat(120)}/file.js`;
  const {entries} = readTarball(tarball([
    {name: 'PaxHeader', type: 'pax', data: paxRecord('path', long) + paxRecord('mtime', '1')},
    {name: 'package/truncated-name', data: 'pax'},
    {name: 'file2.js', prefix: `package/${'p'.repeat(100)}`, data: 'prefix'},
    {name: 'pax_global_header', type: 'global', data: paxRecord('comment', 'ignored')},
  ]));
  assert.deepEqual(entries.map(e => e.path), [`${'d'.repeat(120)}/file.js`, `${'p'.repeat(100)}/file2.js`]);
});

test('each member a package may not carry refuses the whole package, and nothing is written', async t => {
  const dir = setup(t);
  const good = {name: 'package/package.json', data: '{}'};
  const cases = {
    symlink: [[good, {name: 'package/link', type: 'symlink', linkname: '/etc/passwd'}], /link/],
    hardlink: [[good, {name: 'package/hard', type: 'hardlink', linkname: 'package/package.json'}], /link/],
    'character device': [[good, {name: 'package/dev', type: 'char'}], /device|type/],
    'block device': [[good, {name: 'package/blk', type: 'block'}], /device|type/],
    fifo: [[good, {name: 'package/fifo', type: 'fifo'}], /fifo|type/i],
    'absolute path': [[good, {name: '/package/abs.js', data: 'x'}], /absolute|unsafe/],
    '.. path': [[good, {name: 'package/../escape.js', data: 'x'}], /unsafe/],
    '.. inside a pax path': [[good, {name: 'PaxHeader', type: 'pax', data: paxRecord('path', 'package/a/../../escape.js')}, {name: 'package/ok.js', data: 'x'}], /unsafe/],
    'empty part': [[good, {name: 'package//double.js', data: 'x'}], /unsafe/],
    'second top directory': [[good, {name: 'other/file.js', data: 'x'}], /top director/],
    'a file at the top': [[good, {name: 'loose.js', data: 'x'}], /top director/],
    'duplicate member': [[good, {name: 'package/a.js', data: 'one'}, {name: 'package/a.js', data: 'two'}], /duplicate/],
    'a file that is also a directory': [[good, {name: 'package/a', data: 'file'}, {name: 'package/a/b.js', data: 'x'}], /duplicate|conflict/],
    'oversized member': [[good, {name: 'package/huge.bin', size: 300 * 1024 * 1024}], /bound|size/],
    'a second top-directory header': [[{name: 'package/', type: 'dir', mode: 0o755}, good, {name: 'package/', type: 'dir', mode: 0o755}], /duplicate/],
    'a NUL inside a pax path': [[good, {name: 'PaxHeader', type: 'pax', data: paxRecord('path', 'package/lib/a\0b.js')}, {name: 'package/ok.js', data: 'x'}], /NUL/],
    'a NUL inside a GNU long name': [[good, {name: '././@LongLink', type: 'longname', data: 'package/lib/a\0b.js\0'}, {name: 'package/ok.js', data: 'x'}], /NUL/],
    // The end of the archive is two zero blocks with nothing but zeros after them.
    'a member after the end block': [gzipSync(Buffer.concat([withoutEnd([good]), Buffer.alloc(512), withoutEnd([{name: 'package/hidden.js', data: 'x'}]), Buffer.alloc(1024)])), /end/],
    'a single end block': [gzipSync(Buffer.concat([withoutEnd([good]), Buffer.alloc(512)])), /end/],
    'data after the end': [gzipSync(Buffer.concat([tarBytes([good]), Buffer.from('trailing')])), /end/],
  };
  for (const [name, [entries, pattern]] of Object.entries(cases)) {
    const bytes = Buffer.isBuffer(entries) ? entries : tarball(entries);
    assert.throws(() => readTarball(bytes), refused(pattern), name);
    const dest = join(dir, name.replace(/\W+/g, '-'), 'package');
    assert.throws(() => unpackTarball(bytes, dest), refused(pattern), name);
    assert.equal(existsSync(dest), false, `${name}: the package directory is not created`);
  }
  assert.deepEqual(listAll(dir), [], 'nothing was written anywhere');
});

test('an npm package carries its package.json at the top: one without it is refused before anything is written', t => {
  const dir = setup(t);
  const cases = {
    'no package.json': [{name: 'package/index.js', data: 'x'}],
    'package.json only deeper': [{name: 'package/lib/package.json', data: '{}'}],
    'package.json as a directory': [{name: 'package/package.json/', type: 'dir'}, {name: 'package/package.json/x', data: '{}'}],
  };
  for (const [name, entries] of Object.entries(cases)) {
    const bytes = tarball(entries);
    assert.throws(() => readPackageTarball(bytes), refused(/package\.json/), name);
    const dest = join(dir, name.replace(/\W+/g, '-'), 'package');
    assert.throws(() => unpackTarball(bytes, dest), refused(/package\.json/), name);
    assert.equal(existsSync(dest), false, name);
  }
  assert.deepEqual(listAll(dir), []);
  assert.equal(readPackageTarball(packageTarball('a', '1.0.0')).top, 'package');
});

test('a member past the bound the caller sets is refused, as is an archive whose unpacked size passes the total', () => {
  const bytes = tarball([{name: 'package/package.json', data: '{}'}, {name: 'package/big.bin', data: Buffer.alloc(4096)}]);
  assert.throws(() => readTarball(bytes, {maxMemberBytes: 1024}), refused(/bound/));
  assert.throws(() => readTarball(bytes, {maxTotalBytes: 2048}), refused(/bound/));
  assert.equal(readTarball(bytes, {maxMemberBytes: 4096}).entries.length, 2);
});

test('a damaged archive is refused: not gzip, a bad header checksum, a body cut short, an unknown member type', () => {
  const good = {name: 'package/package.json', data: '{}'};
  assert.throws(() => readTarball(Buffer.from('not gzip at all')), refused(/gzip/));
  const badSum = gzipSync(Buffer.concat([tarHeader({name: 'package/a.js', size: 0, checksum: 1}), Buffer.alloc(1024)]));
  assert.throws(() => readTarball(badSum), refused(/checksum/));
  const whole = tarBytes([good, {name: 'package/b.js', data: Buffer.alloc(2000, 1)}]);
  assert.throws(() => readTarball(gzipSync(whole.subarray(0, 1536))), refused(/truncated|short/));
  assert.throws(() => readTarball(tarball([good, {name: 'package/c', type: '7', data: 'x'}])), refused(/type/));
});

test('an archive with no members, or no top directory, is refused', () => {
  assert.throws(() => readTarball(gzipSync(Buffer.alloc(1024))), refused(/empty|no files/));
});
