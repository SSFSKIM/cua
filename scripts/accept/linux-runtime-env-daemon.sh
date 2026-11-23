#!/bin/sh
# The private session bus of linux-runtime-env.sh (`dbus-run-session --dbus-daemon=<this>`): dbus-daemon as it is, its
# own diagnostics and the output of the services it activates (the accessibility bus among them) sent to a log in the
# run's XDG_RUNTIME_DIR instead of the wrapped command's output, which a fixture's JSON report is. dbus-run-session reads
# the bus's address from the pipe it names in --print-address, not from this output.
exec dbus-daemon "$@" >> "$XDG_RUNTIME_DIR/dbus-daemon.log" 2>&1
