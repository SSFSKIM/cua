#!/bin/bash
# private.sh <log> <command...>: the command on a private Xvfb (1280x800, as :0) with its own session bus, Openbox and
# AT-SPI (private-inner.sh), never on the person's :0.
set -u
T=/Users/new/.local/share/cua-171/task23
log=$1
shift
xvfb-run -a -s "-screen 0 1280x800x24" dbus-run-session -- "$T/private-inner.sh" "$@" > "$log" 2>&1
code=$?
echo "exit $code"
exit $code
