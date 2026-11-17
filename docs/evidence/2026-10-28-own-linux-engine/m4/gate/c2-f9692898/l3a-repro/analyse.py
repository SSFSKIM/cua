#!/usr/bin/env python3
# Task 77: a reproduction's clipboard_read runs in order, and the Chrome application's children around them (menus.jsonl).
import json, sys
d = sys.argv[1]
rows = [json.loads(l) for l in open(f'{d}/results.jsonl')]
for r in rows:
    if r.get('kind') == 'settle-run':
        a = (r.get('answers') or [{}])[0]
        if not r['ok'] or r['trial'] >= int(sys.argv[2] if len(sys.argv) > 2 else 0):
            print('run', r['trial'], r['ok'], a.get('error'), r.get('answered_ms'))
    if r.get('kind') == 'settle-audit':
        print('audit', json.dumps({k: r.get(k) for k in ('pass', 'failed', 'requests')})[:400])
print('--- menus.jsonl, from the first change with a non-frame child')
m = [json.loads(l) for l in open(f'{d}/menus.jsonl')]
for x in m:
    if 'children' in x:
        kids = [(c['path'].split('/')[-1], c['role'], c.get('count'), c.get('showing'), c.get('visible'), c.get('menu_items')) for c in x['children'] if c['role'] != 'frame']
        print(x['wall'] % 10**7, x['poll'], kids)
    else:
        print(x)
