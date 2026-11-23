// The test processes' own scratch root (#171 M5, task 92). A run makes its scratch directory in TMPDIR, or in /tmp itself
// when the run's longest gedit title would be shortened under TMPDIR (scenes.mjs `scratchRoot`), and `/tmp/cua171-run-*`
// is the production namespace: a real run's start check refuses to start beside any directory there. A test killed
// mid-run (a timeout, by hand) leaves its run's scratch behind, so a test's runs make theirs in a root of the tests' own:
// a directory directly in /tmp, whatever the caller's TMPDIR, with a name short enough that a test's run name of up to 15
// characters stays under it, and named to TMPDIR for the test process and every process it starts. The session bus's
// socket (`<scratch>/session/bus/dbus-*`) stays far inside the 107 bytes a socket path may have.
//
// The suite's wrapper (suite-check.mjs) makes one root for the whole suite; a test file run on its own makes its own
// (fixture-scope.mjs). Side-effect free: both import it.

import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';

/** The variable naming the test root a process and its children make their scratch in; TMPDIR names it too. */
export const TEST_ROOT = 'CUA171_TEST_ROOT';
/** A suite's root (suite-check.mjs): `/tmp/cua171-s-XXXXXX`. */
export const SUITE_ROOT_PREFIX = 'cua171-s-';
/** A test process's own root outside a suite (fixture-scope.mjs): `/tmp/cua171-t-XXXXXX`. */
export const PROCESS_ROOT_PREFIX = 'cua171-t-';

/** A new test root, `/tmp/<prefix>XXXXXX`. */
export const makeTestRoot = (prefix) => mkdtempSync(join('/tmp', prefix));
