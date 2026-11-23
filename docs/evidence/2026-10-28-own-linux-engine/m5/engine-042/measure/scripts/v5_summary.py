"""Task 116: V5's two cells per condition and lane from join_samples.py's rows: samples, takes during the hold and how
those ended (cancelled before the drop in the cancel cell, dropped in front), the tail, no-dragstart, and the watch's
reports. Counts only.
  python3 -I v5_summary.py <label>=<samples.jsonl> ...
"""
import collections, json, sys

CANCELLED = 'began a drag and drop, which changes the desktop; it was cancelled before the drop'
print('| condition | cell | lane | samples | took before the hold | took during the hold | of those prevented | tail | no dragstart | late takes reported | unconfirmed-drop notices |')
print('|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|')
for arg in sys.argv[1:]:
    label, path = arg.split('=', 1)
    g = collections.defaultdict(collections.Counter)
    for l in open(path):
        r = json.loads(l)
        if r['source'] != 'v5':
            continue
        c = g[(r['cell'].replace('chrome_dnd_', '').replace('_shared', ''), r['lane'])]
        c['n'] += 1
        c[r['outcome']] += 1
        if r['outcome'] == 'took_hold':
            prevented = (CANCELLED in (r.get('error') or '')) if r['cell'] == 'chrome_dnd_shared' else (r.get('drops') or 0) > 0
            c['prevented'] += prevented
        late = r.get('late') or {}
        c['late_take'] += late.get('after_release_ms') is not None
        c['unconfirmed'] += bool(late.get('unconfirmed'))
    for (cell, lane), c in sorted(g.items()):
        print(f"| {label} | {cell} | {lane} | {c['n']} | {c['took_path']} | {c['took_hold']} | {c['prevented']} | {c['tail']} | {c['no_dragstart']} | {c['late_take']} | {c['unconfirmed']} |")
