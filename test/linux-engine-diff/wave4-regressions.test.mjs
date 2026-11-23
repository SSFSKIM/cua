// Task 88's fix wave 4: the re-review's two false clears, each kept as its regression test.
// 1. A zombie group leader (its main thread exited) whose worker threads live is not empty: the live tasks' fields under
//    /proc/<pid>/task/<tid>/ count, and a task that cannot be read is unobserved. The processes are a /proc of the test's.
// 2. The leftover checks never switch off by the environment: a gate CLI a test starts inherits NODE_TEST_CONTEXT and
//    still reads the real /proc.

import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { removalProof, startCheck, writeMarker } from '../../scripts/linux-engine-diff/leftovers.mjs';
import { observeProcesses } from '../../scripts/linux-engine-diff/process-references.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const scratch = mkdtempSync(join(tmpdir(), 'cua171-wave4-test-'));
after(() => rmSync(scratch, { recursive: true, force: true }));
let n = 0;
const fresh = (name) => {
  const dir = join(scratch, `${name}-${n++}`);
  mkdirSync(dir, { recursive: true });
  return dir;
};
const uid = process.getuid();

/** A child's spawn, failing on its error or after 10 s rather than waiting without bound (fix wave 4). */
function spawned(child) {
  let timer;
  return new Promise((ok, fail) => {
    timer = setTimeout(() => fail(new Error('the child did not spawn within 10 s')), 10000);
    child.once('spawn', ok);
    child.once('error', fail);
  }).finally(() => clearTimeout(timer));
}
const gone = () => ({ state: 'absent' });

/** One task's (or a process's own) files at `at`; a field named in `unreadable` is left out. */
function taskFiles(at, { state = 'S', argv = ['x'], env = {}, cwd = '/', root = '/', exe = '/usr/bin/x', fds = [], maps = [], unreadable = [] } = {}) {
  mkdirSync(at, { recursive: true });
  const skip = (f) => unreadable.includes(f);
  writeFileSync(join(at, 'stat'), `1 (x) ${state} ${Array.from({ length: 18 }, () => '0').join(' ')} 100 0 0\n`);
  if (!skip('argv')) writeFileSync(join(at, 'cmdline'), argv.length ? `${argv.join('\0')}\0` : '');
  if (!skip('environ')) writeFileSync(join(at, 'environ'), `${Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\0')}\0`);
  for (const [name, target] of [['cwd', cwd], ['root', root], ['exe', exe]]) if (!skip(name)) symlinkSync(target, join(at, name));
  if (!skip('fds')) {
    mkdirSync(join(at, 'fd'));
    fds.forEach((t, i) => symlinkSync(t, join(at, 'fd', String(i))));
  }
  if (!skip('maps')) writeFileSync(join(at, 'maps'), maps.map((p) => `7f00-7f01 r--p 00000000 08:01 1 ${p}\n`).join(''));
}
/**
 * The reviewer's probe as /proc shows it: the leader called pthread_exit, so it is a zombie whose own cwd, root, exe and
 * fds no longer read and whose argv is empty, while worker `tid` lives with its fields.
 */
function deadLeader(proc, pid, tid, worker) {
  const at = join(proc, String(pid));
  taskFiles(at, { state: 'Z', argv: [], unreadable: ['cwd', 'root', 'exe', 'fds', 'maps'] });
  writeFileSync(join(at, 'status'), `Name:\tx\nUid:\t${uid}\t${uid}\t${uid}\t${uid}\n`);
  taskFiles(join(at, 'task', String(pid)), { state: 'Z', argv: [], unreadable: ['cwd', 'root', 'exe', 'fds', 'maps'] });
  if (worker) taskFiles(join(at, 'task', String(tid)), worker);
}
function marked(root, tag) {
  const dir = join(root, `cua171-run-${tag}`);
  mkdirSync(join(dir, 'home'), { recursive: true });
  writeMarker(dir, { run: tag, nonce: 'n0', pid: 4242, pid_start: '777', created: '2026-11-15T10:00:00.000Z' });
  chmodSync(dir, 0o700);
  return dir;
}

test("a zombie leader's live worker holding the scratch as its cwd and by an open file is a reference, for the removal proof", () => {
  const proc = fresh('proc');
  const dir = marked(fresh('tmp'), 'Thread');
  deadLeader(proc, 8100, 8101, { argv: ['helper'], cwd: dir, fds: [`${dir}/home/held`] });
  const proof = removalProof(dir, { proc, creator: gone });
  assert.equal(proof.holds, false);
  assert.match(proof.text, /FAILS: no same-user process references it: pid 8100 x \(its cwd, fds\)/);
});

