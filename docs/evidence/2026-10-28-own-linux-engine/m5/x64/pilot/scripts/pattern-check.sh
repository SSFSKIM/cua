#!/bin/bash
# Task 87: whether leftover-scratch.sh's process count finds a live process, tried on a scratch directory a current
# step's session bus names (its id the argument).
id=$1
echo "bracketed: $(grep -l "cua171-run-${id%?}[${id: -1}]" /proc/[0-9]*/cmdline /proc/[0-9]*/environ 2>/dev/null | wc -l)"
echo "plain:     $(grep -l "cua171-run-$id" /proc/[0-9]*/cmdline /proc/[0-9]*/environ 2>/dev/null | wc -l)"
