"""Task 118: ruling 898.3's residue check, per Chrome version, from V5's development runs (results.jsonl). Counts, ids
and times only (no window title, no page text).

  python3 -I tail_tables.py [--tsv samples.tsv] <version>=<run dir>[,<run dir>...] ...

Per version and cell (chrome_dnd_short_in_front_shared, chrome_dnd_shared), from the samples:
- false ok: in front, ok with no drop, without the hold's exact notice (898.2: another reply wording is no notice) and
  without the pending unconfirmed-drop notice (T14's, which the judge takes as honest); in the
  cancel cell, a plain ok (ok, no notice at all), the cell expecting the refusal or the honest notice;
- hold notices (the exact text, `premise.mjs` HOLD_NOTICE), and of them false alarms: the page shows a drop (or the
  case saw the effect), device.mjs `falseAlarm`;
- the shape (task 112's): the page counted the sample's own press, one more dragstart and dragend and no drop, while
  the engine answered a plain ok (no notice, no take);
- plain ok with no dragstart: ok, no notice, the engine saw no take, and the page counted no dragstart;
- the hold's path from `engine_stats.hold`: `path` (no hold ran: the take came on the drag's own path), else the
  adaptive record's way (fixed, extended, noticed), whether the source was identified, and the take against the press.
And the harness's own verdict rows per run (V5's judge, 898.2).
"""
import collections, json, os, sys


# ---- task 113's analyze_v5.py, its readers copied (that script runs on import)

def num(x):
    return x if isinstance(x, (int, float)) and not isinstance(x, bool) else None


def side(r, k):
    ds = r.get('drop_status') if isinstance(r.get('drop_status'), dict) else {}
    return ds.get(k) if isinstance(ds.get(k), dict) else {}


def delta(r, k):
    b, a = side(r, 'before'), side(r, 'after')
    return (a[k] - b[k]) if num(a.get(k)) is not None and num(b.get(k)) is not None else None


def times(r):
    """(dragstart, release) in ms after the engine's wall press, or None (task 112's alignment)."""
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


HOLD_NOTICE = 'the page may have started a drag that did not complete'
INFRONT, CANCEL = 'chrome_dnd_short_in_front_shared', 'chrome_dnd_shared'
SHORT = {INFRONT: 'in front', CANCEL: 'cancel'}

args = sys.argv[1:]
tsv = None
if args[:1] == ['--tsv']:
    tsv, args = args[1], args[2:]


def r1(x):
    return None if x is None else round(x, 1)


def pct(xs, q):
    s = sorted(xs)
    return r1(s[min(len(s) - 1, int(q * len(s)))]) if s else None


def any_notice(r):
    return bool(r.get('reply_notice') or r.get('state_notice') or ((r.get('late_watch') or {}).get('read') or {}).get('notice'))


def ping_wait(hold):
    waits = [t.get('rtt_ms') if t.get('rtt_ms') is not None else t.get('unanswered_ms') for t in ((hold or {}).get('pings') or {}).get('round_trips') or []]
    waits = [w for w in waits if isinstance(w, (int, float))]
    return max(waits) if waits else None


def path_of(hold):
    if not isinstance(hold, dict) or hold.get('bound_ms') is None:
        return 'no hold record'
    if not hold.get('held'):
        return 'path'
    return (hold.get('adaptive') or {}).get('way') or 'held, no adaptive record'


rows, verdicts = [], []
for spec in args:
    ver, dirs = spec.split('=', 1)
    for d in dirs.split(','):
        run = os.path.basename(os.path.normpath(d))
        for line in open(os.path.join(d, 'run', 'results.jsonl')):
            r = json.loads(line)
            if r.get('kind') == 'verdict' and r.get('op') in SHORT:
                verdicts.append((ver, run, r))
            if r.get('kind') != 'sample' or r.get('op') not in SHORT:
                continue
            es = r.get('engine_stats') or {}
            hold = es.get('hold') or {}
            a = hold.get('adaptive') or {}
            t = times(r)
            drops = delta(r, 'drops')
            dropped = (drops or 0) > 0
            noticed = r.get('ok') is True and r.get('reply_notice') == HOLD_NOTICE
            plain = r.get('ok') is True and not any_notice(r)
            own = delta(r, 'downs') == 1
            starts, ends = delta(r, 'starts'), delta(r, 'ends')
            if r['op'] == INFRONT:
                # the hold's exact notice is honest where no drop shows (898.2); the pending unconfirmed-drop notice
                # (T14's, state_notice or the watch's read) is the judge's honest notice too; a reply notice of
                # another wording is no notice
                pending = bool(r.get('state_notice') or ((r.get('late_watch') or {}).get('read') or {}).get('notice'))
                false_ok = r.get('ok') is True and not noticed and not pending and not dropped
            else:
                false_ok = plain and not took(r)
            rows.append({
                'version': ver, 'run': run, 'cell': SHORT[r['op']], 'block': r.get('block'), 'i': r.get('i'), 'series': r.get('series'),
                'ok': r.get('ok'), 'hold_notice': noticed, 'other_notice': any_notice(r) and not noticed,
                'unconfirmed_notice': bool(r.get('state_notice') or ((r.get('late_watch') or {}).get('read') or {}).get('notice')),
                'false_ok': false_ok, 'false_alarm': noticed and (r.get('effect') is True or dropped),
                'shape': bool(own and starts == 1 and ends == 1 and drops == 0 and plain and not took(r)),
                'plain_no_dragstart': bool(plain and not took(r) and starts == 0),
                'dropped': dropped, 'starts': starts, 'ends': ends, 'drops': drops,
                'dragstart_ms': r1(t[0]) if t and own and starts == 1 else None, 'release_ms': r1(t[1]) if t else None,
                'path': path_of(hold), 'identified': (a.get('source') or {}).get('identified'),
                'unidentified_why': (a.get('source') or {}).get('why'), 'why': a.get('why'),
                'taken': hold.get('taken'), 'take_ms': r1(hold.get('take_after_press_ms')), 'path_ms': r1(hold.get('path_ms')),
                'ping_max_ms': r1(ping_wait(hold)),
                'pings': [[r1(x.get('sent_after_press_ms')), r1(x.get('rtt_ms')), r1(x.get('unanswered_ms'))] for x in (hold.get('pings') or {}).get('round_trips') or []],
                'error': (r.get('error') or '')[:160] or None,
            })

