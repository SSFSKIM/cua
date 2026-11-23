# Task 132: development plans for the 0.4.3 candidate's measurement, added to the VM-local harness checkout t132-h71
# only (a local commit, never pushed): `t132-floor-q`, a quarter of t14-floor's cells at the brief's counts (plain-long
# x300, left x100, inzone-out x30) per round; `t132-handle-long`, Chrome's long-left as drag_handle steps x100
# (ruling 998).
import sys
p = sys.argv[1]
s = open(p).read()
old = "  't14-long-gate': [['cua', 'long-left', 30]],\n"
new = old + ("  // task 132 (development only, never pushed): t14-floor's cells at the candidate's counts, and Chrome's long-left\n"
             "  // as a handle (ruling 998)\n"
             "  't132-floor-q': [['cua', 'plain-long', 75], ['cua', 'left', 25], ['cua', 'inzone-out', 8]],\n"
             "  't132-handle-long': [['cua:handle', 'long-left', 100]],\n")
assert s.count(old) == 1
open(p, 'w').write(s.replace(old, new, 1))
