// Live, opt-in (#171 M4 T18): js_reset and a cell's timeout free desktop pointer input at once. Through cua's own REPL
// host (src/repl-host/supervisor.mjs), its kernel and trusted worker, the sky wrapper (src/services/sky.mjs) and cua's
// Linux service (src/services/engine/linux/service.mjs) driving a real cua-engine on a private Xvfb, a cell starts a
// `drag_handle`, and button 1 is read as held by an independent X client (the harness's `xprobe buttons-down`, the
// server's QueryPointer mask); then js_reset, or the
// cell's own timeout, and button 1 is up when the call answers, with no further js call (a new kernel's setup, the
// other release, never runs). The control: the button stays down while nothing ends the kernel. Needs Linux, Xvfb,
// the harness's xprobe built (cargo build --release in scripts/linux-engine-diff/xprobe) and Node 24 (CUA_NODE), and
// the engine to drive in CUA_LINUX_ENGINE_BIN (the harnesses' override); skips visibly otherwise. Never touches the session's own display: the Xvfb is the test's, with no listener but its socket.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync, spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {findTool} from '../../src/runtime/tools.mjs';
import {RESET_SENTENCE, TIMEOUT_SENTENCE} from '../../src/repl-host/supervisor.mjs';
import {kernelNode} from './kernel-harness.mjs';
import {startHost, texts} from './supervisor-harness.mjs';

const {node, skip: noNode} = kernelNode();
const engine = process.env.CUA_LINUX_ENGINE_BIN;
const XPROBE = fileURLToPath(new URL('../../scripts/linux-engine-diff/xprobe/target/release/xprobe', import.meta.url));
const skip = noNode || (process.platform !== 'linux' && 'Linux only') || (!engine && 'set CUA_LINUX_ENGINE_BIN to the cua-engine to drive')
  || (!findTool('Xvfb', process.env.PATH) && 'needs Xvfb') || (!existsSync(XPROBE) && 'needs the harness\'s xprobe built');
const SKY = fileURLToPath(new URL('../../src/services/sky.mjs', import.meta.url));
const LINUX_SERVICE = fileURLToPath(new URL('../../src/services/engine/linux/service.mjs', import.meta.url));
const SRC = fileURLToPath(new URL('../../src', import.meta.url));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// A private Xvfb -> its display (`:N`); ended at the test's end.
async function privateDisplay(t) {
  const child = spawn('Xvfb', ['-displayfd', '3', '-noreset', '-screen', '0', '1280x800x24', '-nolisten', 'tcp'], {stdio: ['ignore', 'ignore', 'ignore', 'pipe']});
  const ended = new Promise(resolve => child.once('exit', resolve));
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM'); await ended; });
  const display = await new Promise((resolve, reject) => {
    let text = '';
    child.stdio[3].on('data', chunk => { text += chunk; if (text.includes('\n')) resolve(`:${text.trim()}`); });
    child.once('exit', code => reject(new Error(`Xvfb exited (${code}) before it named its display`)));
  });
  assert.notEqual(display, ':0', 'never the session\'s display');
  return display;
}

// Button 1 as an independent client reads it: 'down' or 'up'.
const button1 = display => (JSON.parse(execFileSync(XPROBE, ['buttons-down'], {env: {...process.env, DISPLAY: display}, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']})).includes(1) ? 'down' : 'up');

async function session(t) {
  const display = await privateDisplay(t);
  const host = await startHost(t, {node, capabilities: {elicitation: {}}, env: {
    DISPLAY: display, CUA_SKY_SERVICE: LINUX_SERVICE, CUA_ENGINE_BIN: engine, CUA_DESKTOP_MODE: 'shared',
    CUA_REPL_TRUSTED_SERVICES: JSON.stringify({sky: SKY}), CUA_REPL_TRUSTED_CODE_PATHS: SRC, CUA_REPL_TRUSTED_RPC_ENABLED: '1',
  },
  // the desktop approval each handle's start asks (src/services/engine/policy.mjs)
  onServerRequest: msg => (msg.method === 'elicitation/create' ? {result: {action: 'accept', content: {}}} : undefined)});
  // as the facade does (src/cua-api/sky.mjs): setup, then the handle's start
  const start = `await nodeRepl.rpc('sky', {type: 'setup'}); await nodeRepl.rpc('sky', {type: 'drag_start', handle_id: crypto.randomUUID(), point: {x: 400, y: 300}});`;
  return {display, host, start};
}

test('js_reset releases a held drag_handle before it answers: button 1 is up with no further js call', {skip}, async t => {
  const {display, host, start} = await session(t);
  assert.equal(button1(display), 'up', 'nothing held at first');
  const started = await host.js(`${start} nodeRepl.write('held');`, {mode: 'disabled'});
  assert.deepEqual(texts(started), ['held'], JSON.stringify(started));
  assert.equal(button1(display), 'down', 'the handle holds button 1');
  await delay(500);
  assert.equal(button1(display), 'down', 'control: nothing releases it while the kernel lives');
  const begun = performance.now();
  const reset = await host.call('js_reset', {});
  const ms = Math.round(performance.now() - begun);
  assert.deepEqual(texts(reset), [RESET_SENTENCE]);
  assert.equal(button1(display), 'up', `released by the time js_reset answered (${ms} ms)`);
  t.diagnostic(`js_reset answered in ${ms} ms`);
});

test('a cell\'s timeout releases the handle it held before the timeout sentence: button 1 is up with no further js call', {skip}, async t => {
  const {display, host, start} = await session(t);
  const begun = performance.now();
  const timedOut = await host.js(`${start} await new Promise(() => {});`, {mode: 'disabled', timeoutMs: 5000});
  const ms = Math.round(performance.now() - begun);
  assert.deepEqual(texts(timedOut), [TIMEOUT_SENTENCE]);
  assert.equal(button1(display), 'up', `released by the time the timeout answered (${ms} ms for a 5000 ms budget)`);
  t.diagnostic(`the timeout answered in ${ms} ms`);
});
