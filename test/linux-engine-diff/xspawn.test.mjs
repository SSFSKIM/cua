// The one spawner of everything the harness starts that reaches an X display (#171 M4, task 47; the design session's
// ruling B1; xspawn.mjs): the displays it allows, the displays a run creates, a live run's declaration, and the source
// rule that no X-facing start goes around it. display-reach.test.mjs holds the paths that reached `:0` before.
// Display-free: every launcher is a stand-in, and the private server a fake Xvfb on a PATH of the test's own.

import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import test from 'node:test';

import { startProxy } from '../../scripts/linux-engine-diff/audit.mjs';
import { TEST_DISPLAY } from '../../scripts/linux-engine-diff/hermetic.mjs';
import { startPrivateServer } from '../../scripts/linux-engine-diff/xtools.mjs';
import { DisplayRefused, LIVE_RUN, assertReachable, declareLiveRun, displaySockets, displaysReached, guard, isCreatedDisplay, isLiveRun, localDisplay, registerDisplay } from '../../scripts/linux-engine-diff/xspawn.mjs';
import { harnessStarts, processStarts } from './source-scan.mjs';

const refused = (display, args = []) => {
  try {
    assertReachable('xprop', args, display === undefined ? {} : { DISPLAY: display });
    return false;
  } catch (error) {
    assert.ok(error instanceof DisplayRefused, error.message);
    return true;
  }
};

test('a hermetic run reaches only a display it created or a name that is no display: every form of the person\'s is refused', () => {
  for (const display of [':0', ':0.0', ':00', 'unix:/tmp/.X11-unix/X0', '/tmp/.X11-unix/X0', 'unix:/tmp/elsewhere', 'unix:0', 'localhost:0', '127.0.0.1:0', ':12', ':cua171-x/X0', 'cua171-x', '', undefined]) {
    assert.equal(refused(display), true, `${JSON.stringify(display)} is refused`);
  }
  for (const display of [TEST_DISPLAY, ':cua171-test-trace', ':cua171-none']) assert.equal(refused(display), false, `${display} names no display`);
  // a display flag counts as well as DISPLAY
  assert.equal(refused(TEST_DISPLAY, ['-display', ':0']), true);
  assert.equal(refused(TEST_DISPLAY, ['-d', 'unix:/tmp/.X11-unix/X0']), true);
  assert.equal(refused(TEST_DISPLAY, ['--display=:0']), true);
  assert.equal(refused(TEST_DISPLAY, ['watchdog', '--display', ':0']), true);
  assert.deepEqual(displaysReached(['-k', '-d', ':5', '-D', ':41', '--display=:6'], { DISPLAY: ':7' }), [':7', ':5', ':6']);
  assert.equal(localDisplay(':12.1'), ':12');
  assert.equal(localDisplay('unix:12'), null);
});

