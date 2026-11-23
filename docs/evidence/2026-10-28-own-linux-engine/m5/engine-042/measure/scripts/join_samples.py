"""Task 116: every candidate drag of a run as one row, its hold's ping round trips joined to its outcome. Counts, ids and
times only (no window title, no page text).

  python3 -I join_samples.py --arch x64 --load 2 [--out samples.jsonl] <run dir>...

A run dir is a development run's step dir (private-run.mjs: <dir>/run/results.jsonl) or a :0 sitting's (run71.sh:
<dir>/run/results.jsonl too). Two kinds of run:
- V5's device cells (`kind: sample`, ops chrome_dnd_shared and chrome_dnd_short_in_front_shared): the engine's `--stats`
  record is on the row (`engine_stats`), and the page's counts and pointer log (`drop_status`) give its dragstart.
- D1 and D2 (`kind: drag-run`): the cua lanes' `--stats` lines are in run/engine-stats/, one file per engine
  (`--engine-stats`), each engine a block of one lane's drags in one cell. They are joined by order: the run's cells in
  the order its results list them, each cell's blocks in run order (`BLOCK_RUNS` = 10, a block's runs consecutive), and
  the lane's engines in the order settle-counts.json lists them (their start order). Every join is checked: an engine's
  drag lines must be exactly one block's runs, and each line's `ok` the row's.

Per row:
- `hold`: the engine's hold record (bound, held, waited, taken, take_after_press_ms, path_ms), null when no hold ran.
- `pings`: the hold's round trips; `rtts` the answered ones; `first_ms` the first ping's round trip, `max_ms` the largest,
  an unanswered ping counted at its `unanswered_ms` (at least that slow, censored at the hold's end); `asked` false when
  the source lists no _NET_WM_PING.
- `outcome`, one of:
  - `took_path`: the engine saw the take before its hold began (the press watch or the drag's own look);
  - `took_hold`: the take came during the hold (`hold.taken`), at `hold.take_after_press_ms`;
  - `tail`: no take by the release, and the page counted a dragstart of the drag's own (V5's late renderer; its time
    after the press in `dragstart_ms`); the watch's late take, when it saw one, in `late`;
  - `no_dragstart`: no take, and the page counted no dragstart (V5: Chrome began no drag, ruling 823's unmet premise);
  - `plain`: D1's and D2's drags with no take (their pages count no dragstart);
  - `refused`: an answer that is not ok and not one of the above (recorded, not judged).
- `late`: what the after-release watch reported for the drag (`late_dnd` on the next request of the same engine, or on
  the sample's own pending read): its `after_release_ms`, `escaped`, the read's notice and the next request's answer.
- `answer_ms` (the harness's write-to-answer time), `release_after_press_ms` (the engine's wall clock), and their
  difference `answer_less_hold_ms`: the time outside press-to-release (before the press, the rest after the release).
"""
import collections, json, os, sys

args = sys.argv[1:]
opts = {'--arch': None, '--load': None, '--out': None}
while args and args[0] in opts:
    opts[args[0]], args = args[1], args[2:]
ARCH, LOAD = opts['--arch'], opts['--load']
if not ARCH or LOAD is None or not args:
    sys.exit('usage: join_samples.py --arch <x64|arm64> --load <0|2> [--out samples.jsonl] <run dir>...')

V5_OPS = ('chrome_dnd_shared', 'chrome_dnd_short_in_front_shared')
# V5's scene's own no-take control (task 116): a select drag in front on the same page with the same ballast
SEL_OPS = ('chrome_select_nudged_shared',)
BLOCK_RUNS = 10


def num(x):
    return x if isinstance(x, (int, float)) and not isinstance(x, bool) else None


def r1(x):
    return None if x is None else round(x, 1)


# ---- the page's counts and dragstart (task 113's analyze_v5.py, unchanged in meaning)

def side(r, k):
    ds = r.get('drop_status') if isinstance(r.get('drop_status'), dict) else {}
    return ds.get(k) if isinstance(ds.get(k), dict) else {}


def delta(r, k):
    b, a = side(r, 'before'), side(r, 'after')
    return (a[k] - b[k]) if num(a.get(k)) is not None and num(b.get(k)) is not None else None


