#!/bin/bash
# the idle sittings of batches 4 and 5 again in a locked call of their own (theirs ended in, or began after, a sitting
# at twice the load): Chrome's undisturbed drops and leaves on e8574df3, Electron's leaves
S=$HOME/Developer/GitHub/cua/.claude/worktrees/cua-171/docs/evidence/2026-10-28-own-linux-engine/m4/drag-handle/scripts
H=$HOME/.local/share/cua-171/task73b/harness-e8574df3
E=$HOME/.local/share/cua-171/task73b/build/e8574df3ba4895ad3dcab2410bd1c007f2707488/src/native/linux-engine/target/x86_64-unknown-linux-musl/release/cua-engine
T73_CURSORS=1 bash "$S/sitting.sh" "$H" "$E" chrome-dnd-none-2 none 30 chrome handle-dnd pinned,cua
T73_CURSORS=1 bash "$S/sitting.sh" "$H" "$E" chrome-dnd-leave-2 leave 15 chrome handle-dnd pinned,cua:d
T73_CURSORS=1 bash "$S/sitting.sh" "$H" "$E" electron-leave-2 leave 15 electron handle-dnd pinned,cua:d
