// A route audit's window, its ancestry put into the audit's own trace (#171 M4, task 53): `xprobe ancestry <window>`,
// connected through the audit's xtrace proxy, selects the window's structure and reads its parents, so the trace's own
// QueryTree replies say which frame holds it (task 50's frame red had none) and its ReparentNotify and DestroyNotify say
// when that changes (foreign.mjs). The judge lends a harness window's client range only while the trace would see the
// window end, which holds only while the watcher's connection lives: a watcher that ends before the audit leaves it
// unclean. Display-free: the watcher is a stand-in, the proxy's display a hermetic name the spawner allows in a test.

import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { watchAncestry } from '../../scripts/linux-engine-diff/audit.mjs';
import { XPROBE } from '../../scripts/linux-engine-diff/xtools.mjs';

const proxy = { display: ':cua171-test-ancestry', env: { PATH: process.env.PATH, DISPLAY: ':cua171-test-ancestry', XAUTHORITY: '/nonexistent/cua171-proxy-auth' } };

/**
 * An xprobe stand-in: `mode` says what it does once started (ready and stay, then its end line and a clean exit when
 * stdin closes; ready, then end early; fail at once; ready, then die with an X error when stdin closes; ready, then a
 * clean exit with no end line).
 */
function fakeXprobe(mode) {
  const calls = [];
  const spawn = (cmd, args, options) => {
    const child = new EventEmitter();
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.exitCode = null;
    const exit = (code) => {
      if (child.exitCode !== null) return;
      child.exitCode = code;
      setImmediate(() => {
        child.emit('exit', code, null);
        child.stdout.end();
        child.emit('close', code, null);
      });
    };
    child.kill = () => {
      exit(143);
      return true;
    };
    calls.push({ cmd, args, env: options.env, stdinEnded: () => child.stdin.readableEnded || child.stdin.writableEnded });
    child.stdin.on('finish', () => {
      if (mode === 'dies at stop') {
        child.stderr.write('xprobe: X11 error: connection reset\n');
        exit(1);
        return;
      }
      if (mode !== 'no end line') child.stdout.write('{"watched":true}\n');
      setImmediate(() => exit(0));
    });
    setImmediate(() => {
      if (mode === 'fails') {
        child.stderr.write('xprobe: X11 error: Window\n');
        exit(1);
        return;
      }
      child.stdout.write('{"ready":true,"chain":[60817412,5926191]}\n');
      if (mode === 'ends') setTimeout(() => exit(1), 5);
    });
    return child;
  };
  return { spawn, calls };
}

test("the watcher reads the audited window's ancestry through the proxy, and watched it until the audit ends", async () => {
  const xprobe = fakeXprobe('stays');
  const watch = await watchAncestry(proxy, 60817412, { spawn: xprobe.spawn });
  assert.deepEqual(watch.chain, [60817412, 5926191]);
  const [call] = xprobe.calls;
  assert.equal(call.cmd, XPROBE);
  assert.deepEqual(call.args, ['ancestry', '60817412']);
  // the proxy's display and its own authority file: the trace is the route audit's
  assert.equal(call.env.DISPLAY, ':cua171-test-ancestry');
  assert.equal(call.env.XAUTHORITY, '/nonexistent/cua171-proxy-auth');
  assert.deepEqual(await watch.stop(), { watched: true });
  assert.equal(call.stdinEnded(), true);
});

test('a watcher that ends before the audit, or never starts, did not watch: the audit is not clean', async () => {
  const early = await watchAncestry(proxy, 60817412, { spawn: fakeXprobe('ends').spawn });
  await new Promise((r) => setTimeout(r, 30));
  const ended = await early.stop();
  assert.equal(ended.watched, false);
  assert.match(ended.error, /ended before the audit did/);
  const failed = await watchAncestry(proxy, 60817412, { spawn: fakeXprobe('fails').spawn });
  assert.equal(failed.chain, null);
  const never = await failed.stop();
  assert.equal(never.watched, false);
  assert.match(never.error, /did not start.*X11 error: Window/);
});

test('a watcher that dies as the audit stops it, or ends with no end line, did not watch to the end', async () => {
  // the X connection lost in the instant stdin closed: the trace may have missed the window's end
  const died = await (await watchAncestry(proxy, 60817412, { spawn: fakeXprobe('dies at stop').spawn })).stop();
  assert.equal(died.watched, false);
  assert.match(died.error, /did not watch to the audit's end \(exit 1: xprobe: X11 error: connection reset\)/);
  const silent = await (await watchAncestry(proxy, 60817412, { spawn: fakeXprobe('no end line').spawn })).stop();
  assert.equal(silent.watched, false);
  assert.match(silent.error, /did not watch to the audit's end \(exit 0, no end line\)/);
});

test("the route audit watches its window's ancestry before the engine starts, and a watch that failed leaves it unclean", () => {
  const run = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'linux-engine-diff', 'run.mjs'), 'utf8');
  const pass = run.slice(run.indexOf('// The X request audit, in its own untimed pass'));
  const watched = pass.indexOf('watchAncestry(proxy, ');
  assert.ok(watched > 0, 'the audit pass starts the watcher on its proxy');
  assert.ok(watched < pass.indexOf('makeEngine('), 'before the engine connects');
  assert.match(pass, /const clean = audited\.clean && foreign\.length === 0 && ancestry\.watched;/);
});
