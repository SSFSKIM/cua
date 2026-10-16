// A child's lifeline to its supervisor (src/repl-host/lifeline.mjs, kernel-child.mjs lifelinePipe):
// - a child busy in synchronous code, which can never read the end of its stdin, still ends once its supervisor lets
//   go of (or, dying, loses) the lifeline's write end;
// - a watched child still exits by itself at once;
// - a required lifeline the child cannot watch (unreadable, not the named pipe, malformed) fails the child's start
//   visibly instead of leaving it unprotected.
// Plain Node children, so these run on any supported Node. Every child is ended by its test's teardown, and every
// child here also has a live lifeline, so a test process that dies leaves nothing spinning.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chmodSync, existsSync, mkdtempSync, realpathSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {lifelinePipe, startKernelChild} from '../../src/repl-host/kernel-child.mjs';
import {LIFELINE_ENV, LIFELINE_FAILED, watchLifeline} from '../../src/repl-host/lifeline.mjs';

const LIFELINE = fileURLToPath(new URL('../../src/repl-host/lifeline.mjs', import.meta.url));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
// Polls `predicate` for at most `ms`; the test fails rather than waits for ever.
async function until(predicate, ms = 10_000) {
  const started = performance.now();
  while (!predicate()) {
    if (performance.now() - started > ms) throw new Error(`not within ${ms} ms`);
    await delay(20);
  }
}
const pathOf = setting => setting.split(':').slice(2).join(':');
// A child that watches its lifeline and reports the outcome (`watching`, or the failure's message), then runs `then`
// (by default: spins for ever in synchronous code).
const child = (then = 'setTimeout(() => { for (;;) {} }, 50);') => `import(${JSON.stringify(LIFELINE)}).then(({watchLifeline}) => watchLifeline()).then(
  () => { process.stdout.write('watching\\n'); ${then} }, error => { process.stdout.write(error.message + '\\n'); process.exit(1); });`;

