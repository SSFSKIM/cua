#!/usr/bin/env python3
# Task 89 (the controller's questions on V5's rerun): one cell's cua samples from a V5 results.jsonl (optionally .gz),
# every field but the page's drop_status (printed apart, its `after` log only), for the blocks and indices asked.
# usage: v5-dnd-samples.py <results.jsonl[.gz]> <op> <block> <i,i,...>
import gzip, json, sys

path, op, block, idx = sys.argv[1], sys.argv[2], int(sys.argv[3]), [int(x) for x in sys.argv[4].split(',')]
opener = gzip.open if path.endswith('.gz') else open
with opener(path, 'rt') as f:
    for line in f:
        r = json.loads(line)
        if r.get('kind') == 'sample' and r.get('engine') == 'cua' and r.get('op') == op and r.get('block') == block and r.get('i') in idx:
            ds = r.pop('drop_status', None)
            print(f"== {op} {block}/{r.get('i')} ({r.get('series')})")
            print(json.dumps(r, indent=None)[:6000])
            if ds:
                print('drop_status.after.log:', json.dumps((ds.get('after') or {}).get('log')))
                a = ds.get('after') or {}
                print('drop_status.after counts:', {k: a.get(k) for k in ('starts', 'drops', 'downs', 'ends', 'effect', 'dur', 'ups', 'at')})
            print()
