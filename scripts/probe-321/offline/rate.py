# #321 offline: per cell (engine/<mode>/<kind>, raw/<step>), how many clicks moved a Safari window above a TextEdit
# window (and above TextEdit's front window), the first click of a batch against later ones, whether the move reverted
# within the 3 s watch, whether the front app changed; and for each move its time after the watch began and against the
# engine's delivery record (hold start, first event posted, release) or the raw step's own times.
#   python3 -I rate.py <run dir>
import json
import os
import sys

rows = []
for root, _, files in os.walk(sys.argv[1]):
    if 'results.json' in files and root.endswith('p321'):
        art = os.path.relpath(root, sys.argv[1]).split(os.sep)[0]
        rows += [dict(r, art=art) for r in json.load(open(os.path.join(root, 'results.json')))['cells'] if 'i' in r]

for cell in sorted({r['cell'] for r in rows}):
    sel = [r for r in rows if r['cell'] == cell]
    moved = [r for r in sel if r.get('moved')]
    firsts = [r for r in sel if r['i'] == 1]
    answers = {}
    for r in sel:
        a = (r.get('answer') or {}).get('answer') or ('raw' if r.get('raw') else 'none')
        reason = ((r.get('answer') or {}).get('elementClick') or {}).get('reason')
        key = f'{a}/{reason}' if reason else a
        answers[key] = answers.get(key, 0) + 1
    print(f"{cell}: moved {len(moved)}/{len(sel)} (above TextEdit's front window {sum(bool(r.get('movedAboveFront')) for r in sel)}), "
          f"first clicks {sum(bool(r.get('moved')) for r in firsts)}/{len(firsts)}, later {sum(bool(r.get('moved')) for r in sel if r['i'] > 1)}/{len(sel) - len(firsts)}; "
          f"reverted {sum(bool(r.get('reverted')) for r in moved)}/{len(moved)}; front changed {sum(bool(r.get('frontChanged')) for r in sel)}; "
          f"TextEdit windows {sorted({(r.get('before') or {}).get('textEditWindows') for r in sel}, key=str)}; resets {sum(bool(r.get('reset')) for r in sel)}; "
          f"problems {sum(bool(r.get('problem') or r.get('exception')) for r in sel)}; answers {answers}")
    for r in moved:
        d = r.get('delivery') or {}
        rel = {k: round(r['movedAt'] - d[k]) for k in ('holdStartedAt', 'postedAt', 'releasedAt') if isinstance(d.get(k), (int, float))}
        steps = {s['step']: round(r['movedAt'] - s['atMs']) for s in ((r.get('raw') or {}).get('steps') or []) if 'atMs' in s}
        sent = round(r['movedAt'] - r['clickSentAt']) if r.get('clickSentAt') else None
        print(f"    {r['art']} {r['label']}: +{round(r['movedAt'] - r['goAt'])} ms after the watch began; after send {sent}; "
              f"after delivery {rel or '-'}; after raw steps {steps or '-'}; reverted {r.get('reverted')}; raiseLeft {d.get('raiseLeft')} restores {d.get('restores')}; "
              f"order {[c['order'] for c in r['watch']['changes'] if c.get('aboveAny')][:1]}")
