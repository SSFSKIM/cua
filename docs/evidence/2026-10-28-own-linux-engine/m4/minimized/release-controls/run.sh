#!/usr/bin/env bash
# The release proof's live negative controls (probe.mjs) on a private Xvfb with its own Openbox and session bus.
# $1: the cua engine. Writes controls.jsonl beside this script.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ENGINE="${1:?engine}"
N=""
for n in $(seq 60 99); do
  if [ ! -e "/tmp/.X11-unix/X$n" ] && [ ! -e "/tmp/.X$n-lock" ]; then N=$n; break; fi
done
[ -n "$N" ] || { echo "no free display"; exit 2; }
# the private server's own credentials, which the audit's proxy copies (as on :0)
AUTHDIR="$(mktemp -d)"
export XAUTHORITY="$AUTHDIR/Xauthority"
touch "$XAUTHORITY"
xauth -f "$XAUTHORITY" add ":$N" . "$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"
trap 'rm -rf "$AUTHDIR"' EXIT
Xvfb ":$N" -auth "$XAUTHORITY" -noreset -screen 0 1280x800x24 -nolisten tcp >/dev/null 2>&1 &
XV=$!
sleep 1
export DISPLAY=":$N"
openbox >/dev/null 2>&1 &
OB=$!
sleep 1
dbus-run-session -- node "$HERE/probe.mjs" "$ENGINE" > "$HERE/controls.jsonl"
echo "probe exit $? on :$N"
kill "$OB" "$XV"
