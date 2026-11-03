// #171 M4, task 41: the whole-run RECORD only on a private display, the watchdog on every display, and the hermetic
// guard. X.Org 21.1's FlushClient spins for good once RECORD's flush callback re-enters it for a recording client that
// fell behind (task 41's report), so a person's display gets no record client, and every run's display is watched by
// a GetInputFocus round trip that stops the run, killing the record client first, when it goes unanswered. Task 44:
// the watchdog answers before anything of the run's reads the display, its readiness is its own, a guardian lost
// mid-run stops the run, and a stall's escalation is never cut short. Display-free: the record, the watchdog and the
// tools are fakes.

import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { TEST_DISPLAY } from '../../scripts/linux-engine-diff/hermetic.mjs';
import { Desktop, desktopEnding } from '../../scripts/linux-engine-diff/scenes.mjs';
import { RECORD_REFUSAL, XPROBE, isPrivateDisplay, startRunRecord, startRunWatchdog } from '../../scripts/linux-engine-diff/xtools.mjs';

const ROOT = 0x293;

/** A watchdog that records what it was told: started with its options, the pids it guards, stopped once. */
function fakeWatchdog() {
  const seen = { started: [], guarded: [], stopped: 0 };
  const start = async (options) => {
    seen.started.push(options);
    return {
      guard: (pid) => seen.guarded.push(pid),
      stop: async () => {
        seen.stopped += 1;
        return { state: 'ended', clean: true, stalled: false, round_trips: 3, lines: [{ kind: 'ready' }, { kind: 'end', round_trips: 3 }] };
      },
    };
  };
  return { start, seen };
}

const fakeTrace = () => () => ({ env: { ...process.env, DISPLAY: ':cua171-test-trace' }, stop: async () => '' });
const reader = { request: async () => ({ response: { ok: true, output: [] } }), close: async () => {} };

/**
 * The X tools the Desktop reads the root and the active window with, as fakes on PATH, each logging its call. Returns
 * the restore, with `calls()`: the tools run so far.
 */
function fakeTools() {
  const dir = mkdtempSync(join(tmpdir(), 'cua171-watchdog-tools-'));
  const log = join(dir, 'log');
  writeFileSync(log, '');
  const tool = (name, body) => {
    writeFileSync(join(dir, name), `#!/bin/sh\necho "${name} $*" >> ${JSON.stringify(log)}\n${body}\n`);
    chmodSync(join(dir, name), 0o755);
  };
  tool('xwininfo', `echo "xwininfo: Window id: 0x${ROOT.toString(16)} (the root window) (has no name)"`);
  tool('xprop', 'echo "_NET_ACTIVE_WINDOW(WINDOW): window id # 0x0"');
  tool('xdotool', 'exit 0');
  const saved = process.env.PATH;
  process.env.PATH = `${dir}${delimiter}${saved}`;
  const restore = () => {
    process.env.PATH = saved;
    rmSync(dir, { recursive: true, force: true });
  };
  restore.calls = () => readFileSync(log, 'utf8').split('\n').filter(Boolean);
  return restore;
}

async function runDesktop({ privateDisplay, startRecord }) {
  const watchdog = fakeWatchdog();
  const restore = fakeTools();
  const desktop = new Desktop({ cua: 'unused', run: 'watchdog', reader, startActive: 0, nonce: 'n0' });
  try {
    await desktop.begin({ startTrace: fakeTrace(), startRecord, existing: () => [], privateDisplay, startWatchdog: watchdog.start, startSession: async () => ({ address: 'unix:path=/nonexistent/cua171-test-bus', stop: async () => ({ terminated: true, killed: false }) }) });
    desktop.root = ROOT;
    await desktop.closeAll();
  } finally {
    desktop.unhookStop();
    restore();
  }
  return { desktop, watchdog: watchdog.seen };
}

