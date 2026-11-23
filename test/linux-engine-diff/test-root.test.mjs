// The tests' own scratch root (#171 M5, task 92; test-root.mjs, fixture-scope.mjs): a test's run makes its scratch in a
// root of the tests', never in /tmp's production namespace (`/tmp/cua171-run-*`), where a test killed mid-run used to
// leave it and every real run's start check then refused until a person removed it (seven did on 2026-11-16). Under the
// suite's wrapper the root is the suite's; a test file run on its own makes its own. Display-free: the runs are Desktops
// that only make their scratch.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import test from 'node:test';

import { SCRATCH_PREFIX, scratchDirs } from '../../scripts/linux-engine-diff/leftovers.mjs';
import { Desktop, scratchRoot } from '../../scripts/linux-engine-diff/scenes.mjs';
import { allowingProductionScratch } from './fixture-scope.mjs';
import { PROCESS_ROOT_PREFIX, SUITE_ROOT_PREFIX, TEST_ROOT } from './test-root.mjs';

const FIXTURE_SCOPE = join(import.meta.dirname, 'fixture-scope.mjs');
const SCENES = join(import.meta.dirname, '..', '..', 'scripts', 'linux-engine-diff', 'scenes.mjs');
const reader = { request: async () => ({ response: { ok: true, output: [] } }), close: async () => {} };

/** A Desktop of this test, put away after `fn`. */
function withDesktop(run, fn) {
  const desktop = new Desktop({ cua: 'unused', run, reader, startActive: 0, nonce: 'n0' });
  try {
    return fn(desktop);
  } finally {
    desktop.unhookStop();
    rmSync(desktop.dir, { recursive: true, force: true });
  }
}

test("a test's TMPDIR is a test root directly in /tmp, and its run makes its scratch there", () => {
  const root = process.env[TEST_ROOT];
  assert.equal(tmpdir(), root);
  assert.equal(dirname(root), '/tmp');
  assert.ok([SUITE_ROOT_PREFIX, PROCESS_ROOT_PREFIX].some((prefix) => basename(root).startsWith(prefix)), root);
  withDesktop('watchdog-unwind', (desktop) => {
    assert.equal(dirname(desktop.dir), root);
    assert.ok(basename(desktop.dir).startsWith(SCRATCH_PREFIX));
  });
});

test('a run name of up to 15 characters keeps its scratch under either test root; a longer one would fall back to /tmp', () => {
  for (const prefix of [SUITE_ROOT_PREFIX, PROCESS_ROOT_PREFIX]) {
    const root = `/tmp/${prefix}AbC123`;
    assert.equal(scratchRoot('x'.repeat(15), root), root);
    assert.equal(scratchRoot('x'.repeat(16), root), '/tmp');
  }
});

test("a test's run whose scratch would fall back to /tmp is refused before anything is made there", () => {
  const run = 'x'.repeat(16);
  // refused in place of the mkdtemp itself, so there is nothing to remove
  assert.throws(() => withDesktop(run, () => {}), /^Error: refusing a test's run scratch in the production namespace \/tmp\/cua171-run-XXXXXX: the run's name is too long for the test root/);
  // a test of the fallback itself says so
  allowingProductionScratch(() => withDesktop(run, (desktop) => assert.equal(dirname(desktop.dir), '/tmp')));
});

/**
 * A test process that makes a run's scratch and is killed (SIGKILL: no handler of its runs) before it ends -> the
 * scratch it left. `env`: the process's environment.
 */
async function killedTest(env) {
  const code = `import ${JSON.stringify(FIXTURE_SCOPE)}; import { Desktop } from ${JSON.stringify(SCENES)};
const desktop = new Desktop({ cua: 'unused', run: 'watchdog-first', reader: { async close() {} }, startActive: 0, nonce: 'n0' });
process.stdout.write(desktop.dir + '\\n');
setInterval(() => {}, 1000);`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', code], { env, stdio: ['ignore', 'pipe', 'inherit'] });
  try {
    const [line] = await once(createInterface({ input: child.stdout }), 'line');
    return line;
  } finally {
    const gone = new Promise((r) => child.once('exit', r));
    child.kill('SIGKILL');
    await gone;
  }
}

test('a test killed mid-run leaves its scratch in the test root, nothing under the production prefix', async () => {
  // a test file run on its own (no suite's root, the plain TMPDIR): a root of its own, which the kill leaves
  const env = { ...process.env };
  delete env[TEST_ROOT];
  delete env.TMPDIR;
  const own = await killedTest(env);
  try {
    assert.equal(existsSync(own), true, 'the killed test left its scratch');
    assert.equal(dirname(dirname(own)), '/tmp');
    assert.ok(basename(dirname(own)).startsWith(PROCESS_ROOT_PREFIX), own);
    assert.equal(scratchDirs(['/tmp']).some((d) => d.dir === own), false, "not among the directories a real run's start check reads");
  } finally {
    rmSync(dirname(own), { recursive: true, force: true });
  }
  // under the suite (this process's root inherited): the suite's root
  const inherited = await killedTest(process.env);
  try {
    assert.equal(dirname(inherited), process.env[TEST_ROOT]);
  } finally {
    rmSync(inherited, { recursive: true, force: true });
  }
});
