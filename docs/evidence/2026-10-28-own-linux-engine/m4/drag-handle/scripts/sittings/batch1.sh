#!/bin/bash
# undisturbed handle sequences, Chrome and Electron, every kind, 30 a lane
. $HOME/.local/share/cua-171/task73b/vars.sh
T73_CURSORS=1 bash "$S/sitting.sh" "$H" "$E" chrome-none none 30 chrome handle-select,handle-range,handle-dnd,handle-canvas pinned,cua
T73_CURSORS=1 bash "$S/sitting.sh" "$H" "$E" electron-none none 30 electron handle-select,handle-range,handle-dnd,handle-canvas pinned,cua