test("a zombie leader's live worker holding a scratch that is gone is refused at the next start", () => {
  const proc = fresh('proc');
  const lost = join(fresh('tmp'), 'cua171-run-ThrGn1');
  deadLeader(proc, 8200, 8201, { argv: ['helper'], cwd: `${lost} (deleted)`, fds: [`${lost}/home/held (deleted)`] });
  const { refused } = startCheck({ roots: [fresh('tmp')], proc });
  assert.deepEqual(refused.map((r) => r.dir), [lost]);
  assert.match(refused[0].reason, /pid 8200 x \(its cwd, fds\)/);
});

test("a zombie leader's live worker that cannot be read is unobserved; a leader with no live task holds nothing", () => {
  const proc = fresh('proc');
  const dir = marked(fresh('tmp'), 'ThrUnr');
  deadLeader(proc, 8300, 8301, { unreadable: ['cwd', 'fds'] });
  const proof = removalProof(dir, { proc, creator: gone });
  assert.match(proof.text, /FAILS: every same-user process was fully observed: pid 8300's task 8301 cwd \(ENOENT\), task 8301 fds \(ENOENT\)/);
  // every task dead: a zombie, fully observed and empty
  const dead = fresh('proc');
  deadLeader(dead, 8400, null, null);
  const [p] = observeProcesses({ proc: dead }).processes;
  assert.deepEqual([p.zombie, p.unobserved], [true, []]);
  assert.equal(removalProof(dir, { proc: dead, creator: gone }).holds, true);
  // a task list that cannot be read is unobserved, never empty
  const unlisted = fresh('proc');
  deadLeader(unlisted, 8500, null, null);
  rmSync(join(unlisted, '8500', 'task'), { recursive: true });
  assert.deepEqual(observeProcesses({ proc: unlisted }).processes[0].unobserved.map((u) => u.field), ['tasks']);
});

/** A node child of this test (it inherits NODE_TEST_CONTEXT, without --test): `{status, stdout, stderr}`. */
function childNode(args) {
  try {
    return { status: 0, stdout: execFileSync(process.execPath, args, { env: { ...process.env }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (error) {
    return { status: error.status, stdout: String(error.stdout), stderr: String(error.stderr) };
  }
}

test('a gate CLI a test starts inherits NODE_TEST_CONTEXT and still reads the real /proc and roots: a live holder is found', { skip: process.platform !== 'linux' }, async () => {
  assert.ok(process.env.NODE_TEST_CONTEXT, 'under node --test, so its children inherit the marker');
  const base = mkdtempSync(join(tmpdir(), 'cua171-wave4-cli-'));
  const held = marked(base, 'CliHld');
  const lost = mkdtempSync(join(base, 'cua171-run-'));
  const holder = spawn('sleep', ['30'], { cwd: held, stdio: 'ignore' });
  const orphan = spawn('sleep', ['30'], { cwd: lost, stdio: 'ignore' });
  try {
    await Promise.all([holder, orphan].map(spawned));
    rmSync(lost, { recursive: true });
    // the removal command: its proof reads the real /proc and finds the holder
    const removal = childNode([join(ROOT, 'scripts/linux-engine-gate/gate.mjs'), 'leftovers', '--remove', held, '--confirm']);
    assert.equal(removal.status, 2, removal.stderr);
    assert.match(removal.stdout, new RegExp(`FAILS: no same-user process references it: .*pid ${holder.pid} sleep \\(its cwd\\)`));
    // a Desktop's start check in that child, with no scope named: the real /proc, so the orphan of a removed scratch
    const leftovers = join(ROOT, 'scripts/linux-engine-diff/leftovers.mjs');
    const scenes = join(ROOT, 'scripts/linux-engine-diff/scenes.mjs');
    const start = childNode(['--input-type=module', '-e', `import { startCheck } from ${JSON.stringify(leftovers)}; import { Desktop } from ${JSON.stringify(scenes)}; import { rmSync } from 'node:fs';
const d = new Desktop({ cua: 'unused', run: 'cli', reader: { async close() {} }, startActive: 0, nonce: 'n0' });
const r = startCheck({ own: [d.dir], ...d.leftoverScope() });
d.unhookStop(); rmSync(d.dir, { recursive: true, force: true });
process.stdout.write(JSON.stringify(r.refused.filter((x) => x.dir === ${JSON.stringify(lost)})));`]);
    assert.equal(start.status, 0, start.stderr);
    assert.match(JSON.parse(start.stdout).map((r) => r.reason).join(), new RegExp(`its directory is gone and a process still references it: .*pid ${orphan.pid} sleep \\(its cwd\\)`));
  } finally {
    holder.kill();
    orphan.kill();
    rmSync(base, { recursive: true, force: true });
  }
});

