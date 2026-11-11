#!/bin/bash
# Task 75's amplifier: the drag control's test alone, with Xvfb, the engine and the test all on CPU 0 beside two busy
# loops there, so the X server and the probe's reader contend for one CPU as on a loaded runner.
#   usage: amp.sh <first> <last> <outdir>   (under locked.sh task75)
set -u
taskset -c 0 sh -c 'while :; do :; done' & hog1=$!
taskset -c 0 sh -c 'while :; do :; done' & hog2=$!
trap 'kill $hog1 $hog2 2>/dev/null' EXIT
taskset -c 0 /Users/new/.local/share/cua-171/task75/run.sh alone "$1" "$2" "$3"
