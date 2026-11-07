# #313 offline: Firefox's focus read-back latency after AXPress (latency.mjs), per mode and field over every artifact
# under the run directory: p50, p95, p99 and max of the time from the click's answer to the first AXFocused true, and
# every click that never read true, answered other than success, or moved the front app or the window order.
#   python3 -I latency.py <run dir>
import json
import math
import os
import sys

rows = []
for root, _, files in os.walk(sys.argv[1]):
    if 'results.json' in files and root.endswith(os.path.join('firefox', 'latency')):
        art = os.path.relpath(root, sys.argv[1]).split(os.sep)[0]
        rows += [dict(r, art=art) for r in json.load(open(os.path.join(root, 'results.json')))['cells']]


def pct(xs, p):
    xs = sorted(xs)
    return xs[min(len(xs) - 1, max(0, math.ceil(p / 100 * len(xs)) - 1))]


for key in sorted({(r.get('desktop'), r.get('target')) for r in rows if r.get('desktop')}):
    sel = [r for r in rows if (r.get('desktop'), r.get('target')) == key]
    times = [r['read']['firstTrueMs'] for r in sel if (r.get('read') or {}).get('firstTrueMs') is not None]
    answers = {}
    for r in sel:
        a = (r.get('answer') or {}).get('answer', 'no click')
        answers[a] = answers.get(a, 0) + 1
    line = f'{key[0]}/{key[1]}: {len(sel)} clicks, {len(times)} read true; answers {answers}'
    if times:
        line += f'; ms p50 {pct(times, 50):.0f} p95 {pct(times, 95):.0f} p99 {pct(times, 99):.0f} max {max(times):.0f}'
        line += f'; within 300 ms {sum(t <= 300 for t in times)}/{len(times)}'
    print(line)
    clicks = [r['clickMs'] for r in sel if 'clickMs' in r]
    if clicks:
        print(f'    clickMs p50 {pct(clicks, 50)} max {max(clicks)}; refronted TextEdit {sum(bool(r.get("refrontedTextEdit")) for r in sel)}; not reloaded {sum(r.get("reloaded") is False for r in sel)}')
    for r in sel:
        rd = r.get('read') or {}
        b, a = r.get('before') or {}, r.get('after') or {}
        moved = b.get('front') != a.get('front') or (b.get('order') or {}).get('pidIndex') != (a.get('order') or {}).get('pidIndex')
        odd = rd.get('firstTrueMs') is None or (r.get('answer') or {}).get('answer') != 'success' or moved or r.get('problem') or r.get('exception')
        if odd:
            print(f"    {r['art']} {r['label']}: {(r.get('answer') or {}).get('answer')} {json.dumps((r.get('answer') or {}).get('elementClick'))} firstTrueMs={rd.get('firstTrueMs')} appFocusFirstMs={rd.get('appFocusFirstMs')} start={r.get('startActive')} front {b.get('front')}->{a.get('front')} pidIndex {(b.get('order') or {}).get('pidIndex')}->{(a.get('order') or {}).get('pidIndex')} page={json.dumps(r.get('pageFocusEvents'))} {json.dumps(r.get('problem') or r.get('exception') or '')[:200]}")
