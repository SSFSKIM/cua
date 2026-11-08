# Per head, over shared Safari clicks (page and #282's) and TextEdit: clicks, watch saw any raise during the guard or
# after, visible after the hold, guard repaired (restores > 0 or after release), capped, guard and latency quantiles.
import json, os, statistics as st, sys
from collections import defaultdict
agg = defaultdict(lambda: defaultdict(list))
for root, _, files in os.walk(sys.argv[1]):
    if 'results.json' not in files:
        continue
    rel = os.path.relpath(root, sys.argv[1]).split(os.sep)
    head = rel[1]
    for c in json.load(open(os.path.join(root, 'results.json')))['cells']:
        p = c.get('p321') or c
        dl, w = p.get('delivery'), p.get('watch')
        label = c.get('label', '')
        app = 'textedit' if 'textedit' in root.split('/')[-1] else 'chrome' if root.endswith('cft') else 'safari'
        if not dl or not w:
            continue
        s = agg[(head, app)]
        ch = w.get('changes') or []
        he = dl['holdStartedAt'] + dl['screenHoldMs']
        anyr = any(x.get('aboveFront') for x in ch)
        vis = any(x.get('aboveFront') and (ch[i + 1]['atMs'] if i + 1 < len(ch) else 1e18) > he for i, x in enumerate(ch))
        s['n'].append(1); s['any'].append(anyr); s['vis'].append(vis)
        s['rep'].append((dl.get('restores') or 0) > 0 or bool(dl.get('repairedAfterRelease')))
        s['cap'].append(bool(dl.get('capped'))); s['guard'].append(dl['guardMs']); s['hold'].append(dl['screenHoldMs'])
        if c.get('clickMs') is not None and 'cell' in c:
            s['ms'].append(c['clickMs'])
        tr = dl.get('transientRaise')
        if tr:
            s['seen'].append(bool(tr.get('seen'))); s['out'].append(bool(tr.get('outlivedHold')))
q = lambda xs, p: sorted(xs)[min(len(xs) - 1, int(p * len(xs)))]
for k in sorted(agg):
    s = agg[k]
    print(k, 'n', len(s['n']), 'watch any raise', sum(s['any']), 'visible', sum(s['vis']), 'repaired', sum(s['rep']), 'capped', sum(s['cap']),
          'seen', sum(s['seen']) if s['seen'] else '-', 'outlived', sum(s['out']) if s['out'] else '-',
          'hold p50/min', st.median(s['hold']), min(s['hold']), 'guard p50/p95/max', round(st.median(s['guard'])), round(q(s['guard'], .95)), round(max(s['guard'])),
          'latency p50/p95', (st.median(s['ms']), q(s['ms'], .95)) if s['ms'] else '-')
