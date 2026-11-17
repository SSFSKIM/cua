#!/bin/bash
# on e8574df3: the events experiment (the event proofs and the vendor-JavaScript drag_handle cases) against both vendor
# builds, on a private display
S=$HOME/Developer/GitHub/cua/.claude/worktrees/cua-171/docs/evidence/2026-10-28-own-linux-engine/m4/drag-handle/scripts
. "$S/env.sh"
H=$HOME/.local/share/cua-171/task73b/harness-e8574df3
E=$HOME/.local/share/cua-171/task73b/build/e8574df3ba4895ad3dcab2410bd1c007f2707488/src/native/linux-engine/target/x86_64-unknown-linux-musl/release/cua-engine
bash "$S/experiment.sh" "$H" events-idle --experiment events --vendor "$PINNED" --newest "$NEWEST" --cua "$E"
