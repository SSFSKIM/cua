#!/usr/bin/env python3
"""The focus-timer sittings' series as Markdown rows: per family, lane and scenario, the independent and raw counts,
the misses by cause, and for a paste series its settle's cost (the waits and how soon after the window's last key the
paste came) and the pipeline's median. usage: verdicts.py <label>=<results.jsonl>..."""
import json
import sys

print('| sitting | family | lane | scenario | runs | misses (causes) | streak at the end | verdict | raw misses | raw streak | settle waited median / max ms | after the last key median ms | pipeline median ms |')
print('|---|---|---|---|---:|---|---:|---|---:|---:|---|---:|---:|')
for arg in sys.argv[1:]:
    label, path = arg.split('=', 1)
    with open(path) as f:
        for line in f:
            r = json.loads(line)
            if r.get('kind') != 'focus-timer-series':
                continue
            causes = ', '.join(f'{c} {n}' for c, n in (r.get('miss_causes') or {}).items())
            need = r.get('need', 30)
            if r['lane'] == 'control':
                verdict = f"control: {r['misses']}/{r['runs']} failed (text wrong in {r.get('wrong_text')})"
            else:
                verdict = f'{need} consecutive' if r['reached'] else '**not reached**'
            s = r.get('settle') or {}
            waited = f"{s.get('waited_median')} / {s.get('waited_max')}" if s else '–'
            after = s.get('after_key_median', '–') if s else '–'
            raw = r.get('raw') or {}
            print(f"| {label} | {r['family']} | {r['lane']} | {r['scenario']} | {r['runs']} | {r['misses']}{f' ({causes})' if causes else ''} | {r['streak']} | {verdict} | {raw.get('misses', '–')} | {raw.get('streak', '–')} | {waited} | {after} | {r.get('burst_ms_median')} |")
