"""Task 113: the in-front cell's false oks per lane (ok, no notice, no drop), each with its page's dragstart after the
press, the release after the press, the press hold and final hold records, and whether any take came; and per lane the
distribution of the page's dragstart after the press over every sample with a dragstart. Counts and times only.
  python3 -I infront_false_oks.py <results.jsonl>...
"""
import collections, json, sys
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from analyze_v5 import delta, times, notice, took  # noqa: E402

OP = 'chrome_dnd_short_in_front_shared'
starts = collections.defaultdict(list)
rows = collections.defaultdict(list)
n = collections.Counter()
for p in sys.argv[1:]:
    for line in open(p):
        r = json.loads(line)
        if r.get('kind') != 'sample' or r.get('op') != OP:
            continue
        lane = r['engine']
        n[lane] += 1
        t = times(r)
        if t and delta(r, 'starts') == 1:
            starts[lane].append(t[0])
        if r.get('ok') is True and not notice(r) and not (delta(r, 'drops') or 0) > 0:
            es = r.get('engine_stats') or {}
            fh, hold = es.get('final_hold') or {}, es.get('hold') or {}
            rows[lane].append((r['block'], r['i'], r['series'], round(t[0], 1) if t else None, round(t[1], 1) if t else None,
                               hold.get('taken'), round(hold['take_after_press_ms'], 1) if hold.get('take_after_press_ms') else None,
                               fh.get('taken'), round(fh['waited_ms'], 1) if fh.get('waited_ms') is not None else None,
                               took(r), delta(r, 'starts'), delta(r, 'ends'), (es.get('after_release') or {}).get('confirmed_by')))


def pct(xs, q):
    s = sorted(xs)
    return round(s[min(len(s) - 1, int(q * len(s)))], 1) if s else None


print('| lane | samples | with dragstart | dragstart after press p50 / p90 / p95 / p99 / max | > 300 | > 350 | > 450 | > 600 |')
print('|---|---:|---:|---|---:|---:|---:|---:|')
for lane in sorted(n):
    s = starts[lane]
    print(f"| {lane} | {n[lane]} | {len(s)} | {pct(s, .5)} / {pct(s, .9)} / {pct(s, .95)} / {pct(s, .99)} / {pct(s, 1)} | "
          + ' | '.join(str(sum(1 for x in s if x > b)) for b in (300, 350, 450, 600)) + ' |')
print('\nfalse oks: (block, i, series, dragstart after press, release after press, press-hold taken, its take ms, final-hold taken, its wait ms, any take, starts, ends, confirmed by)')
for lane in sorted(rows):
    for x in rows[lane]:
        print(lane, x)
