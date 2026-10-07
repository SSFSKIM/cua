// Ownership of $CUA_HOME/run (src/runtime/run-dir.mjs): the owner record, release, the exit hook and the sweep. Real
// sockets are made by a process that binds one and is killed before it can remove it, as a killed broker (a cua before
// issue #66) left it.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {REPO, shortScratch} from './fixtures/runtime-fixture.mjs';
import {claimRunSession, describeSweep, sweepRun} from '../src/runtime/run-dir.mjs';

const RUN_DIR = pathToFileURL(join(REPO, 'src', 'runtime', 'run-dir.mjs')).href;
const ID = n => `00000000-0000-4000-8000-00000000000${n}`;

function home(t) {
  const s = shortScratch();
  t.after(s.cleanup);
  return s.dir;
}

// Leaves a socket at `path` the way a killed broker (a cua before issue #66) did.
function leftoverSocket(path) {
  spawnSync(process.execPath, ['-e', `require('net').createServer().listen(${JSON.stringify(path)}, () => process.kill(process.pid, 'SIGKILL'))`]);
  assert.ok(lstatSync(path).isSocket());
}

// A session as its owner leaves it: record, working directory with something in it, and (optionally) a socket.
function session(run, id, pid, {socket = true} = {}) {
  mkdirSync(join(run, id), {recursive: true});
  writeFileSync(join(run, id, 'scratch.txt'), 'cell output');
  if (pid !== undefined) writeFileSync(join(run, `${id}.pid`), `${pid}\n`);
  if (socket) leftoverSocket(join(run, `${id}.sock`));
}

test('a claim records this process first; release removes the working directory and then the record', async t => {
  const dir = home(t);
  const run = join(dir, 'run');
  const claim = claimRunSession(dir, ID(1));
  assert.equal(readFileSync(join(run, `${ID(1)}.pid`), 'utf8'), `${process.pid}\n`);
  assert.equal(lstatSync(join(run, `${ID(1)}.pid`)).mode & 0o777, 0o600);
  assert.equal(lstatSync(run).mode & 0o777, 0o700);
  assert.throws(() => claimRunSession(dir, ID(1)), {code: 'EEXIST'}, 'a session is claimed once');
  mkdirSync(join(run, ID(1)));
  writeFileSync(join(run, ID(1), 'scratch.txt'), 'x');
  assert.deepEqual(claim.release(), []);
  assert.deepEqual(readdirSync(run), []);
});

test('release removes the session entirely, a socket left by a cua from before the file store included', async t => {
  const dir = home(t);
  const run = join(dir, 'run');
  const claim = claimRunSession(dir, ID(1));
  mkdirSync(join(run, ID(1)));
  leftoverSocket(join(run, `${ID(1)}.sock`));
  assert.deepEqual(claim.release(), []);
  assert.deepEqual(readdirSync(run), []);
});

test('the sweep removes sessions whose owner is gone, leaves live ones, and reports entries without a record untouched', async t => {
  const dir = home(t);
  const run = join(dir, 'run');
  mkdirSync(run);
  const dead = 999_999;
  session(run, ID(1), dead);                    // killed by a cua before #66, with its broker: directory, socket, record
  session(run, ID(2), dead, {socket: false});   // killed: directory and record
  session(run, ID(3), process.pid);             // live
  session(run, ID(4), undefined);               // no record: a cua from before records, or not cua's
  writeFileSync(join(run, `${ID(5)}.pid`), ''); // a record still being written
  const found = sweepRun(dir, {alive: pid => pid === process.pid});
  assert.deepEqual(found.swept.map(s => s.session).sort(), [ID(1), ID(2)]);
  assert.deepEqual(found.live, [{session: ID(3), pid: process.pid}]);
  assert.deepEqual(found.unowned.sort(), [ID(4), `${ID(4)}.sock`, `${ID(5)}.pid`]);
  assert.deepEqual(found.failed, []);
  assert.deepEqual(readdirSync(run).sort(), [ID(3), `${ID(3)}.pid`, `${ID(3)}.sock`, ID(4), `${ID(4)}.sock`, `${ID(5)}.pid`]);
  const line = describeSweep(found);
  assert.match(line, new RegExp(`removed the leftovers of 2 connections whose cua process is gone \\(.*${ID(1)}, pid ${dead}`));
  assert.match(line, new RegExp(`left alone 3 entries with no owner record \\(.*${ID(4)}\\.sock`));
  assert.doesNotMatch(line, new RegExp(ID(3)), 'a live session is not reported as stale');
  assert.equal(describeSweep(sweepRun(join(dir, 'elsewhere'))), null, 'no run directory: nothing to say');
});

test('a stale session that cannot be removed is reported as failed and keeps its record for the next sweep', {skip: process.getuid?.() === 0}, async t => {
  const dir = home(t);
  const run = join(dir, 'run');
  mkdirSync(run);
  session(run, ID(1), 999_999);
  chmodSync(run, 0o500);
  let found;
  try { found = sweepRun(dir, {alive: () => false}); } finally { chmodSync(run, 0o700); }
  assert.equal(found.swept.length, 0);
  assert.equal(found.failed[0].session, ID(1));
  assert.match(describeSweep(found), /could not remove the leftovers of .*EACCES/);
  assert.deepEqual(sweepRun(dir, {alive: () => false}).swept.map(s => s.session), [ID(1)]);
  assert.deepEqual(readdirSync(run), []);
});

// The exit paths a process does not close in order: an uncaught error or an unhandled rejection still removes its
// session (the exit hook); a SIGKILL cannot, and the next sweep with the real liveness check does.
for (const [how, crash, cleaned] of [
  ['an uncaught error', `setTimeout(() => { throw new Error('boom'); }, 10);`, true],
  ['an unhandled rejection', `await new Promise((_, reject) => setTimeout(() => reject(new Error('boom')), 10));`, true],
  ['SIGKILL', `process.kill(process.pid, 'SIGKILL');`, false],
]) {
  test(`a claimant that dies by ${how} ${cleaned ? 'leaves nothing behind' : 'is swept once it is gone'}`, async t => {
    const dir = home(t);
    const run = join(dir, 'run');
    const script = `
      import {claimRunSession} from ${JSON.stringify(RUN_DIR)};
      import {mkdirSync, writeFileSync} from 'node:fs';
      import net from 'node:net';
      claimRunSession(${JSON.stringify(dir)}, ${JSON.stringify(ID(1))});
      mkdirSync(${JSON.stringify(join(run, ID(1)))});
      writeFileSync(${JSON.stringify(join(run, ID(1), 'scratch.txt'))}, 'x');
      await new Promise(resolve => net.createServer().listen(${JSON.stringify(join(run, `${ID(1)}.sock`))}, resolve));
      ${crash}`;
    const child = spawn(process.execPath, ['--input-type=module', '-e', script], {stdio: 'ignore'});
    const [code, signal] = await new Promise(resolve => child.on('exit', (...a) => resolve(a)));
    assert.ok(code === 1 || signal === 'SIGKILL', `${code} ${signal}`);
    if (cleaned) return assert.deepEqual(readdirSync(run), []);
    assert.deepEqual(readdirSync(run).sort(), [ID(1), `${ID(1)}.pid`, `${ID(1)}.sock`]);
    assert.deepEqual(sweepRun(dir).swept, [{session: ID(1), pid: child.pid}]);
    assert.equal(existsSync(run) && readdirSync(run).length, 0);
  });
}
