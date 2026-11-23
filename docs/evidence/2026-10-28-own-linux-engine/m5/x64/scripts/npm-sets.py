#!/usr/bin/env python3
# Task 89 (ruling 743): the README's npm test section from failing.mjs's comparison: both sets of failures by test name,
# collapsed per file where every name of that file fails in both, and the difference.
# usage: npm-sets.py <npm-test-compare.txt>
import re, sys
lines = open(sys.argv[1]).read().split('\n')
sets, cur = {}, None
for l in lines:
    m = re.match(r'^(\S.*?): (\d+) failing$', l)
    if m:
        cur = 'H' if 'npm-test-H' in m.group(1) else 'main'
        sets[cur] = []
        continue
    if l.startswith('failing in'):
        cur = None
        continue
    if cur and l.startswith('  '):
        sets[cur].append(l.strip())
H, M = sets['H'], sets['main']
both = sorted(set(H) & set(M))
print(f'Failing at H: {len(H)}. Failing at main: {len(M)}. In both: {len(both)}.\n')
print('Failing at both heads (file :: test):\n')
for t in both:
    print(f'- `{t}`')
print('\nFailing at H only:\n')
for t in sorted(set(H) - set(M)):
    print(f'- `{t}`')
print('\nFailing at main only:\n')
for t in sorted(set(M) - set(H)):
    print(f'- `{t}`')
