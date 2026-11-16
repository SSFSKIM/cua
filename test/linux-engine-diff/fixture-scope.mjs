// A test file's fixture scope for the run's start and end checks (task 88's fix wave 4). Imported by a test file whose
// Desktops and gate steps name no scope of their own, so they read no real scratch root and no real process table: the
// suite runs its files side by side in one TMPDIR, and another file's run is never this one's leftover. The production
// default stays the real roots and /proc (leftovers.mjs `defaultScope`); only this explicit import changes it, in this
// process alone.

import { useFixtureScope } from '../../scripts/linux-engine-diff/leftovers.mjs';

useFixtureScope({ roots: [], proc: null });
