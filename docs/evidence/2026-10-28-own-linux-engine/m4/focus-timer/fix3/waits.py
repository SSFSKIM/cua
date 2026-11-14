#!/usr/bin/env python3
# The TARGETS wait of each paste in a probe sitting (runs.jsonl) or a matrix sitting (matrix.jsonl): how long the paste
# waited after its take for its target's TARGETS answer, the median, p95 and maximum, how many were never answered,
# and for each step of the ladder how many pastes would have gone out before their answer had the bound been that
# step; plus the outcomes and the pastes' answer time (probe sittings).
# usage: python3 -I waits.py <runs.jsonl | matrix.jsonl>...
import json
import statistics
import sys

LADDER = [5, 10, 25, 50, 100, 200, 500, 1000]


def q(values, p):
    values = sorted(values)
    return values[min(len(values) - 1, int(round(p * (len(values) - 1))))]


for path in sys.argv[1:]:
    rows = [json.loads(l) for l in open(path) if l.strip()]
    groups = {}
    for r in rows:
        if r.get('kind') == 'run':
            groups.setdefault('gnome-terminal', []).append(r)
        elif r.get('kind') == 'paste':
            groups.setdefault(r['target'], []).append(r)
    print(f'== {path}')
    for target, rs in groups.items():
        targets = [(r.get('paste') or {}).get('targets') if r.get('kind') == 'run' else r.get('targets') for r in rs]
        answered = [t['waited_ms'] for t in targets if t and t['answered']]
        never = sum(1 for t in targets if t and not t['answered'])
        missing = sum(1 for t in targets if not t)
        outcomes = {}
        for r in rs:
            key = r.get('outcome') or ('ok' if r.get('ok') else (r.get('error') or '')[:40])
            outcomes[key] = outcomes.get(key, 0) + 1
        line = f'  {target}: {len(rs)} pastes, outcomes {outcomes}; answered {len(answered)}, never {never}, no record {missing}'
        if answered:
            line += f'; wait ms median {statistics.median(answered):.2f}, p95 {q(answered, 0.95):.2f}, max {max(answered):.2f}'
            over = {step: sum(1 for w in answered if w > step) + never for step in LADDER}
            line += '; past each step: ' + ', '.join(f'{s} ms: {n}' for s, n in over.items())
        print(line)
        answers = [r['answered_ms'] for r in rs if r.get('kind') == 'run' and r.get('outcome') == 'ok']
        if answers:
            print(f'    passing runs answered in ms: median {statistics.median(answers):.1f}, p95 {q(answers, 0.95):.1f}')
