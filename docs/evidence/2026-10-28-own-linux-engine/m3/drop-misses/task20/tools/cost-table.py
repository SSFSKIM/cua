# cost-table.py <cost.jsonl>: per kind and lane, the median answer time, its difference from `base`, and the effect.
import json, sys, statistics, collections
rows = [json.loads(l) for l in open(sys.argv[1]) if l.strip()]
by = collections.defaultdict(list)
for r in rows:
    by[(r['kind'], r['lane'])].append(r)
lanes = list(dict.fromkeys(r['lane'] for r in rows))
kinds = list(dict.fromkeys(r['kind'] for r in rows))
def took(r):
    k = r['kind']
    if k.startswith('chrome-dnd'):
        return isinstance(r['before'], int) and r['after'] == r['before'] + 1
    if k == 'chrome-select-40':
        return isinstance(r['after'], str) and r['after'] not in ('', 'none') and r['after'] != r['before']
    if k == 'chrome-range-40':
        return r['after'] != r['before']
    return None
print('| kind | lane | n | ok | took effect | median ms | vs base (ms) |')
print('|---|---|---:|---:|---:|---:|---:|')
for k in kinds:
    base = statistics.median([r['ms'] for r in by[(k, 'base')]]) if by[(k, 'base')] else None
    for l in lanes:
        rs = by[(k, l)]
        if not rs:
            continue
        med = statistics.median([r['ms'] for r in rs])
        eff = [took(r) for r in rs]
        effs = '-' if all(e is None for e in eff) else f"{sum(1 for e in eff if e)}/{len(rs)}"
        print(f"| {k} | {l} | {len(rs)} | {sum(1 for r in rs if r['ok'])} | {effs} | {med:.1f} | {med - base:+.1f} |")