def page_dragstart(r, es):
    """The page's dragstart in ms after the engine's wall press (task 112's alignment), or None."""
    wall = es.get('wall') or {}
    pw = num(wall.get('press_ms'))
    a = side(r, 'after')
    log = a.get('log') if isinstance(a.get('log'), dict) else {}
    st, en = log.get('start'), log.get('end')
    if pw is None or num(a.get('at')) is None or not isinstance(st, dict) or not isinstance(en, dict):
        return None
    if not all(num(x.get(y)) is not None for x in (st, en) for y in ('t', 'h')):
        return None
    press_ev = (a['at'] - pw % 1e9 + 5e8) % 1e9 - 5e8
    return press_ev + (en['t'] - en['h']) + st['h']


# ---- the engine's record

def ping_fields(hold):
    p = (hold or {}).get('pings')
    if not isinstance(p, dict):
        return None
    if not p.get('asked'):
        return {'asked': False, 'why': p.get('why')}
    every = p.get('round_trips') or []
    # wave 2 (313167a9): a ping whose submission was under way at the hold's end (`in_flight`) or failed
    # (`send_failed`) asked nothing, so it is no round trip and no unanswered ping
    cut = [t for t in every if t.get('in_flight') or t.get('send_failed') is not None]
    trips = [t for t in every if not (t.get('in_flight') or t.get('send_failed') is not None)]
    kinds = {'in_flight': sum(1 for t in cut if t.get('in_flight')), 'send_failed': sum(1 for t in cut if t.get('send_failed') is not None)}
    if not trips:
        return {'asked': False, 'why': 'no ping asked by the hold\'s end', 'cut': len(cut), **kinds}
    rtts = [t['rtt_ms'] for t in trips if num(t.get('rtt_ms')) is not None]
    waits = [num(t.get('rtt_ms')) if num(t.get('rtt_ms')) is not None else num(t.get('unanswered_ms')) for t in trips]
    waits = [w for w in waits if w is not None]
    first = trips[0]
    return {
        'asked': True,
        'n': len(trips),
        'cut': len(cut),
        **kinds,
        'answered': len(rtts),
        'unanswered': [r1(t.get('unanswered_ms')) for t in trips if num(t.get('rtt_ms')) is None],
        'rtts': [r1(x) for x in rtts],
        'first_ms': r1(waits[0]) if waits else None,
        'first_answered': first is not None and num(first.get('rtt_ms')) is not None,
        'first_sent_after_press_ms': r1(first.get('sent_after_press_ms')) if first else None,
        'max_ms': r1(max(waits)) if waits else None,
        # every asked ping: [sent after the press, its round trip or None, its age at the hold's end when unanswered]
        'trips': [[r1(t.get('sent_after_press_ms')), r1(num(t.get('rtt_ms'))), r1(num(t.get('unanswered_ms')))] for t in trips],
    }


def hold_fields(es):
    h = es.get('hold')
    if not isinstance(h, dict):
        return None
    return {k: (r1(h.get(k)) if num(h.get(k)) is not None else h.get(k)) for k in
            ('bound_ms', 'path_ms', 'held', 'waited_ms', 'taken', 'take_after_press_ms', 'keepalives')}


def engine_took(es):
    """(before the hold, during the hold): the takes the engine saw by its release."""
    press, hold, dnd = es.get('press') or {}, es.get('hold') or {}, es.get('dnd') or {}
    # the press record's `taken` is any take by the release, the hold's included: a take the hold saw is the hold's
    in_hold = bool(hold.get('taken')) and bool(hold.get('held'))
    before = not in_hold and (bool(press.get('taken')) or bool(hold.get('taken'))
                              or dnd.get('outcome') not in (None, 'no_start'))
    return before, in_hold


def late_fields(late):
    if not isinstance(late, dict):
        return None
    return {'after_release_ms': r1(num(late.get('after_release_ms'))), 'escaped': late.get('escaped'),
            'unconfirmed': late.get('unconfirmed'), 'failed': late.get('failed')}


def timing(row_ms, es):
    wall = es.get('wall') or {}
    pw, rw = num(wall.get('press_ms')), num(wall.get('release_ms'))
    rel = rw - pw if pw is not None and rw is not None else None
    return {'answer_ms': r1(num(row_ms)), 'release_after_press_ms': r1(rel),
            'answer_less_hold_ms': r1(num(row_ms) - rel) if num(row_ms) is not None and rel is not None else None}


def classify(es, took_before, took_hold, dragstart_own):
    if took_before:
        return 'took_path'
    if took_hold:
        return 'took_hold'
    if dragstart_own is True:
        return 'tail'
    if dragstart_own is False:
        return 'no_dragstart'
    return None


