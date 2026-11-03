// The suite's cleanup check (#171 M4, task 45; suite-check.mjs): a process the suite started that still runs naming a
// run's scratch directory or profile, or a scratch directory it left, fails the suite. Its own proof: a nested suite whose
// one test leaves a stand-in, or a directory, behind fails, naming it, and ends or removes it; one that leaves nothing
// passes. The check is a wrapper that runs `node --test` and then looks at what remains (task 45's review: the global
// setup it replaced needed Node 24's --test-global-setup, where package.json declares ^22.14 and >=23.7), so the nested
// suites run it as `npm run test:linux-engine-diff` does. Display-free: the stand-ins are node processes that only
// wait, each ended by this test whatever happens.

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { SUITE_MARK, findLeaks, leftDirectories, listProcesses, scratchPrefixes } from './suite-check.mjs';

const HAS_PROC = existsSync('/proc/self/cmdline');
const CHECK = join(import.meta.dirname, 'suite-check.mjs');
const REPO = join(import.meta.dirname, '..', '..');
const FIXTURE = join(import.meta.dirname, 'leak-fixture', 'leaks.mjs');
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return (readFileSync(`/proc/${pid}/cmdline`, 'utf8') ?? '').length > 0;
  } catch {
    return false;
  }
};

test("a leak is a process naming the suite's directory, or one of the suite's naming a run's scratch or profile", () => {
  assert.ok(scratchPrefixes('/tmp').includes('/tmp/cua171-'));
  const suiteDir = '/tmp/cua171-suite-abc';
  const processes = [
    { pid: 10, argv: ['node', '-e', 'x', '--user-data-dir=/tmp/cua171-suite-abc/cua171-chrome-scratch-1/chrome-profile'], marked: false, linux: true },
    { pid: 11, argv: ['google-chrome', '--user-data-dir=/tmp/cua171-diff-run-x/chrome-profile'], marked: true, linux: true },
    // another checkout's live run: its scratch, not carrying the suite's mark
    { pid: 12, argv: ['google-chrome', '--user-data-dir=/tmp/cua171-diff-live-y/chrome-profile'], marked: false, linux: true },
    { pid: 13, argv: ['node', 'something-else'], marked: true, linux: true },
    // an exited child not yet reaped
    { pid: 14, argv: [], marked: true, linux: true },
    // this process
    { pid: process.pid, argv: ['node', '/tmp/cua171-suite-abc/x'], marked: true, linux: true },
    // where no environment can be read (off Linux), only the suite's own directory counts
    { pid: 15, argv: ['node /tmp/cua171-diff-z/x'], marked: null, linux: false },
    { pid: 16, argv: ['node /tmp/cua171-suite-abc/cua171-diff-z/x'], marked: null, linux: false },
  ];
  assert.deepEqual(findLeaks({ processes, suiteDir, prefixes: scratchPrefixes('/tmp') }).map((p) => p.pid), [10, 11, 16]);
});

test('a live stand-in of the suite is seen with its pid and command line', { skip: !HAS_PROC && 'no /proc here' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cua171-leakcheck-'));
  const mark = `${SUITE_MARK}=leakcheck${process.pid}`;
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)', join(dir, 'profile')], { stdio: 'ignore', env: { ...process.env, [SUITE_MARK]: mark.split('=')[1] } });
  try {
    for (let i = 0; i < 100 && !alive(child.pid); i++) await new Promise((r) => setTimeout(r, 10));
    const leaks = findLeaks({ processes: listProcesses(mark) });
    const found = leaks.find((p) => p.pid === child.pid);
    assert.ok(found, 'the stand-in is a leak');
    assert.ok(found.argv.includes(join(dir, 'profile')));
    // the same process, unmarked, is another's
    assert.equal(findLeaks({ processes: listProcesses(`${SUITE_MARK}=another`) }).some((p) => p.pid === child.pid), false);
    assert.deepEqual(leftDirectories(join(dir, 'none')), []);
  } finally {
    child.kill('SIGKILL');
    rmSync(dir, { recursive: true, force: true });
  }
});

