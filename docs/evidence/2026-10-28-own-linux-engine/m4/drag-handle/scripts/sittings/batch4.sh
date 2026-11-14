#!/bin/bash
# #363: Electron's held drop at twice the load (16 stress-ng workers on 8 cores), 40 a side, with the cursor watch;
# then, idle, Electron drops whose path leaves the zone, for the cursor a miss shows at its release
. $HOME/.local/share/cua-171/task73b/vars.sh
T73_CURSORS=1 bash "$S/sitting.sh" "$H" "$E" electron-load2 none 40 electron handle-dnd pinned,cua --load-factor 2
T73_CURSORS=1 bash "$S/sitting.sh" "$H" "$E" electron-leave leave 15 electron handle-dnd pinned,cua:d
