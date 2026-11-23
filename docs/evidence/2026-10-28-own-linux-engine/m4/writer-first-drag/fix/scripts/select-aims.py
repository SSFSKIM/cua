"""The drag experiment's Writer `select` cell: each lane's runs by parity, the path's height and the text selected.
usage: python3 -I select-aims.py <results.jsonl>"""
import collections
import json
import sys

counts = collections.Counter()
for line in open(sys.argv[1]):
    r = json.loads(line)
    if r.get('kind') != 'drag-run' or r.get('drag') != 'select':
        continue
    counts[(r['engine'], r['i'] % 2, r['path'][0]['y'], r['after'])] += 1
for key, n in sorted(counts.items()):
    print(n, key)