test('a display the run created is reachable until it is released; never :0, and never one whose socket was there before', () => {
  const release = registerDisplay(':4711', 'a test server');
  try {
    assert.equal(isCreatedDisplay(':4711.0'), true);
    assert.equal(refused(':4711'), false);
    assert.equal(refused(':4711.0'), false);
    // only the exact local form: the same number by a path or a host is not it
    assert.equal(refused('unix:/tmp/.X11-unix/X4711'), true);
    assert.equal(refused('localhost:4711'), true);
  } finally {
    release();
  }
  assert.equal(refused(':4711'), true, 'released: refused again');
  assert.throws(() => registerDisplay(':0', 'a server that named :0'), /never one the run created/);
  assert.throws(() => registerDisplay(':0.0', 'a server that named :0'), /never one the run created/);
  assert.throws(() => registerDisplay(':4712', 'a server', { before: new Set([':4712']) }), /whose socket was there before it started/);
  assert.throws(() => registerDisplay('unix:/tmp/.X11-unix/X3', 'a server'), /not a local display/);
  const dir = mkdtempSync(join(tmpdir(), 'cua171-sockets-'));
  try {
    for (const name of ['X0', 'X12', 'X12-lock', 'other']) writeFileSync(join(dir, name), '');
    assert.deepEqual([...displaySockets(dir)].sort(), [':0', ':12']);
    assert.deepEqual([...displaySockets(join(dir, 'none'))], []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a test is never a live run: declaring one declares nothing, and the variable a live run sets is not honored', () => {
  const saved = process.env[LIVE_RUN];
  try {
    assert.equal(declareLiveRun('a test that tries'), false);
    assert.equal(process.env[LIVE_RUN], saved);
    process.env[LIVE_RUN] = 'set by hand';
    assert.equal(isLiveRun(), false);
    assert.equal(refused(':0'), true, 'still refused');
    // outside a test the same variable declares a live run, which reaches any display by design
    assert.equal(isLiveRun({ [LIVE_RUN]: 'the harness' }), true);
    assert.throws(() => declareLiveRun(''), /says what it is/);
  } finally {
    if (saved === undefined) delete process.env[LIVE_RUN];
    else process.env[LIVE_RUN] = saved;
  }
});

test('the check stands in front of any launcher: a refused start never reaches it, an allowed one does', () => {
  const asked = [];
  const launch = guard((cmd, args, options) => {
    asked.push([cmd, args, options.env?.DISPLAY]);
    return 'started';
  });
  assert.throws(() => launch('xdotool', ['getactivewindow'], { env: { DISPLAY: ':0' } }), DisplayRefused);
  assert.throws(() => launch('xtrace', ['-d', ':0', '-D', ':41'], { env: { DISPLAY: TEST_DISPLAY } }), DisplayRefused);
  assert.deepEqual(asked, []);
  assert.equal(launch('xdotool', ['getactivewindow'], { env: { DISPLAY: TEST_DISPLAY } }), 'started');
  assert.deepEqual(asked, [['xdotool', ['getactivewindow'], TEST_DISPLAY]]);
});

/** A fake Xvfb on a PATH of the test's own that reports display `number` and lives until signalled, and an xprop that logs. */
function fakeServer(number) {
  const dir = mkdtempSync(join(tmpdir(), 'cua171-xspawn-server-'));
  const log = join(dir, 'log');
  writeFileSync(log, '');
  const tool = (name, body) => {
    writeFileSync(join(dir, name), `#!/bin/sh\necho "${name} $*" >> ${JSON.stringify(log)}\n${body}\n`);
    chmodSync(join(dir, name), 0o755);
  };
  tool('Xvfb', `echo ${number} >&3\nexec sleep 30`);
  tool('xprop', 'exit 0');
  const saved = process.env.PATH;
  process.env.PATH = `${dir}${delimiter}${saved}`;
  return { dir, calls: () => readFileSync(log, 'utf8').split('\n').filter(Boolean), done: () => {
    process.env.PATH = saved;
    rmSync(dir, { recursive: true, force: true });
  } };
}

const fakeWatchdog = async () => ({ guard: () => {}, stop: async () => ({ state: 'ended', clean: true }) });

test("a private server's display is the run's own while it runs: reachable, a proxy in front of it too, and refused once it stops", async () => {
  const server = fakeServer(4721);
  const sockets = mkdtempSync(join(tmpdir(), 'cua171-xspawn-sockets-'));
  try {
    const started = await startPrivateServer({ out: server.dir, startWatchdog: fakeWatchdog, sockets: () => new Set() });
    assert.equal(started.display, ':4721');
    assert.equal(refused(':4721'), false);
    // a trace proxy in front of it is the run's too, until its stop (a stand-in xtrace; its socket in the test's directory)
    const spawn = (cmd, args) => {
      const n = args[args.indexOf('-D') + 1].slice(1);
      setImmediate(() => writeFileSync(join(sockets, `X${n}`), ''));
      return { pid: 1, exitCode: null, on: () => {}, once: (event, fn) => event === 'exit' && (spawn.exit = fn), kill: () => setImmediate(() => spawn.exit?.(0, null)), stderr: null };
    };
    const proxy = await startProxy({ display: started.display, privateDisplay: true, spawn, socketDir: sockets });
    assert.equal(refused(proxy.display), false, "the proxy in front of the run's server is the run's");
    await proxy.stop();
    assert.equal(refused(proxy.display), true, 'until its stop');
    await started.stop();
    assert.equal(refused(':4721'), true, 'and the server, once stopped');
    // a proxy in front of a name that is no display is not a display of the run's
    const hermetic = await startProxy({ display: TEST_DISPLAY, privateDisplay: true, spawn, socketDir: sockets });
    assert.equal(refused(hermetic.display), true);
    await hermetic.stop();
  } finally {
    server.done();
    rmSync(sockets, { recursive: true, force: true });
  }
});

test('a server that names a display whose socket was there before is another server\'s: it is ended, and nothing reaches it', async () => {
  const server = fakeServer(4731);
  try {
    await assert.rejects(startPrivateServer({ out: server.dir, startWatchdog: () => assert.fail('no watchdog'), sockets: () => new Set([':4731']) }), /whose socket was there before it started/);
    assert.equal(refused(':4731'), true);
    assert.deepEqual(server.calls().filter((c) => c.startsWith('xprop')), [], 'never probed');
  } finally {
    server.done();
  }
});

// ---------------------------------------------------------------------------------------------------------------
// the source: no X-facing start goes around the spawner

/** What reaches an X display when the harness starts it: its X tools, the engines, the applications, the bus daemon. */
const X_FACING = new Set(["'xtrace'", "'xprop'", "'xdotool'", "'xwininfo'", "'xclip'", "'xdpyinfo'", "'xauth'", "'Xvfb'", "'dbus-daemon'", 'XPROBE', 'xprobe', 'this.bin', 'values.engine', 'args.cua', 'cmd', 'CHROME_COMMAND']);

/** What the harness starts that reaches no X display: the bus tools, its load and its build steps. */
const NOT_X_FACING = new Set(["'busctl'", "'dbus-monitor'", "'stress-ng'", "'git'", "'pgrep'", "'sleep'", 'command']);

test('every start of an X-facing tool goes through the spawner, and nothing else starts one', () => {
  const starts = harnessStarts();
  assert.ok(starts.some((s) => s.file === 'xtools.mjs' && s.command === "'Xvfb'" && s.guarded), 'the walk sees guarded starts');
  const unguarded = starts.filter((s) => !s.guarded && !NOT_X_FACING.has(s.command));
  assert.deepEqual(unguarded.map(({ file, line, command }) => `${file}:${line}: ${command}`), [], 'an X-facing start, or an unknown one, outside the spawner');
  const unknown = starts.filter((s) => !X_FACING.has(s.command) && !NOT_X_FACING.has(s.command));
  assert.deepEqual(unknown.map(({ file, line, command }) => `${file}:${line}: ${command}`), [], 'every command the harness starts is known to reach a display or not');
  for (const tool of ["'xtrace'", "'xprop'", "'xdotool'", "'xwininfo'", "'xclip'", "'Xvfb'", "'dbus-daemon'", 'XPROBE', 'this.bin', 'cmd', 'CHROME_COMMAND']) {
    assert.ok(starts.some((s) => s.command === tool && s.guarded), `${tool} is started, through the spawner`);
  }
});

test('the source check sees an old-code start of an X tool, plain, aliased or by a defaulted launcher', () => {
  const old = [
    "import { execFileSync } from 'node:child_process';\nexecFileSync('xprop', ['-root']);\n",
    "import { spawn as start } from 'node:child_process';\nconst go = (x, launch = start) => launch('xtrace', ['-d', ':0']);\n",
    "import { spawn } from 'node:child_process';\nspawn(XPROBE, ['watchdog']);\n",
    "const run = async () => (await import('node:child_process')).execFileSync(args.cua, ['--version']);\n",
  ];
  for (const text of old) {
    const [start] = processStarts({ file: 'old.mjs', text });
    assert.equal(start.guarded, false, text);
    assert.ok(X_FACING.has(start.command), text);
  }
  const guarded = "import { guard, xSpawn } from './xspawn.mjs';\nxSpawn('xprop', []);\nconst go = (launch) => guard(launch)('xtrace', ['-d', d]);\n";
  assert.deepEqual(processStarts({ file: 'new.mjs', text: guarded }).map(({ command, guarded: g }) => [command, g]), [["'xprop'", true], ["'xtrace'", true]]);
});
