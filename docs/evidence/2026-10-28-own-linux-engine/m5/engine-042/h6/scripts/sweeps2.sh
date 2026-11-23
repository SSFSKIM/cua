#!/bin/bash
# task 121: the fine sweep at idle, then the coarse sweep at twice the load (L4c's condition)
set -u
T=/Users/new/.local/share/cua-171/task121
"$T/sweep.sh" sweep-fine-idle freeze-042-fine; echo "fine idle exit $?"
"$T/sweep.sh" sweep-load2 freeze-042 --load-factor 2; echo "coarse load2 exit $?"
"$T/sweep.sh" sweep-fine-load2 freeze-042-fine --load-factor 2; echo "fine load2 exit $?"
