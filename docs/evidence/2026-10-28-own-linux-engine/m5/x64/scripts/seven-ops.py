#!/usr/bin/env python3
# Task 89: item 3's seven listed operations (Acceptance 3: the 480-element gedit tree read, the 222-element Chrome
# read, the window screenshot, press_key, click, scroll, drag), each with the three medians of each series (cold, warm)
# from the verdict steps' run/summary.md rows: the pinned build, the newest build, cua. A markdown table.
# usage: seven-ops.py <summary.md>...
import re, sys

WANT = [('gedit', 'tree'), ('chrome', 'tree'), ('gedit', 'tree_shot'), ('chrome', 'tree_shot'), ('gedit', 'press_key'),
        ('chrome', 'press_key'), ('gedit', 'click'), ('chrome', 'click'), ('chrome-input', 'scroll'), ('chrome-input', 'drag')]
rows = {}
for path in sys.argv[1:]:
    step = re.search(r'/(V\d|Z0)\.', path)
    for line in open(path):
        c = [x.strip() for x in line.split('|')[1:-1]]
        if len(c) < 6 or (c[0], c[1]) not in WANT or (c[3] == '–' and c[4] == '–'):
            continue
        rows.setdefault((c[0], c[1]), {})[c[2]] = (c[3], c[4], c[-1][:70], step.group(1) if step else '?')
print('| scene | op | step | cold: pinned / newest / cua (ms) | warm: pinned / newest / cua (ms) | cua verdict |')
print('|---|---|---|---|---|---|')
for key in WANT:
    e = rows.get(key)
    if not e:
        print(f'| {key[0]} | {key[1]} | – | not found | | |')
        continue
    g = lambda n, i: e.get(n, ('–', '–', '', ''))[i]
    print(f"| {key[0]} | {key[1]} | {g('cua', 3)} | {g('pinned', 0)} / {g('newest', 0)} / {g('cua', 0)} | {g('pinned', 1)} / {g('newest', 1)} / {g('cua', 1)} | {g('cua', 2).replace('|', '/')} |")
