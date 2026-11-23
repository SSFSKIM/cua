#!/bin/bash
# Task 99 (T7; from task 96's and task 89's): the :0 sitting in one hold of the host lock (holder t7-arm64), its cap
# CUA_LOCK_MAX set for the sitting. HARD_STOP (epoch seconds) is exported for sitting.sh; the cap ends the hold at the
# latest some minutes after.
# usage: sitting-locked.sh <cap, e.g. 250m> <hard stop, epoch s> <sitting.sh arguments>
set -u
cap=$1; export HARD_STOP=$2; shift 2
CUA_LOCK_MAX=$cap exec /Users/new/.local/share/cua-171/locked.sh t7-arm64 /Users/new/.local/share/cua-171/task99/sitting.sh "$@"
