"""Task 118 (ruling 917): the in-front cell's witness failures and unconfirmed-drop notices per head and Chrome version,
from V5's stored rows. Counts, fields and times only (no window title, no page text).
  python3 -I witness_tables.py <head>/<version>=<run dir>[,<run dir>...] ...
"""
import collections, json, os, sys

OP = 'chrome_dnd_short_in_front_shared'


def num(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool)


def drops(r):
    ds = r.get('drop_status') or {}
    b, a = (ds.get('before') or {}).get('drops'), (ds.get('after') or {}).get('drops')
    return a - b if num(a) and num(b) else None


print('| head / Chrome | in-front n | witness failed | its fields (samples) | of the failed: dropped (page) / not | of the failed: ok plain / unconfirmed notice / hold notice | unconfirmed-drop notices, n (rate) | of those: dropped anyway (page) |')
print('|---|---:|---:|---|---|---|---|---:|')
detail = []
for spec in sys.argv[1:]:
    label, dirs = spec.split('=', 1)
    rows = []
    for d in dirs.split(','):
        for line in open(os.path.join(d, 'run', 'results.jsonl')):
            r = json.loads(line)
            if r.get('kind') == 'sample' and r.get('op') == OP and r.get('engine') == 'cua':
                r['_run'] = os.path.basename(os.path.normpath(d))
                rows.append(r)
    failed = [r for r in rows if r.get('witness') is False]
    fields = collections.Counter(f for r in failed for f in (r.get('witness_fields') or []))
    fd = sum(1 for r in failed if (drops(r) or 0) > 0)
    kinds = collections.Counter('unconfirmed' if r.get('state_notice') else 'hold' if r.get('reply_notice') else 'plain' for r in failed if r.get('ok'))
    unc = [r for r in rows if r.get('state_notice')]
    ud = sum(1 for r in unc if (drops(r) or 0) > 0)
    print(f"| {label} | {len(rows)} | {len(failed)} | {', '.join(f'{k} ({v})' for k, v in fields.most_common())} | {fd} / {len(failed) - fd} | "
          f"{kinds['plain']} / {kinds['unconfirmed']} / {kinds['hold']} | {len(unc)} ({100 * len(unc) / len(rows):.1f}%) | {ud} |")
    for r in failed:
        ch = collections.Counter(c.get('field') for c in r.get('witness_changes') or [])
        detail.append((label, r['_run'], r.get('block'), r.get('i'), r.get('series'), r.get('ok'), drops(r), r.get('effect'),
                       'unconfirmed' if r.get('state_notice') else 'hold' if r.get('reply_notice') else 'none',
                       r.get('witness_fields'), dict(ch), len(r.get('witness_restacks') or []),
                       [(f.get('kind'), f.get('source')) for f in (r.get('witness_focus') or [])][:4], r.get('witness_allowed')))
print('\nEvery witness failure: (head/Chrome, run, block, i, series, ok, page drops, effect, notice, fields, changes by field, restacks, focus events (kind, source), allowed)')
for x in detail:
    print('-', json.dumps(x))