test("a display not marked private (the person's :0) gets no record client, and its run is watched", async () => {
  let recordStarted = 0;
  const { desktop, watchdog } = await runDesktop({
    privateDisplay: () => false,
    startRecord: async () => {
      recordStarted += 1;
      return { pid: 1, stop: async () => '' };
    },
  });
  assert.equal(recordStarted, 0, 'no record client was started');
  assert.equal(watchdog.started.length, 1, 'the watchdog ran');
  assert.equal(watchdog.stopped, 1, 'and was stopped at the run end');
  assert.deepEqual(watchdog.guarded, []);
  const ending = desktopEnding(desktop.ending);
  assert.deepEqual(ending.foreign.filter((l) => l.startsWith("the run's record")), [], 'a record not run on purpose fails nothing');
  assert.match(ending.record.record.skipped, /only on a private display/);
  assert.deepEqual(desktop.ending.watchdog, { state: 'ended', clean: true, stalled: false, round_trips: 3, lines: [{ kind: 'ready' }, { kind: 'end', round_trips: 3 }] });
  assert.deepEqual(ending.record.watchdog, { state: 'ended', round_trips: 3 });
});

test('a private display gets the whole-run record, its client guarded by the watchdog from its spawn', async () => {
  const { desktop, watchdog } = await runDesktop({
    privateDisplay: () => true,
    // startRunRecord guards its client as soon as it is spawned, before its readiness is awaited
    startRecord: async ({ guard }) => {
      guard(4242);
      return { pid: 4242, stop: async () => [JSON.stringify({ kind: 'ready', ms: 1 }), JSON.stringify({ kind: 'end', ms: 2 })].join('\n') };
    },
  });
  assert.deepEqual(watchdog.guarded, [4242], "the record client is the first thing a stall kills");
  const ending = desktopEnding(desktop.ending);
  assert.equal(ending.record.record.skipped, undefined);
  assert.equal(ending.record.record.clean, true);
});

test('startRunRecord itself refuses a display not marked private, before any record client is spawned', async () => {
  let spawned = 0;
  await assert.rejects(
    startRunRecord({ isPrivate: () => false, spawnRecord: () => (spawned += 1) }),
    (error) => error.message === RECORD_REFUSAL,
  );
  assert.equal(spawned, 0);
});

test('the private mark is read from the root property; anything else, an error included, is not private', () => {
  const answer = (text) => () => text;
  assert.equal(isPrivateDisplay({ run: answer('CUA171_PRIVATE_DISPLAY(STRING) = "1"\n') }), true);
  assert.equal(isPrivateDisplay({ run: answer('CUA171_PRIVATE_DISPLAY:  not found.\n') }), false);
  assert.equal(
    isPrivateDisplay({
      run: () => {
        throw new Error('unable to open display');
      },
    }),
    false,
  );
});

/** A spawned watchdog process stand-in: its arguments, its stdin text, the signals it was sent, and an exit the test chooses. */
function fakeChild({ dieOnKill = false } = {}) {
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  let written = '';
  child.stdin.on('data', (d) => (written += d));
  child.exitCode = null;
  child.pid = 777;
  child.signals = [];
  child.kill = (signal) => {
    child.signals.push(signal);
    if (dieOnKill) child.exit(null, signal);
  };
  child.exit = (code, signal = null) => {
    child.exitCode = code;
    child.emit('exit', code, signal);
  };
  return { child, written: () => written };
}

/** A line appended to the watchdog's file, as the process writes them. */
const append = (file, line) => execFileSync('sh', ['-c', `echo '${JSON.stringify(line)}' >> '${file}'`]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A watchdog started on a fake child that reports ready at once; `onLost` records each loss. */
async function readyWatchdog(file, options = {}) {
  const { child, written } = fakeChild(options.child);
  const lost = [];
  const watchdog = await startRunWatchdog({
    display: ':cua171-test-93',
    file,
    readyMs: 2000,
    onLost: (reason) => lost.push(reason),
    spawnWatchdog: () => {
      setTimeout(() => append(file, { kind: 'ready', display: ':cua171-test-93', pid: 777 }), 10);
      return child;
    },
    ...options.start,
  });
  return { watchdog, child, written, lost };
}

function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'cua171-watchdog-'));
  return { dir, file: join(dir, 'watchdog.jsonl'), done: () => rmSync(dir, { recursive: true, force: true }) };
}

