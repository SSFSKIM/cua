// A test file for the suite's cleanup check's own test (leak-check.test.mjs), never part of the suite (its name is no
// `*.test.mjs`): run by a nested suite through the check (suite-check.mjs). `LEAK` says what it leaves behind: `process`
// (a detached stand-in that waits forever, naming a scratch directory of the suite's, its pid written to `LEAK_PID`),
// `a11y-stub` (the run's org.a11y.Bus stand-in, a11y-stub.mjs, outliving its session bus: held stopped so it cannot see
// the bus end, then the bus stopped; its pid written to `LEAK_PID`), `directory` (a scratch directory left in the
// suite's), or nothing; `fail` leaves nothing and fails.

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { startA11yStub } from '../../../scripts/linux-engine-diff/a11y-stub.mjs';
import { startSessionBus } from '../../../scripts/linux-engine-diff/session-bus.mjs';

test('a test that leaves something of a run behind, or not', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cua171-leak-fixture-'));
  if (process.env.LEAK === 'process') {
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)', '--', `--user-data-dir=${join(dir, 'chrome-profile')}`], { stdio: 'ignore', detached: true });
    child.unref();
    writeFileSync(process.env.LEAK_PID, String(child.pid));
  }
  if (process.env.LEAK === 'a11y-stub') {
    const bus = await startSessionBus({ dir, display: ':cua171-test-leak-fixture', serviceFile: null });
    const stub = await startA11yStub({ address: bus.address, a11y: 'unix:path=/run/user/501/at-spi/bus_0,guid=0123' });
    process.kill(stub.pid, 'SIGSTOP');
    await bus.stop();
    writeFileSync(process.env.LEAK_PID, String(stub.pid));
    // the scratch directory goes, so only the process is left
    rmSync(dir, { recursive: true, force: true });
    return;
  }
  if (process.env.LEAK !== 'directory') rmSync(dir, { recursive: true, force: true });
  if (process.env.LEAK === 'fail') throw new Error('the fixture fails, as asked');
});
