#!/bin/bash
# undisturbed.sh <name> [trials]: task 20's undisturbed drags (pointer inside, five kinds, shared and dedicated) on a
# private Xvfb (1280x800, as :0), the engine CUA_BIN (default task23/engine/cua-engine); output runs/<name>.jsonl.
set -u
T=/Users/new/.local/share/cua-171/task23
name=$1
export CUA_BIN=${CUA_BIN:-$T/engine/cua-engine}
rm -f "$T/runs/$name.jsonl"
xvfb-run -a -s "-screen 0 1280x800x24" dbus-run-session -- "$T/undisturbed-inner.sh" "$T/runs/$name.jsonl" "${2:-24}" > "$T/runs/$name.log" 2>&1
code=$?
echo "exit $code"
exit $code
