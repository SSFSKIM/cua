#!/usr/bin/env python3
"""Prints a sitting's focus-timer runs, filtered. usage: show-runs.py <sitting dir> [family[,family]] [lane] [max per series]"""
import glob
import json
import sys

sitting = sys.argv[1]
families = sys.argv[2].split(',') if len(sys.argv) > 2 and sys.argv[2] else None
lane = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] else None
limit = int(sys.argv[4]) if len(sys.argv) > 4 else 2
rows = []
for f in glob.glob(f'{sitting}/**/results.jsonl', recursive=True):
    rows += [json.loads(line) for line in open(f)]
seen = {}
for r in rows:
    if r.get('kind') != 'focus-timer-run':
        continue
    if families and r['family'] not in families:
        continue
    if lane and r['lane'] != lane:
        continue
    key = (r['family'], r['lane'], r['scenario'])
    seen[key] = seen.get(key, 0) + 1
    if seen[key] > limit:
        continue
    keep = {k: r.get(k) for k in ['trial', 'ok', 'miss', 'errors', 'expected', 'got', 'exact', 'click', 'caret_before', 'burst_ms']}
    print(r['family'], r['lane'], r['scenario'], json.dumps(keep)[:900])
    p = r.get('paste') or {}
    print('   paste', json.dumps({k: p.get(k) for k in ['observed', 'expected', 'confirmed', 'settle', 'confirm_rule']})[:600])
for r in rows:
    if r.get('kind') == 'focus-timer-audit' and not r.get('clean') and (not families or r['family'] in families):
        print('audit', r['family'], r['lane'], r.get('scenario'), json.dumps({k: r.get(k) for k in ['runs', 'problems', 'forbidden', 'sessions']})[:700])
