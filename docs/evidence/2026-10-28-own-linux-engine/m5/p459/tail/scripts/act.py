#!/usr/bin/env python3
# Task 130: per lane of a p459 set, Chrome's activation after the release (any within the row's read), and the image
# Chrome's cursor showed just before the drag-end cursor (no-drop bd1d.. or accept 1dc3..), split by right and wrong rows.
#   python3 act.py <set dir>
import json, os, sys, glob, gzip
from collections import Counter, defaultdict
d = sys.argv[1]
OUT = {'left', 'long-left', 'inzone-out'}
per = defaultdict(Counter)
for lane in sorted(os.listdir(d)):
    for f in glob.glob(os.path.join(d, lane, 'r*', 'run', 'results.jsonl*')):
        op = gzip.open if f.endswith('.gz') else open
        for line in op(f, 'rt'):
            if '"kind":"drop-signal"' not in line:
                continue
            r = json.loads(line)
            c = per[(lane, r['cell'])]
            c['drags'] += 1
            act = (r.get('signals') or {}).get('activation_after_release_ms') is not None
            c['activated'] += act
            cur = [x for x in (r.get('signals') or {}).get('cursors', []) if not x['named']]
            ends = [i for i, x in enumerate(cur) if x['image'].startswith('b46b') and x['t_ms'] > 150]
            prev = cur[ends[0] - 1]['image'][:4] if ends and ends[0] > 0 else 'none'
            c['end-on-' + {'bd1d': 'nodrop', '1dc3': 'accept'}.get(prev, 'other')] += 1
print('| lane | cell | drags | Chrome activated after the release | ended on the no-drop image | ended on the accept image | other |')
print('|---|---|---:|---:|---:|---:|---:|')
for (lane, cell), c in sorted(per.items()):
    print(f"| {lane} | {cell} | {c['drags']} | {c['activated']} | {c['end-on-nodrop']} | {c['end-on-accept']} | {c['end-on-other']} |")