test('the watchdog runs xprobe watchdog on the named display, guards pids, and stops cleanly at the end', async () => {
  const { file, done } = scratch();
  const { child, written } = fakeChild();
  let call;
  try {
    const watching = startRunWatchdog({
      display: ':cua171-test-display',
      stopPid: 4321,
      file,
      readyMs: 2000,
      onLost: () => assert.fail('a watchdog the run stopped is not lost'),
      spawnWatchdog: (bin, args, options) => {
        call = { bin, args, options };
        // the ready line, once it answered its first round trip
        setTimeout(() => append(file, { kind: 'ready', display: ':cua171-test-display', pid: 777 }), 20);
        return child;
      },
    });
    const watchdog = await watching;
    assert.equal(call.bin, XPROBE);
    assert.deepEqual(call.args.slice(0, 3), ['watchdog', '--display', ':cua171-test-display']);
    assert.ok(call.args.join(' ').includes('--stop 4321'), call.args.join(' '));
    // a process group of its own: a ^C, or a signal to the run's group, never ends the guardian of the run's cleanup
    assert.equal(call.options.detached, true);
    watchdog.guard(99);
    watchdog.guard(undefined);
    const ended = watchdog.stop();
    setTimeout(() => {
      append(file, { kind: 'end', round_trips: 5 });
      child.exit(0);
    }, 20);
    const result = await ended;
    assert.equal(written(), 'guard 99\n', 'only a real pid is guarded');
    assert.equal(result.stalled, false);
    assert.equal(result.clean, true);
    assert.equal(result.state, 'ended');
    assert.equal(result.round_trips, 5);
    assert.deepEqual(result.lines.map((l) => l.kind), ['ready', 'end']);
  } finally {
    done();
  }
});

test('a watchdog that exits on a stall reports it, with its stall line, and is not taken for a lost one', async () => {
  const { file, done } = scratch();
  try {
    const { watchdog, child, lost } = await readyWatchdog(file);
    append(file, { kind: 'stall', display: ':cua171-test-93', killed: [12] });
    child.exit(3);
    const result = await watchdog.stop();
    assert.equal(result.stalled, true);
    assert.equal(result.clean, false);
    assert.equal(result.state, 'stalled');
    assert.deepEqual(result.lines.at(-1), { kind: 'stall', display: ':cua171-test-93', killed: [12] });
    assert.deepEqual(lost, [], 'a stall already stopped the run itself');
  } finally {
    done();
  }
});

