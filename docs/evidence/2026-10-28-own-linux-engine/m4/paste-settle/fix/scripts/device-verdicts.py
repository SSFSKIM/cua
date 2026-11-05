#!/usr/bin/env python3
"""A device run's verdict rows per case: samples, passes, and for drag-and-drop cases the outcomes and late notices.
usage: device-verdicts.py <results.jsonl>"""
import json
import sys
from collections import defaultdict

rows = [json.loads(line) for line in open(sys.argv[1]) if line.strip()]
verdicts = defaultdict(lambda: {'n': 0, 'pass': 0})
for r in rows:
    if r.get('kind') == 'verdict' and r.get('candidate') == 'cua':
        v = verdicts[r['op']]
        v['n'] += 1
        v['pass'] += r.get('verdict') == 'pass'
        v.setdefault('reasons', set()).update([str(x)[:120] for x in (r.get('failures') or r.get('reasons') or [])])
for op, v in sorted(verdicts.items()):
    print(f"{op:48} verdicts {v['pass']}/{v['n']} {sorted(v.get('reasons', []))[:3]}")
samples = defaultdict(list)
for r in rows:
    if r.get('kind') == 'sample' and r.get('candidate') == 'cua' and 'dnd' in str(r.get('op')):
        samples[r['op']].append(r)
for op, rs in sorted(samples.items()):
    outs = [((r.get('stats') or {}).get('dnd') or {}).get('outcome') for r in rs]
    late = [bool((r.get('stats') or {}).get('late_dnd')) for r in rs]
    print(f"{op:48} samples {len(rs)} outcomes {outs} late_dnd {sum(late)}")
