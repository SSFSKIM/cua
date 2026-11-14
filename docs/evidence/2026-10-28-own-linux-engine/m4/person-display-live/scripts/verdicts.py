#!/usr/bin/python3 -I
# Task 50: the verdict table of a run's summary.md, counted: each cua (or candidate) row's verdict by its first word,
# per scene, and the list of every verdict that is not a PASS.
# usage: verdicts.py <summary.md>
import collections, re, sys

per_scene = collections.defaultdict(collections.Counter)
total = collections.Counter()
other = []
for line in open(sys.argv[1]):
    cells = [c.strip() for c in line.strip().strip('|').split('|')]
    if len(cells) < 5 or cells[0] in ('scene', '---') or not line.startswith('|'):
        continue
    verdict = cells[-1]
    if not verdict or cells[2] == '**bar**':
        continue
    word = re.match(r'[*A-Za-z() ]+', verdict)
    word = (word.group(0) if word else verdict).strip('* ').split(' (')[0].split(':')[0]
    per_scene[cells[0]][word] += 1
    total[word] += 1
    if not verdict.startswith('PASS'):
        other.append(f'{cells[0]} {cells[1]} {cells[2]}: {verdict[:220]}')
print('total', dict(total))
for s, c in per_scene.items():
    print(f'  {s}: {dict(c)}')
print('not PASS:')
for o in other:
    print('  ', o)
