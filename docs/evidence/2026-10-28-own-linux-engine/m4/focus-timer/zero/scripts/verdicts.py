#!/usr/bin/env python3
"""Each series of one or more focus-timer sittings as a Markdown table row, and a per-family verdict per lane.
usage: verdicts.py <results.jsonl>..."""
import json
import sys

series = []
for path in sys.argv[1:]:
    with open(path) as f:
        for line in f:
            r = json.loads(line)
            if r.get('kind') == 'focus-timer-series':
                series.append(r)

print('| family | lane | scenario | runs | misses (independent), by cause | wrong text | raw misses | raw streak | verdict |')
print('|---|---|---|---:|---|---:|---:|---:|---|')
for s in series:
    causes = ', '.join(f'{c} {n}' for c, n in s['miss_causes'].items())
    verdict = f"{s['need']} consecutive" if s['reached'] else '**not reached**'
    print(f"| {s['family']} | {s['lane']} | {s['scenario']} | {s['runs']} | {s['misses']}{f' ({causes})' if causes else ''} | {s['wrong_text']} | {s['raw']['misses']} | {s['raw']['streak']} | {verdict} |")

print()
print('| family | timer | control-0ms |')
print('|---|---|---|')
families = list(dict.fromkeys(s['family'] for s in series))
for family in families:
    cells = []
    for lane in ['timer', 'control-0ms']:
        mine = [s for s in series if s['family'] == family and s['lane'] == lane]
        failed = [s['scenario'] for s in mine if not s['reached']]
        cells.append('passes' if mine and not failed else f"**misses** ({', '.join(failed)})" if mine else '–')
    print(f'| {family} | {cells[0]} | {cells[1]} |')
