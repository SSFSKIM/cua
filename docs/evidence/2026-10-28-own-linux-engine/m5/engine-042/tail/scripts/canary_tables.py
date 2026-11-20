"""Task 118 (ruling 907): the gate-form canary runs (gate.mjs run K1 / K2, --dev, arm64, private display), one row per
run: the Chrome gate.mjs read (`step.json` chrome), the Chrome the process record saw (procs/<part>.txt, the harness's
`chrome` executables), the in-front cell's canary (held presses, busy >= 5 ms, slow >= 20 ms) and the select control's,
each cell's verdict and reasons, and the step's exit. Then the pass rate per step and the busy share's spread.
  python3 -I canary_tables.py <task118 dir>
"""
import collections, glob, json, os, sys

T = sys.argv[1]
rows = []
for d in sorted(glob.glob(os.path.join(T, 'canary', 'k*-*', 'K*.development-run'))):
    part = os.path.basename(os.path.dirname(d))
    step = json.load(open(os.path.join(d, 'step.json')))
    exes = collections.Counter()
    pf = os.path.join(T, 'procs', f'{part}.txt')
    if os.path.exists(pf):
        for line in open(pf):
            f = line.split()
            if len(f) == 4 and f[3] == '1':
                exes[f[2]] += 1
    v = {}
    res = os.path.join(d, 'run', 'results.jsonl')
    if os.path.exists(res):
        for line in open(res):
            r = json.loads(line)
            if r.get('kind') == 'verdict' and r.get('candidate') == 'cua':
                v[r['op']] = r
    inf = v.get('chrome_dnd_short_in_front_shared') or {}
    sel = v.get('chrome_select_nudged_shared') or {}
    c, s = inf.get('hold_canary') or {}, sel.get('hold_canary') or {}
    rows.append({'part': part, 'step': step.get('step'), 'chrome': step.get('chrome'), 'exes': dict(exes), 'exit': step.get('exit'),
                 'held': c.get('held'), 'busy': c.get('busy'), 'slow': c.get('slow'), 'inf': inf.get('verdict'),
                 'inf_reasons': inf.get('reasons') or [], 'drops': inf.get('drops'),
                 'sel_held': s.get('held'), 'sel_slow': s.get('slow'), 'sel_cold_slow': s.get('cold_slow'), 'sel': sel.get('verdict'),
                 'sel_reasons': sel.get('reasons') or []})

print('| run | step | Chrome (gate.mjs) | harness Chrome executables (process record: processes) | in front: busy / held (slow >= 20 ms) | in front verdict | select: slow / held (cold) | select verdict | exit |')
print('|---|---|---|---|---|---|---|---|---:|')
for r in rows:
    ex = '; '.join(f'{k}: {n}' for k, n in r['exes'].items()) or 'none recorded'
    print(f"| {r['part']} | {r['step']} | {r['chrome']} | {ex} | {r['busy']} / {r['held']} ({r['slow']}) | {r['inf']} | "
          f"{r['sel_slow']} / {r['sel_held']} ({r['sel_cold_slow']}) | {r['sel']} | {r['exit']} |")

print('\n| step | runs | both cells pass | in-front canary floor met (busy x 2 >= held, held >= 3) | busy / held, lowest share | busy / held, pooled | select fast on every warm held drag |')
print('|---|---:|---:|---:|---|---|---:|')
for st in sorted({r['step'] for r in rows}):
    g = [r for r in rows if r['step'] == st]
    met = [r for r in g if r['held'] is not None and r['held'] >= 3 and r['busy'] * 2 >= r['held']]
    shares = [(r['busy'] / r['held'], r) for r in g if r['held']]
    low = min(shares, key=lambda x: x[0])[1] if shares else None
    print(f"| {st} | {len(g)} | {sum(1 for r in g if r['inf'] == 'pass' and r['sel'] == 'pass')} | {len(met)} | "
          f"{f'{low['busy']} / {low['held']} ({low['part']})' if low else '–'} | {sum(r['busy'] or 0 for r in g)} / {sum(r['held'] or 0 for r in g)} | "
          f"{sum(1 for r in g if r['sel'] == 'pass')} |")

failed = [r for r in rows if r['inf'] != 'pass' or r['sel'] != 'pass']
print('\nReasons of every cell that did not pass:' if failed else '\nEvery cell of every run passed.')
for r in failed:
    print(f"- {r['part']}: in front {r['inf']} {r['inf_reasons']}; select {r['sel']} {r['sel_reasons']}")