vers = sorted({r['version'] for r in rows})
print('## The cells per Chrome version\n')
print('| Chrome | cell | samples | dropped | false oks | hold notices | of them false alarms | other notices | the shape (plain ok) | plain ok, no dragstart |')
print('|---|---|---:|---:|---:|---:|---:|---:|---:|---:|')
for v in vers:
    for cell in ('in front', 'cancel'):
        g = [r for r in rows if r['version'] == v and r['cell'] == cell]
        print(f"| {v} | {cell} | {len(g)} | {sum(r['dropped'] for r in g)} | {sum(r['false_ok'] for r in g)} | {sum(r['hold_notice'] for r in g)} | "
              f"{sum(r['false_alarm'] for r in g)} | {sum(r['other_notice'] for r in g)} | {sum(r['shape'] for r in g)} | {sum(r['plain_no_dragstart'] for r in g)} |")

print("\n## The hold's path per Chrome version and cell\n")
print('Path: `path` = no hold ran (the take came on the drag\'s own path, before it ended); else the adaptive record\'s way. '
      'Take = `hold.take_after_press_ms`, the take against the press.\n')
print('| Chrome | cell | path | samples | identified (yes / no / no record) | taken | take after press p50 / p90 / p99 / max | ping max p50 / max |')
print('|---|---|---|---:|---|---:|---|---|')
for v in vers:
    for cell in ('in front', 'cancel'):
        g = [r for r in rows if r['version'] == v and r['cell'] == cell]
        for p in sorted({r['path'] for r in g}):
            h = [r for r in g if r['path'] == p]
            takes = [r['take_ms'] for r in h if r['taken'] and r['take_ms'] is not None]
            pm = [r['ping_max_ms'] for r in h if r['ping_max_ms'] is not None]
            ident = collections.Counter('yes' if r['identified'] is True else 'no' if r['identified'] is False else 'none' for r in h)
            print(f"| {v} | {cell} | {p} | {len(h)} | {ident['yes']} / {ident['no']} / {ident['none']} | {len(takes)} | "
                  f"{pct(takes, .5)} / {pct(takes, .9)} / {pct(takes, .99)} / {pct(takes, 1)} | {pct(pm, .5)} / {pct(pm, 1)} |")
        why = collections.Counter(r['unidentified_why'] for r in g if r['identified'] is False)
        if why:
            print(f"| {v} | {cell} | unidentified, why | | {dict(why)} | | | |")

print('\n## Dragstart against the press, in front (the page\'s own dragstart, on the engine\'s wall clock)\n')
print('| Chrome | with dragstart | p50 / p90 / p99 / max | > 450 | > 650 |')
print('|---|---:|---|---:|---:|')
for v in vers:
    s = [r['dragstart_ms'] for r in rows if r['version'] == v and r['cell'] == 'in front' and r['dragstart_ms'] is not None]
    print(f"| {v} | {len(s)} | {pct(s, .5)} / {pct(s, .9)} / {pct(s, .99)} / {pct(s, 1)} | {sum(x > 450 for x in s)} | {sum(x > 650 for x in s)} |")

print('\n## Every false ok, hold notice and other notice, in full\n')
keys = ('version', 'run', 'cell', 'block', 'i', 'series', 'ok', 'dropped', 'starts', 'ends', 'dragstart_ms', 'release_ms', 'path', 'identified', 'why', 'taken', 'take_ms', 'ping_max_ms', 'pings', 'error')
listed = [r for r in rows if r['false_ok'] or r['hold_notice'] or r['other_notice'] or r['shape'] or r['plain_no_dragstart']]
for r in listed:
    tags = [k for k in ('false_ok', 'hold_notice', 'false_alarm', 'other_notice', 'shape', 'plain_no_dragstart') if r[k]]
    print(f"- **{', '.join(tags)}**: " + json.dumps({k: r[k] for k in keys}))
if not listed:
    print('none')

print("\n## The harness's verdicts (V5's judge, 898.2)\n")
print('| Chrome | run | cell | verdict | drops | hold notices | the canary | reasons |')
print('|---|---|---|---|---|---|---|---|')
for v, run, r in verdicts:
    print(f"| {v} | {run} | {SHORT[r['op']]} | {r.get('verdict')} | {json.dumps(r.get('drops'))} | {json.dumps(r.get('hold_notices'))} | "
          f"{json.dumps(r.get('hold_canary'))} | {'; '.join(r.get('reasons') or []) or '–'} |")

if tsv:
    cols = ('version', 'run', 'cell', 'block', 'i', 'series', 'ok', 'hold_notice', 'false_ok', 'false_alarm', 'dropped', 'starts', 'ends',
            'dragstart_ms', 'release_ms', 'path', 'identified', 'taken', 'take_ms', 'path_ms', 'ping_max_ms')
    with open(tsv, 'w') as f:
        f.write('\t'.join(cols) + '\n')
        for r in rows:
            f.write('\t'.join('' if r[c] is None else str(r[c]) for c in cols) + '\n')
