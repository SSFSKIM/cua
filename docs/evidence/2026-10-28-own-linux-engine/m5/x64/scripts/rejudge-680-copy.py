#!/usr/bin/env python3
# Task 89: M4's ruling-680 re-judge and its controls copied into task89/rejudge-680/, with one change: the re-judge also
# reads M5's counted run name (`pinned-<step>`) as its step, beside M4's `m4-gate-<step>`. Prints the diff.
import difflib, os, shutil
M = '/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/docs/evidence/2026-10-28-own-linux-engine/m4/gate/scripts'
T = '/Users/new/.local/share/cua-171/task89/rejudge-680'
os.makedirs(T, exist_ok=True)
src = open(os.path.join(M, 'rejudge-late-take-window.mjs')).read()
old = "replace(/^m4-gate-/, '')"
assert src.count(old) == 1
new = src.replace(old, "replace(/^(m4-gate-|pinned-)/, '')")
open(os.path.join(T, 'rejudge-late-take-window.mjs'), 'w').write(new)
shutil.copy(os.path.join(M, 'rejudge-late-take-controls.mjs'), T)
print(''.join(difflib.unified_diff(src.splitlines(True), new.splitlines(True), 'm4/gate/scripts/rejudge-late-take-window.mjs', 'task89/rejudge-680/rejudge-late-take-window.mjs')))
