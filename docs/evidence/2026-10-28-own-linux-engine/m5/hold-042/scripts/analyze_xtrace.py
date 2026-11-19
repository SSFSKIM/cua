"""Task 113: what the run's Chrome sent and received over X around each drag (the reduced trace of chrome-xtrace/),
by class of sample: V5's cancel cell (shape: a plain ok whose page counted a dragstart and a dragend and no drop; took:
refused as cancelled; no-start: a plain ok whose page counted no dragstart) and the controls (D1's select and canvas,
cua's lane). For every request or event key, the share of each class's samples it appears in, before the release
(press to release) and after it (release to release + 600 ms), with the median time after the release of its first
sighting there. Keys: the request's or event's name, with a SendEvent's event and type, a selection or property atom,
a ChangeWindowAttributes' cursor. Counts, names and times only.
  python3 -I analyze_xtrace.py --cancel <results.jsonl> <trace.jsonl> [--controls <results.jsonl> <stats dir> <trace.jsonl>]
"""
import bisect, collections, glob, json, statistics, sys

AFTER_MS = 600
CANCELLED = 'began a drag and drop, which changes the desktop; it was cancelled before the drop'


def load_trace(p):
    ev = []
    for line in open(p):
        o = json.loads(line)
        if o.get('kind') == 'drawing':
            continue
        key = o['k'] + ':' + o['n']
        if o['n'] == 'SendEvent':
            key += f"[{o.get('ev')},{o.get('type')}]"
        for f in ('selection', 'property', 'atom', 'type'):
            if f in o and o['n'] != 'SendEvent':
                key += f'[{f}={o[f]}]'
        if o['n'] == 'ChangeWindowAttributes' and o.get('cursor'):
            key += '[cursor]'
        ev.append((o['t'], key))
    ev.sort()
    return ev


def window_keys(trace, ts, a, b):
    i, j = bisect.bisect_left(ts, a), bisect.bisect_right(ts, b)
    first = {}
    for t, k in trace[i:j]:
        first.setdefault(k, t)
    return first


def delta(r, k):
    ds = r.get('drop_status') or {}
    b, a = ds.get('before') or {}, ds.get('after') or {}
    return (a[k] - b[k]) if isinstance(a.get(k), (int, float)) and isinstance(b.get(k), (int, float)) else None


def cancel_samples(results):
    out = []
    for line in open(results):
        r = json.loads(line)
        if r.get('kind') != 'sample' or r.get('op') != 'chrome_dnd_shared' or r.get('engine') != 'cua':
            continue
        wall = (r.get('engine_stats') or {}).get('wall') or {}
        if 'press_ms' not in wall:
            continue
        if r.get('ok') is False and CANCELLED in (r.get('error') or ''):
            cls = 'took'
        elif r.get('ok') is True and delta(r, 'starts') == 1 and delta(r, 'ends') == 1 and (delta(r, 'drops') or 0) == 0:
            cls = 'shape'
        elif r.get('ok') is True and delta(r, 'starts') == 0:
            cls = 'no-start'
        else:
            cls = 'other'
        out.append((cls, wall['press_ms'], wall['release_ms']))
    return out


def control_samples(results, stats_dir):
    """D1's select and canvas drags of cua's lane, each paired with its engine's --stats line by order (one engine a
    block, its drags in order)."""
    walls = []
    for p in sorted(glob.glob(f'{stats_dir}/*cua.*.jsonl')):
        for line in open(p):
            try:
                s = json.loads(line).get('stats') or {}
            except Exception:
                continue
            if s.get('command') == 'drag' and isinstance(s.get('wall'), dict):
                walls.append((s['wall']['press_ms'], s['wall']['release_ms']))
    walls.sort()
    return [('control', p, r) for p, r in walls]


args = sys.argv[1:]
samples, traces = [], []
while args:
    flag = args.pop(0)
    if flag == '--cancel':
        res, tr = args.pop(0), args.pop(0)
        samples.append((cancel_samples(res), load_trace(tr)))
    elif flag == '--controls':
        res, sd, tr = args.pop(0), args.pop(0), args.pop(0)
        samples.append((control_samples(res, sd), load_trace(tr)))
classes = collections.Counter()
seen = {w: collections.defaultdict(collections.Counter) for w in ('before', 'after')}
first_after = collections.defaultdict(list)
for group, trace in samples:
    ts = [t for t, _ in trace]
    for cls, press, release in group:
        classes[cls] += 1
        for w, (a, b) in (('before', (press, release)), ('after', (release, release + AFTER_MS))):
            for k, t in window_keys(trace, ts, a, b).items():
                seen[w][k][cls] += 1
                if w == 'after':
                    first_after[(k, cls)].append(t - release)
order = [c for c in ('shape', 'took', 'no-start', 'other', 'control') if classes[c]]
print('samples:', dict(classes))
for w in ('after', 'before'):
    print(f'\n== {w} the release: the share of each class\'s samples a key appears in' + (' (median ms after the release of its first sighting)' if w == 'after' else ''))
    print('| key | ' + ' | '.join(f'{c} (n {classes[c]})' for c in order) + ' |')
    print('|---|' + '---|' * len(order))
    keys = sorted(seen[w], key=lambda k: -max(seen[w][k][c] / classes[c] for c in order))
    for k in keys:
        cells = []
        for c in order:
            n = seen[w][k][c]
            med = statistics.median(first_after[(k, c)]) if w == 'after' and first_after[(k, c)] else None
            cells.append(f'{n} ({100 * n / classes[c]:.0f}%)' + (f' {med:.0f}' if med is not None else ''))
        print(f'| {k} | ' + ' | '.join(cells) + ' |')
