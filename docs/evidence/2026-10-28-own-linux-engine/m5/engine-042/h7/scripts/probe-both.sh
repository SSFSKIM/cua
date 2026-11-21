#!/bin/bash
# task 125 (ruling 956, closure 2): the press mark on Chrome 156 (installed) and 158 (extracted current stable), each
# on an XTEST click and a synthetic (SendEvent) one; a private display each, run-owned profiles. Task 128: rerun with
# the probe on a display its own server named (probe-usertime-any.sh, the review of cf1ef10f, finding 4).
set -u
here=$(dirname "$(readlink -f "$0")")
for c in google-chrome /Users/new/.local/share/cua-171/chrome-stable/158.0.8127.36-1/bin/google-chrome; do
  echo "=== $("$c" --version)"
  CHROME=$c "$here/probe-usertime-any.sh"
done