// Settles with `promise`, or fails once `ms` passed: no wait here is unbounded.
const within = (promise, what, ms = 10_000) => {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${what}: not within ${ms} ms`)), ms); })]).finally(() => clearTimeout(timer));
};

function start(t, setting, code = child()) {
  const proc = spawn(process.execPath, ['-e', code], {stdio: ['ignore', 'pipe', 'inherit'], env: {PATH: process.env.PATH, [LIFELINE_ENV]: setting}});
  const ended = new Promise(resolve => proc.once('exit', (code, signal) => resolve({code, signal})));
  // A child that exits before it reports rejects the report rather than leaving it pending.
  const reported = within(new Promise((resolve, reject) => {
    proc.stdout.setEncoding('utf8').once('data', text => resolve(text.trim()));
    ended.then(status => reject(new Error(`the child ended before it reported (${JSON.stringify(status)})`)));
  }), 'the child\'s report');
  reported.catch(() => {});
  t.after(async () => { if (proc.exitCode === null && proc.signalCode === null) proc.kill('SIGKILL'); await within(ended, 'the child\'s exit at teardown'); });
  return {proc, get exited() { return within(ended, 'the child\'s exit'); }, reported};
}
const lifeline = t => { const made = lifelinePipe(); t.after(() => made.release()); return made; };

test('a child spinning in synchronous code ends once its lifeline\'s write end is gone', async t => {
  const line = lifeline(t);
  const {exited, reported} = start(t, line.setting);
  assert.equal(await reported, 'watching');
  await delay(300);
  const started = performance.now();
  line.release();
  assert.deepEqual(await exited, {code: null, signal: 'SIGKILL'});
  assert.ok(performance.now() - started < 3000, `ended after ${Math.round(performance.now() - started)} ms`);
});

test('a watched child still exits by itself at once, and keeps running while the write end is held', async t => {
  const line = lifeline(t);
  const exiting = start(t, line.setting, child('setTimeout(() => process.exit(7), 300);'));
  assert.equal(await exiting.reported, 'watching');
  const started = performance.now();
  assert.deepEqual(await exiting.exited, {code: 7, signal: null});
  assert.ok(performance.now() - started < 2000, 'a watcher thread never holds its process open');
  const spinning = start(t, line.setting);
  assert.equal(await spinning.reported, 'watching');
  await delay(800);
  assert.equal(spinning.proc.exitCode, null, 'a held lifeline never ends its child');
});

test('a required lifeline the child cannot watch fails its start with the sentence, never runs unprotected', async t => {
  const denied = lifeline(t);
  chmodSync(pathOf(denied.setting), 0o000);
  const unreadable = start(t, denied.setting);
  assert.match(await unreadable.reported, new RegExp(`^${LIFELINE_FAILED}: .*EACCES`));
  assert.equal((await unreadable.exited).code, 1);
  const other = lifeline(t);
  const [dev] = other.setting.split(':');
  const mismatched = start(t, `${dev}:1:${pathOf(other.setting)}`);
  assert.match(await mismatched.reported, new RegExp(`^${LIFELINE_FAILED}: .* is not the named lifeline`));
  const gone = start(t, `1:2:${join(tmpdir(), 'cua-lifeline-absent', 'lifeline')}`);
  assert.match(await gone.reported, new RegExp(`^${LIFELINE_FAILED}: .*ENOENT`));
  for (const setting of ['', 'x', '1:2', '1:2:relative']) {
    const env = {[LIFELINE_ENV]: setting};
    await assert.rejects(watchLifeline(env), {message: new RegExp(`^${LIFELINE_FAILED}: malformed`)});
    assert.equal(LIFELINE_ENV in env, false, 'the setting leaves the environment');
  }
  assert.equal(await watchLifeline({}), null, 'no setting: no lifeline required');
});

test('every child the host starts is given its lifeline, which is unlinked once the child is ready and released when it ends', async t => {
  const script = 'const fs=require("fs");const [dev,ino]=process.env.CUA_REPL_LIFELINE.split(":");const path=process.env.CUA_REPL_LIFELINE.split(":").slice(2).join(":");'
    + 'const s=fs.statSync(path,{bigint:true});process.stdout.write(JSON.stringify({fifo:s.isFIFO(),same:String(s.dev)===dev&&String(s.ino)===ino})+"\\n");'
    + 'process.stdout.write(JSON.stringify({type:"runtime_ready"})+"\\n");process.stdin.once("data",()=>process.exit(0));';
  const messages = [];
  let ended;
  const done = new Promise(resolve => { ended = resolve; });
  let given;
  const kernel = startKernelChild({command: process.execPath, args: ['-e', script], env: {PATH: '/usr/bin:/bin'}, cwd: process.cwd()},
    {onMessage: m => messages.push(m), onEnd: ended, lifelines: root => (given = lifelinePipe(root))});
  t.after(() => kernel.stop());
  await until(() => messages.length >= 2);
  assert.deepEqual(messages[0], {fifo: true, same: true});
  assert.equal(existsSync(pathOf(given.setting)), false, 'the path is gone once the child is ready');
  assert.equal(given.held, true);
  kernel.send({go: 1});
  await done;
  assert.equal(given.held, false, 'the write end is closed once the child is gone');
});

test('the lifeline lives under the child\'s own TMPDIR, the scoped sandbox\'s temporary root, never elsewhere', async t => {
  const runTmp = realpathSync(mkdtempSync(join(tmpdir(), 'cua-run-tmp-')));
  t.after(() => rmSync(runTmp, {recursive: true, force: true}));
  const script = 'process.stdout.write(JSON.stringify({setting:process.env.CUA_REPL_LIFELINE})+"\\n");process.stdin.once("data",()=>process.exit(0));';
  const messages = [];
  let ended;
  const done = new Promise(resolve => { ended = resolve; });
  const kernel = startKernelChild({command: process.execPath, args: ['-e', script], env: {PATH: '/usr/bin:/bin', TMPDIR: runTmp}, cwd: process.cwd()},
    {onMessage: m => messages.push(m), onEnd: ended});
  t.after(() => kernel.stop());
  await until(() => messages.length >= 1);
  assert.ok(pathOf(messages[0].setting).startsWith(runTmp + '/cua-lifeline-'), messages[0].setting);
  kernel.send({go: 1});
  await done;
});
