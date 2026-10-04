// The sentinel scanner behind scripts/probe-secrets.mjs. A PASS from the live probe is only as good as this: every
// byte of every file must be scanned, including fingerprints that straddle read chunks, and a file it could not read
// must be reported, never skipped.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chmodSync, mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fingerprints, scanFiles, textLeaks} from '../scripts/probe/leak-scan.mjs';
import {scratch} from './fixtures/runtime-fixture.mjs';

const SENTINEL = 'cua-m5-sentinel-Zq9_x-7Hk2LmNo4PqRsTuVwXy';
const PRINTS = fingerprints(SENTINEL);

test('a value is found raw and as base64 at every byte offset of a framed reply', () => {
  for (let offset = 0; offset < 6; offset++) {
    const frame = Buffer.concat([Buffer.alloc(offset, 0x41), Buffer.from(JSON.stringify({ok: true, value: SENTINEL}))]);
    assert.ok(textLeaks(frame.toString('base64'), PRINTS) > 0, `offset ${offset}`);
  }
  assert.ok(textLeaks(`x${SENTINEL}y`, PRINTS) > 0);
  assert.equal(textLeaks('nothing here', PRINTS), 0);
});

test('files of any size are scanned completely, including fingerprints that straddle read chunks', async t => {
  const s = scratch();
  t.after(s.cleanup);
  const big = Buffer.alloc(5 << 20, 0x2e);
  Buffer.from(SENTINEL).copy(big, (4 << 20) + 123);                               // past the old 4 MiB cutoff
  writeFileSync(join(s.dir, 'big.log'), big);
  const straddle = Buffer.alloc((1 << 20) + 64, 0x2e);
  Buffer.from(SENTINEL).copy(straddle, (1 << 20) - 10);                           // across the first chunk boundary
  writeFileSync(join(s.dir, 'straddle.log'), straddle);
  const encoded = Buffer.alloc(3 << 20, 0x2e);
  Buffer.from(Buffer.from(`{"value":"${SENTINEL}"}`).toString('base64')).copy(encoded, (2 << 20) - 40);  // base64, across a boundary
  writeFileSync(join(s.dir, 'encoded.log'), encoded);
  mkdirSync(join(s.dir, 'nested'));
  writeFileSync(join(s.dir, 'nested', 'clean.log'), Buffer.alloc(6 << 20, 0x2e));

  const result = await scanFiles([s.dir], PRINTS, {chunkBytes: 1 << 20});
  assert.deepEqual(result.leaked.map(f => f.replace(s.dir, '')).sort(), ['/big.log', '/encoded.log', '/straddle.log']);
  assert.deepEqual(result.unread, []);
  assert.equal(result.scanned, 4);
});

test('a file that cannot be read is reported as unread, never as clean', {skip: process.getuid?.() === 0}, async t => {
  const s = scratch();
  t.after(s.cleanup);
  const locked = join(s.dir, 'locked.log');
  writeFileSync(locked, SENTINEL);
  chmodSync(locked, 0o000);  // the scratch cleanup removes it regardless: its directory stays writable
  const result = await scanFiles([s.dir, join(s.dir, 'absent')], PRINTS);
  assert.deepEqual(result.unread, [locked]);
  assert.deepEqual(result.leaked, []);
  assert.equal(result.scanned, 0);
});

test('a root behind an inaccessible directory is unread, while a root that does not exist is simply absent', {skip: process.getuid?.() === 0}, async t => {
  const s = scratch();
  t.after(s.cleanup);
  const gate = join(s.dir, 'gate');
  mkdirSync(join(gate, 'state'), {recursive: true});
  writeFileSync(join(gate, 'state', 'leak.log'), SENTINEL);
  chmodSync(gate, 0o000);
  let result;
  try { result = await scanFiles([join(gate, 'state'), join(s.dir, 'absent')], PRINTS); } finally { chmodSync(gate, 0o700); }
  assert.deepEqual(result.unread, [join(gate, 'state')]);
  assert.deepEqual(result.leaked, []);
  assert.equal(result.scanned, 0);
});

test('an excluded path is never opened and is reported as excluded, not as scanned or clean', async t => {
  const s = scratch();
  t.after(s.cleanup);
  mkdirSync(join(s.dir, 'codex'));
  writeFileSync(join(s.dir, 'codex', 'auth.json'), `{"x":"${SENTINEL}"}`);
  writeFileSync(join(s.dir, 'codex', 'other.json'), 'clean');
  const opened = [];
  const result = await scanFiles([s.dir], PRINTS, {exclude: path => { opened.push(path); return path.endsWith('/codex/auth.json'); }});
  assert.deepEqual(result.leaked, []);
  assert.equal(result.scanned, 1);
  assert.deepEqual(result.excluded, [join(s.dir, 'codex', 'auth.json')]);
  const plain = await scanFiles([s.dir], PRINTS);
  assert.deepEqual(plain.excluded, []);
  assert.equal(plain.leaked.length, 1, 'without the exclusion the same file is scanned');
});
