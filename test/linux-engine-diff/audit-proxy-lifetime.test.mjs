// The trace proxy never outlives the harness that started it (#171 M4, the audit leak): an xtrace proxy (audit.mjs
// `startProxy`) whose harness ended without reaching its `stop()` kept running, reparented to init, listening on its
// `/tmp/.X11-unix/X<n>` and proxying to whatever display took its target's number next (four found on the VM, the
// last on 11-12, each beside a run directory its cleanup never reached). Whatever way the harness ends — it exits
// without the stop, a run throws past it, a signal's stop hook exits the process, or the harness dies by a signal it
// never sees — its xtrace ends with it, and wherever the harness itself still runs, the proxy's socket and directory
// go too.
// Display-free: the harness is a child process of the test, its xtrace a real stand-in process that listens on a
// socket in the test's own socket directory, never `/tmp/.X11-unix`, and leaves the socket behind when it is ended, as
// xtrace does.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const AUDIT = pathToFileURL(join(import.meta.dirname, '../../scripts/linux-engine-diff/audit.mjs')).href;
const STOP = pathToFileURL(join(import.meta.dirname, '../../scripts/linux-engine-diff/stop.mjs')).href;

const FAKE_XTRACE = `#!${process.execPath}
// listens on the proxy's socket (-D :<n>) and runs until it is killed, leaving the socket behind, as xtrace does
import { createServer } from 'node:net';
import { writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
const n = args[args.indexOf('-D') + 1].slice(1);
writeFileSync(args[args.indexOf('-o') + 1], 'traced\\n');
createServer().listen(process.env.FAKE_XTRACE_SOCKETS + '/X' + n);
`;

/**
 * A harness in a child process that starts a proxy through the stand-in, prints `{pid, log}` (the xtrace's pid, the
 * trace's file) and then ends as `end` says: `exit` (process.exit, the stop never called), `throw` (the run throws past
 * the stop), `wait` (runs on, for a signal; with `hooked`, a stop hook of the harness's own, stop.mjs, is in place).
 */
