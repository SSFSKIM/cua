"""Task 118 (ruling 918): the in-front cell's lost drops per engine and Chrome version, from stored V5 rows at arm64
twice the load: the drop rate (landed: the page's drop counter risen) and how each drag that did not land answered.
Counts only (no window title, no page text).
  python3 -I lost_drops.py <label>:<lane>=<run dir>[,<run dir>...] ...
The answers of a drag that did not land:
- unconfirmed: ok, with T14's pending unconfirmed-drop notice on the next read;
- other pending: ok, with another pending notice on the next read (named by its first words);
- hold notice: ok, with 0.4.2's hold notice on the reply;
- plain ok: ok and no notice at all, the false ok;
- refused: not ok (its error's first words).
"""
import collections, json, os, sys

OP = 'chrome_dnd_short_in_front_shared'
UNCONFIRMED = 'Pending from your last drag, an unconfirmed drop'


def num(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool)


def landed(r):
    ds = r.get('drop_status') or {}
    b, a = (ds.get('before') or {}).get('drops'), (ds.get('after') or {}).get('drops')
    return (a - b) > 0 if num(a) and num(b) else r.get('effect') is True


print('| engine / Chrome | runs | in-front n | landed | drop rate | lost | lost, unconfirmed notice | lost, hold notice | lost, other notice | lost, plain ok (false ok) | lost, refused | landed with the unconfirmed notice |')
print('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|')
others = []
for spec in sys.argv[1:]:
    head, dirs = spec.split('=', 1)
    label, lane = head.rsplit(':', 1)
    rows, runs = [], 0
    for d in dirs.split(','):
        runs += 1
        for line in open(os.path.join(d, 'run', 'results.jsonl')):
            r = json.loads(line)
            if r.get('kind') == 'sample' and r.get('op') == OP and r.get('engine') == lane:
                rows.append(r)
    c = collections.Counter()
    for r in rows:
        if landed(r):
            c['landed'] += 1
            c['landed_unc'] += bool((r.get('state_notice') or '').startswith(UNCONFIRMED))
            continue
        sn, rn = r.get('state_notice') or '', r.get('reply_notice') or ''
        if r.get('ok') is not True:
            c['refused'] += 1
            others.append((label, 'refused', (r.get('error') or '')[:90]))
        elif sn.startswith(UNCONFIRMED):
            c['unc'] += 1
        elif rn:
            c['hold'] += 1
        elif sn:
            c['other'] += 1
            others.append((label, 'other notice', sn[:90]))
        else:
            c['plain'] += 1
    n = len(rows)
    lost = n - c['landed']
    print(f"| {label} | {runs} | {n} | {c['landed']} | {100 * c['landed'] / n:.1f}% | {lost} ({100 * lost / n:.1f}%) | {c['unc']} | {c['hold']} | {c['other']} | {c['plain']} | {c['refused']} | {c['landed_unc']} |")
if others:
    print('\nThe other answers:')
    for x in collections.Counter(others).items():
        print('-', x)
