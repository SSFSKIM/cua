# Task 148: the Electron rows' settle rests (drop_cursor.settle.rest_ms) tallied per step, from the counted rows alone,
# as a cross-check of the judge's settle line. usage: python3 -I rests.py <results.jsonl>...
import json, sys, collections
for f in sys.argv[1:]:
    t = collections.Counter(); n = 0; settled = 0
    for line in open(f):
        r = json.loads(line)
        if r.get('kind') != 'drop-signal' or r.get('family') != 'electron':
            continue
        n += 1
        s = (r.get('drop_cursor') or {}).get('settle')
        if s is None:
            t['no settle record'] += 1
            continue
        settled += 1
        t[s.get('rest_ms', 'absent')] += 1
    print(f"{f}: {n} Electron rows, {settled} with a settle record; rest_ms {dict(t)}")