test('a watchdog that never reports ready fails the start, and is ended', async () => {
  const { file, done } = scratch();
  const { child } = fakeChild({ dieOnKill: true });
  try {
    await assert.rejects(startRunWatchdog({ display: ':cua171-test-93', file, readyMs: 100, onLost: () => assert.fail('never ready, never lost'), spawnWatchdog: () => child }), /the run's display .*:cua171-test-93.* did not answer the watchdog/);
    assert.deepEqual(child.signals, ['SIGKILL']);
  } finally {
    done();
  }
});

test("a display already hung fails the start: the watchdog's stall before its first answer is the error", async () => {
  const { file, done } = scratch();
  const { child } = fakeChild();
  try {
    const start = startRunWatchdog({
      display: ':cua171-test-93',
      file,
      readyMs: 5000,
      onLost: () => assert.fail('never ready, never lost'),
      spawnWatchdog: () => {
        setTimeout(() => {
          append(file, { kind: 'stall', display: ':cua171-test-93', round_trips: 0, reason: 'cannot connect: no setup reply in 5000 ms', stopped: null });
          child.exit(3);
        }, 20);
        return child;
      },
    });
    await assert.rejects(start, /did not answer .*no setup reply in 5000 ms.*nothing is run on it/);
  } finally {
    done();
  }
});

// Readiness belongs to this invocation (task 44): `watchdog.jsonl` sits beside a run's results, which a later run in the
// same directory appends to, so a ready line already in it is an earlier watchdog's.

test("a spawn that fails fails the start, whatever ready line the file already holds", async () => {
  const { file, done } = scratch();
  writeFileSync(file, `${JSON.stringify({ kind: 'ready', display: ':cua171-test-93', pid: 4242 })}\n${JSON.stringify({ kind: 'end', round_trips: 3 })}\n`);
  try {
    await assert.rejects(
      startRunWatchdog({ display: ':cua171-test-93', file, readyMs: 2000, onLost: () => assert.fail('never ready'), spawnWatchdog: (bin, args, options) => spawn('/nonexistent/cua171-no-xprobe', args, options) }),
      /ENOENT/,
    );
  } finally {
    done();
  }
});

test("an earlier watchdog's ready line is not this one's: only a line of this process, written after its spawn, is", async () => {
  const { file, done } = scratch();
  // the same pid as the fake's, from before this start: only what is written after the spawn counts
  writeFileSync(file, `${JSON.stringify({ kind: 'ready', display: ':cua171-test-93', pid: 777 })}\n`);
  const { child } = fakeChild({ dieOnKill: true });
  try {
    const start = startRunWatchdog({
      display: ':cua171-test-93',
      file,
      readyMs: 300,
      onLost: () => assert.fail('never ready'),
      spawnWatchdog: () => {
        // a ready line of another process, written after the spawn
        setTimeout(() => append(file, { kind: 'ready', display: ':cua171-test-93', pid: 555 }), 10);
        return child;
      },
    });
    await assert.rejects(start, /did not answer the watchdog/);
    assert.deepEqual(child.signals, ['SIGKILL']);
  } finally {
    done();
  }
});

// A watchdog that ends between writing its ready line and the start's next look at the file (its 20 ms poll) must not
// be taken up: its exit came while nothing was ready yet, so no loss was raised either, and the run would go on
// unwatched (task 44's re-review)
test('a watchdog that writes its ready line and ends before the start takes it up fails the start, never handed back dead', async () => {
  const { file, done } = scratch();
  const { child } = fakeChild();
  const lost = [];
  try {
    const start = startRunWatchdog({
      display: ':cua171-test-93',
      file,
      readyMs: 2000,
      onLost: (reason) => lost.push(reason),
      spawnWatchdog: () => {
        setTimeout(() => {
          append(file, { kind: 'ready', display: ':cua171-test-93', pid: 777 });
          child.exit(1);
        }, 5);
        return child;
      },
    });
    await assert.rejects(start, /the run's watchdog of the X display :cua171-test-93 ended \(exit code 1\) before the run took it up, so nothing is run on it/);
    assert.deepEqual(lost, [], 'a start that failed stops nothing: nothing of the run had begun');
  } finally {
    done();
  }
});

// A guardian that ends before the run did leaves the display unwatched (task 44): the run is stopped, and its stop says so.

test('a watchdog that ends after it was ready, before the run asked it to, stops the run', async () => {
  const { file, done } = scratch();
  try {
    const { watchdog, child, lost } = await readyWatchdog(file);
    child.exit(1);
    assert.equal(lost.length, 1);
    assert.match(lost[0], /ended before the run did \(exit code 1\)/);
    const result = await watchdog.stop();
    assert.equal(result.clean, false);
    assert.equal(result.state, 'lost');
    assert.match(result.reason, /ended before the run did/);
  } finally {
    done();
  }
});

test("a lost watchdog stops the run by default: SIGTERM to the run's pid, as a stall does", async () => {
  const { file, done } = scratch();
  const run = spawn('sleep', ['30']);
  const { child } = fakeChild();
  try {
    const watchdog = await startRunWatchdog({
      display: ':cua171-test-93',
      file,
      stopPid: run.pid,
      readyMs: 2000,
      spawnWatchdog: () => {
        setTimeout(() => append(file, { kind: 'ready', display: ':cua171-test-93', pid: 777 }), 10);
        return child;
      },
    });
    const ended = new Promise((r) => run.once('exit', (code, signal) => r(signal)));
    // the alert, kept from the test's output
    const written = [];
    const write = process.stderr.write;
    process.stderr.write = (text) => written.push(String(text));
    try {
      child.exit(null, 'SIGKILL');
    } finally {
      process.stderr.write = write;
    }
    assert.equal(await ended, 'SIGTERM');
    assert.match(written.join(''), /^cua171 WATCHDOG: the watchdog of the X display :cua171-test-93 is gone \(it ended before the run did \(signal SIGKILL\)\)/);
    assert.equal((await watchdog.stop()).state, 'lost');
  } finally {
    run.kill('SIGKILL');
    done();
  }
});

// The cleanup after a lost watchdog runs unwatched (the design session: a stated limit), so such a run can never read as
// a clean one: it exits nonzero, and its last line names the loss and whether its cleanup completed.

const HARNESS = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', 'scripts', 'linux-engine-diff');

/**
 * A run in a process of its own whose watchdog (a stand-in child) is ready and then ends mid-run, with the default
 * loss handling. `cleanup`: `completes`, `fails`, or `none` (no cleanup hooked). Answers its exit and its stderr lines.
 */
async function runLosingItsWatchdog(cleanup) {
  const dir = mkdtempSync(join(tmpdir(), 'cua171-lost-'));
  const script = join(dir, 'run.mjs');
  const url = (name) => JSON.stringify(new URL(`file://${join(HARNESS, name)}`).href);
  writeFileSync(script, `import { appendFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { cleanupOnStop } from ${url('stop.mjs')};
import { startRunWatchdog } from ${url('xtools.mjs')};
const mode = ${JSON.stringify(cleanup)};
if (mode !== 'none') cleanupOnStop(async () => {
  await new Promise((r) => setTimeout(r, 100));
  if (mode === 'fails') throw new Error('a window of the run would not close');
});
const file = ${JSON.stringify(join(dir, 'watchdog.jsonl'))};
const child = new EventEmitter();
child.stdin = new PassThrough();
child.pid = 777;
child.kill = () => {};
await startRunWatchdog({ display: ':cua171-test-93', file, readyMs: 2000, spawnWatchdog: () => {
  setTimeout(() => appendFileSync(file, JSON.stringify({ kind: 'ready', display: ':cua171-test-93', pid: 777 }) + '\\n'), 5);
  return child;
} });
setInterval(() => {}, 1000);
// the guardian ends mid-run
setTimeout(() => child.emit('exit', 1, null), 50);
`);
  try {
    const proc = spawn(process.execPath, [script], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => (stderr += d));
    const exit = await new Promise((resolve) => proc.once('close', (code, signal) => resolve({ code, signal })));
    return { exit, lines: stderr.split('\n').filter(Boolean) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

for (const [cleanup, outcome] of [
  ['completes', /its cleanup completed/],
  ['fails', /its cleanup did not complete \(a window of the run would not close\)/],
  ['none', /no cleanup was in place, so none ran/],
]) {
  test(`a run that loses its watchdog mid-run exits nonzero, its last line naming the loss and its cleanup's outcome (cleanup ${cleanup})`, async () => {
    const { exit, lines } = await runLosingItsWatchdog(cleanup);
    assert.ok(exit.code !== 0, `nonzero: ${JSON.stringify(exit)}`);
    if (cleanup === 'none') assert.deepEqual(exit, { code: null, signal: 'SIGTERM' }, "no cleanup's exit: the signal's own");
    else assert.deepEqual(exit, { code: 143, signal: null });
    const last = lines.at(-1) ?? '';
    assert.match(last, /^cua171 STOPPED: the run lost the watchdog of the X display :cua171-test-93 \(it ended before the run did \(exit code 1\)\), so the display went unwatched; /, last);
    assert.match(last, outcome, last);
  });
}

test('stop tells a clean shutdown from a failed one: exit 0 after an end line of its own, and nothing else', async () => {
  for (const [name, finish, state] of [
    ['no end line', (file, child) => child.exit(0), 'failed'],
    ['an end line, then a failure', (file, child) => (append(file, { kind: 'end', round_trips: 2 }), child.exit(2)), 'failed'],
    ['killed', (file, child) => child.exit(null, 'SIGKILL'), 'failed'],
  ]) {
    const { file, done } = scratch();
    try {
      const { watchdog, child, lost } = await readyWatchdog(file);
      const stopping = watchdog.stop();
      finish(file, child);
      const result = await stopping;
      assert.equal(result.clean, false, name);
      assert.equal(result.state, state, name);
      assert.deepEqual(lost, [], `${name}: the run had asked it to stop`);
    } finally {
      done();
    }
  }
});

test("the run's end fails when its watchdog did not end cleanly, and when it had none", () => {
  const ending = (watchdog) => ({ start: null, end: null, holder: null, audit: { clean: true, traced: true, requests: 1, mutating: 0, foreign: [] }, record: { skipped: RECORD_REFUSAL, clean: true, traced: false, requests: 0, mutating: 0, foreign: [] }, watchdog });
  const clean = desktopEnding(ending({ state: 'ended', clean: true, stalled: false, round_trips: 4, lines: [] }));
  assert.deepEqual(clean.foreign, []);
  assert.deepEqual(clean.record.watchdog, { state: 'ended', round_trips: 4 });
  const lost = desktopEnding(ending({ state: 'lost', clean: false, stalled: false, reason: 'it ended before the run did (exit code 1)', round_trips: null, lines: [] }));
  assert.deepEqual(lost.foreign, ["the run's watchdog: it ended before the run did (exit code 1), so the display went unwatched"]);
  assert.deepEqual(lost.record.watchdog, { state: 'lost', round_trips: null, reason: 'it ended before the run did (exit code 1)' });
  assert.deepEqual(desktopEnding(ending(null)).foreign, ["the run's watchdog: there was none, so the display went unwatched"]);
});

// A stall's escalation is never cut short by the run's own stop (task 44): the stall line comes first, then the
// watchdog waits out its grace for the run's processes to end and kills what is left.

test('a stop never kills a watchdog that is escalating a stall: it answers stalled at once', async () => {
  const { file, done } = scratch();
  try {
    const { watchdog, child } = await readyWatchdog(file, { child: { dieOnKill: true }, start: { intervalMs: 10, boundMs: 10 } });
    // stalled: the line is out, the run's processes are being ended, and the process has not exited
    append(file, { kind: 'stall', display: ':cua171-test-93', round_trips: 4, killed: [], stopped: process.pid });
    const started = Date.now();
    const result = await watchdog.stop();
    assert.equal(result.state, 'stalled');
    assert.ok(Date.now() - started < 1000, 'answered without waiting for the escalation');
    await sleep(5200);
    assert.deepEqual(child.signals, [], 'never signalled: its escalation runs to its end');
  } finally {
    done();
  }
});

test('a stall that comes while the run is stopping is not cut short either', async () => {
  const { file, done } = scratch();
  try {
    const { watchdog, child } = await readyWatchdog(file, { child: { dieOnKill: true }, start: { intervalMs: 10, boundMs: 10 } });
    const stopping = watchdog.stop();
    setTimeout(() => append(file, { kind: 'stall', display: ':cua171-test-93', round_trips: 4, killed: [], stopped: process.pid }), 100);
    const result = await stopping;
    assert.equal(result.state, 'stalled');
    await sleep(5200);
    assert.deepEqual(child.signals, []);
  } finally {
    done();
  }
});

test('a watchdog that does not end when asked, with no stall, is killed and its stop says it failed', async () => {
  const { file, done } = scratch();
  try {
    const { watchdog, child } = await readyWatchdog(file, { child: { dieOnKill: true }, start: { intervalMs: 10, boundMs: 10 } });
    const result = await watchdog.stop();
    assert.deepEqual(child.signals, ['SIGKILL']);
    assert.equal(result.state, 'failed');
    assert.match(result.reason, /did not end when asked/);
  } finally {
    done();
  }
});

// The Desktop arms its watchdog before anything of the run's reads or touches the display (task 44).

test('the Desktop reads nothing of the display before its watchdog answered', async () => {
  const restore = fakeTools();
  const watchdog = fakeWatchdog();
  let callsAtWatchdog = null;
  // no startActive: a run's own, read from the display
  const desktop = new Desktop({ cua: 'unused', run: 'watchdog-first', reader, nonce: 'n0' });
  try {
    assert.deepEqual(restore.calls(), [], 'the constructor reads no window');
    await desktop.begin({
      startTrace: fakeTrace(),
      startRecord: async () => assert.fail('no record on a display not marked private'),
      privateDisplay: () => {
        assert.notEqual(callsAtWatchdog, null, 'the private mark is read only once the watchdog answered');
        return false;
      },
      startWatchdog: async (options) => {
        callsAtWatchdog = restore.calls().length;
        return watchdog.start(options);
      },
      // the applications' session bus of a person's display's run (B2, task 47), a stand-in
      startSession: async () => ({ address: 'unix:path=/nonexistent/cua171-test-bus', a11y: 'unix:path=/nonexistent/a11y', stop: async () => ({ terminated: true, killed: false }) }),
    });
    assert.equal(callsAtWatchdog, 0, 'no X tool ran before the watchdog answered');
    assert.ok(restore.calls().some((c) => c.startsWith('xprop -root _NET_ACTIVE_WINDOW')), 'the active window is read after it');
    assert.ok(restore.calls().some((c) => c.startsWith('xwininfo -root')), 'and the root and the windows already there');
    assert.equal(desktop.startActive, 0);
    desktop.root = ROOT;
    await desktop.closeAll();
  } finally {
    desktop.unhookStop();
    restore();
  }
});

test('a display that does not answer the watchdog fails the start before anything reads it or starts on it', async () => {
  const restore = fakeTools();
  const desktop = new Desktop({ cua: 'unused', run: 'watchdog-hung', reader, nonce: 'n0' });
  try {
    await assert.rejects(
      desktop.begin({
        startTrace: () => assert.fail('no trace'),
        startRecord: () => assert.fail('no record'),
        startSession: () => assert.fail('no session'),
        privateDisplay: () => assert.fail('no read of the private mark'),
        existing: () => assert.fail('no read of the windows there'),
        startWatchdog: async () => {
          throw new Error("the run's display :cua171-test-93 did not answer the watchdog's first round trip in 15000 ms, so nothing is run on it");
        },
      }),
      /nothing is run on it/,
    );
    assert.deepEqual(restore.calls(), [], 'no X tool ran');
  } finally {
    desktop.unhookStop();
    restore();
    rmSync(desktop.dir, { recursive: true, force: true });
  }
});

test('a read that fails after the watchdog answered stops the watchdog, and the start fails', async () => {
  const restore = fakeTools();
  const watchdog = fakeWatchdog();
  const desktop = new Desktop({ cua: 'unused', run: 'watchdog-unwind', reader, nonce: 'n0' });
  try {
    await assert.rejects(
      desktop.begin({
        startTrace: () => assert.fail('no trace'),
        startRecord: () => assert.fail('no record'),
        existing: () => {
          throw new Error('xwininfo: unable to open display');
        },
        startWatchdog: watchdog.start,
      }),
      /unable to open display/,
    );
    assert.equal(watchdog.seen.stopped, 1);
  } finally {
    desktop.unhookStop();
    restore();
    rmSync(desktop.dir, { recursive: true, force: true });
  }
});

test('the whole-run record is guarded from its spawn, before its readiness is awaited', async () => {
  const { child } = fakeChild();
  const guarded = [];
  const recording = startRunRecord({
    isPrivate: () => true,
    readyMs: 300,
    guard: (pid) => guarded.push(pid),
    spawnRecord: () => {
      child.stderr = new PassThrough();
      child.kill = () => {};
      return child;
    },
  });
  // guarded at once: a display that freezes while the record begins still has its record client killed first
  assert.deepEqual(guarded, [777]);
  await assert.rejects(recording, /did not begin/);
});

test("a test process reaches no real display: whatever DISPLAY its shell has, it is replaced before any tool runs", () => {
  assert.equal(process.env.DISPLAY, TEST_DISPLAY);
  // a test process started with DISPLAY at a real display (:0) still has none once the harness's modules load
  const script = `import(${JSON.stringify(new URL('../../scripts/linux-engine-diff/xtools.mjs', import.meta.url).href)}).then(() => console.log(process.env.DISPLAY))`;
  const shown = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8',
    env: { ...process.env, DISPLAY: ':0', NODE_TEST_CONTEXT: 'child-v8' },
    cwd: fileURLToPath(new URL('.', import.meta.url)),
  }).trim();
  assert.equal(shown, TEST_DISPLAY);
});
