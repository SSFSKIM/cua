#!/usr/bin/env python3
# Task 77: V5's chrome_dnd_late_take_shared samples, cua lane, in detail (the drop the witness did not record).
import json, sys
path = sys.argv[1]
want = set(sys.argv[2:])  # "block/i" keys, empty: all
rows = [json.loads(l) for l in open(path)]
rows = [r for r in rows if r.get('op') == 'chrome_dnd_late_take_shared' and r.get('block') is not None]
for r in rows:
    key = f"{r.get('block')}/{r.get('i')}"
    if want and key not in want:
        continue
    print('==', key, r.get('engine') or r.get('label'), 'ok', r.get('ok'), 'dropped', r.get('dropped'), 'witness', r.get('witness'), 'ms', r.get('ms'))
    print('   keys', sorted(r.keys()))
    for k in ('drop_status', 'dnd', 'hold', 'press', 'route', 'late_watch', 'untied_stats', 'witness_fields', 'witness_changes', 'witness_after_changes'):
        if k in r:
            print('  ', k, json.dumps(r[k])[:1400])
    es = r.get('engine_stats')
    if es:
        print('   engine_stats', json.dumps({k: v for k, v in es.items() if k != 'bus'})[:1800])
