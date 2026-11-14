#!/usr/bin/env python3
"""A sitting's progress: its series rows, and its runs counted per family, lane and kind, with the misses.
usage: show.py <results.jsonl>"""
import collections
import json
import sys

runs = collections.Counter()
misses = collections.Counter()
for line in open(sys.argv[1]):
    r = json.loads(line)
    kind = r.get('kind')
    if kind == 'qt-activation-run':
        key = (r['family'], r['lane'], r['input'])
        runs[key] += 1
        if not r['ok']:
            misses[key] += 1
    elif kind == 'qt-activation-series' or (kind not in ('qt-activation-run',) and 'lane' in r and 'streak' in r):
        keep = ['family', 'lane', 'input', 'runs', 'misses', 'streak', 'reached', 'activated', 'activation_requests',
                'refused', 'landed', 'ack_waited_median', 'ack_waited_max', 'ack_released_median', 'ack_released_max']
        print({k: r.get(k) for k in keep})
    elif kind == 'focus-timer-series':
        print({k: r.get(k) for k in ['family', 'lane', 'scenario', 'runs', 'misses', 'streak', 'reached', 'miss_causes']})
    elif kind == 'focus-timer-audit':
        print('audit', r['family'], r['lane'], r.get('scenario'), 'clean', r['clean'], r.get('problems'))
for key in sorted(runs):
    print(key, 'runs', runs[key], 'misses', misses[key])
