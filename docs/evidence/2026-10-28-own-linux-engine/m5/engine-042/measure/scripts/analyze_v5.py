"""Task 113: V5's two failing cells (chrome_dnd_short_in_front_shared, chrome_dnd_shared) per lane, op and series, from
development runs' results.jsonl. Counts, ids and times only (no window title, no page text).

  python3 -I analyze_v5.py [--json out.json] <results.jsonl>...

Per sample:
- dragstart_ms: the page's dragstart after the engine's press, on the engine's wall clock (task 112's alignment: the
  page's `at` is its pointerdown's epoch ms mod 1e9; its log's `t` runs from that pointerdown, `h` is its own clock).
- the late shape: the page counted a press of the sample's own, one more dragstart and one more dragend and no drop,
  and its dragstart came after the engine's release.
- shape_plain_ok: task 112's shape, the page's drag started and ended with no drop while the engine answered a plain
  ok (whatever the order of the page's dragstart and the release).
- plain_ok_no_start: a false ok (either cell) whose page counted no dragstart (Chrome began no drag: ruling 823's
  unmet premise, apart from the shape).
- a plain ok: ok, no notice, and the engine saw no take (press, hold and final hold all untaken, dnd outcome
  no_start or absent). In the in-front cell a plain ok with no drop is the judged false ok; in the cancel cell any
  plain ok is (the cell expects the refusal).
- prevented: the final hold ran and its take came (`final_hold.taken`), and the sample then dropped (in front) or was
  refused as cancelled before the drop (cancel).
"""
import collections, json, statistics, sys

args = sys.argv[1:]
out_json = None
if args[:1] == ['--json']:
    out_json, args = args[1], args[2:]

OPS = ('chrome_dnd_short_in_front_shared', 'chrome_dnd_shared')
CANCELLED = 'began a drag and drop, which changes the desktop; it was cancelled before the drop'


def num(x):
    return x if isinstance(x, (int, float)) and not isinstance(x, bool) else None


def side(r, k):
    ds = r.get('drop_status') if isinstance(r.get('drop_status'), dict) else {}
    return ds.get(k) if isinstance(ds.get(k), dict) else {}


def delta(r, k):
    b, a = side(r, 'before'), side(r, 'after')
    return (a[k] - b[k]) if num(a.get(k)) is not None and num(b.get(k)) is not None else None


def times(r):
    """(dragstart, release) in ms after the engine's wall press, or None."""
    es = r.get('engine_stats') or {}
    wall = es.get('wall') or {}
    pw, rw = num(wall.get('press_ms')), num(wall.get('release_ms'))
    a = side(r, 'after')
    log = a.get('log') if isinstance(a.get('log'), dict) else {}
    st, en = log.get('start'), log.get('end')
    if pw is None or rw is None or num(a.get('at')) is None or not isinstance(st, dict) or not isinstance(en, dict):
        return None
    if not all(num(x.get(y)) is not None for x in (st, en) for y in ('t', 'h')):
        return None
    press_ev = (a['at'] - pw % 1e9 + 5e8) % 1e9 - 5e8
    return press_ev + (en['t'] - en['h']) + st['h'], rw - pw


def took(r):
    es = r.get('engine_stats') or {}
    press, hold, fh, dnd = es.get('press') or {}, es.get('hold') or {}, es.get('final_hold') or {}, es.get('dnd') or {}
    ar = es.get('after_release') or {}
    return bool(press.get('taken') or hold.get('taken') or fh.get('taken') or ar.get('released_with_take')
                or dnd.get('outcome') not in (None, 'no_start') or es.get('late_dnd'))


def notice(r):
    return bool(r.get('reply_notice') or r.get('state_notice') or ((r.get('late_watch') or {}).get('read') or {}).get('notice'))


rows = []
for p in args:
    for line in open(p):
        try:
            r = json.loads(line)
        except Exception:
            continue
        if r.get('kind') == 'sample' and r.get('op') in OPS:
            r['_file'] = p
            rows.append(r)

groups = collections.defaultdict(list)
for r in rows:
    groups[(r['op'], r['engine'], r['series'])].append(r)


def pct(xs, q):
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(q * len(xs)))] if xs else None


