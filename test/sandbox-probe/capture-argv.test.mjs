// The argv capture's cleanup (scripts/sandbox-probe/capture-argv.c; review finding P2 of the M0 PR). The Codex launcher
// does not forward signals to its sandboxed child, so stopping only the launcher's pid orphans a stalled child, and
// retries accumulate them. Each attempt runs in its own process group, and on every exit path the probe ends what is
// left of the attempt's tree (TERM, then KILL) before it returns. The launcher here is a harmless shell that forks a
// `sleep` and waits. macOS only (libproc); built with the system clang.
import {after, test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync, mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';

const SOURCE = fileURLToPath(new URL('../../scripts/sandbox-probe/capture-argv.c', import.meta.url));
const macOS = process.platform === 'darwin';
let buildDir;
after(() => { if (buildDir) rmSync(buildDir, {recursive: true, force: true}); });

// The probe, built once with the system clang -> {bin} or {skip: why}. The default SDK can be one the linker cannot
// read (the mini: the Command Line Tools' macOS 27 SDK's libSystem.tbd against Xcode's ld, M0's evidence README), and an
// environment rebuilt from `env -i` drops the SDKROOT a shell there exports. So each SDK on offer is tried in turn: the
// caller's SDKROOT, the default, Xcode's own. Only when none builds is the suite skipped, naming the compiler's error.
const XCODE_SDK = '/Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX.sdk';
function buildProbe() {
  if (!macOS) return {skip: 'macOS only'};
  buildDir = mkdtempSync(join(tmpdir(), 'cua-capture-bin-'));
  const out = join(buildDir, 'capture-argv');
  const sdks = [...new Set([process.env.SDKROOT, undefined, existsSync(XCODE_SDK) ? XCODE_SDK : null].filter(sdk => sdk !== null && sdk !== ''))];
  let error = '';
  for (const sdk of sdks) {
    const {SDKROOT: _caller, ...env} = process.env;
    const r = spawnSync('/usr/bin/clang', ['-O2', '-Wall', '-Werror', '-o', out, SOURCE], {encoding: 'utf8', env: sdk ? {...env, SDKROOT: sdk} : env});
    if (r.status === 0) return {bin: out};
    error ||= `${(r.stderr || String(r.error ?? '')).split('\n').find(Boolean) ?? `clang exited ${r.status}`}`;
  }
  return {skip: `no SDK here builds the probe with /usr/bin/clang (${error})`};
}
const probe = buildProbe();
const skip = probe.skip ?? false;
function capture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'cua-capture-test-'));
  // Whatever the test's own launcher recorded and the probe left alive is ended, so a failing run leaves nothing.
  t.after(() => {
    try { for (const pid of pidsIn(join(dir, 'pids'))) if (alive(pid)) process.kill(pid, 'SIGKILL'); } catch { /* none recorded */ }
    rmSync(dir, {recursive: true, force: true});
  });
  return {dir, bin: probe.bin};
}
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
// Children of an exited launcher are reaped by launchd shortly after they die; give that a moment.
async function settled(pids, ms = 2000) {
  for (const end = Date.now() + ms; Date.now() < end && pids.some(alive);) await new Promise(r => setTimeout(r, 50));
  return pids.filter(alive);
}
const pidsIn = file => readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(Number);
const run = (bin, args) => spawnSync(bin, args, {encoding: 'utf8', timeout: 30_000});

// sh forks the sleep(s), records their pids and its own, and waits. `ignoreTerm` makes the whole tree ignore SIGTERM
// (an ignored signal is inherited), so only the escalation ends it. The sleeps drop the probe's stderr, so a survivor
// cannot hold the test's pipe open (it would then outlive its sleep unseen). The pid file's path is the script's $1,
// never part of its source.
const launcher = (pidfile, {ignoreTerm = false, leaveGroup = false} = {}) => ['/bin/sh', '-c',
  `${ignoreTerm ? 'trap "" TERM; ' : ''}echo $$ >> "$1"; /bin/sleep 120 2>/dev/null & echo $! >> "$1"; `
  + `${leaveGroup ? `/usr/bin/perl -e 'setpgrp(0, 0); exec "/bin/sleep", "121"' 2>/dev/null & echo $! >> "$1"; ` : ''}wait`, 'sh', pidfile];

test('a missed capture window ends each attempt\'s whole tree, not only the launcher', {skip}, async t => {
  const {dir, bin} = capture(t), pidfile = join(dir, 'pids');
  const r = run(bin, ['--tries', '2', '--timeout-ms', '400', '--target', '/nonexistent/never', '--', ...launcher(pidfile)]);
  assert.equal(r.status, 1, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), {captured: false, tries: 2, attempts: [{sawChild: true}, {sawChild: true}]});
  const pids = pidsIn(pidfile);
  assert.equal(pids.length, 4, 'two attempts, each a shell and its sleep');
  assert.deepEqual(await settled(pids), [], 'no process of any attempt survives');
});

test('a tree that ignores SIGTERM is killed after a bounded wait, and the probe still returns', {skip}, async t => {
  const {dir, bin} = capture(t), pidfile = join(dir, 'pids');
  const started = Date.now();
  const r = run(bin, ['--tries', '1', '--timeout-ms', '400', '--target', '/nonexistent/never', '--', ...launcher(pidfile, {ignoreTerm: true})]);
  assert.equal(r.status, 1, `${r.error ?? ''} ${r.stderr}`);
  assert.ok(Date.now() - started < 10_000, 'bounded');
  assert.deepEqual(await settled(pidsIn(pidfile)), []);
});

test('a descendant that left the attempt\'s process group is ended too', {skip}, async t => {
  const {dir, bin} = capture(t), pidfile = join(dir, 'pids');
  const r = run(bin, ['--tries', '1', '--timeout-ms', '600', '--target', '/nonexistent/never', '--', ...launcher(pidfile, {leaveGroup: true})]);
  assert.equal(r.status, 1, r.stderr);
  const pids = pidsIn(pidfile);
  assert.equal(pids.length, 3);
  assert.deepEqual(await settled(pids), []);
});

test('after a catch, a launcher that does not finish is ended with its whole tree', {skip}, async t => {
  const {dir, bin} = capture(t), pidfile = join(dir, 'pids');
  const r = run(bin, ['--tries', '1', '--timeout-ms', '5000', '--target', '/bin/sleep', '--', ...launcher(pidfile, {ignoreTerm: true})]);
  assert.equal(r.status, 0, r.stderr);
  const caught = JSON.parse(r.stdout);
  assert.equal(caught.captured, true);
  assert.equal(caught.execPath, '/bin/sleep');
  assert.deepEqual(caught.argv, ['/bin/sleep', '120']);
  assert.deepEqual(await settled(pidsIn(pidfile)), []);
});
