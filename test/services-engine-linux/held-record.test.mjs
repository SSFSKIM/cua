// The trusted worker's part of the engine's held record (src/services/engine/linux/held-record.mjs, M4 T7b fix 5): the
// descriptor the launcher shim hands down is taken before anything starts, kept close-on-exec, and given to each engine
// the client starts, at descriptor 3, and to nothing else.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {closeSync, mkdtempSync, openSync, readFileSync, readlinkSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {ENGINE_HELD_FD, HELD_RECORD_ENV, heldRecordStdio, takeHeldRecord} from '../../src/services/engine/linux/held-record.mjs';
import {createEngineClient} from '../../src/services/engine/linux/client.mjs';
import {fakeLinuxEngine} from '../helpers/fake-linux-engine.mjs';

const linuxOnly = {skip: process.platform !== 'linux' && 'Linux only (/proc)'};
const MODULE = pathToFileURL(join(import.meta.dirname, '../../src/services/engine/linux/held-record.mjs')).href;

// A worker stand-in: it inherited a pipe's write end at 5, named in the environment, as the shim hands it down
const WORKER = `
import {readFileSync, readlinkSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const {takeHeldRecord, heldRecordStdio} = await import(${JSON.stringify(MODULE)});
const link = readlinkSync('/proc/self/fd/5');
const kept = takeHeldRecord();
const open = fd => { try { return readlinkSync('/proc/self/fd/' + fd); } catch { return null; } };
const inherited = open(5);
const flags = parseInt(readFileSync('/proc/self/fdinfo/' + kept, 'utf8').match(/flags:\\s+(\\d+)/)[1], 8);
const lister = "const fs = require('fs'); console.log(JSON.stringify(fs.readdirSync('/proc/self/fd').map(n => { try { return fs.readlinkSync('/proc/self/fd/' + n); } catch { return null; } })))";
const plain = JSON.parse(spawnSync(process.execPath, ['-e', lister], {encoding: 'utf8'}).stdout);
const held = heldRecordStdio();
const given = spawnSync('/bin/sh', ['-c', 'printf engine >&3; readlink /proc/self/fd/3; echo "$${HELD_RECORD_ENV}"'],
  {encoding: 'utf8', env: {...process.env, ...held.env}, stdio: ['ignore', 'pipe', 'pipe', ...held.stdio]});
console.error(JSON.stringify({link, named: process.env.${HELD_RECORD_ENV} ?? null, inherited, kept, cloexec: (flags & 0o2000000) !== 0,
  plain, given: given.stdout.trim().split('\\n')}));
`;

test('the worker takes the record before it starts anything: reopened close-on-exec, the inherited one closed, its name gone; a plain child gets nothing, the engine gets it at 3', linuxOnly, t => {
  const dir = mkdtempSync(join(tmpdir(), 'cua-held-record-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  writeFileSync(join(dir, 'worker.mjs'), WORKER);
  const out = join(dir, 'record');
  // 5 is the write end of a pipe whose reader (cat) stands for the shim; the worker's own stdout goes to stderr
  const run = spawnSync('/bin/sh', ['-c', `"$0" "$1" 5>&1 1>&2 | cat > "$2"`, process.execPath, join(dir, 'worker.mjs'), out],
    {encoding: 'utf8', env: {...process.env, [HELD_RECORD_ENV]: '5'}});
  assert.equal(run.status, 0, run.stderr);
  const seen = JSON.parse(run.stderr.trim().split('\n').pop());
  assert.match(seen.link, /^pipe:\[\d+\]$/);
  assert.equal(seen.named, null, 'the name is out of the environment');
  assert.equal(seen.inherited, null, 'the inherited descriptor is closed');
  assert.notEqual(seen.kept, 5);
  assert.equal(seen.cloexec, true, 'kept close-on-exec');
  assert.ok(!seen.plain.includes(seen.link), `a child started plainly holds no end of the record: ${JSON.stringify(seen.plain)}`);
  assert.deepEqual(seen.given, [seen.link, String(ENGINE_HELD_FD)], 'the engine finds it at 3, named so');
  assert.equal(readFileSync(out, 'utf8'), 'engine', 'what the engine writes reaches the shim');
});

test('no record named, a value that is no descriptor or a standard stream, or one no longer open: none is kept, and the name always goes', () => {
  for (const value of [undefined, '', 'x', '-1', '1', '2']) {
    const env = value === undefined ? {} : {[HELD_RECORD_ENV]: value};
    let opened = false;
    assert.equal(takeHeldRecord(env, {open: () => { opened = true; return 9; }, close: () => {}}), null, String(value));
    assert.equal(opened, false, `${value}: nothing opened`);
    assert.equal(HELD_RECORD_ENV in env, false);
  }
  const closed = [];
  const env = {[HELD_RECORD_ENV]: '7'};
  assert.equal(takeHeldRecord(env, {open: () => { throw Object.assign(new Error('gone'), {code: 'ENXIO'}); }, close: fd => closed.push(fd)}), null, 'no reader any more');
  assert.deepEqual(closed, [7]);
  assert.equal(heldRecordStdio(null), null);
  assert.deepEqual(heldRecordStdio(12), {stdio: [12], env: {[HELD_RECORD_ENV]: '3'}});
});

const reportsRecord = `import {readlinkSync} from 'node:fs';
export function answer(command) {
  if (command !== 'held') return undefined;
  let at3 = null;
  try { at3 = readlinkSync('/proc/self/fd/3'); } catch { /* none */ }
  return {output: {named: process.env.${HELD_RECORD_ENV} ?? null, at3}};
}`;

test('the client gives each engine it starts the record at 3, named so, and an engine of a worker with none gets neither', linuxOnly, async t => {
  const dir = mkdtempSync(join(tmpdir(), 'cua-held-client-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const file = join(dir, 'stand-in');
  const fd = openSync(file, 'w');
  t.after(() => closeSync(fd));
  const engine = fakeLinuxEngine(t, {behaviour: reportsRecord});
  const held = createEngineClient({path: engine.path, held: heldRecordStdio(fd)});
  t.after(() => held.close());
  assert.deepEqual(await held.request('held', {}), {named: '3', at3: readlinkSync(`/proc/self/fd/${fd}`)});
  const none = createEngineClient({path: engine.path});
  t.after(() => none.close());
  // a worker holding no record (the module took none here); the fake engine, a Node process, puts its own at 3
  const without = await none.request('held', {});
  assert.equal(without.named, null);
  assert.notEqual(without.at3, readlinkSync(`/proc/self/fd/${fd}`));
});
