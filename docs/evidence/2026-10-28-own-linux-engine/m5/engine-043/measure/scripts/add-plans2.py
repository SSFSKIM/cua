# Task 132 (ruling 1026): the handle tail's development plan, added to the VM-local harness checkout t132-h71 only (a
# local commit, never pushed): `t132-handle-q`, a quarter of Chrome's handle cells at the coordinator's counts per round
# (long-left x100, plain-long x50, inzone-out x30 over four rounds).
import sys
p = sys.argv[1]
s = open(p).read()
old = "  't132-handle-long': [['cua:handle', 'long-left', 100]],\n"
new = old + "  't132-handle-q': [['cua:handle', 'long-left', 25], ['cua:handle', 'plain-long', 13], ['cua:handle', 'inzone-out', 8]],\n"
assert s.count(old) == 1
open(p, 'w').write(s.replace(old, new, 1))
