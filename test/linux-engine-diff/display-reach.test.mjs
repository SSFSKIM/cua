// The paths that reached the person's display from a hermetic run before (#171 M4, task 47; the design session's
// ruling B1, sminos 332), each refused by the one spawner of X-facing tools (xspawn.mjs) before anything starts:
// - x11rb sends a `unix:<path>` or `/path` display string to `/tmp/.X11-unix/X0`, display 0, whatever the path names
//   (task 41: the watchdog's tests reached `:0`'s socket so);
// - task 45's red run started a real `xtrace -d :0`, since the code it ran ignored the fake spawn the new test passed.
// So these tests hand the harness only fakes it cannot get past: every X tool the old code could start by name is a
// tripwire first on PATH (it logs and exits 1), and every injected launcher logs too; a run of these tests against code
// without the spawner starts only those, never a real tool, and fails on their logs. Nothing here connects to a display.

import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import test from 'node:test';

import { startProxy } from '../../scripts/linux-engine-diff/audit.mjs';
import { Desktop } from '../../scripts/linux-engine-diff/scenes.mjs';
import { isPrivateDisplay, startRunWatchdog, xdotool } from '../../scripts/linux-engine-diff/xtools.mjs';

/** The X tools the harness starts by name: each a tripwire here. */
const TOOLS = ['xtrace', 'xprop', 'xdotool', 'xwininfo', 'xclip', 'xdpyinfo', 'xauth', 'Xvfb', 'dbus-daemon', 'xterm', 'gedit'];

/** The display strings that reach the person's display 0: plainly, by screen, and the two forms x11rb sends to X0. */
const PERSONS = [':0', ':0.0', 'unix:/tmp/.X11-unix/X0', '/tmp/.X11-unix/X0', 'unix:/tmp/cua171-fake-socket', 'localhost:0'];

/** Tripwires for `TOOLS` first on PATH, each logging `<tool> DISPLAY=<…> <args>` and exiting 1. */
function tripwires() {
  const dir = mkdtempSync(join(tmpdir(), 'cua171-tripwire-'));
  const log = join(dir, 'log');
  writeFileSync(log, '');
  for (const name of TOOLS) {
    writeFileSync(join(dir, name), `#!/bin/sh\necho "${name} DISPLAY=$DISPLAY $*" >> ${JSON.stringify(log)}\nexit 1\n`);
    chmodSync(join(dir, name), 0o755);
  }
  const saved = { PATH: process.env.PATH, DISPLAY: process.env.DISPLAY };
  process.env.PATH = `${dir}${delimiter}${saved.PATH}`;
  return {
    dir,
    started: () => readFileSync(log, 'utf8').split('\n').filter(Boolean),
    done() {
      process.env.PATH = saved.PATH;
      process.env.DISPLAY = saved.DISPLAY;
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** A launcher a test injects: it logs what it was asked to start and starts nothing. */
function injected() {
  const asked = [];
  const launch = (cmd, args) => {
    asked.push(`${cmd} ${args.join(' ')}`);
    throw new Error('the injected launcher starts nothing');
  };
  return { asked, launch };
}

const refusal = /refusing to start \S+ on the X display/;

for (const display of PERSONS) {
  test(`a trace of ${display} is refused before xtrace starts, whatever launcher the caller injects`, async () => {
    const wires = tripwires();
    const socketDir = mkdtempSync(join(tmpdir(), 'cua171-reach-sockets-'));
    const fake = injected();
    try {
      await assert.rejects(startProxy({ display, privateDisplay: false, socketDir }), refusal);
      await assert.rejects(startProxy({ display, privateDisplay: false, socketDir, spawn: fake.launch }), refusal);
      assert.deepEqual(fake.asked, [], 'the injected launcher is never asked');
      assert.deepEqual(wires.started(), [], 'no tool on the PATH was started');
    } finally {
      wires.done();
      rmSync(socketDir, { recursive: true, force: true });
    }
  });

  test(`the harness's own tools on ${display} are refused before they start: the display probe, xdotool, the watchdog, a scene application`, async () => {
    const wires = tripwires();
    const dir = mkdtempSync(join(tmpdir(), 'cua171-reach-'));
    const fake = injected();
    const desktop = new Desktop({ cua: 'unused', run: 'reach', reader: { request: async () => ({ response: { ok: true, output: [] } }), close: async () => {} }, startActive: 0, nonce: 'n0' });
    desktop.isPrivate = false;
    desktop.session = { address: 'unix:path=/nonexistent/cua171-test-run-bus', stop: async () => ({}) };
    try {
      // a probe answers "not private" for a display it may not reach, and asks nothing
      assert.equal(isPrivateDisplay({ env: { ...process.env, DISPLAY: display } }), false);
      process.env.DISPLAY = display;
      assert.throws(() => xdotool('getactivewindow'), refusal);
      await assert.rejects(startRunWatchdog({ display, file: join(dir, 'watchdog.jsonl'), spawnWatchdog: fake.launch }), refusal);
      assert.throws(() => desktop.spawnApp(desktop.label('front'), 'xterm', ['-T', 'x']), refusal);
      assert.deepEqual(fake.asked, [], 'the injected launcher is never asked');
      assert.deepEqual(wires.started(), [], 'no tool on the PATH was started');
    } finally {
      wires.done();
      desktop.unhookStop();
      rmSync(desktop.dir, { recursive: true, force: true });
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('the tripwires catch what they exist to catch: a tool started by name on PATH is logged, not run', () => {
  const wires = tripwires();
  try {
    assert.ok(existsSync(join(wires.dir, 'xtrace')));
    assert.equal(isPrivateDisplay({ env: { ...process.env, DISPLAY: ':cua171-tests-reach-no-display' } }), false);
    assert.deepEqual(wires.started(), ['xprop DISPLAY=:cua171-tests-reach-no-display -root CUA171_PRIVATE_DISPLAY'], 'a display that names no display is the tests\' own: the tool starts (here, the tripwire)');
  } finally {
    wires.done();
  }
});
