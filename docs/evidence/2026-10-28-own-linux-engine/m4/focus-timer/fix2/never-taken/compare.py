#!/usr/bin/env python3
# The proxy's cost and the engine-side signature, per sitting, from runs.jsonl alone (so a sitting with no proxy is
# read the same way): outcomes; for each run the target's TARGETS request in the engine's own log (`target … Targets
# … +Nms`, ms after the chord's dispatch, 0 for one at or before it) and whether the target asked for data; medians of
# the confirmation's time and the answer's.
# usage: python3 -I compare.py <run dir>...
import json
import re
import statistics
import sys

ENTRY = re.compile(r'^(target|other) (0x[0-9a-f]+) (\d+) (\w+) t(\d+) \+(\d+)ms$')

for d in sys.argv[1:]:
    rows = [json.loads(l) for l in open(f'{d}/runs.jsonl') if l.strip()]
    meta = next(r for r in rows if r['kind'] == 'meta')
    runs = [r for r in rows if r['kind'] == 'run']
    by = {}
    sig = {}
    for r in runs:
        by[r['outcome']] = by.get(r['outcome'], 0) + 1
        log = [ENTRY.match(e).groups() for e in ((r['paste'] or {}).get('log') or [])]
        targets = [int(e[5]) for e in log if e[0] == 'target' and e[3] == 'Targets']
        data = [e for e in log if e[0] == 'target' and e[3] != 'Targets']
        key = (r['outcome'], 'targets after dispatch' if targets and targets[0] > 0 else 'targets at or before dispatch' if targets else 'no targets', 'data asked' if data else 'no data asked')
        sig[key] = sig.get(key, 0) + 1
    ok = [r for r in runs if r['outcome'] == 'ok']
    conf = [r['paste']['confirm_ms'] for r in ok if r['paste'] and r['paste'].get('confirm_ms') is not None]
    ans = [r['answered_ms'] for r in ok]
    print(f"== {d}: proxy {meta['proxy']}, runs {len(runs)}, outcomes {by}")
    for k, v in sorted(sig.items()):
        print(f'   {v:4d}  {k}')
    if ok:
        print(f'   ok runs: confirm_ms median {statistics.median(conf):.1f} (p90 {sorted(conf)[int(0.9 * len(conf))]:.1f}); answered_ms median {statistics.median(ans):.1f}')
