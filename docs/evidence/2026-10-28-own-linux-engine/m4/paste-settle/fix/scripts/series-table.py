#!/usr/bin/env python3
"""A sitting's focus-timer series so far, one line each (family lane scenario runs misses causes settle), and the
runs of a series still going. usage: series-table.py <results.jsonl>"""
import json
import sys
from collections import defaultdict

rows = [json.loads(line) for line in open(sys.argv[1]) if line.strip()]
done = set()
for r in rows:
    if r.get('kind') == 'focus-timer-series':
        done.add((r['family'], r['lane'], r['scenario']))
        s = r.get('settle') or {}
        print(f"{r['family']:15} {r['lane']:10} {r['scenario']:12} runs {r['runs']:3} misses {r['misses']:3} reached {r['reached']!s:5} raw {r['raw']['misses']:3} causes {r.get('miss_causes')} wait {s.get('waited_median')} after_click {s.get('after_click_median')}")
running = defaultdict(list)
for r in rows:
    if r.get('kind') == 'focus-timer-run' and (r['family'], r['lane'], r['scenario']) not in done:
        running[(r['family'], r['lane'], r['scenario'])].append(r)
for key, runs in running.items():
    print('running', key, len(runs), 'misses', sum(not r['ok'] for r in runs), [r.get('miss') for r in runs if not r['ok']][:10])
for r in rows:
    if r.get('kind') in ('focus-timer-not-applicable', 'focus-timer-skipped'):
        print(r['kind'], r['family'], r.get('scenario'), r['why'][:120])