# ---- V5's device rows

def v5_rows(run, path):
    rows = [json.loads(l) for l in open(path) if l.strip()]
    samples = [r for r in rows if r.get('kind') == 'sample' and r.get('op') in V5_OPS + SEL_OPS]
    by_slot = {(r['op'], r['engine'], r.get('block'), r.get('i')): r for r in samples}
    out = []
    for r in samples:
        es = r.get('engine_stats') or {}
        before, in_hold = engine_took(es)
        own = delta(r, 'downs') == 1
        starts = delta(r, 'starts')
        ds = page_dragstart(r, es) if own and starts == 1 else None
        dragstart_own = (starts == 1) if own and starts is not None else None
        outcome = classify(es, before, in_hold, dragstart_own)
        # the scene's select control presses on text, no source: with no take it is a plain drag, its own control,
        # whatever it answered (its stray nudges' condition makes the answer the stray refusal)
        if r['op'] in SEL_OPS and outcome not in ('took_path', 'took_hold'):
            outcome = 'plain'
        if outcome is None:
            outcome = 'refused' if r.get('ok') is not True else 'unread'
        # the watch's report: the sample's own pending read (in front), else the next sample's request on the engine
        lw = (r.get('late_watch') or {}).get('next') or {}
        late = lw.get('late_dnd')
        nxt = by_slot.get((r['op'], r['engine'], r.get('block'), (r.get('i') or 0) + 1))
        next_answer = None
        if late is None and nxt is not None:
            late = (nxt.get('engine_stats') or {}).get('late_dnd')
            if late is not None:
                next_answer = {'ok': nxt.get('ok'), 'error': (nxt.get('error') or '')[:200]}
        elif late is not None:
            next_answer = {'ok': r.get('next_ok'), 'error': (r.get('next_error') or '')[:200]}
        out.append({
            'arch': ARCH, 'load': LOAD, 'run': run, 'source': 'sel' if r['op'] in SEL_OPS else 'v5', 'cell': r['op'], 'lane': r['engine'],
            'series': r.get('series'), 'block': r.get('block'), 'i': r.get('i'), 'ok': r.get('ok'),
            'error': (r.get('error') or '')[:200] or None,
            'notice': r.get('reply_notice') or r.get('state_notice') or None,
            'outcome': outcome, 'hold': hold_fields(es), 'pings': ping_fields(es.get('hold')),
            'dragstart_ms': r1(ds), 'starts': starts, 'drops': delta(r, 'drops'),
            'late': late_fields(late), 'late_read_notice': r.get('state_notice') if late is not None else None,
            'late_next': next_answer, **timing(r.get('ms'), es),
        })
    return out


# ---- D1's and D2's drag rows joined to their engines' stats files

def stats_lines(path):
    lines = []
    for l in open(path):
        try:
            lines.append(json.loads(l)['stats'])
        except Exception:
            lines.append(None)
    return lines


