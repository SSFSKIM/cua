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
import { enclosingText, envWrites, harnessModules, harnessStarts, processStarts } from './source-scan.mjs';

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

/**
 * What the harness starts that reaches no X display: the bus tools, its load and its build steps, and the run's
 * org.a11y.Bus stand-in (`process.execPath`, a11y-stub.mjs: given the root's value, it starts with an empty environment;
 * the test below holds it to that).
 */
const NOT_X_FACING = new Set(["'busctl'", "'dbus-monitor'", "'stress-ng'", "'git'", "'pgrep'", "'sleep'", 'command', 'process.execPath']);

test("the harness starts node only as the run's org.a11y.Bus stand-in, with an empty environment", () => {
  const nodes = harnessStarts().filter((s) => s.command === 'process.execPath');
  assert.deepEqual(nodes.map((s) => s.file), ['a11y-stub.mjs']);
  const { text } = harnessModules().find((m) => m.file === 'a11y-stub.mjs');
  assert.match(text.slice(nodes[0].at), /^spawn\(process\.execPath, \[A11Y_STUB, [^\n]*\{ stdio: \[[^\]]*\], env: \{\}, detached: true \}\)/);
});

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

// ---------------------------------------------------------------------------------------------------------------
// the source: no handoff through the process's environment goes around the spawner's check (task 48, from task 47's
// re-review: the vendor-JavaScript lane installed DISPLAY into process.env and OpenAI's client started the engine with it)

/** The writes into the process's environment that hand no display on, each with why: any other needs the check. */
const ENV_WRITES = {
  'hermetic.mjs DISPLAY': "a test's DISPLAY becomes the hermetic name, which no X library parses",
  'xspawn.mjs [LIVE_RUN]': "the live run's declaration, the spawner's own variable",
  'scenes.mjs DBUS_SESSION_BUS_ADDRESS': "a private display's run's session bus",
  'scenes.mjs AT_SPI_BUS_ADDRESS': "a private display's run's accessibility bus",
  'scenes.mjs [name]': "the session's bus variables (SESSION_ENV) put back as they were found",
  'services.mjs OAI_SKY_LINUX_BIN': "the two-services instrument's engine path, in a declared live run",
  'wire-check.mjs OAI_SKY_LINUX_BIN': "the wire check's stub engine (stub-replay.mjs), which reaches no display",
  'wire-check.mjs LINUX_ENGINE_DIFF_REPLAY': "the stub engine's replay file",
  'wire-check.mjs LINUX_ENGINE_DIFF_REPLAY_LOG': "the stub engine's request log",
};

test("every write into the process's environment is a known one that hands on no display, or sits behind the reachability check", () => {
  const writes = harnessModules().flatMap(envWrites);
  assert.ok(writes.some((w) => w.file === 'hermetic.mjs' && w.key === 'DISPLAY'), 'the walk sees writes');
  const unknown = writes.filter((w) => !w.checked && !ENV_WRITES[`${w.file} ${w.key}`]);
  assert.deepEqual(unknown.map(({ file, line, key }) => `${file}:${line}: process.env ${key}`), [], 'a handoff through process.env outside the spawner\'s check');
  // the lane that hands its environment to OpenAI's client: every write of it behind the check
  const lane = writes.filter((w) => w.file === 'vendor-js.mjs');
  assert.ok(lane.length >= 2 && lane.every((w) => w.checked && w.key === '[k]'), JSON.stringify(lane));
  // what the listed dynamic writes can write: the bus variables and the live run's mark, never a display's
  const scenes = readFileSync(join(import.meta.dirname, '../../scripts/linux-engine-diff/scenes.mjs'), 'utf8');
  assert.equal(scenes.match(/^const SESSION_ENV = (\[.*\]);$/m)?.[1], "['DBUS_SESSION_BUS_ADDRESS', 'AT_SPI_BUS_ADDRESS']");
  assert.equal(LIVE_RUN, 'CUA171_LIVE_RUN');
});

test("the source check sees an old-code handoff through the environment, and a checked one", () => {
  // the vendor-JavaScript lane as it was before task 48
  const old = `export class VendorJsEngine {
  async withEnv(fn) {
    const saved = {};
    const overrides = { ...(this.env ?? {}), OAI_SKY_LINUX_BIN: this.link };
    for (const [k, v] of Object.entries(overrides)) {
      saved[k] = process.env[k];
      process.env[k] = v;
    }
    return fn();
  }
}
`;
  assert.deepEqual(envWrites({ file: 'old.mjs', text: old }).map(({ key, checked }) => [key, checked]), [['[k]', false]]);
  const others = "function a(d) {\n  process.env.DISPLAY = d;\n}\nconst b = (e) => {\n  Object.assign(process.env, e);\n};\nprocess.env = {};\nif (process.env.DISPLAY === ':0') x();\n";
  assert.deepEqual(envWrites({ file: 'old.mjs', text: others }).map(({ key, checked }) => [key, checked]), [['DISPLAY', false], ['*', false], ['*', false]]);
  const checked = "class E {\n  async withEnv(fn) {\n    this.assertReachable();\n    for (const [k, v] of list) {\n      if (v) {\n        process.env[k] = v;\n      }\n    }\n  }\n}\n";
  assert.deepEqual(envWrites({ file: 'new.mjs', text: checked }).map(({ key, checked: c }) => [key, c]), [['[k]', true]]);
  // a block that is no function does not end the reading: the check above it still counts, and one below never does
  assert.match(enclosingText(checked, checked.indexOf('process.env')), /^ {2}async withEnv/);
  const late = "function c(v) {\n  process.env[k] = v;\n  assertReachable('x', [], process.env);\n}\n";
  assert.deepEqual(envWrites({ file: 'late.mjs', text: late }).map((w) => w.checked), [false]);
});

/** Where the harness hands an engine start to code of another's, which spawns with the process's environment. */
const HANDOFFS = /\bloadVendorClient\s*\(|\bcreateService\s*\(|sky_js\/src\/service\.js/g;

/** The handoffs that reach no display of a person's by construction, each with why. */
const KNOWN_HANDOFFS = {
  'wire-check.mjs': "the wire check's client starts only the stub engine (stub-replay.mjs), which reaches no display",
};

test("every handoff of an engine start to OpenAI's client or a service sits behind the reachability check, in a declared live run, or is the wire check's stub", () => {
  const sites = [];
  for (const { file, text } of harnessModules()) {
    const live = /^declareLiveRun\(/m.test(text);
    for (const m of text.matchAll(HANDOFFS)) {
      if (/function\s+$/.test(text.slice(Math.max(0, m.index - 12), m.index))) continue;
      const checked = /\bassertReachable\s*\(/.test(enclosingText(text, m.index));
      sites.push({ file, line: text.slice(0, m.index).split('\n').length, ok: checked || live || Boolean(KNOWN_HANDOFFS[file]), checked });
    }
  }
  assert.ok(sites.some((s) => s.file === 'vendor-js.mjs' && s.checked), 'the vendor-JavaScript lane loads its client behind the check');
  assert.deepEqual(sites.filter((s) => !s.ok).map(({ file, line }) => `${file}:${line}`), [], 'a handoff to code that starts an engine, outside the check');
});
