#!/bin/bash
# disturbances in the cua:d lane, Electron; then Chrome's drop cases: a path that leaves the zone, a frozen browser
. $HOME/.local/share/cua-171/task73b/vars.sh
bash "$S/batch.sh" "$H" "$E" electron electron handle-select,handle-range,handle-dnd pinned,cua:d 10 check popup nudge grab
bash "$S/sitting.sh" "$H" "$E" chrome-leave leave 15 chrome handle-dnd pinned,cua:d
T73_FREEZE_AFTER_MS=3 T73_FREEZE_MS=80 bash "$S/sitting.sh" "$H" "$E" chrome-freeze-3 freeze 20 chrome handle-dnd pinned,cua:d
