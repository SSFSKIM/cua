// The test suite's own cleanup check (#171 M4, task 45; the design session's rulings, 2026-11-03): when the suite ends,
// nothing it started or made may remain of a run: no process naming a run's scratch directory or a run's profile (a
// `/tmp/cua171-*` path, a `--user-data-dir` under one), and no scratch directory. A stand-in left behind (a fake Chrome a
// test did not end) outlives the suite, reparented to init, and a later run may take it, or its directory, for its own.
// The suite fails naming each one, then ends the process and removes the directory.
//
// Loaded as the harness suite's global setup: `npm run test:linux-engine-diff`, which is `node --test
// --test-global-setup=test/linux-engine-diff/suite-setup.mjs "test/linux-engine-diff/*.test.mjs"` (Node 24). `npm test`
// keeps its plain `node --test "<pattern>"`, the form repl-parity's coverage check reads (scripts/repl-parity/coverage.mjs).
//
// What is the suite's: `globalSetup` makes a temporary directory of the suite's own (`/tmp/cua171-suite-*`) and names it
// as TMPDIR, which every test process inherits, so every scratch directory a test or the harness under test makes
// (`mkdtemp(tmpdir())`) lies in it, and it puts a nonce in the environment. A process counts when it names that
// directory, or, carrying the nonce (read from /proc on Linux), names any `/tmp/cua171-*` path; a directory counts when it
// is left in the suite's. A harness run from another checkout on the same machine (its scratch is `/tmp/cua171-*` too),
// or another suite running beside this one, is never taken for the suite's.

import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** The variable that marks this suite's processes. */
export const SUITE_MARK = 'CUA171_TEST_SUITE';

/** Where a run's scratch directories and profiles lie: `<tmp>/cua171-` for each spelling of the temporary directory. */
export function scratchPrefixes(tmp = tmpdir()) {
  const spellings = new Set([tmp, '/tmp']);
  try {
    spellings.add(realpathSync(tmp));
  } catch {
    // a temporary directory that cannot be resolved keeps its spelling
  }
  return [...spellings].map((dir) => `${dir.replace(/\/+$/, '')}/cua171-`);
}

/**
 * Every process now, as `{pid, argv, marked, linux}`: `marked` whether its environment carries `mark` (null where it
 * cannot be read: another user's, or off Linux, every process).
 */
export function listProcesses(mark, { proc = '/proc', run = execFileSync } = {}) {
  if (existsSync(`${proc}/self`)) {
    const out = [];
    for (const name of readdirSync(proc)) {
      if (!/^\d+$/.test(name)) continue;
      let argv;
      let marked = null;
      try {
        argv = readFileSync(`${proc}/${name}/cmdline`, 'utf8').split('\0').filter(Boolean);
      } catch {
        continue;
      }
      try {
        marked = readFileSync(`${proc}/${name}/environ`, 'utf8').split('\0').includes(mark);
      } catch {
        // another user's, or gone
      }
      out.push({ pid: Number(name), argv, marked, linux: true });
    }
    return out;
  }
  const text = run('ps', ['-axww', '-o', 'pid=,command='], { encoding: 'utf8' });
  return text
    .split('\n')
    .map((line) => line.match(/^\s*(\d+)\s+(.*)$/))
    .filter(Boolean)
    .map(([, pid, command]) => ({ pid: Number(pid), argv: [command], marked: null, linux: false }));
}

/**
 * The processes left behind, never this one: each names the suite's own directory `suiteDir`, or names a run's scratch
 * or profile (`prefixes`) and carries the suite's mark. Off Linux no mark can be read, so only the suite's directory
 * counts there: another suite or run on the machine may name a run's scratch of its own.
 */
export function findLeaks({ processes, suiteDir = null, prefixes = scratchPrefixes(), self = process.pid }) {
  return processes.filter(({ pid, argv, marked }) => {
    if (pid === self || argv.length === 0) return false;
    if (suiteDir && argv.some((arg) => arg.includes(`${suiteDir}/`) || arg === suiteDir)) return true;
    if (marked !== true) return false;
    return argv.some((arg) => prefixes.some((prefix) => arg.includes(prefix)));
  });
}

/** What the suite left in its own directory: each entry's path. */
export function leftDirectories(suiteDir) {
  try {
    return readdirSync(suiteDir).map((name) => join(suiteDir, name));
  } catch {
    return [];
  }
}

let state = null;
let judged = false;

export async function globalSetup() {
  const suiteDir = mkdtempSync(join(tmpdir(), 'cua171-suite-'));
  const mark = `${SUITE_MARK}=${randomBytes(6).toString('hex')}`;
  state = { suiteDir, mark, tmp: tmpdir() };
  process.env[SUITE_MARK] = mark.split('=')[1];
  process.env.TMPDIR = suiteDir;
}

/**
 * The check. Anything left fails the suite (exit code 1, each named on stderr); each process is then ended with SIGKILL
 * and the suite's directory removed. Called once (node calls a teardown again when it throws, so this one sets the exit
 * code instead).
 */
export async function globalTeardown() {
  if (judged || !state) return;
  judged = true;
  const { suiteDir, mark, tmp } = state;
  // the processes a test's last cleanup signalled: given a moment to go
  await new Promise((r) => setTimeout(r, 300));
  const leaks = findLeaks({ processes: listProcesses(mark), suiteDir, prefixes: scratchPrefixes(tmp) });
  for (const { pid } of leaks) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // gone meanwhile
    }
  }
  if (leaks.length) await new Promise((r) => setTimeout(r, 200));
  const dirs = leftDirectories(suiteDir);
  rmSync(suiteDir, { recursive: true, force: true });
  if (leaks.length === 0 && dirs.length === 0) return;
  process.exitCode = 1;
  const report = ['cua171 SUITE LEAK: the suite left what a run of the harness owns; each process is ended and each directory removed now:'];
  for (const { pid, argv } of leaks) report.push(`  process ${pid}: ${argv.join(' ')}`);
  for (const dir of dirs) report.push(`  directory ${dir}`);
  process.stderr.write(`${report.join('\n')}\n`);
}
