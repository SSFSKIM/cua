"""Per lane and family, how many readiness trials the engine took as kept offscreen, and how many first captures were
wrong. usage: offscreen-counts.py <results.jsonl>..."""
import collections
import json
import sys

for path in sys.argv[1:]:
    off, wrong = collections.Counter(), collections.Counter()
    for line in open(path):
        r = json.loads(line)
        if r.get('kind') != 'readiness-trial':
            continue
        if (r.get('capture') or {}).get('offscreen'):
            off[(r['lane'], r['family'])] += 1
        if r.get('ok') is False:
            wrong[(r['lane'], r['family'], r['condition'])] += 1
    print(path, 'offscreen:', dict(off), 'wrong:', dict(wrong))
