#!/bin/bash
# T8's (task 173) two gate runs at H: by its own selection, then engine-linux by name.
T=/Users/new/.local/share/cua-171/t173
H=3722f2826ca8a8ff3c7a6e28e00ba765d10b077b
cd "$(cd "$T/wt" && pwd -P)" || exit 2
ci-gate "$H" --label m6b-t8-H > "$T/ci-gate-default.log" 2>&1; echo "exit $?" >> "$T/ci-gate-default.log"
ci-gate "$H" --gates engine-linux --label m6b-t8-H-engine > "$T/ci-gate-engine-linux.log" 2>&1; echo "exit $?" >> "$T/ci-gate-engine-linux.log"
