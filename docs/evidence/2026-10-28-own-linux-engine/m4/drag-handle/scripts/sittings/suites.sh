#!/bin/bash
# task 73b: the engine's checks and suites with the gate's flags, then the JavaScript suites, on the checkout
S=$HOME/Developer/GitHub/cua/.claude/worktrees/cua-171/docs/evidence/2026-10-28-own-linux-engine/m4/drag-handle/scripts
bash "$S/engine-suites.sh" "$1"
bash "$S/node-suites.sh" "$1"
