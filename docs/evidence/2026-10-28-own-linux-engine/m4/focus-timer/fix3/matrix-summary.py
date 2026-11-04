#!/usr/bin/env python3
# The matrix pass's table: for each family's X client, in how many pastes (into each target) it asked for TARGETS
# when the owner changed, and when (ms from the chord's dispatch; before it, negative, for the target itself); and per
# target family, whether the paste's own wait was answered, how long it waited, and the paste's outcome.
# usage: python3 -I matrix-summary.py <matrix.jsonl>
import collections
import json
import statistics
import sys

rows = [json.loads(l) for l in open(sys.argv[1]) if l.strip()]
meta = next(r for r in rows if r['kind'] == 'meta')
pastes = [r for r in rows if r['kind'] == 'paste']
families = list(meta['windows'])
targets_atom = next((q['target'] for p in pastes for q in p['requests'] if q['outcome'] == 'Targets'), None)
print(f"{meta['version']}, wait {meta['wait_ms']} ms, {meta['runs']} pastes per target, load {meta['load']}")
print('\nWho asked for TARGETS at an owner change: in pastes into another window (any time), and in its own pastes,')
print('by its first TARGETS request\'s time from the chord\'s dispatch: before (ms < 0), within the chord\'s millisecond')
print('(ms 0: the log\'s times are whole ms, so this is either side), after (ms > 0, its paste\'s own request).')
print('Whether the target\'s answer came before the chord is the engine\'s own targets.answered, per target below.')
for f in families:
    other = [p for p in pastes if p['target'] != f]
    own = [p for p in pastes if p['target'] == f]
    asked_other = [p for p in other if any(q['client'] == f and q['target'] == targets_atom for q in p['requests'])]
    first = [min((q['ms'] for q in p['requests'] if q['client'] == f and q['target'] == targets_atom), default=None) for p in own]
    before = sum(1 for ms in first if ms is not None and ms < 0)
    at_chord = sum(1 for ms in first if ms == 0)
    after = sum(1 for ms in first if ms is not None and ms > 0)
    line = f"  {f:18s} into others: {len(asked_other)}/{len(other)}"
    if own:
        line += f"; own, first TARGETS before / at 0 / after the chord: {before} / {at_chord} / {after} of {len(own)}"
    print(line)
print('\nOther requests (not TARGETS), by client and outcome:')
other = collections.Counter((q['client'], q['whose'], q['outcome']) for p in pastes for q in p['requests'] if q['target'] != targets_atom)
for k, v in sorted(other.items()):
    print(f'  {v:3d} {k}')
print('\nPer target: answered before the chord / pastes; wait ms median (max); outcomes:')
for f in families:
    ps = [p for p in pastes if p['target'] == f]
    if not ps:
        continue
    ans = [p for p in ps if p['targets'] and p['targets']['answered']]
    waits = [p['targets']['waited_ms'] for p in ps if p['targets']]
    outcomes = collections.Counter('ok' if p['ok'] else (p['error'] or '')[:60] for p in ps)
    print(f"  {f:18s} {len(ans)}/{len(ps)}; {statistics.median(waits):.1f} ({max(waits):.1f}); {dict(outcomes)}")
