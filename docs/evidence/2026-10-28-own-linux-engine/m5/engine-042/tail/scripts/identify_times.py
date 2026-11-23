"""Task 118 (the final review of wave 5): how long the engine's browser identification took on every sample of a block
(`engine_stats.browser_identity.ms`), per Chrome version and run kind: the max, and every one past 50 ms (wave 6
counts an identification that finishes past 50 ms as none). Counts and times only.
  python3 -I identify_times.py <block dir: runs/ and canary/ beneath it>
"""
import collections, glob, json, os, sys

B = sys.argv[1]
kinds = [('156', 'V5 2x', glob.glob(f'{B}/runs/v5*-156-*/run/results.jsonl')), ('158', 'V5 2x', glob.glob(f'{B}/runs/v5*-158-*/run/results.jsonl')),
         ('156', 'K1', glob.glob(f'{B}/canary/k1-*/K1*/run/results.jsonl')), ('158', 'K2', glob.glob(f'{B}/canary/k2-*/K2*/run/results.jsonl'))]
print('| Chrome | runs | samples with a record | asked the bus (not cached) | max ms | max ms, held samples | over 50 ms |')
print('|---|---|---:|---:|---:|---:|---:|')
over = []
for ver, kind, paths in kinds:
    ms, held, bus = [], [], 0
    for p in sorted(paths):
        run = p.split('/')[-4] if '/canary/' in p else p.split('/')[-3]
        for line in open(p):
            r = json.loads(line)
            if r.get('kind') != 'sample' or r.get('engine') != 'cua':
                continue
            es = r.get('engine_stats') or {}
            bi = es.get('browser_identity')
            if not isinstance(bi, dict) or not isinstance(bi.get('ms'), (int, float)):
                continue
            ms.append(bi['ms'])
            bus += bool(bi.get('bus'))
            h = (es.get('hold') or {}).get('held') is True
            if h:
                held.append(bi['ms'])
            if bi['ms'] > 50:
                over.append((ver, kind, run, r['op'], r.get('block'), r.get('i'), round(bi['ms'], 1), h, bi.get('cached'), bi.get('bus')))
    print(f"| {ver} | {kind} ({len(paths)}) | {len(ms)} | {bus} | {round(max(ms), 1) if ms else '–'} | {round(max(held), 1) if held else '–'} | {sum(1 for x in ms if x > 50)} |")
print('\nEvery identification past 50 ms:' if over else '\nNo identification took more than 50 ms.')
for o in over:
    print('-', o)
