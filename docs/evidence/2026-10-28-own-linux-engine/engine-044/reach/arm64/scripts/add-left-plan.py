# Task 147 (ruling 1140): the development plan `t147-left`, Chrome t14-floor's `left` cell alone, 25 a round, added
# to the VM-local development checkout t147-dev only (a local commit, never pushed), after task 132's plans.
import sys
p = sys.argv[1]
s = open(p).read()
old = "  't132-handle-long': [['cua:handle', 'long-left', 100]],\n"
new = old + "  // task 147 (ruling 1140; development only, never pushed): t14-floor's left cell alone, for its release_sync records\n  't147-left': [['cua', 'left', 25]],\n"
assert s.count(old) == 1
open(p, 'w').write(s.replace(old, new, 1))
