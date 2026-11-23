#!/bin/bash
# Task 122 (from task 99, T7): the judged Chrome (F2): 156.0.8078.73 arm64, held, and what the harness runs (chrome.mjs CHROME_COMMAND,
# resolved on the steps' PATH).
set -u
G=${G:-/Users/new/Developer/GitHub/cua/.claude/worktrees/t122-h6}
echo "time $(date -u +%FT%TZ), $(uname -m)"
dpkg-query -W -f '${Package} ${Version} ${Architecture}\n' google-chrome-stable
echo "held: $(apt-mark showhold | tr '\n' ' ')"
grep -n "export const CHROME_COMMAND " "$G/scripts/linux-engine-diff/chrome.mjs"
c=$(command -v google-chrome); echo "google-chrome on PATH: $c"
echo "--- $c"; cat "$c"
echo "--- resolved"; readlink -f /usr/bin/google-chrome-stable
echo "version: $(google-chrome --version)"
file -b "$(readlink -f /usr/bin/google-chrome-stable)" | cut -c1-80
file -b /opt/google/chrome/chrome | cut -c1-100
# task 122: K2's Chrome, the current stable one extracted under chrome-stable (gate.mjs currentStableChrome)
S=/Users/new/.local/share/cua-171/chrome-stable
cur=$(cat "$S/current")
echo "--- K2's current stable: current=$cur; $("$S/$cur/bin/google-chrome" --version)"
