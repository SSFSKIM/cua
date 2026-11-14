#!/usr/bin/env python3
# Task 77: L3b's electron-input press_key desktop runs, the named trials in detail, and every trial's summary line.
import json, sys
rows = [json.loads(l) for l in open(sys.argv[1])]
want = {int(x) for x in sys.argv[2:]}
cell = 'electron-input press_key desktop'
for r in rows:
    if r.get('kind') == 'settle-run' and r.get('cell') == cell:
        b, a = r.get('before') or {}, r.get('after') or {}
        print(r['trial'], 'ok', r.get('ok'), 'landed', r.get('landed'), 'late', r.get('late_ms'), 'clean', r.get('desktop_clean'), 'front', r.get('front_active'), 'ans', r.get('answered_ms'), 'downs/ups', (b.get('key_downs'), b.get('key_ups')), '->', (a.get('key_downs'), a.get('key_ups')))
        if r['trial'] in want:
            for k in sorted(r.keys()):
                if k not in ('kind',):
                    print('    ', k, json.dumps(r[k])[:500])