def drag_rows(run, rundir):
    path = os.path.join(rundir, 'results.jsonl')
    rows = [json.loads(l) for l in open(path) if l.strip()]
    runs = [r for r in rows if r.get('kind') == 'drag-run']
    cells = [(r['family'], r['drag']) for r in rows if r.get('kind') == 'drag-cell']
    sc = json.load(open(os.path.join(rundir, 'settle-counts.json')))
    engines = [e for p in sc['processes'] for e in p['engines'] if e.get('stats_file')]
    out = []
    lanes = sorted({r['engine'] for r in runs if r['engine'].startswith('cua') and r['engine'] != 'cua:no-press'})
    for lane in lanes:
        files = [e for e in engines if e['lane'] == lane.replace(':', '_') or e['lane'] == lane]
        # the lane's runs, cell by cell in the results' order, each cell's by run index, cut into blocks
        blocks = []
        for cell in cells:
            mine = sorted((r for r in runs if (r['family'], r['drag']) == cell and r['engine'] == lane), key=lambda r: r['i'])
            cur = []
            for r in mine:
                if cur and (r['i'] % BLOCK_RUNS == 0 or r['i'] != cur[-1]['i'] + 1):
                    blocks.append(cur)
                    cur = []
                cur.append(r)
            if cur:
                blocks.append(cur)
        if len(blocks) != len(files):
            raise SystemExit(f'{run} {lane}: {len(blocks)} blocks of runs, {len(files)} engines with stats')
        for block, eng in zip(blocks, files):
            lines = stats_lines(os.path.join(rundir, eng['stats_file']))
            drags = [(k, s) for k, s in enumerate(lines) if s and s.get('id') is not None and s.get('command') == 'drag']
            if len(drags) != len(block):
                raise SystemExit(f"{run} {lane} {eng['stats_file']}: {len(drags)} drag lines for a block of {len(block)} runs")
            for n, (r, (k, es)) in enumerate(zip(block, drags)):
                if bool(es.get('ok')) != bool(r.get('ok')):
                    raise SystemExit(f"{run} {lane} {eng['stats_file']}: line {k}'s ok {es.get('ok')} against run {r['i']}'s {r.get('ok')}")
                before, in_hold = engine_took(es)
                outcome = 'took_path' if before else 'took_hold' if in_hold else 'plain' if r.get('ok') else 'refused'
                # the watch's report: on the engine's next line that carries one (its next request, or its exit)
                later = lines[k + 1:drags[n + 1][0] + 1] if n + 1 < len(drags) else lines[k + 1:]
                late = next((s.get('late_dnd') for s in later if s and s.get('late_dnd') is not None), None)
                next_answer = None
                if late is not None and n + 1 < len(block):
                    nr = block[n + 1]
                    next_answer = {'ok': nr.get('ok'), 'error': (nr.get('error') or '')[:200]}
                out.append({
                    'arch': ARCH, 'load': LOAD, 'run': run, 'source': 'd2' if r['family'] == 'electron' else 'd1',
                    'cell': f"{r['family']}:{r['drag']}", 'lane': lane, 'series': 'cold' if r.get('first_request') else 'warm',
                    'block': None, 'i': r['i'], 'ok': r.get('ok'), 'error': r.get('error'), 'notice': None,
                    'took_effect': r.get('took'), 'outcome': outcome, 'hold': hold_fields(es),
                    'pings': ping_fields(es.get('hold')), 'dragstart_ms': None, 'starts': None, 'drops': None,
                    'late': late_fields(late), 'late_read_notice': None, 'late_next': next_answer,
                    'stats_file': eng['stats_file'], **timing(r.get('ms'), es),
                })
    return out


# ---- the dnd experiment's rows (`kind: dnd-run`, Electron's short drag and drop): the lane asked --stats itself, so
# each row carries its line's hold (`stats_hold`), dnd and the rest (`stats_extra`: press, wall)

def dnd_rows(run, path):
    out = []
    for l in open(path):
        r = json.loads(l) if l.strip() else {}
        if r.get('kind') != 'dnd-run':
            continue
        es = {**(r.get('stats_extra') or {}), 'hold': r.get('stats_hold'), 'dnd': r.get('stats_dnd')}
        before, in_hold = engine_took(es)
        outcome = 'took_path' if before else 'took_hold' if in_hold else 'no_take' if r.get('ok') else 'refused'
        out.append({
            'arch': ARCH, 'load': LOAD, 'run': run, 'source': 'edn', 'cell': f"{r.get('family')}:dnd-short", 'lane': 'cua',
            'engine_lane': r.get('engine'), 'series': 'cold' if r.get('i') == 0 else 'warm', 'block': None, 'i': r.get('i'),
            'ok': r.get('ok'), 'error': r.get('error'), 'notice': None, 'outcome': outcome, 'hold': hold_fields(es),
            'pings': ping_fields(es.get('hold')), 'dragstart_ms': None, 'starts': None, 'drops': None, 'late': None,
            'late_read_notice': None, 'late_next': None, **timing(r.get('ms'), es),
        })
    return out


all_rows = []
for d in args:
    run = os.path.basename(os.path.normpath(d))
    rundir = os.path.join(d, 'run')
    path = os.path.join(rundir, 'results.jsonl')
    kinds = collections.Counter(json.loads(l).get('kind') for l in open(path) if l.strip())
    if kinds.get('sample'):
        all_rows += v5_rows(run, path)
    if kinds.get('drag-run'):
        all_rows += drag_rows(run, rundir)
    if kinds.get('dnd-run'):
        all_rows += dnd_rows(run, path)
    print(f'{run}: ' + ', '.join(f'{k} {v}' for k, v in sorted(collections.Counter(
        (r['source'], r['outcome']) for r in all_rows if r['run'] == run).items())), file=sys.stderr)

out = open(opts['--out'], 'w') if opts['--out'] else sys.stdout
for r in all_rows:
    out.write(json.dumps(r) + '\n')
