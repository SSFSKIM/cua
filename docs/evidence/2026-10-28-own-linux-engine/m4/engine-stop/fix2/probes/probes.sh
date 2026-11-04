#!/bin/bash
# The admitted-work probes on the fix-2 engine: the residual (an engine request running past by(0.7)) and the
# sleeping cell, sandboxed and disabled; each ends with the processes left stopped.
d=<probes>
bin=$1
scroll="await cua.computer.scroll({x: 400, y: 300, direction: 'down', pixels: 65535}); nodeRepl.write('scrolled');"
echo "stress-ng: $(pgrep -c -x stress-ng)"
CELL2="$scroll" bash $d/probe-admitted.sh residual-long-request "$bin" CELL2="$scroll" | grep -E 'eof at|cell 2|serve exit|keys after|stopped after|teardown' | cut -c1-300
CELL2="$scroll" bash $d/probe-admitted.sh residual-long-request-disabled "$bin" CELL2="$scroll" CUA_SHIM_SANDBOX=disabled | grep -E 'eof at|cell 2|serve exit|keys after|stopped after|teardown' | cut -c1-300
bash $d/probe-admitted.sh sandboxed-fixed "$bin" | grep -E 'eof at|cell 2|serve exit|keys after|stopped after|teardown' | cut -c1-300
bash $d/probe-admitted.sh disabled-fixed "$bin" CUA_SHIM_SANDBOX=disabled | grep -E 'eof at|cell 2|serve exit|keys after|stopped after|teardown' | cut -c1-300
