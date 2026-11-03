// #171 M4, task 41: the whole-run RECORD only on a private display, the watchdog on every display, and the hermetic
// guard. X.Org 21.1's FlushClient spins for good once RECORD's flush callback re-enters it for a recording client that
// fell behind (task 41's report), so a person's display gets no record client, and every run's display is watched by
// a GetInputFocus round trip that stops the run, killing the record client first, when it goes unanswered. Display-free:
// the record, the watchdog and the tools are fakes.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
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
        return { stalled: false, lines: [{ kind: 'ready' }, { kind: 'end', round_trips: 3 }] };
      },
    };
  };
  return { start, seen };
}

const fakeTrace = () => () => ({ env: { ...process.env, DISPLAY: ':77' }, stop: async () => '' });
const reader = { request: async () => ({ response: { ok: true, output: [] } }), close: async () => {} };

/** The X tools the Desktop reads the root and the active window with, as fakes on PATH. */
function fakeTools() {
  const dir = mkdtempSync(join(tmpdir(), 'cua171-watchdog-tools-'));
  const tool = (name, body) => {
    writeFileSync(join(dir, name), `#!/bin/sh\n${body}\n`);
    chmodSync(join(dir, name), 0o755);
  };
  tool('xwininfo', `echo "xwininfo: Window id: 0x${ROOT.toString(16)} (the root window) (has no name)"`);
  tool('xprop', 'echo "_NET_ACTIVE_WINDOW(WINDOW): window id # 0x0"');
  tool('xdotool', 'exit 0');
  const saved = process.env.PATH;
  process.env.PATH = `${dir}${delimiter}${saved}`;
  return () => {
    process.env.PATH = saved;
    rmSync(dir, { recursive: true, force: true });
  };
}

async function runDesktop({ privateDisplay, startRecord }) {
  const watchdog = fakeWatchdog();
  const restore = fakeTools();
  const desktop = new Desktop({ cua: 'unused', run: 'watchdog', reader, startActive: 0, nonce: 'n0' });
  try {
    await desktop.begin({ startTrace: fakeTrace(), startRecord, existing: () => [], privateDisplay, startWatchdog: watchdog.start });
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
  assert.deepEqual(desktop.ending.watchdog, { stalled: false, lines: [{ kind: 'ready' }, { kind: 'end', round_trips: 3 }] });
});

test('a private display gets the whole-run record, its client guarded by the watchdog', async () => {
  const { desktop, watchdog } = await runDesktop({
    privateDisplay: () => true,
    startRecord: async () => ({ pid: 4242, stop: async () => [JSON.stringify({ kind: 'ready', ms: 1 }), JSON.stringify({ kind: 'end', ms: 2 })].join('\n') }),
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

/** A spawned watchdog process stand-in: its arguments, its stdin text, and an exit the test chooses. */
function fakeChild() {
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  let written = '';
  child.stdin.on('data', (d) => (written += d));
  child.exitCode = null;
  child.pid = 777;
  child.kill = () => {};
  child.exit = (code) => {
    child.exitCode = code;
    child.emit('exit', code);
  };
  return { child, written: () => written };
}

test('the watchdog runs xprobe watchdog on the named display, guards pids, and stops cleanly at the end', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cua171-watchdog-'));
  const file = join(dir, 'watchdog.jsonl');
  const { child, written } = fakeChild();
  let call;
  try {
    const watching = startRunWatchdog({
      display: ':0',
      stopPid: 4321,
      file,
      readyMs: 2000,
      spawnWatchdog: (bin, args, options) => {
        call = { bin, args, options };
        // the ready line, once it answered its first round trip
        setTimeout(() => execFileSync('sh', ['-c', `echo '{"kind":"ready","display":":0"}' >> '${file}'`]), 20);
        return child;
      },
    });
    const watchdog = await watching;
    assert.equal(call.bin, XPROBE);
    assert.deepEqual(call.args.slice(0, 3), ['watchdog', '--display', ':0']);
    assert.ok(call.args.join(' ').includes('--stop 4321'), call.args.join(' '));
    watchdog.guard(99);
    watchdog.guard(undefined);
    const ended = watchdog.stop();
    setTimeout(() => {
      execFileSync('sh', ['-c', `echo '{"kind":"end","round_trips":5}' >> '${file}'`]);
      child.exit(0);
    }, 20);
    const result = await ended;
    assert.equal(written(), 'guard 99\n', 'only a real pid is guarded');
    assert.equal(result.stalled, false);
    assert.deepEqual(result.lines.map((l) => l.kind), ['ready', 'end']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a watchdog that exits on a stall reports it, with its stall line', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cua171-watchdog-'));
  const file = join(dir, 'watchdog.jsonl');
  const { child } = fakeChild();
  try {
    const watchdog = await startRunWatchdog({
      display: ':93',
      file,
      readyMs: 2000,
      spawnWatchdog: () => {
        setTimeout(() => execFileSync('sh', ['-c', `echo '{"kind":"ready"}' >> '${file}'`]), 20);
        return child;
      },
    });
    execFileSync('sh', ['-c', `echo '{"kind":"stall","display":":93","killed":[12]}' >> '${file}'`]);
    child.exit(3);
    const result = await watchdog.stop();
    assert.equal(result.stalled, true);
    assert.deepEqual(result.lines.at(-1), { kind: 'stall', display: ':93', killed: [12] });
    assert.ok(readFileSync(file, 'utf8').includes('"stall"'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a watchdog that never reports ready fails the start, and is ended', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cua171-watchdog-'));
  const { child } = fakeChild();
  let killed = 0;
  child.kill = () => {
    killed += 1;
    child.exit(null);
  };
  try {
    await assert.rejects(startRunWatchdog({ display: ':93', file: join(dir, 'w.jsonl'), readyMs: 100, spawnWatchdog: () => child }), /the run's display .*:93.* did not answer the watchdog/);
    assert.equal(killed, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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
