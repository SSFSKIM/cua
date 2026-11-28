#!/usr/bin/env python3
"""#228 task 2: the wait's distribution from `wait.py`'s rows, per scenario, of each run's first observation (the one
that asked and waited): the wait's end, its length, when content first came, the reads it made, the answer's nodes
and the whole request's length. Writes Markdown to stdout.

usage: summarize.py <wait.jsonl> [...]
"""
import json
import statistics
import sys


def spread(values):
    values = sorted(v for v in values if v is not None)
    if not values:
        return '-'
    if len(values) == 1:
        return f'{values[0]:g}'
    return f'{values[0]:g} / {statistics.median(values):g} / {values[-1]:g}'


rows = [json.loads(line) for path in sys.argv[1:] for line in open(path) if line.strip()]
print('| Scenario | Runs (passed) | First observation\'s end | Wait, ms (min / median / max) | Content after, ms | Reads | Nodes | Request, ms |')
print('|---|---:|---|---:|---:|---:|---:|---:|')
for scenario in dict.fromkeys(r['scenario'] for r in rows):
    mine = [r for r in rows if r['scenario'] == scenario]
    firsts = [r['reads'][0] for r in mine if r.get('reads')]
    waits = [f.get('wait') or {} for f in firsts]
    ends = {}
    for w in waits:
        ends[w.get('end', 'none')] = ends.get(w.get('end', 'none'), 0) + 1
    print(f"| {scenario} | {len(mine)} ({sum(r['passed'] for r in mine)}) | {', '.join(f'{k} {v}' for k, v in ends.items())} | "
          f"{spread(w.get('ms') for w in waits)} | {spread(w.get('content_ms') for w in waits)} | {spread(w.get('reads') for w in waits)} | "
          f"{spread(f['nodes'] for f in firsts)} | {spread(f['request_ms'] for f in firsts)} |")
