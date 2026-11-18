#!/bin/bash
# Task 96 (the controller's ruling (a), after V1's first attempt was stopped by wrap71): the :0 pilot steps' commands
# printed again for the rerun's out root, then with only `--run m5-pinned-dev-<step>-pilot` shortened to
# `--run pdev-<step>`, so the Desktop scratch stays under run71's TMPDIR (scenes.mjs scratchRoot). Each name is checked
# first with scenes.mjs's own scratchRoot against a TMPDIR of run71's form (/tmp/c71-XXXXXX).
set -u
T=/Users/new/.local/share/cua-171/task96
G=/Users/new/Developer/GitHub/cua/.claude/worktrees/t96-arm64
OUTR=/Users/new/.local/share/cua-171/m5/pilot-arm64/out-zero-r1
"$T/print-zero.sh" -r1-printed "$OUTR" V1 V2 V3 V4 V5 Z0 || exit 1
sed -E 's/--run m5-pinned-dev-([A-Za-z0-9]+)-pilot /--run pdev-\1 /' "$T/zero-commands-r1-printed.txt" > "$T/zero-commands-r1.txt"
echo "--- the one change, per step:"
diff <(tr ' ' '\n' < "$T/zero-commands-r1-printed.txt") <(tr ' ' '\n' < "$T/zero-commands-r1.txt")
echo "--- scratchRoot under a run71-shaped TMPDIR:"
cd "$G" && /Users/new/.local/share/cua-171/node24/bin/node --input-type=module -e "
import { scratchRoot } from './scripts/linux-engine-diff/scenes.mjs';
const tmp = '/tmp/c71-XXXXXX';
let bad = 0;
for (const s of ['V1','V2','V3','V4','V5','Z0']) { for (const run of ['m5-pinned-dev-'+s+'-pilot', 'pdev-'+s]) { const r = scratchRoot(run, tmp); console.log(run.padEnd(24), '->', r, r === tmp ? 'under the TMPDIR' : 'OUT of the TMPDIR'); if (run.startsWith('pdev') && r !== tmp) bad++; } }
process.exit(bad ? 1 : 0);
"
