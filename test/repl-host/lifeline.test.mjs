// A child's lifeline to its supervisor (src/repl-host/lifeline.mjs, kernel-child.mjs lifelinePipe): a child busy in
// synchronous code, which can never read the end of its stdin, still ends once its supervisor lets go of (or, dying,
// loses) the lifeline's write end; a watched child still exits by itself at once; a path that is not the named lifeline
// is never watched. Plain Node children, so these run on any supported Node.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {lifelinePipe, startKernelChild} from '../../src/repl-host/kernel-child.mjs';
import {LIFELINE_ENV, watchLifeline} from '../../src/repl-host/lifeline.mjs';

const LIFELINE = fileURLToPath(new URL('../../src/repl-host/lifeline.mjs', import.meta.url));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
// A child that watches its lifeline, says so, then spins forever in synchronous code (or, `exit`, exits by itself).
const child = (then = 'setTimeout(() => { for (;;) {} }, 50);') => `import(${JSON.stringify(LIFELINE)}).then(({watchLifeline}) => { process.stdout.write(String(watchLifeline() !== null) + '\\n'); ${then} });`;

function start(t, setting, code = child()) {
  const proc = spawn(process.execPath, ['-e', code], {stdio: ['ignore', 'pipe', 'inherit'], env: {PATH: process.env.PATH, [LIFELINE_ENV]: setting}});
  const exited = new Promise(resolve => proc.once('exit', (code, signal) => resolve({code, signal})));
  const watched = new Promise(resolve => proc.stdout.setEncoding('utf8').once('data', text => resolve(text.trim() === 'true')));
  t.after(async () => { if (proc.exitCode === null && proc.signalCode === null) proc.kill('SIGKILL'); await exited; });
  return {proc, exited, watched};
}

test('a child spinning in synchronous code ends once its lifeline\'s write end is gone', async t => {
  const lifeline = lifelinePipe();
  const {exited, watched} = start(t, lifeline.setting);
  assert.equal(await watched, true);
  await delay(300);
  const started = performance.now();
  lifeline.release();
  assert.deepEqual(await exited, {code: null, signal: 'SIGKILL'});
  assert.ok(performance.now() - started < 3000, `ended after ${Math.round(performance.now() - started)} ms`);
});

test('a watched child still exits by itself at once, and keeps running while the write end is held', async t => {
  const lifeline = lifelinePipe();
  t.after(() => lifeline.release());
  const exiting = start(t, lifeline.setting, child('setTimeout(() => process.exit(7), 300);'));
  assert.equal(await exiting.watched, true);
  const started = performance.now();
  assert.deepEqual(await exiting.exited, {code: 7, signal: null});
  assert.ok(performance.now() - started < 2000, 'a watcher thread never holds its process open');
  const spinning = start(t, lifeline.setting);
  assert.equal(await spinning.watched, true);
  await delay(800);
  assert.equal(spinning.proc.exitCode, null, 'a held lifeline never ends its child');
});

test('a path that is not the named pipe is never watched, and the setting leaves the environment', async t => {
  const lifeline = lifelinePipe();
  t.after(() => lifeline.release());
  const [dev, , ...path] = lifeline.setting.split(':');
  const other = start(t, `${dev}:1:${path.join(':')}`);
  assert.equal(await other.watched, false);
  for (const setting of [undefined, '', 'x', '1:2', '1:2:relative']) {
    const env = setting === undefined ? {} : {[LIFELINE_ENV]: setting};
    assert.equal(watchLifeline(env), null);
    assert.equal(LIFELINE_ENV in env, false);
  }
});

test('every child the host starts is given its lifeline, which is unlinked once the child is ready and released when it ends', async () => {
  const script = 'const fs=require("fs");const [dev,ino,path]=[...process.env.CUA_REPL_LIFELINE.split(":").slice(0,2),process.env.CUA_REPL_LIFELINE.split(":").slice(2).join(":")];'
    + 'const s=fs.statSync(path,{bigint:true});process.stdout.write(JSON.stringify({fifo:s.isFIFO(),same:String(s.dev)===dev&&String(s.ino)===ino})+"\\n");'
    + 'process.stdout.write(JSON.stringify({type:"runtime_ready"})+"\\n");process.stdin.once("data",()=>process.exit(0));';
  const messages = [];
  let ended;
  const done = new Promise(resolve => { ended = resolve; });
  let given;
  const kernel = startKernelChild({command: process.execPath, args: ['-e', script], env: {PATH: '/usr/bin:/bin'}, cwd: process.cwd()},
    {onMessage: m => messages.push(m), onEnd: ended, lifelines: () => (given = lifelinePipe())});
  while (messages.length < 2) await delay(20);
  assert.deepEqual(messages[0], {fifo: true, same: true});
  const path = given.setting.split(':').slice(2).join(':');
  assert.equal(existsSync(path), false, 'the path is gone once the child is ready');
  assert.equal(given.held, true);
  kernel.send({go: 1});
  await done;
  assert.equal(given.held, false, 'the write end is closed once the child is gone');
});
