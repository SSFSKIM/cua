// The run's trace (audit.mjs `startProxy`, an xtrace proxy) and the display's authority (#171 M4, task 45; task 46's
// finding 3): it copied the person's ~/.Xauthority into its scratch directory whenever XAUTHORITY was unset, on a
// private display too, and a start that failed left the copy behind. Now on a private display it reads no authority
// file at all (the harness's own X server has none), and on a person's display xtrace reads the person's file in place
// and writes the proxy's credentials into the proxy's own directory, which goes on every end, a failed start included.
// Display-free: xtrace is a stand-in, and the proxy's socket directory is the test's own.

import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';

import { startProxy } from '../../scripts/linux-engine-diff/audit.mjs';

/**
 * An xtrace stand-in: records its command line; `starts` says whether it comes up (its socket appears in `socketDir`)
 * or exits at once, as xtrace does when it cannot read the display's credentials.
 */
function fakeXtrace({ starts, socketDir }) {
  const calls = [];
  const spawn = (cmd, args) => {
    calls.push({ cmd, args });
    const child = new EventEmitter();
    child.stderr = new PassThrough();
    child.exitCode = null;
    child.kill = () => {
      child.exitCode = 0;
      setImmediate(() => child.emit('exit', 0, null));
      return true;
    };
    const fake = args[args.indexOf('-D') + 1];
    if (starts) setImmediate(() => writeFileSync(join(socketDir, `X${fake.slice(1)}`), ''));
    else
      setImmediate(() => {
        child.stderr.write('Error parsing xauth list data: less than three things in a line!\n');
        child.exitCode = 1;
        child.emit('exit', 1, null);
      });
    return child;
  };
  return { spawn, calls };
}

function setup() {
  const socketDir = mkdtempSync(join(tmpdir(), 'cua171-proxy-sockets-'));
  // the person's HOME, with their authority file in it
  const home = mkdtempSync(join(tmpdir(), 'cua171-proxy-home-'));
  writeFileSync(join(home, '.Xauthority'), 'the person\'s credentials', { mode: 0o600 });
  return { socketDir, home, done: () => [socketDir, home].forEach((d) => rmSync(d, { recursive: true, force: true })) };
}

const flagValue = (args, flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);

test("on a private display the trace reads no authority file, the person's above all, and its clients get an empty one of its own", async () => {
  const s = setup();
  const xtrace = fakeXtrace({ starts: true, socketDir: s.socketDir });
  try {
    for (const env of [{ HOME: s.home }, { HOME: s.home, XAUTHORITY: join(s.home, '.Xauthority') }]) {
      const proxy = await startProxy({ display: ':91', privateDisplay: true, env, spawn: xtrace.spawn, socketDir: s.socketDir });
      const { args } = xtrace.calls.at(-1);
      assert.ok(args.includes('-n'), 'no credentials copied');
      assert.equal(args.includes('-c'), false);
      assert.equal(flagValue(args, '-f'), null);
      assert.equal(flagValue(args, '-F'), null);
      assert.equal(args.some((a) => a.includes(s.home)), false, "the person's authority file is never named");
      const dir = dirname(flagValue(args, '-o'));
      assert.equal(proxy.env.XAUTHORITY, join(dir, 'Xauthority'), "the proxy's clients read the proxy's own authority");
      assert.equal(readFileSync(proxy.env.XAUTHORITY, 'utf8'), '', 'which holds nothing: the server has no authority');
      await proxy.stop();
      assert.equal(existsSync(dir), false, "the proxy's directory goes at its stop");
    }
  } finally {
    s.done();
  }
});

test("on a person's display xtrace reads the person's authority file in place and writes the proxy's credentials into its own directory", async () => {
  const s = setup();
  const xtrace = fakeXtrace({ starts: true, socketDir: s.socketDir });
  try {
    for (const [env, source] of [[{ HOME: s.home }, join(s.home, '.Xauthority')], [{ HOME: '/nonexistent', XAUTHORITY: join(s.home, '.Xauthority') }, join(s.home, '.Xauthority')]]) {
      const before = statSync(source).mtimeMs;
      const proxy = await startProxy({ display: ':0', privateDisplay: false, env, spawn: xtrace.spawn, socketDir: s.socketDir });
      const { args } = xtrace.calls.at(-1);
      const dir = dirname(flagValue(args, '-o'));
      // xtrace 1.4.0 reads the display's credentials from the file it is given as -F (`xauth -f <F> list <display>`)
      // and writes the proxy's into the one given as -f (`xauth -f <f> remove|add <proxy>`), the reverse of its --help
      assert.ok(args.includes('-c'));
      assert.equal(flagValue(args, '-F'), source, "the person's file, read where it is");
      assert.equal(flagValue(args, '-f'), join(dir, 'Xauthority'), "the proxy's credentials written into its own directory");
      assert.equal(proxy.env.XAUTHORITY, join(dir, 'Xauthority'));
      assert.equal(readFileSync(join(dir, 'Xauthority'), 'utf8'), '', 'nothing copied: the person\'s file is not duplicated');
      assert.deepEqual(readdirSync(dir).sort(), ['Xauthority']);
      assert.equal(statSync(source).mtimeMs, before);
      await proxy.stop();
      assert.equal(existsSync(dir), false, "the proxy's directory, and whatever xtrace wrote into it, goes at its stop");
    }
  } finally {
    s.done();
  }
});

test('a trace that fails to start leaves nothing behind: its directory, with the credentials xtrace wrote, is removed', async () => {
  const s = setup();
  const xtrace = fakeXtrace({ starts: false, socketDir: s.socketDir });
  try {
    for (const privateDisplay of [false, true]) {
      await assert.rejects(startProxy({ display: ':0', privateDisplay, env: { HOME: s.home }, spawn: xtrace.spawn, socketDir: s.socketDir }), /xtrace did not start: Error parsing xauth list data/);
      const dir = dirname(flagValue(xtrace.calls.at(-1).args, '-o'));
      assert.equal(existsSync(dir), false, `the failed start's directory is removed (${privateDisplay ? 'private' : "a person's"} display)`);
    }
    assert.deepEqual(readdirSync(s.socketDir), [], 'and no socket of its own is left');
  } finally {
    s.done();
  }
});
