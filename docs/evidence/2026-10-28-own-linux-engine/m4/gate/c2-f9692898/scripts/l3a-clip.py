#!/usr/bin/env python3
# Task 77: L3a's chrome-text clipboard cells, run by run (the context menu that did not open at twice the load).
import json, sys, collections
rows = [json.loads(l) for l in open(sys.argv[1])]
kinds = collections.Counter(r.get('kind') for r in rows)
print('kinds', dict(kinds))
cell = [r for r in rows if 'clipboard' in json.dumps(r.get('cell', '')) and 'chrome-text' in json.dumps(r.get('cell', ''))]
print('clipboard rows', len(cell), collections.Counter(r.get('kind') for r in cell))
if cell:
    print('keys of first', sorted(cell[0].keys()))
for r in cell[:80]:
    ans = r.get('answers') or r.get('answer')
    print(r.get('kind'), r.get('cell'), r.get('trial', r.get('i')), 'class', r.get('class'), 'ok', r.get('ok'),
          'err', json.dumps(r.get('error') or (ans if not isinstance(ans, list) else [a.get('error') if isinstance(a, dict) else a for a in ans]))[:160],
          'ms', r.get('ms') or r.get('answer_ms'), 't', r.get('at') or r.get('t'))
