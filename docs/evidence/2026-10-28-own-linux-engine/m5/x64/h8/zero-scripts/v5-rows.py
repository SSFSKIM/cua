#!/usr/bin/env python3
"""x64 V5 at H8: V5's verdict rows read from its results (read-only): how many verdict rows and how they read, any row
not pass, span-limited samples, premise exclusions, and the identification counts of the adaptive holds.
usage: v5-rows.py <results.jsonl[.gz]>
"""
import collections
import gzip
import json
import sys

f = sys.argv[1]
op = gzip.open if f.endswith('.gz') else open
rows = [json.loads(l) for l in op(f, 'rt') if l.strip()]
kinds = collections.Counter(r.get('kind') for r in rows)
print('kinds:', dict(kinds))
ver = [r for r in rows if r.get('kind') in ('verdict', 'device-verdict')]
print('verdict rows:', len(ver), 'by verdict:', dict(collections.Counter(str(r.get('verdict', r.get('pass'))) for r in ver)))
for r in ver:
    v = str(r.get('verdict', r.get('pass')))
    if v not in ('pass', 'True', 'PASS'):
        print('  not pass:', r.get('engine'), r.get('scene'), r.get('op'), v, json.dumps(r.get('findings') or r.get('why'))[:300])
span = [(r.get('engine'), r.get('op'), r.get('span_limited')) for r in ver if r.get('span_limited')]
print('span-limited:', json.dumps(span)[:800])
prem = [(r.get('engine'), r.get('op'), r.get('premise_excluded') or r.get('excluded')) for r in ver if r.get('premise_excluded') or r.get('excluded')]
print('premise exclusions:', json.dumps(prem)[:800])
ident = collections.Counter()
def visit(v):
    if isinstance(v, list):
        for x in v:
            visit(x)
    elif isinstance(v, dict):
        a = v.get('adaptive')
        if isinstance(a, dict) and isinstance(a.get('source'), dict) and 'identified' in a['source']:
            s = a['source']
            ident['identified' if s['identified'] else f"unidentified: {str(s.get('why') or s.get('by'))[:100]}"] += 1
        for x in v.values():
            visit(x)
for r in rows:
    visit(r)
print('identification (adaptive holds):', dict(ident))
