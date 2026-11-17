"""Task 79: a verdict step's speed tally, counted once from its run/summary.md: per cua verdict row, each series
(cold, warm) the verdict names as faster, within the bound or same within noise, and the PASS rows that name no series.
usage: python3 -I speed-tally.py <summary.md>..."""
import re
import sys

for path in sys.argv[1:]:
    faster = within = same = bare = rows = 0
    other = {}
    for line in open(path):
        c = [x.strip() for x in line.split('|')[1:-1]]
        if len(c) < 14 or c[2] != 'cua':
            continue
        rows += 1
        v = c[-1]
        series = re.findall(r'\b(cold|warm) (faster|within the bound|same)', v)
        for _, kind in series:
            if kind == 'faster':
                faster += 1
            elif kind == 'within the bound':
                within += 1
            else:
                same += 1
        if v.startswith('PASS') and not series:
            bare += 1
        if not v.startswith('PASS'):
            key = v.split(' ')[0].strip('*')
            other[key] = other.get(key, 0) + 1
    print(f'{path}: cua rows {rows}; series faster {faster}, within the bound {within}, same {same}; PASS rows naming no series {bare}; other verdicts {other}')
