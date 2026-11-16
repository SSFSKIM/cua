// A scene's close signals the pid its pidfile names (gnome-terminal's program, which its terminal server owns) only while
// that pid is still the process the scene started (#171 M5, T4's second round; task 87's finding 8, ruling 725): its
// start time and executable, read when the scene opened, compared again before the signal. A pid another process now
// holds is left alone and recorded. Linux's /proc; no display.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
// its runs' start and end checks read a fixture, never the real roots or /proc (fixture-scope.mjs)
import './fixture-scope.mjs';

import { pidfileIdentity, processIdentity, signalIfSame } from '../../scripts/linux-engine-diff/pid-identity.mjs';
import { Desktop } from '../../scripts/linux-engine-diff/scenes.mjs';

// a process's start time and executable are /proc's (pid-identity.mjs): Linux only
const skip = process.platform !== 'linux' && 'Linux only: /proc';
const scratch = mkdtempSync(join(tmpdir(), 'cua171-pid-identity-'));
after(() => rmSync(scratch, { recursive: true, force: true }));
// each child by its handle, never its number: a child already reaped is never signalled (its pid may be another's now)
const children = [];
const running = (child) => child.exitCode === null && child.signalCode === null;
after(() => {
  for (const c of children) if (running(c)) c.kill('SIGKILL');
});

/** A process of the test's own, as a scene's program is: `sleep`, in a group of its own. */
function sleeper() {
  const child = spawn('sleep', ['60'], { stdio: 'ignore', detached: true });
  children.push(child);
  return child;
}

const until = async (check, ms = 3000) => {
  for (const end = Date.now() + ms; Date.now() < end; ) {
    if (check()) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return check();
};

test("a process's identity is its pid, its start time since boot and its executable; a gone pid has none", { skip }, async () => {
  const child = sleeper();
  await until(() => processIdentity(child.pid)?.exe === '/usr/bin/sleep');
  const id = processIdentity(child.pid);
  assert.equal(id.pid, child.pid);
  assert.match(id.start, /^\d+$/);
  assert.equal(id.exe, '/usr/bin/sleep');
  assert.deepEqual(processIdentity(child.pid), id, 'the same process reads the same');
  child.kill('SIGKILL');
  await until(() => processIdentity(child.pid) === null);
  assert.equal(processIdentity(child.pid), null);
});

test('a reused pid is never signalled: another start time or executable under the recorded pid is left alone, with the reason', { skip }, async () => {
  const child = sleeper();
  await until(() => processIdentity(child.pid)?.exe === '/usr/bin/sleep');
  const now = processIdentity(child.pid);
  const kills = [];
  const kill = (pid, signal) => kills.push([pid, signal]);
  // the scene's program ended and its pid went to this process: started later, or another program
  for (const recorded of [{ ...now, start: String(Number(now.start) - 1) }, { ...now, exe: '/usr/bin/tee' }]) {
    const result = signalIfSame(recorded, 'SIGTERM', { kill });
    assert.equal(result.signalled, false);
    assert.match(result.reason, new RegExp(`pid ${child.pid} is another process now`));
  }
  assert.deepEqual(kills, [], 'nothing signalled');
  assert.equal(running(child), true);
  assert.deepEqual(signalIfSame(null, 'SIGTERM', { kill }), { signalled: false, reason: 'no identity was recorded when the scene opened' });
  // the process itself is signalled
  assert.deepEqual(signalIfSame(now, 'SIGTERM', { kill }), { signalled: true });
  assert.deepEqual(kills, [[child.pid, 'SIGTERM']]);
});

test("a pidfile's identity is read once the scene's script has become its program, as the terminal's scripts exec it", { skip }, async () => {
  const pidfile = join(scratch, 'scene.pid');
  const child = spawn('sh', ['-c', 'echo $$ > "$1"; sleep 0.3; exec sleep 60', 'sh', pidfile], { stdio: 'ignore', detached: true });
  children.push(child);
  const id = await pidfileIdentity(pidfile, { program: 'sleep' });
  assert.equal(id.pid, child.pid);
  assert.equal(id.exe, '/usr/bin/sleep', 'after the exec, not the shell');
  assert.equal(await pidfileIdentity(join(scratch, 'none.pid'), { program: 'sleep', waitMs: 100 }), null, 'no pidfile, no identity');
});

test("a scene's close signals its pidfile's pid only while it is the scene's program; a reused one is recorded and left running", { skip }, async () => {
  const desktop = new Desktop({ cua: 'unused', run: 'pidtest', reader: { async close() {} }, startActive: 0, nonce: 'n0' });
  try {
    const program = sleeper();
    await until(() => processIdentity(program.pid)?.exe === '/usr/bin/sleep');
    const pidfile = join(scratch, 'terminal.pid');
    writeFileSync(pidfile, `${program.pid}\n`);
    // the scene recorded another process under that pid (its own program ended, and the pid was given to this one)
    const group = sleeper();
    const reused = { kind: 'family', id: 0, pid: group.pid, group: true, pidfile, pidIdentity: { ...processIdentity(program.pid), start: '1' } };
    desktop.windows.push(reused);
    await desktop.close([reused]);
    assert.equal(running(program), true, "the pid's process now is not the scene's: never signalled");
    assert.equal(desktop.skips.length, 1);
    assert.equal(desktop.skips[0].what, 'signal');
    assert.match(desktop.skips[0].reason, new RegExp(`the pid ${pidfile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} names: pid ${program.pid} is another process now`));
    // the scene's own program, still running: signalled
    const group2 = sleeper();
    const own = { kind: 'family', id: 0, pid: group2.pid, group: true, pidfile, pidIdentity: processIdentity(program.pid) };
    desktop.windows.push(own);
    await desktop.close([own]);
    assert.ok(await until(() => !running(program)), 'its own program ended');
  } finally {
    desktop.unhookStop();
    rmSync(desktop.dir, { recursive: true, force: true });
  }
});
