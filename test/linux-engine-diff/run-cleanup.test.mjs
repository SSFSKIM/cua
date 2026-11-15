// A run's cleanup runs every step (#171 M5, T4's second round; tech-debt-tracker's 2026-11-14 entry, rulings 721 and
// 724). It used to stop at the first step that threw, and an uncaught throw or the watchdog's stop skipped it whole, so
// five runs left their `cua171-run-*` scratch, and four their session buses, behind (task 87). Now every step is tried on
// a normal end, a throw, an uncaught error and a stop: the windows, the reader, the holder, the run's Chrome, the session
// bus, the engines' scratch, the scratch directory, the logs, the trace; the failures are collected and reported
// together, and fail the run. Display-free: the session bus, the reader and the window close are the test's own.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { pathToFileURL } from 'node:url';

import { Desktop, desktopEnding } from '../../scripts/linux-engine-diff/scenes.mjs';

const SCENES = pathToFileURL(join(import.meta.dirname, '../../scripts/linux-engine-diff/scenes.mjs')).href;
const STOP = pathToFileURL(join(import.meta.dirname, '../../scripts/linux-engine-diff/stop.mjs')).href;
const scratch = mkdtempSync(join(tmpdir(), 'cua171-cleanup-test-'));
after(() => rmSync(scratch, { recursive: true, force: true }));
let n = 0;

/** A run's Desktop with a session bus of the test's own, whose stop is recorded, and its scratch in use. */
function desktopWithBus(over = {}) {
  const desktop = new Desktop({ cua: 'unused', run: `cleanup${n++}`, reader: { async close() {} }, startActive: 0, nonce: 'n0' });
  // the end check over a root of the test's own, and the run's end reports kept for the test
  desktop.leftoverOptions = { roots: [mkdtempSync(join(scratch, 'root-'))] };
  desktop.reported = [];
  desktop.report = (line) => desktop.reported.push(line);
  const stopped = [];
  desktop.session = { address: `unix:path=${desktop.dir}/session/bus/dbus-test`, stop: async () => (stopped.push('session'), { terminated: true }) };
  mkdirSync(join(desktop.dir, 'session', 'bus'), { recursive: true });
  writeFileSync(join(desktop.dir, 'session', 'session.conf'), '<busconfig/>\n');
  Object.assign(desktop, over);
  return { desktop, stopped };
}

test('the first cleanup step throws: the session bus is still stopped and the run directory still removed, the failure recorded', async () => {
  const { desktop, stopped } = desktopWithBus();
  desktop.close = async () => {
    throw new Error('the windows could not be closed: xdotool: BadWindow');
  };
  await desktop.closeAll();
  assert.deepEqual(stopped, ['session'], 'the session bus stopped');
  assert.equal(existsSync(desktop.dir), false, 'the run directory removed');
  assert.deepEqual(desktop.cleanupFailures, ["closing the run's windows: the windows could not be closed: xdotool: BadWindow"]);
});

test("every failing step is reported, together, and marks the run's end unclean, never a verdict failure (ruling 730)", async () => {
  const { desktop, stopped } = desktopWithBus();
  desktop.close = async () => {
    throw new Error('BadWindow');
  };
  desktop.chrome = { stop: async () => { throw new Error('the profile is locked'); } };
  // a trace whose end is the test's: the ending it records
  desktop.trace = {};
  desktop.finishTrace = async () => ({ start: null, end: null, holder: null, audit: { clean: true, traced: true, requests: 1, mutating: 0, foreign: [] }, record: { skipped: 'declined', clean: true, traced: false, requests: 0, mutating: 0, foreign: [] }, watchdog: { state: 'ended', clean: true }, skipped: [], chrome: null, session: null });
  await desktop.closeAll();
  assert.deepEqual(stopped, ['session']);
  assert.equal(existsSync(desktop.dir), false);
  assert.deepEqual(desktop.cleanupFailures, ["closing the run's windows: BadWindow", "stopping the run's Chrome: the profile is locked"]);
  assert.deepEqual(desktop.reported, ["the run's end is unclean (its own side, not a verdict failure): a cleanup step threw: closing the run's windows: BadWindow; a cleanup step threw: stopping the run's Chrome: the profile is locked\n"], 'reported together, once');
  const { record, foreign } = desktopEnding(desktop.ending);
  assert.deepEqual(record.cleanup_failures, desktop.cleanupFailures);
  assert.deepEqual(record.unclean, ["a cleanup step threw: closing the run's windows: BadWindow", "a cleanup step threw: stopping the run's Chrome: the profile is locked"]);
  assert.deepEqual(foreign, [], 'the run\'s own side: unclean, not a failure');
  // a cleanup with no failure fails nothing
  const clean = desktopWithBus();
  clean.desktop.close = async () => {};
  clean.desktop.trace = {};
  clean.desktop.finishTrace = desktop.finishTrace;
  await clean.desktop.closeAll();
  assert.deepEqual(clean.desktop.cleanupFailures, []);
  assert.deepEqual(clean.desktop.reported, [], 'nothing to report');
  assert.deepEqual(desktopEnding(clean.desktop.ending).foreign, []);
  assert.equal(desktopEnding(clean.desktop.ending).record.unclean, undefined);
});