/** A nested suite of the fixture alone, run through the suite's cleanup check as npm runs the harness suite: `{status, stderr}`. */
function nestedSuite(leak, pidFile) {
  const env = { ...process.env, LEAK: leak, LEAK_PID: pidFile };
  // a child `node --test` must not see this runner's context, or it reports to this runner instead
  delete env.NODE_TEST_CONTEXT;
  delete env[SUITE_MARK];
  return spawnSync(process.execPath, [CHECK, FIXTURE], { env, encoding: 'utf8', timeout: 60000 });
}

test('a suite that leaves a stand-in behind fails, naming its pid and command line, and the stand-in is ended', { skip: !HAS_PROC && 'no /proc here' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cua171-leakcheck-nested-'));
  const pidFile = join(dir, 'pid');
  let pid = null;
  try {
    const run = nestedSuite('process', pidFile);
    pid = Number(readFileSync(pidFile, 'utf8'));
    assert.equal(run.status, 1, `the suite fails: ${run.stderr}`);
    assert.match(run.stderr, new RegExp(`cua171 SUITE LEAK: .*\\n  process ${pid}: .*setInterval.*--user-data-dir=\\S*/cua171-suite-\\w+/cua171-leak-fixture-\\w+/chrome-profile`));
    assert.equal(alive(pid), false, 'and the stand-in is ended');
  } finally {
    if (pid && alive(pid)) process.kill(pid, 'SIGKILL');
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a suite that leaves a scratch directory behind fails, naming it, and the directory is removed', () => {
  const run = nestedSuite('directory', '/nonexistent');
  assert.equal(run.status, 1, `the suite fails: ${run.stderr}`);
  const [, left] = run.stderr.match(/\n {2}directory (\S+\/cua171-leak-fixture-\w+)/) ?? [];
  assert.ok(left, run.stderr);
  assert.equal(existsSync(left), false, 'and the directory is removed');
});

test('a suite that leaves nothing behind passes, and its own directory is gone', () => {
  const suites = () => readdirSync(tmpdir()).filter((name) => name.startsWith('cua171-suite-')).sort();
  const before = suites();
  const run = nestedSuite('none', '/nonexistent');
  assert.equal(run.status, 0, run.stderr);
  assert.doesNotMatch(run.stderr, /SUITE LEAK/);
  assert.deepEqual(suites(), before);
});

test("a suite whose tests fail fails the check too, whatever it left", () => {
  const run = nestedSuite('fail', '/nonexistent');
  assert.equal(run.status, 1, run.stderr);
  assert.doesNotMatch(run.stderr, /SUITE LEAK/);
});

// The declared Node range (package.json `engines`) is what every test npm runs must work on: no flag of a later Node in
// the scripts that run the suites, or in a command line a test starts.
test("no test npm runs needs a flag the declared Node range lacks: the cleanup check is a wrapper, not Node 24's global setup", () => {
  const pkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'));
  assert.equal(pkg.engines.node, '^22.14 || >=23.7', 'the range this test guards');
  assert.equal(pkg.scripts['test:linux-engine-diff'], 'node test/linux-engine-diff/suite-check.mjs "test/linux-engine-diff/*.test.mjs"');
  const NODE_24_ONLY = ['--test-global-setup'];
  for (const [name, script] of Object.entries(pkg.scripts).filter(([n]) => n.startsWith('test'))) {
    for (const flag of NODE_24_ONLY) assert.ok(!script.includes(flag), `npm's ${name} uses ${flag}`);
  }
  const files = readdirSync(join(REPO, 'test'), { recursive: true }).filter((f) => /\.(mjs|js)$/.test(f));
  for (const file of files) {
    const text = readFileSync(join(REPO, 'test', file), 'utf8');
    for (const flag of NODE_24_ONLY) {
      // this file names the flag only in its own check
      if (file === join('linux-engine-diff', 'leak-check.test.mjs')) continue;
      assert.ok(!text.includes(flag), `test/${file} uses ${flag}`);
    }
  }
});
