# Per head: the activation-to-events gap (postedAt - holdStartedAt) and the hold left after the events
# (releasedAt - postedAt) over every delivery record, and the visible raises against that gap.
import json, os, statistics as st, sys
from collections import defaultdict
g = defaultdict(list)
for root, _, files in os.walk(sys.argv[1]):
    if 'results.json' not in files:
        continue
    head = os.path.relpath(root, sys.argv[1]).split(os.sep)[1]
    for c in json.load(open(os.path.join(root, 'results.json')))['cells']:
        p = c.get('p321') or c
        dl, w = p.get('delivery'), p.get('watch')
        if not dl or not w:
            continue
        ch = w.get('changes') or []
        he = dl['holdStartedAt'] + dl['screenHoldMs']
        vis = any(x.get('aboveFront') and (ch[i + 1]['atMs'] if i + 1 < len(ch) else 1e18) > he for i, x in enumerate(ch))
        g[head].append((dl['postedAt'] - dl['holdStartedAt'], dl['releasedAt'] - dl['postedAt'], vis))
for h, xs in sorted(g.items()):
    gap = sorted(x[0] for x in xs)
    after = sorted(x[1] for x in xs)
    big = [x for x in xs if x[0] > 100]
    print(h, 'n', len(xs), 'gap p50', st.median(gap), 'p90', gap[int(.9 * len(gap))], 'max', gap[-1], '| hold after events p50', st.median(after), 'min', after[0],
          '| gap>100ms', len(big), 'visible among them', sum(x[2] for x in big), '| visible with gap<=100', sum(x[2] for x in xs if x[0] <= 100))
