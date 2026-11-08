# transientRaise.ms for clicks the watch also saw raised against those it did not (B, shared Safari and TextEdit).
import json, os, statistics as st, sys
seen_w, seen_nw = [], []
for root, _, files in os.walk(sys.argv[1]):
    if 'results.json' not in files or '/B/' not in root + '/':
        continue
    for c in json.load(open(os.path.join(root, 'results.json')))['cells']:
        p = c.get('p321') or c
        dl, w = p.get('delivery'), p.get('watch')
        if not dl or not w or not (dl.get('transientRaise') or {}).get('seen'):
            continue
        hs, ge = dl['holdStartedAt'], dl['postedAt'] + dl['guardMs']
        ch = w.get('changes') or []
        hit = any(x.get('aboveFront') and (ch[i + 1]['atMs'] if i + 1 < len(ch) else 1e18) > hs and x['atMs'] < ge for i, x in enumerate(ch))
        (seen_w if hit else seen_nw).append(dl['transientRaise']['ms'])
for name, xs in (('watch saw it', seen_w), ('watch missed it', seen_nw)):
    print(name, len(xs), 'ms p50', st.median(xs), 'p90', sorted(xs)[int(.9 * len(xs))], 'max', max(xs), 'share <=21ms', round(sum(x <= 21 for x in xs) / len(xs), 2))