def r1(x):
    return None if x is None else round(x, 1)


table = []
for (op, lane, series), rs in sorted(groups.items()):
    g = collections.Counter()
    starts, late_after_release, fh_takes, fh_waits, ms, fh_after_start = [], [], [], [], [], []
    for r in rs:
        g['n'] += 1
        if num(r.get('ms')) is not None:
            ms.append(r['ms'])
        own = delta(r, 'downs') == 1
        shape = own and delta(r, 'starts') == 1 and delta(r, 'ends') == 1 and delta(r, 'drops') == 0
        t = times(r)
        if t and own and delta(r, 'starts') == 1:
            starts.append(t[0])
        late = bool(shape and t and t[0] > t[1])
        if late:
            g['late_shape'] += 1
            late_after_release.append(round(t[0] - t[1], 1))
        plain_ok = r.get('ok') is True and not notice(r) and not took(r)
        # task 112's shape: the page's drag began and ended with no drop, and the engine answered a plain ok
        if shape and plain_ok:
            g['shape_plain_ok'] += 1
        dropped = (delta(r, 'drops') or 0) > 0
        if op == 'chrome_dnd_short_in_front_shared':
            if r.get('ok') is True and not notice(r) and not dropped:
                g['false_ok'] += 1
                if delta(r, 'starts') == 0:
                    g['plain_ok_no_start'] += 1
            if dropped:
                g['dropped'] += 1
        else:
            if plain_ok:
                g['false_ok'] += 1
                # the page saw no drag start at all: Chrome never began one (ruling 823's unmet premise), not the shape
                if delta(r, 'starts') == 0:
                    g['plain_ok_no_start'] += 1
            if r.get('ok') is False and CANCELLED in (r.get('error') or ''):
                g['cancelled'] += 1
        fh = (r.get('engine_stats') or {}).get('final_hold')
        if isinstance(fh, dict):
            g['final_hold_ran'] += 1
            fh_waits.append(fh.get('waited_ms'))
            if fh.get('taken'):
                g['final_hold_take'] += 1
                fh_takes.append(round(fh['start_after_press_ms'] + fh['waited_ms'], 1))
                # after the hold began: where 0.4.1 would have released (the path's end, or the hold after the press)
                fh_after_start.append(round(fh['waited_ms'], 1))
                ok_effect = dropped and r.get('ok') is True if op == 'chrome_dnd_short_in_front_shared' else (r.get('ok') is False and CANCELLED in (r.get('error') or ''))
                if ok_effect:
                    g['prevented'] += 1
    table.append({
        'op': op, 'lane': lane, 'series': series, **g,
        'ms_median': r1(statistics.median(ms)) if ms else None,
        'dragstart_after_press': {'n': len(starts), 'p50': r1(pct(starts, .5)), 'p90': r1(pct(starts, .9)), 'p99': r1(pct(starts, .99)), 'max': r1(max(starts)) if starts else None},
        'late_after_release_ms': late_after_release,
        'final_hold_take_after_press_ms': fh_takes,
        'final_hold_take_after_hold_start_ms': fh_after_start,
        'final_hold_wait_median_ms': r1(statistics.median([w for w in fh_waits if num(w) is not None])) if fh_waits else None,
    })

cols = ['n', 'shape_plain_ok', 'late_shape', 'false_ok', 'plain_ok_no_start', 'dropped', 'cancelled', 'final_hold_ran', 'final_hold_take', 'prevented']
print('| op | lane | series | ' + ' | '.join(cols) + ' | ms p50 | dragstart after press p50/p90/max | late by (ms after release) | final-hold takes (ms after press) |')
print('|---|---|---|' + '---:|' * len(cols) + '---:|---|---|---|')
for t in table:
    d = t['dragstart_after_press']
    print(f"| {t['op'].replace('chrome_dnd_', '')} | {t['lane']} | {t['series']} | " + ' | '.join(str(t.get(c, 0)) for c in cols)
          + f" | {t['ms_median']} | {d['p50']}/{d['p90']}/{d['max']} (n {d['n']}) | {t['late_after_release_ms'] or ''} | {t['final_hold_take_after_press_ms'] or ''} |")
if out_json:
    json.dump(table, open(out_json, 'w'), indent=1)
