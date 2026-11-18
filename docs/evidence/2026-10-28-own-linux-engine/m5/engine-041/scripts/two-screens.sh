#!/bin/bash
# Task 101: tests/two-screens.sh of a checkout, with the cargo wrapper first on PATH. usage: two-screens.sh <checkout>
export PATH=/Users/new/.local/share/cua-171/task101/cargo-only:$PATH
[ -x /Users/new/.local/share/cua-171/node24/bin/node ] && export PATH=/Users/new/.local/share/cua-171/node24/bin:$PATH
cd "$1/native/linux-engine" && exec tests/two-screens.sh
