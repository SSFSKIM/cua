// Where a run's scratch directory goes (task 51), on its own so the gate's launcher can check a `:0` step's run name
// without loading the Desktop (scenes.mjs, which re-exports it; M5's T4 arm64 round, fix wave 1).

import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { geditTitle } from './gedit-title.mjs';
import { SCRATCH_PREFIX } from './leftovers.mjs';

/**
 * The longest label tail the scenes give a gedit window (`openGedit`): the minimized scene's text window of a vendor
 * lane (run.mjs `openScene`; gedit-title.test.mjs lists every one).
 */
const LONGEST_GEDIT_TAIL = ['minimized', 'text_pinned'];

/**
 * Where the run's scratch directory goes (task 51; the design session's ruling, sminos 336): the harness's TMPDIR when
 * the longest gedit title the scenes build for `run` stays whole under it, else /tmp. gedit middle-truncates a title's
 * directory to what is left of 100 characters (gedit-title.mjs), and each lane's window is on a file of its own label,
 * so a shortened title differs between lanes: task 49's session TMPDIR failed `gedit tree_shot` on the title alone.
 */
export function scratchRoot(run, tmp = tmpdir()) {
  const longest = `${['cua171-diff', run, 'n'.repeat(8), ...LONGEST_GEDIT_TAIL].join('-')}.txt`;
  return geditTitle(join(tmp, `${SCRATCH_PREFIX}XXXXXX`, longest)).ellipsized ? '/tmp' : tmp;
}
