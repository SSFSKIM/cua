#!/usr/bin/env python3
# Step 1 of the never-taken probe: every paste run in fix2/'s sittings, by sitting, family and lane: successes, own
# misses (by kind), retry-guard refusals; and whether every own miss is the never-taken kind.
# usage: python3 -I tabulate.py <results.jsonl>...
import collections
import json
import sys


def kind(r):
    """ok; refused (no paste record: refused before dispatch, the retry guard's refusal among them); never-taken
    (transfer ended, nothing after the keys); landed-unconfirmed (the paste's text exact, the answer unconfirmed);
    partial; other."""
    p = r.get('paste') or {}
    errs = ' '.join(r.get('errors') or [])
    if r['ok']:
        return 'ok'
    if not p:
        return 'refused:' + errs[:80]
    exp = r['expected']['a']
    got = r['got']['a']
    pasted = exp[len('abcDefgH'):]
    if p.get('transfer') == 'ended' and got == exp[: len(exp) - len(pasted)]:
        return 'never-taken'
    if got == exp:
        return 'landed-unconfirmed(transfer=%s)' % p.get('transfer')
    if pasted and pasted[:1] in got[len('abcDefgH'):]:
        return 'partial(%r)' % got
    return 'other(transfer=%s,got=%r)' % (p.get('transfer'), got)


for path in sys.argv[1:]:
    rows = [json.loads(l) for l in open(path) if l.strip()]
    runs = [r for r in rows if r.get('kind') == 'focus-timer-run' and r.get('scenario') == 'paste']
    if not runs:
        continue
    print('==', path)
    by = collections.defaultdict(list)
    for r in runs:
        by[(r['family'], r['lane'])].append(r)
    for key, rs in by.items():
        c = collections.Counter()
        seq = []
        for r in rs:
            k = kind(r)
            c[k] += 1
            seq.append((r['trial'], k, (r.get('paste') or {}).get('transfer'), (r.get('paste') or {}).get('requests'),
                        (r.get('paste') or {}).get('attributed'), r['errors'][:1]))
        print(' ', key, 'runs', len(rs), dict(c))
        for s in seq:
            if s[1] != 'ok':
                print('     ', s)
    series = [r for r in rows if r.get('kind') == 'focus-timer-series' and r.get('scenario') == 'paste']
    for s in series:
        print('  series', s['family'], s['lane'], 'runs', s['runs'], 'misses', s['misses'], 'streak', s['streak'],
              'reached', s['reached'], 'raw', s.get('raw'), 'causes', s.get('miss_causes'))
