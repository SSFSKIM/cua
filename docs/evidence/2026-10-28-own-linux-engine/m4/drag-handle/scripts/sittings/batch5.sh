#!/bin/bash
# on e8574df3 (the drop window past Chrome's drag image): Chrome's handle drops undisturbed, leaving the zone, and with
# the browser frozen across the end (two stop delays); a second Electron sitting at twice the load
S=$HOME/Developer/GitHub/cua/.claude/worktrees/cua-171/docs/evidence/2026-10-28-own-linux-engine/m4/drag-handle/scripts
H=$HOME/.local/share/cua-171/task73b/harness-e8574df3
E=$HOME/.local/share/cua-171/task73b/build/e8574df3ba4895ad3dcab2410bd1c007f2707488/src/native/linux-engine/target/x86_64-unknown-linux-musl/release/cua-engine
T73_CURSORS=1 bash "$S/sitting.sh" "$H" "$E" chrome-dnd-none none 30 chrome handle-dnd pinned,cua
T73_CURSORS=1 bash "$S/sitting.sh" "$H" "$E" chrome-dnd-leave leave 15 chrome handle-dnd pinned,cua:d
T73_FREEZE_AFTER_MS=0 T73_FREEZE_MS=80 bash "$S/sitting.sh" "$H" "$E" chrome-freeze-0 freeze 20 chrome handle-dnd pinned,cua:d
T73_FREEZE_AFTER_MS=8 T73_FREEZE_MS=120 bash "$S/sitting.sh" "$H" "$E" chrome-freeze-8 freeze 20 chrome handle-dnd pinned,cua:d
T73_CURSORS=1 bash "$S/sitting.sh" "$H" "$E" electron-load2-b none 40 electron handle-dnd pinned,cua --load-factor 2
