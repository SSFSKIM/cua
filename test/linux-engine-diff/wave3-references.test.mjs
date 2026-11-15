// Task 88's fix wave 3: the start check detects and refuses, and never removes; removal is a separate command whose
// proof needs every same-user process fully observed. One reference model (process-references.mjs) serves both: every
// field that was read is kept when another was not, literal and relative paths in argv and environ count, and so do
// cwd, root, exe, fd and mapping targets inside a `cua171-run-*` path, `(deleted)` ones included. A field that could
// not be read is unobserved: never proof of absence, and in detection never proof of presence. Display-free; nothing is
// signalled; the processes are a /proc of the test's own.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

import { removalProof, removeLeftover, startCheck, writeMarker } from '../../scripts/linux-engine-diff/leftovers.mjs';
import { observeProcesses, referencesTo, scratchReferences } from '../../scripts/linux-engine-diff/process-references.mjs';
import { Desktop } from '../../scripts/linux-engine-diff/scenes.mjs';
import { parseGateArgs } from '../../scripts/linux-engine-gate/gate.mjs';

const scratch = mkdtempSync(join(tmpdir(), 'cua171-wave3-test-'));
after(() => rmSync(scratch, { recursive: true, force: true }));
let n = 0;
const fresh = (name) => {
  const dir = join(scratch, `${name}-${n++}`);
  mkdirSync(dir, { recursive: true });
  return dir;
};
const uid = process.getuid();

/**
 * A process in the test's /proc with every field the model reads: argv, environ, cwd, root, exe, fds, maps, its stat
 * (state and start time) and its status (uid). A field named in `unreadable` is left out, as /proc's EACCES would be.
 */
function processIn(proc, pid, { argv = ['x'], env = {}, cwd = '/', root = '/', exe = '/usr/bin/x', fds = [], maps = [], start = '100', state = 'S', unreadable = [] } = {}) {
  const at = join(proc, String(pid));
  mkdirSync(at, { recursive: true });
  const skip = (f) => unreadable.includes(f);
  writeFileSync(join(at, 'status'), `Name:\tx\nUid:\t${uid}\t${uid}\t${uid}\t${uid}\n`);
  writeFileSync(join(at, 'stat'), `${pid} (x) ${state} ${Array.from({ length: 18 }, () => '0').join(' ')} ${start} 0 0\n`);
  if (!skip('argv')) writeFileSync(join(at, 'cmdline'), `${argv.join('\0')}\0`);
  if (!skip('environ')) writeFileSync(join(at, 'environ'), `${Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\0')}\0`);
  for (const [name, target] of [['cwd', cwd], ['root', root], ['exe', exe]]) if (!skip(name)) symlinkSync(target, join(at, name));
  if (!skip('fds')) {
    mkdirSync(join(at, 'fd'));
    fds.forEach((t, i) => symlinkSync(t, join(at, 'fd', String(i))));
  }
  if (!skip('maps')) writeFileSync(join(at, 'maps'), maps.map((p) => `7f00-7f01 r--p 00000000 08:01 1234   ${p}\n`).join(''));
}
/** A boot time, so a start time reads as a wall time (as the age exception of wave 2 needed). */
const booted = (proc) => writeFileSync(join(proc, 'stat'), 'cpu 0\nbtime 1700000000\n');
function marked(root, tag, { pid = 4242, start = '777', mode = 0o700 } = {}) {
  const dir = join(root, `cua171-run-${tag}`);
  mkdirSync(join(dir, 'home'), { recursive: true });
  writeMarker(dir, { run: tag, nonce: 'n0', pid, pid_start: start, created: '2026-11-15T10:00:00.000Z' });
  chmodSync(dir, mode);
  return dir;
}
const gone = () => ({ state: 'absent' });

