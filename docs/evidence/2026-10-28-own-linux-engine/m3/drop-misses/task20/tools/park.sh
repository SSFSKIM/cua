#!/bin/bash
# park.sh: cold short drops in front with the real pointer parked first, no stray event: outside Chrome (on the front
# window in its corner) and inside Chrome away from the path. TRIALS a lane (default 8), every build.
T=/Users/new/.local/share/cua-171/task20
TRIALS=${TRIALS:-8} "$T/run-cold.sh" park-outside --park-pointer 1170,715
TRIALS=${TRIALS:-8} "$T/run-cold.sh" park-inside --park-pointer 300,560
