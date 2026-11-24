# Task 160: task 147's development plan `t147-left` (Chrome t14-floor's `left` cell alone, 25 a round), added to the
# VM-local checkout t160-e045 only (a local commit, never pushed), after `t14-long-gate`.
import sys
p = sys.argv[1]
s = open(p).read()
old = "  't14-long-gate': [['cua', 'long-left', 30]],\n"
new = old + "  // task 147's plan (ruling 1140), here for task 160 (development only, never pushed): t14-floor's left cell alone\n  't147-left': [['cua', 'left', 25]],\n"
assert s.count(old) == 1
open(p, 'w').write(s.replace(old, new, 1))