// the reviewer's counterexample 1: wave 2's age exception removed a directory an old process held as cwd and by an fd
test('an old process whose environment cannot be read, holding the scratch as its cwd and by an fd, is a reference: refused, never removed', () => {
  const root = fresh('tmp');
  const proc = fresh('proc');
  booted(proc);
  const dir = marked(root, 'OldHld');
  processIn(proc, 6003, { argv: ['(sd-pam)'], start: '100', cwd: dir, fds: ['/dev/null', `${dir}/home/log`], unreadable: ['environ'] });
  const { refused } = startCheck({ roots: [root], proc, creator: gone });
  assert.equal(refused.length, 1);
  assert.equal(refused[0].dir, dir);
  assert.match(refused[0].reason, /pid 6003 x \(its cwd, fds\)/);
  assert.equal(existsSync(dir), true);
  const proof = removalProof(dir, { proc, creator: gone });
  assert.equal(proof.holds, false);
  assert.match(proof.text, /FAILS: no same-user process references it: pid 6003 x \(its cwd, fds\)/);
  assert.match(proof.text, /FAILS: every same-user process was fully observed: pid 6003's environ \(ENOENT\)/);
});

// counterexample 2: the orphan check read only argv and environ, so a process holding a gone scratch by cwd or fd was missed
test('a process whose argv and environment name nothing, holding a gone scratch by cwd and a (deleted) fd, is refused at the next start', () => {
  const proc = fresh('proc');
  const lost = join(fresh('tmp'), 'cua171-run-Lost01');
  processIn(proc, 7200, { argv: ['gedit'], env: { HOME: '/home/u' }, cwd: `${lost}/home (deleted)`, fds: [`${lost}/home/.cache/x (deleted)`] });
  const { refused } = startCheck({ roots: [fresh('tmp')], proc });
  assert.deepEqual(refused.map((r) => r.dir), [lost]);
  assert.match(refused[0].reason, /its directory is gone and a process still references it: pid 7200 x \(its cwd, fds\)/);
});

// counterexample 3: an unreadable environment dropped the readable argv too
test('a readable argv naming a missing scratch beside an unreadable environment still counts', () => {
  const proc = fresh('proc');
  const lost = join(fresh('tmp'), 'cua171-run-Lost02');
  processIn(proc, 7300, { argv: ['dbus-daemon', `--config-file=${lost}/session/session.conf`], unreadable: ['environ', 'cwd', 'fds'] });
  const { refused } = startCheck({ roots: [fresh('tmp')], proc });
  assert.deepEqual(refused.map((r) => r.dir), [lost]);
  assert.match(refused[0].reason, /pid 7300 x \(its argv\)/);
  const [p] = observeProcesses({ proc }).processes;
  assert.deepEqual(p.fields.argv, ['dbus-daemon', `--config-file=${lost}/session/session.conf`], 'the field read is kept');
  assert.deepEqual(p.unobserved.map((u) => u.field), ['environ', 'cwd', 'fds']);
});

test('the start check refuses every kind of leftover, naming it and its evidence, and removes nothing', () => {
  const root = fresh('tmp');
  const proc = fresh('proc');
  const done = marked(root, 'Done01'); // wave 2 removed this one: marker, creator gone, nothing references it
  const unmarked = join(root, 'cua171-run-NoMrk1');
  mkdirSync(unmarked, { mode: 0o700 });
  const live = marked(root, 'Live01', { pid: 99, start: '555' });
  const busGone = join(root, 'cua171-run-BusGn1');
  processIn(proc, 301, { argv: ['at-spi-bus-launcher'], env: { DBUS_SESSION_BUS_ADDRESS: `unix:path=${busGone}/session/bus/x,guid=1` } });
  const sceneGone = join(root, 'cua171-run-ScnGn1');
  processIn(proc, 302, { argv: ['gedit', `${sceneGone}/home/notes.txt`] });
  // a process none of whose fields could be read is no evidence of anything in detection: it blocks no run
  processIn(proc, 303, { unreadable: ['argv', 'environ', 'cwd', 'root', 'exe', 'fds', 'maps'] });
  const creator = (pid) => (pid === 99 ? { state: 'live', start: '555' } : { state: 'absent' });
  const result = startCheck({ roots: [root], proc, creator });
  assert.deepEqual(Object.keys(result), ['refused'], 'nothing is cleared: the start check removes nothing');
  const why = Object.fromEntries(result.refused.map((r) => [r.dir, r.reason]));
  assert.deepEqual(Object.keys(why).sort(), [busGone, done, live, sceneGone, unmarked].sort());
  assert.match(why[done], /its marker reads \(run Done01, pid 4242\); its creator pid 4242 is absent; no observed process references it; the start check removes nothing: `gate\.mjs leftovers --remove .*cua171-run-Done01 --confirm` removes it once its proof holds/);
  assert.match(why[unmarked], /no marker of the harness's/);
  assert.match(why[live], /its creator pid 99 is still running/);
  assert.match(why[busGone], /its directory is gone and a process still references it: pid 301 x \(its environ\)/);
  assert.match(why[sceneGone], /pid 302 x \(its argv\)/);
  for (const dir of [done, unmarked, live]) assert.equal(existsSync(dir), true, `${dir} untouched`);
  // the run's own is never the check's
  assert.deepEqual(startCheck({ own: [done, unmarked, live, busGone, sceneGone], roots: [root], proc, creator }).refused, []);
});

test('a relative path or a mapping into the scratch is a reference; a zombie holds nothing and is fully observed', () => {
  const root = fresh('tmp');
  const proc = fresh('proc');
  const dir = marked(root, 'RelPth');
  processIn(proc, 400, { argv: ['tail', '-f', 'cua171-run-RelPth/home/log'], cwd: root });
  processIn(proc, 401, { maps: [`${dir}/lib.so (deleted)`] });
  processIn(proc, 402, { state: 'Z', unreadable: ['argv', 'environ', 'cwd', 'root', 'exe', 'fds', 'maps'] });
  const { processes } = observeProcesses({ proc });
  const by = Object.fromEntries(processes.map((p) => [p.pid, referencesTo(p, dir)]));
  assert.deepEqual(by, { 400: ['argv'], 401: ['maps'], 402: [] });
  assert.deepEqual(processes.find((p) => p.pid === 402).unobserved, []);
  assert.deepEqual(scratchReferences(processes.find((p) => p.pid === 401)), [{ dir, by: 'maps' }]);
});

test('the removal command refuses while any same-user process is unobserved, and removes once everything is observed and clear', () => {
  const root = fresh('tmp');
  const proc = fresh('proc');
  const dir = marked(root, 'Remov1');
  processIn(proc, 500, { argv: ['bash'], env: { HOME: '/home/u' }, cwd: '/home/u', fds: ['/dev/pts/0', 'socket:[123]'] });
  processIn(proc, 501, { argv: ['(sd-pam)'], unreadable: ['environ', 'cwd', 'root', 'exe', 'fds', 'maps'] });
  const refused = removeLeftover(dir, { proc, creator: gone, confirm: true });
  assert.equal(refused.removed, false);
  assert.match(refused.text, /FAILS: every same-user process was fully observed: pid 501's environ \(ENOENT\), cwd \(ENOENT\)/);
  assert.match(refused.text, /^refused: /m);
  assert.equal(existsSync(dir), true);
  rmSync(join(proc, '501'), { recursive: true });
  // the proof first, then nothing removed without --confirm
  const dry = removeLeftover(dir, { proc, creator: gone });
  assert.deepEqual([dry.removed, dry.proof.holds], [false, true]);
  assert.match(dry.text, /^the proof holds; not removed without --confirm$/m);
  assert.equal(existsSync(dir), true);
  const done = removeLeftover(dir, { proc, creator: gone, confirm: true });
  assert.equal(done.removed, true);
  assert.deepEqual(done.proof.checks.map((c) => c.holds), done.proof.checks.map(() => true));
  assert.match(done.text, /^- holds: its creator is absent: pid 4242 is absent$/m);
  assert.match(done.text, new RegExp(`^removed ${dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'));
  assert.equal(existsSync(dir), false);
});

test('the removal proof fails on each condition it needs, and never reads past a path that is not a scratch directory', () => {
  const proc = fresh('proc');
  const root = fresh('tmp');
  const fails = (dir, opts = {}) => removalProof(dir, { proc, creator: gone, ...opts }).checks.filter((c) => !c.holds).map((c) => c.what);
  assert.deepEqual(fails(marked(root, 'Live02', { pid: 99, start: '555' }), { creator: () => ({ state: 'live', start: '555' }) }), ['its creator is absent']);
  // the pid now another start's: the creator is gone
  assert.deepEqual(fails(marked(root, 'Reuse1', { pid: 99, start: '555' }), { creator: () => ({ state: 'live', start: '9' }) }), []);
  assert.deepEqual(fails(marked(root, 'Unkn01'), { creator: () => ({ state: 'unknown', reason: 'EACCES' }) }), ['its creator is absent']);
  assert.deepEqual(fails(marked(root, 'Open01', { mode: 0o755 })), ['mode 700']);
  const unmarked = join(root, 'cua171-run-NoMrk2');
  mkdirSync(unmarked, { mode: 0o700 });
  assert.deepEqual(fails(unmarked), ['its marker reads', 'its creator is absent', "its marker's time is before now"]);
  assert.deepEqual(fails(marked(root, 'Later1'), { now: () => Date.parse('2026-11-15T09:00:00.000Z') }), ["its marker's time is before now"]);
  assert.deepEqual(fails(marked(root, 'NoProc'), { proc: join(proc, 'nowhere') }), ['every same-user process was fully observed']);
  // not a scratch directory: a link to one, another name, nothing there
  const link = join(root, 'cua171-run-Link01');
  symlinkSync(marked(root, 'Target'), link);
  for (const path of [link, fresh('cua171-other'), join(root, 'cua171-run-Absent')]) {
    const p = removalProof(path, { proc, creator: gone });
    assert.deepEqual([p.holds, p.checks.length, p.checks[0].what], [false, 1, 'a cua171-run-* directory, not a link'], path);
  }
});

test("gate.mjs leftovers takes --remove <dir> and --confirm; --confirm alone is refused", () => {
  assert.deepEqual(['remove', 'confirm'].map((k) => parseGateArgs(['leftovers', '--remove', '/tmp/cua171-run-Abc123', '--confirm'])[k]), ['/tmp/cua171-run-Abc123', true]);
  assert.equal(parseGateArgs(['leftovers']).remove, null);
  assert.throws(() => parseGateArgs(['leftovers', '--confirm']), /--confirm needs --remove <dir>/);
});

// the suite under the lock: a parallel test's child holding its own removed scratch reached a test-default start check
// through the real /proc. A test process's default reads no real process table (`proc: null`), as it reads no real root.
test("a test process's default start check reads no real process: another test's child in a removed scratch is not a leftover", { skip: process.platform !== 'linux' }, async () => {
  const held = mkdtempSync(join(fresh('real'), 'cua171-run-'));
  const child = spawn('sleep', ['30'], { cwd: held, stdio: 'ignore' });
  try {
    await new Promise((r) => child.once('spawn', r));
    rmSync(held, { recursive: true });
    assert.match(startCheck({ roots: [] }).refused.map((r) => r.reason).join(), new RegExp(`pid ${child.pid} sleep \\(its cwd\\)`), 'the real /proc shows it');
    const desktop = new Desktop({ cua: 'unused', run: 'scope', reader: { async close() {} }, startActive: 0, nonce: 'n0' });
    try {
      assert.deepEqual(startCheck({ own: [desktop.dir], ...desktop.leftoverScope() }).refused, []);
    } finally {
      desktop.unhookStop();
      rmSync(desktop.dir, { recursive: true, force: true });
    }
    assert.equal(observeProcesses({ proc: null }).unlisted, 'no process table is read here');
    assert.equal(removalProof(fresh('x'), { proc: null }).holds, false);
  } finally {
    child.kill();
  }
});