/** A child process holding a Desktop with a bus of its own, its scratch in `tmp`; `then` is the code that ends it. */
function child(then) {
  const tmp = mkdtempSync(join(scratch, 'tmp-'));
  const marker = join(tmp, 'session-stopped');
  const script = join(tmp, 'child.mjs');
  writeFileSync(script, `import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Desktop } from ${JSON.stringify(SCENES)};
import { stopBecause } from ${JSON.stringify(STOP)};
const desktop = new Desktop({ cua: 'unused', run: 'cleanupchild', reader: { async close() {} }, startActive: 0, nonce: 'n0' });
desktop.session = { address: 'unix:path=' + desktop.dir + '/session/bus/dbus-test', stop: async () => { writeFileSync(${JSON.stringify(marker)}, 'stopped'); return {}; } };
desktop.leftoverOptions = { roots: [${JSON.stringify(tmp)}] };
mkdirSync(join(desktop.dir, 'session', 'bus'), { recursive: true });
process.stdout.write(desktop.dir + '\\n');
setInterval(() => {}, 1000);
${then}
`);
  const proc = spawn(process.execPath, [script], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, TMPDIR: tmp } });
  let stdout = '';
  let stderr = '';
  proc.stdout.on('data', (d) => (stdout += d));
  proc.stderr.on('data', (d) => (stderr += d));
  const exited = new Promise((resolve) => proc.once('exit', (code, signal) => resolve({ code, signal })));
  return { marker, exited, out: () => ({ stdout, stderr }), kill: () => proc.kill('SIGKILL') };
}

test("the watchdog's stop cleans up: the run's own SIGTERM runs every step before the exit, and the last line says so", async () => {
  const c = child("setTimeout(() => stopBecause('the run lost the watchdog of the X display :99 (a test)'), 100);");
  try {
    const { code } = await c.exited;
    const { stdout, stderr } = c.out();
    assert.equal(code, 143);
    const dir = stdout.trim();
    assert.match(dir, /cua171-run-/);
    assert.equal(existsSync(dir), false, 'the run directory removed');
    assert.equal(readFileSync(c.marker, 'utf8'), 'stopped', 'the session bus stopped');
    assert.match(stderr, /cua171 STOPPED: the run lost the watchdog of the X display :99 \(a test\); its cleanup completed, unwatched\./);
  } finally {
    c.kill();
  }
});

for (const [what, then] of [
  ['an uncaught throw', "setTimeout(() => { throw new Error('a step threw past every catch'); }, 100);"],
  // M4 candidate 1's D2: a spawn with no binary and no error listener (ENOENT), which ends node at once
  ["a child's unhandled error event (a spawn's ENOENT)", "import('node:child_process').then(({ spawn }) => setTimeout(() => spawn('/nonexistent/cua171-electron'), 100));"],
  ['an unhandled rejection', "setTimeout(() => { Promise.reject(new Error('a promise nobody awaited')); }, 100);"],
]) {
  test(`${what} cleans up before the process ends: the session bus stopped, the run directory removed, exit 1`, async () => {
    const c = child(then);
    try {
      const { code } = await c.exited;
      const { stdout, stderr } = c.out();
      assert.equal(code, 1, stderr);
      const dir = stdout.trim();
      assert.equal(existsSync(dir), false, 'the run directory removed');
      assert.equal(readFileSync(c.marker, 'utf8'), 'stopped', 'the session bus stopped');
      assert.match(stderr, /cua171 FATAL: .*; the run's cleanup ran before the exit/);
    } finally {
      c.kill();
    }
  });
}
