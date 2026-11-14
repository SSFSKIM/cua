#!/bin/bash
# The fix's scripts and its verdict table into the evidence directory, home paths labelled (copy-evidence.py).
set -u
S=$HOME/.local/share/cua-171/task60-fix/scripts
E=$HOME/Developer/GitHub/cua/.claude/worktrees/cua-171/docs/evidence/2026-10-28-own-linux-engine/m4/paste-settle/fix
args=()
for f in build-musl.sh export-harness.sh sitting.sh live.sh click-field.sh shipped-clicks.sh final-sittings.sh device-dnd.sh probe-all.sh review-probe.mjs debug-firefox2.mjs qt-activation.sh suites.sh copy-evidence.py copy-scripts.sh verdicts.py series-table.py front-active.py device-verdicts.py show-runs.py; do
  args+=("$f=scripts/$f")
done
python3 "$S/copy-evidence.py" "$S" "$E" "${args[@]}" | tail -1
python3 "$S/verdicts.py" click-paste-idle="$E/click-paste/idle/results.jsonl" click-paste-load2="$E/click-paste/load2/results.jsonl" click-field-zero-idle="$E/click-field/zero-idle/results.jsonl" click-field-zero-load2="$E/click-field/zero-load2/results.jsonl" click-field-steps-idle="$E/click-field/steps-idle/results.jsonl" click-field-steps-load2="$E/click-field/steps-load2/results.jsonl" shipped-idle="$E/shipped/idle/results.jsonl" shipped-load2="$E/shipped/load2/results.jsonl" > "$E/verdicts.md"
wc -l "$E/verdicts.md"
du -sh "$E"
