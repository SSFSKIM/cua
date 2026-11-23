// A test file's fixture scope for the run's start and end checks (task 88's fix wave 4). Imported by a test file whose
// Desktops and gate steps name no scope of their own, so they read no real scratch root and no real process table: the
// suite runs its files side by side in one TMPDIR, and another file's run is never this one's leftover. The production
// default stays the real roots and /proc (leftovers.mjs `defaultScope`); only this explicit import changes it, in this
// process alone.
//
// It also says where this process's runs make their scratch (task 92): in the test root (test-root.mjs), the suite's when
// the process runs under the suite's wrapper, else one of its own, removed when the process exits empty (a scratch left
// in it stays, so a process still using it never names a scratch that is gone, which a real start check refuses too). And
// it refuses a run scratch in the production namespace (`/tmp/cua171-run-*`, where a run whose name is too long for the
// root falls back to): a test that made one and was killed would stop every real run's start check until a person
// removed it.

import fs, { rmdirSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';

import { SCRATCH_PREFIX, useFixtureScope } from '../../scripts/linux-engine-diff/leftovers.mjs';
import { PROCESS_ROOT_PREFIX, TEST_ROOT, makeTestRoot } from './test-root.mjs';

useFixtureScope({ roots: [], proc: null });

if (!process.env[TEST_ROOT] || process.env.TMPDIR !== process.env[TEST_ROOT]) {
  const root = makeTestRoot(PROCESS_ROOT_PREFIX);
  process.env[TEST_ROOT] = root;
  process.env.TMPDIR = root;
  process.on('exit', () => {
    try {
      rmdirSync(root);
    } catch {
      // not empty: what a test left stays where it is, outside the production namespace
    }
  });
}

const PRODUCTION = join('/tmp', SCRATCH_PREFIX);
let allowed = 0;
const mkdtempSync = fs.mkdtempSync;
fs.mkdtempSync = function guarded(prefix, ...rest) {
  if (allowed === 0 && prefix === PRODUCTION) {
    throw new Error(`refusing a test's run scratch in the production namespace ${PRODUCTION}XXXXXX: the run's name is too long for the test root ${process.env[TEST_ROOT]}, so the harness falls back to /tmp (scenes.mjs scratchRoot); give the test's run a shorter name`);
  }
  return mkdtempSync.call(this, prefix, ...rest);
};
// the harness's modules import mkdtempSync by name
syncBuiltinESMExports();

/** Runs `fn` with a run scratch in the production namespace allowed: for a test of the /tmp fallback itself. */
export function allowingProductionScratch(fn) {
  allowed++;
  try {
    return fn();
  } finally {
    allowed--;
  }
}
