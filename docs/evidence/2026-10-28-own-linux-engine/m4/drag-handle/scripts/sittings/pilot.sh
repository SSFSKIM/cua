#!/bin/bash
. $HOME/.local/share/cua-171/task73b/vars.sh
T73_CURSORS=1 bash "$S/sitting.sh" "$H" "$E" pilot-check check 2 chrome handle-select,handle-dnd pinned,cua:d
