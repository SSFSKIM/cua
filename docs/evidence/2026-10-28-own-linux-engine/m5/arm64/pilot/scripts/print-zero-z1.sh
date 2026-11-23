#!/bin/bash
# Task 96 (the controller's word, after V5 was stopped and the session-bus decoy was found unbound): V5 and Z0 printed
# again under the short out root m5/pa/z1, with only `--run` shortened to pdev-<step> as in -r1, then checked: each
# step's two decoy socket paths (wrap71: <step dir>/decoy/{session,a11y}.sock) under 108 bytes, and scenes.mjs's own
# scratchRoot keeping the scratch under a run71-shaped TMPDIR. Exits nonzero if any check fails.
set -u
T=/Users/new/.local/share/cua-171/task96
G=/Users/new/Developer/GitHub/cua/.claude/worktrees/t96-arm64
OUTR=/Users/new/.local/share/cua-171/m5/pa/z1
"$T/print-zero.sh" -z1-printed "$OUTR" V5 Z0 || exit 1
sed -E 's/--run m5-pinned-dev-([A-Za-z0-9]+)-pilot /--run pdev-\1 /' "$T/zero-commands-z1-printed.txt" > "$T/zero-commands-z1.txt"
echo "--- the one change, per step:"
diff <(tr ' ' '\n' < "$T/zero-commands-z1-printed.txt") <(tr ' ' '\n' < "$T/zero-commands-z1.txt")
bad=0
echo "--- decoy socket paths (sun_path holds 107 bytes and a NUL):"
for s in V5 Z0; do for n in session.sock a11y.sock; do
  p="$OUTR/$s.development-run.pinned.pilot/decoy/$n"; l=$(printf %s "$p" | wc -c)
  echo "$l $p"; [ "$l" -lt 108 ] || bad=1
done; done
echo "--- scratchRoot under a run71-shaped TMPDIR:"
cd "$G" && /Users/new/.local/share/cua-171/node24/bin/node --input-type=module -e "
import { scratchRoot } from './scripts/linux-engine-diff/scenes.mjs';
let bad = 0;
for (const run of ['pdev-V5', 'pdev-Z0']) { const r = scratchRoot(run, '/tmp/c71-XXXXXX'); console.log(run, '->', r); if (r !== '/tmp/c71-XXXXXX') bad = 1; }
process.exit(bad);
" || bad=1
echo "checks: $([ $bad = 0 ] && echo pass || echo FAIL)"
exit $bad
