// A test file for the suite's cleanup check's own test (leak-check.test.mjs), never part of the suite (its name is no
// `*.test.mjs`): run by a nested `node --test` with the suite's global setup. `LEAK` says what it leaves behind: `process`
// (a detached stand-in that waits forever, naming a scratch directory of the suite's, its pid written to `LEAK_PID`),
// `directory` (a scratch directory left in the suite's), or nothing.

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('a test that leaves something of a run behind, or not', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cua171-leak-fixture-'));
  if (process.env.LEAK === 'process') {
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)', '--', `--user-data-dir=${join(dir, 'chrome-profile')}`], { stdio: 'ignore', detached: true });
    child.unref();
    writeFileSync(process.env.LEAK_PID, String(child.pid));
  }
  if (process.env.LEAK !== 'directory') rmSync(dir, { recursive: true, force: true });
});
