#!/usr/bin/env python3
"""Per family, the click runs after which the front window was no longer the active window (`front_active`), in
order. usage: front-active.py <results.jsonl>"""
import json
import sys

rows = [json.loads(line) for line in open(sys.argv[1]) if line.strip()]
by = {}
for r in rows:
    if r.get('kind') == 'focus-timer-run' and 'front_active' in r:
        by.setdefault((r['family'], r['lane'], r['scenario']), []).append(r)
for key, runs in by.items():
    lost = [r['trial'] for r in runs if not r['front_active']]
    print(key, 'runs', len(runs), 'front lost after', len(lost), 'first at trial', lost[0] if lost else None)
