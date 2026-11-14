#!/usr/bin/env python3
"""The control-0ms paste misses of a sitting, by family and cause: how many had the text exact (the 8 keys in order,
and the paste whole after them when it was sent), and how many of the 8 keys the paste's observation had seen land
(its observed count less the count before the run, read from the paste's observed caret against the expected start).
usage: paste-misses.py <results.jsonl>..."""
import json
import re
import sys
from collections import Counter, defaultdict

rows = defaultdict(list)
for path in sys.argv[1:]:
    with open(path) as f:
        for line in f:
            r = json.loads(line)
            if r.get('kind') == 'focus-timer-run' and r['lane'] == 'control-0ms' and r['scenario'] == 'paste' and not r['ok']:
                rows[(r['family'], r['miss'])].append(r)

print('| family | cause | runs | keys exact and in order | paste text landed | text exact | keys the observation had seen land (of 8) |')
print('|---|---|---:|---:|---:|---:|---|')
for (family, miss), rs in sorted(rows.items()):
    keys = sum(1 for r in rs if (r['got']['a'] or '').startswith('abcDefgH'))
    landed = sum(1 for r in rs if 'Pasted' in (r['got']['a'] or ''))
    exact = sum(1 for r in rs if r['exact']['a'])
    seen = Counter()
    for r in rs:
        p = r.get('paste') or {}
        m = re.search(r'count: (\d+)', p.get('observed') or '')
        # Chromium's field is emptied before each run, so its observed count is the keys seen; elsewhere the caret
        # before the run is not on the row, and the count is not told apart
        seen[int(m.group(1)) if m and family in ('chrome', 'electron') else '?'] += 1
    print(f"| {family} | {miss} | {len(rs)} | {keys} | {landed} | {exact} | {', '.join(f'{k}: {n}' for k, n in sorted(seen.items(), key=str))} |")
