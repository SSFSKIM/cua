#!/usr/bin/env python3
"""The pipeline's median per family and scenario on two sittings' lanes, side by side: what a scenario's requests cost
end to end (the first request sent to the last answer). usage: latency.py <label>=<results.jsonl>:<lane>..."""
import json
import sys

cols = []
table = {}
for arg in sys.argv[1:]:
    label, rest = arg.split('=', 1)
    path, lane = rest.rsplit(':', 1)
    cols.append(label)
    with open(path) as f:
        for line in f:
            r = json.loads(line)
            if r.get('kind') == 'focus-timer-series' and r['lane'] == lane:
                table.setdefault((r['family'], r['scenario']), {})[label] = r.get('burst_ms_median')
print('| family | scenario | ' + ' | '.join(cols) + ' |')
print('|---|---|' + '---:|' * len(cols))
for (family, scenario), row in table.items():
    print(f'| {family} | {scenario} | ' + ' | '.join(str(row.get(c, '–')) for c in cols) + ' |')
