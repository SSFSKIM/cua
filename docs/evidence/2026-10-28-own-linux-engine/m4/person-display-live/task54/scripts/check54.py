#!/usr/bin/python3 -I
# Task 54: the checks of task 53's report ("What the live proof must run and check") on device-gtk4's results.jsonl:
# every audit row (engine, op, clean, foreign, foreign_parents, ancestry, kind, route), the cua samples of
# gtk4_click_dedicated with their witness fields, allowances and quiet-span changes, and every sample anywhere whose
# allowance lists "focus after the request". Ids and fields only; no title is in these rows.
# usage: check54.py <results.jsonl>
import json, sys

rows = [json.loads(l) for l in open(sys.argv[1])]
print('rows', len(rows), 'kinds', sorted({r.get('kind') for r in rows}))
print('== audits')
for r in rows:
    if r.get('kind') != 'audit':
        continue
    print(r.get('engine'), r.get('scene'), r.get('op'), 'audit', r.get('audit'), 'route', r.get('route'), 'clean', r.get('clean'),
          'foreign', r.get('foreign'), 'parents', r.get('foreign_parents'), 'ancestry', r.get('ancestry'),
          'forbidden', [f.get('what') if isinstance(f, dict) else f for f in r.get('forbidden', [])][:4], 'requests', r.get('requests'),
          'unplaced', r.get('xtest_unplaced'), 'ok', r.get('ok'))
print('== gtk4_click_dedicated cua samples')
for r in rows:
    if r.get('kind') == 'sample' and r.get('op') == 'gtk4_click_dedicated' and r.get('engine') == 'cua':
        print('block', r.get('block'), 'series', r.get('series'), 'i', r.get('i'), 'cold', r.get('cold'), 'ok', r.get('ok'),
              'effect', r.get('effect'), 'witness', r.get('witness'), 'fields', r.get('witness_fields'),
              'allowed', r.get('witness_allowed'), 'after', json.dumps(r.get('witness_after_changes')))
print('== every sample whose allowance lists focus after the request')
n = 0
for r in rows:
    if r.get('kind') == 'sample' and 'focus after the request' in (r.get('witness_allowed') or []):
        n += 1
        print(r.get('engine'), r.get('scene'), r.get('op'), 'block', r.get('block'), 'i', r.get('i'), 'witness', r.get('witness'),
              'after', json.dumps(r.get('witness_after_changes')), 'focus', json.dumps(r.get('witness_focus'))[:600])
print('count', n)
print('== samples with witness false')
for r in rows:
    if r.get('kind') == 'sample' and r.get('witness') is False:
        print(r.get('engine'), r.get('scene'), r.get('op'), 'block', r.get('block'), 'i', r.get('i'), 'fields', r.get('witness_fields'),
              'changes', json.dumps(r.get('witness_changes'))[:800], 'after', json.dumps(r.get('witness_after_changes'))[:800])
