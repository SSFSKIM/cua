#!/bin/bash
# disturbances in the cua:d lane, Chrome: the pre-press try alone, task 20's popup, a nudge, a 2 s gap, a foreign grab
. $HOME/.local/share/cua-171/task73b/vars.sh
bash "$S/batch.sh" "$H" "$E" chrome chrome handle-select,handle-range,handle-dnd pinned,cua:d 10 check popup nudge gap grab