function harness({ end, hooked = false }) {
  const dir = mkdtempSync(join(tmpdir(), 'cua171-lifetime-'));
  const sockets = join(dir, 'sockets');
  const fake = join(dir, 'xtrace');
  writeFileSync(fake, FAKE_XTRACE, { mode: 0o755 });
  const script = join(dir, 'harness.mjs');
  writeFileSync(
    script,
    `import { mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { startProxy } from ${JSON.stringify(AUDIT)};
import { cleanupOnStop } from ${JSON.stringify(STOP)};
mkdirSync(${JSON.stringify(sockets)});
${hooked ? 'cleanupOnStop(async () => {});' : ''}
let pid;
const swap = (a) => (a === 'xtrace' ? ${JSON.stringify(fake)} : a);
const launch = (cmd, args, options) => {
  const child = spawn(swap(cmd), args.map(swap), { ...options, env: { ...process.env, FAKE_XTRACE_SOCKETS: ${JSON.stringify(sockets)} } });
  pid = child.pid;
  return child;
};
const proxy = await startProxy({ display: ':cua171-test-lifetime', privateDisplay: true, env: { HOME: ${JSON.stringify(dir)} }, spawn: launch, socketDir: ${JSON.stringify(sockets)} });
process.stdout.write(JSON.stringify({ pid, log: proxy.log }) + '\\n');
${{ exit: 'process.exit(0);', throw: "throw new Error('the run failed');", wait: 'setInterval(() => {}, 1000);' }[end]}
`,
  );
  const proc = spawn(process.execPath, [script], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  proc.stderr.on('data', (d) => {
    stderr += d;
  });
  const exited = new Promise((resolve) => proc.once('exit', (code, signal) => resolve({ code, signal })));
  let out = '';
  const started = new Promise((resolve, reject) => {
    proc.stdout.on('data', (d) => {
      out += d;
      if (out.includes('\n')) resolve(JSON.parse(out.split('\n')[0]));
    });
    exited.then((e) => reject(new Error(`the harness ended before its proxy started: ${JSON.stringify(e)} ${stderr}`)));
  });
  return { proc, dir, sockets, started, exited, stderr: () => stderr };
}

/** Whether `pid` runs (a zombie, ended and not yet reaped, does not). */
function running(pid) {
  try {
    return !/^\d+ \(.*\) Z/.test(readFileSync(`/proc/${pid}/stat`, 'utf8'));
  } catch {
    return false;
  }
}

/** Whether `pid` still runs once `ms` have passed for its end to land. */
async function survives(pid, ms = 3000) {
  const deadline = Date.now() + ms;
  while (running(pid) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
  return running(pid);
}

/** The harness's end, then what it left: its xtrace running, its socket, the proxy's directory. Ends a survivor. */
async function leftBehind(h, { pid, log }) {
  const ended = await h.exited;
  const xtrace = await survives(pid);
  if (xtrace) process.kill(pid, 'SIGKILL');
  return { ended, xtrace, sockets: readdirSync(h.sockets), dir: existsSync(dirname(log)) };
}

// the parent-death signal (setpriv) and the process table read here (/proc) are Linux's, as the harness is; the hosted
// macOS `test` gate skips these, the Ubuntu `harness-dbus` gate runs them (.github/ci-kit.yml)
const skip = process.platform !== 'linux' && 'Linux only: setpriv and /proc';

const cases = [
  { name: 'a harness that exits without stopping its proxy', end: 'exit', expect: { code: 0, signal: null } },
  { name: 'a run that throws past its proxy\'s stop', end: 'throw', expect: { code: 1, signal: null } },
  { name: "SIGTERM to a harness whose stop hook exits it (stop.mjs), the proxy still running", end: 'wait', hooked: true, signal: 'SIGTERM', expect: { code: 143, signal: null } },
  { name: "SIGINT to a harness whose stop hook exits it (stop.mjs), the proxy still running", end: 'wait', hooked: true, signal: 'SIGINT', expect: { code: 130, signal: null } },
];

for (const c of cases) {
  test(`${c.name} leaves no xtrace running, no socket and no proxy directory`, { skip }, async () => {
    const h = harness(c);
    let started = null;
    try {
      started = await h.started;
      // a harness that ends by itself may be gone, its xtrace with it, by now
      if (c.signal) {
        assert.ok(running(started.pid), 'the stand-in xtrace runs while the harness does');
        h.proc.kill(c.signal);
      }
      const left = await leftBehind(h, started);
      assert.deepEqual(left.ended, c.expect, h.stderr());
      assert.equal(left.xtrace, false, 'its xtrace ended with the harness');
      assert.deepEqual(left.sockets, [], 'its socket removed');
      assert.equal(left.dir, false, "the proxy's directory removed");
    } finally {
      // a failing run's leftovers are the test's to remove
      if (started) rmSync(dirname(started.log), { recursive: true, force: true });
      rmSync(h.dir, { recursive: true, force: true });
    }
  });
}

// a harness killed outright runs no code of its own: the kernel ends its xtrace (the parent-death signal). The socket
// that xtrace leaves is then a file nothing listens on, so nothing more is proxied through it; the proxy's directory,
// which nothing of the harness's could remove, is the test's to remove
for (const signal of ['SIGKILL', 'SIGTERM']) {
  test(`a harness killed by ${signal}${signal === 'SIGTERM' ? ' with no stop hook' : ''} leaves no xtrace running`, { skip }, async () => {
    const h = harness({ end: 'wait' });
    let started = null;
    try {
      started = await h.started;
      assert.ok(running(started.pid), 'the stand-in xtrace runs while the harness does');
      h.proc.kill(signal);
      const left = await leftBehind(h, started);
      assert.deepEqual(left.ended, { code: null, signal });
      assert.equal(left.xtrace, false, 'its xtrace ended with the harness');
    } finally {
      if (started) rmSync(dirname(started.log), { recursive: true, force: true });
      rmSync(h.dir, { recursive: true, force: true });
    }
  });
}
