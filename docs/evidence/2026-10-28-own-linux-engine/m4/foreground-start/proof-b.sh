#!/bin/bash
# Item B's proof run (T7 fix 3): a differential run whose foreground samples (gnome-text-editor's type_text) follow
# Chrome samples (chrome-textarea type_text by default, as in task 56.s speed series; SCENES overrides) once a block, on a
# private display, no RECORD: many short blocks, so many chrome -> gnome-text-editor transitions.
# usage: proof-b.sh <harness dir> <name> <blocks>   (run under locked.sh)
set -u
. "$(dirname "$0")/env.sh"
exec "$S/private.sh" "$1" "$2" --vendor "$PINNED" --newest "$NEWEST" --cua "$CAND" --dev --scene "${SCENES:-chrome-textarea,gnome-text-editor}" --ops type_text --blocks "$3" --samples-input 2 --occlusion covered --no-audit --run "t74w3-$2"
