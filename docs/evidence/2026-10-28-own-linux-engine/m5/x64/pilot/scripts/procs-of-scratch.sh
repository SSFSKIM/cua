#!/bin/bash
# Task 87: every process naming one of the five leftover scratch directories in its argv or environment (ruling 721).
for id in 7nTGZK AdXsUJ OJWaJi lLeOBG q8ExPO; do
  for f in $(grep -l "cua171-run-$id" /proc/[0-9]*/cmdline /proc/[0-9]*/environ 2>/dev/null); do
    p=$(echo "$f" | cut -d/ -f3)
    echo "$id $(basename "$f") pid=$p ppid=$(ps -o ppid= -p "$p" | tr -d ' ') start=$(ps -o lstart= -p "$p") :: $(tr '\0' ' ' < "/proc/$p/cmdline" 2>/dev/null | cut -c1-120)"
  done
done
