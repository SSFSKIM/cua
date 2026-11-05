# stray-table.py <run-dir>...: per engine, the mode of each drag against where the stray event fell relative to the
# drag's first motion past Blink's 4 px threshold, both in ms after the press on the X server's clock (from analyze.mjs
# --json, the nudge's XTEST motion; the popup's crossing from crossing.jsonl).
import json, subprocess, sys, collections
T = '/Users/new/.local/share/cua-171/task20'
tab = collections.defaultdict(lambda: collections.Counter())
for d in sys.argv[1:]:
    out = subprocess.run(['node', f'{T}/analyze.mjs', d, '--json'], capture_output=True, text=True).stdout
    for line in out.splitlines():
        if not line.startswith('{'):
            continue
        r = json.loads(line)
        x = r.get('x') or {}
        s, c = x.get('stray'), x.get('cross')
        if s is None or c is None:
            where = 'unknown'
        else:
            where = 'before' if s < c else 'same ms' if s == c else 'after'
        tab[(r['engine'].split(':')[0], where)][r['mode']] += 1
for (eng, where), modes in sorted(tab.items()):
    n = sum(modes.values())
    print(f"{eng:8} stray {where:8} the first motion past 4 px: {n:3} drags, A {modes['A']}, L {modes['L']}, B {modes['B']}")
