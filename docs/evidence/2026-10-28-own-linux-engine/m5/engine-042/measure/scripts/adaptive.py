"""Task 116: whether a hold could adapt to its pings in either direction (the controller's two questions, 2026-11-20),
from join_samples.py's rows (default lane, wave 2 only). Nothing is built; these are the numbers either rule would meet.

  python3 -I adaptive.py <samples.jsonl>...

A ping is slow at threshold T once its wait passes T: an answered ping whose round trip is above T is known slow at
sent + T, an unanswered one at sent + T if its age at the hold's end passed T. A drag is known slow at the earliest such
moment (`slow_at`), and a ping answered within T before it is a fast ping before the slow one.

1. Presses on a draggable source (V5's tail, no-dragstart and take-in-the-hold drags): per T (20, 40, 80 ms), when
   the drag is known slow (ms after the press), how many never are by the hold's end, and how many had a fast ping
   before their slow one. For the take-in-the-hold drags, whether they were known slow before their take.
2. Plain drags (D1, D2 and V5's scene's select control): every ping's round trip by when it was sent, and any ping
   slow at T at any point of the hold.
3. The two rules' arithmetic:
   - extend: hold to a longer bound only for a drag known slow by B (450): which tails would be covered, and which
     plain drags would be held longer (false extensions);
   - early release at X (100 to 400): release a drag that by X has had an answered ping and no slow one; its misses
     are presses on a draggable source that would be released early before their take (a take-in-the-hold drag whose
     take came after X) or whose dragstart came after X (the tail), and plain drags still held (no saving).
"""
import collections, json, sys

allrows = [json.loads(l) for p in sys.argv[1:] for l in open(p) if l.strip()]
allrows = [r for r in allrows if r['lane'] == 'cua']
rows = allrows
rows = [r for r in rows if r['lane'] == 'cua' and isinstance(r.get('pings'), dict) and r['pings'].get('asked')]
THS = (20, 40, 80)
DRAGGABLE = ('tail', 'no_dragstart', 'took_hold')


def pct(xs, q):
    xs = sorted(x for x in xs if x is not None)
    return xs[min(len(xs) - 1, int(q * len(xs)))] if xs else None


def dist(xs):
    xs = [x for x in xs if x is not None]
    if not xs:
        return '–'
    return ' / '.join(f'{pct(xs, q):.0f}' for q in (0, .1, .5, .9, 1)) + f' (n {len(xs)})'


def slow_at(r, th):
    """(the moment the drag is known slow, whether a ping answered within th came before it)."""
    trips = sorted(r['pings']['trips'], key=lambda t: t[0])
    for k, (sent, rtt, age) in enumerate(trips):
        wait = rtt if rtt is not None else age
        if wait is not None and wait > th:
            fast_before = any(t[1] is not None and t[1] <= th for t in trips[:k])
            return sent + th, fast_before
    return None, any(t[1] is not None and t[1] <= th for t in trips)


def looks_fast_at(r, th, x):
    """Whether by x after the press the drag has had an answered ping and none known slow."""
    answered = any(rtt is not None and sent + rtt <= x and rtt <= th for sent, rtt, _ in r['pings']['trips'])
    s, _ = slow_at(r, th)
    return answered and (s is None or s > x)


def table(head, body):
    print('| ' + ' | '.join(head) + ' |')
    print('|' + '---|' * len(head))
    for b in body:
        print('| ' + ' | '.join(map(str, b)) + ' |')


def cls(r):
    return f"{r['outcome']} ({r['cell'].replace('chrome_dnd_', '').replace('_shared', '')})" if r['source'] == 'v5' else f"plain {r['source']}"


conds = sorted({(r['arch'], r['load']) for r in rows})
print('## 1. Presses on a draggable source: when the drag is known slow (ms after the press: min / p10 / p50 / p90 / max)\n')
body = []
for arch, load in conds:
    for src, g in [('v5', g) for g in DRAGGABLE] + [('edn', 'took_hold'), ('edn', 'no_take')]:
        rs = [r for r in rows if (r['arch'], r['load']) == (arch, load) and r['source'] == src and r['outcome'] == g]
        if not rs:
            continue
        for th in THS:
            got = [slow_at(r, th) for r in rs]
            known = [s for s, _ in got if s is not None]
            fast_first = sum(1 for s, f in got if s is not None and f)
            before_take = ''
            if g == 'took_hold':
                before_take = sum(1 for r, (s, _) in zip(rs, got) if s is not None and s <= r['hold']['take_after_press_ms'])
            body.append([arch, load, f'{g} ({src})', len(rs), th, dist(known), len(rs) - len(known), fast_first, before_take])
table(['arch', 'load', 'class', 'n', 'T ms', 'known slow at', 'never slow', 'a fast ping before the slow one', 'slow before the take'], body)

print('\nThe tail and no-dragstart drags one by one (each ping: sent after the press / round trip or unanswered age):\n')
for r in rows:
    if (r['source'] == 'v5' and r['outcome'] in ('tail', 'no_dragstart')) or (r['source'] == 'edn' and r['outcome'] == 'no_take'):
        trips = ', '.join(f"{s:.0f}/{rtt if rtt is not None else f'unanswered {age}'}" for s, rtt, age in r['pings']['trips'])
        print(f"- {r['arch']} load {r['load']} {cls(r)} {r['run']} block {r['block']} i {r['i']}: dragstart {r['dragstart_ms']}, "
              f"path {r['hold']['path_ms']}, pings {trips}")

print('\n## 2. Plain drags: every ping\'s round trip, by when it was sent\n')
body = []
for arch, load in conds:
    for src in ('d1', 'd2', 'sel'):
        rs = [r for r in rows if (r['arch'], r['load']) == (arch, load) and r['outcome'] == 'plain' and r['source'] == src]
        if not rs:
            continue
        trips = [t for r in rs for t in r['pings']['trips']]
        by = collections.defaultdict(list)
        for sent, rtt, age in trips:
            by[min(4, int(sent // 100))].append(rtt if rtt is not None else age)
        body.append([arch, load, src, len(rs), len(trips)] + [dist(by[k]) for k in range(5)]
                    + [', '.join(str(sum(1 for r in rs if slow_at(r, th)[0] is not None)) for th in THS)])
table(['arch', 'load', 'source', 'drags', 'pings', 'sent 0-99', '100-199', '200-299', '300-399', '400+',
       'drags with a slow ping at 20, 40, 80 ms'], body)
print('\nPlain drags with a slow ping (T 20): when it was known slow\n')
for arch, load in conds:
    rs = [r for r in rows if (r['arch'], r['load']) == (arch, load) and r['outcome'] == 'plain']
    for r in rs:
        s, _ = slow_at(r, 20)
        if s is not None:
            worst = max((t[1] if t[1] is not None else t[2] or 0) for t in r['pings']['trips'])
            print(f"- {arch} load {load} {r['source']} {r['cell']} {r['run']} i {r['i']}: known slow at {s:.0f} ms, worst ping {worst} ms")

print('\n## 3. The rules\' arithmetic\n')
print('Extend: a drag known slow by B (450 ms) is held longer.\n')
body = []
for arch, load in conds:
    here = [r for r in rows if (r['arch'], r['load']) == (arch, load)]
    for th in THS:
        tail = [r for r in here if r['outcome'] == 'tail']
        nost = [r for r in here if r['outcome'] == 'no_dragstart']
        plain = [r for r in here if r['outcome'] == 'plain']
        enot = [r for r in here if r['source'] == 'edn' and r['outcome'] == 'no_take']
        k = lambda rs: sum(1 for r in rs if (slow_at(r, th)[0] or 1e9) <= 450)
        body.append([arch, load, th, f'{k(tail)}/{len(tail)}', f'{k(nost)}/{len(nost)}', f'{k(enot)}/{len(enot)}', f'{k(plain)}/{len(plain)}'])
table(['arch', 'load', 'T ms', 'tails known slow by 450', 'V5 no-dragstart extended', 'Electron no-take extended', 'plain drags extended'], body)
print('\nAn extended drag with no take would answer at about press + 650 (ok with the notice) instead of 450: each one above pays about 200 ms. The tails\' dragstarts against 650 are in section 1\'s list.')
print('\nEarly release at X: released when by X a ping was answered within T and none was slow.\n')
body = []
for arch, load in conds:
    here = [r for r in rows if (r['arch'], r['load']) == (arch, load)]
    for th in THS:
        for x in (100, 150, 200, 250, 300, 350, 400):
            took = [r for r in here if r['outcome'] == 'took_hold' and r['source'] in ('v5', 'edn') and r['hold']['take_after_press_ms'] > x]
            etook = [r for r in took if r['source'] == 'edn']
            tail = [r for r in here if r['outcome'] == 'tail']
            plain = [r for r in here if r['outcome'] == 'plain' and (r['hold']['path_ms'] or 0) < x]
            m = lambda rs: sum(1 for r in rs if looks_fast_at(r, th, x))
            body.append([arch, load, th, x, f'{m(took)}/{len(took)}', f'{m(etook)}/{len(etook)}', f'{m(tail)}/{len(tail)}', f'{m(plain)}/{len(plain)}'])
table(['arch', 'load', 'T ms', 'X ms', 'misses: takes after X released early', 'of them Electron', 'tails released early', 'plain drags (path < X) released early'], body)


def wait(t):
    return t[1] if t[1] is not None else t[2]


def reading_by(r, x):
    """The slowest reading a rule has by x after the press: an answered ping's round trip if answered by x, else the
    age at x of a ping still out (an unanswered ping's age at the hold's end bounds it)."""
    best = None
    for sent, rtt, age in r['pings']['trips']:
        if sent >= x:
            continue
        if rtt is not None and sent + rtt <= x:
            v = rtt
        else:
            v = min(x - sent, age if age is not None else rtt if rtt is not None else x - sent)
        best = v if best is None else max(best, v)
    return best


print("\n## 4. The gap (ruling 897): plain drags' slowest ping against the draggable presses' slow readings\n")
print("Plain: the largest wait of any ping of any plain drag (D1, D2, sel; an unanswered ping at its age). Draggable, no "
      "take: the smallest of each no-take press's largest wait (tail, V5 no-dragstart, Electron no-take). Draggable, "
      "take after 150: of the presses with a ping answered by 150 (the only ones a rule could release then), the "
      "smallest slowest reading by 150 ms. A threshold between the two with a margin each side is proposed as their geometric mean.\n")
body = []
for arch, load in conds:
    here = [r for r in rows if (r['arch'], r['load']) == (arch, load)]
    plain = [r for r in here if r['outcome'] == 'plain']
    worst = max(plain, key=lambda r: max(wait(t) or 0 for t in r['pings']['trips']), default=None)
    pmax = max(wait(t) or 0 for t in worst['pings']['trips']) if worst else None
    notake = [r for r in here if r['outcome'] in ('tail', 'no_dragstart', 'no_take')]
    nmin = min((max(wait(t) or 0 for t in r['pings']['trips']) for r in notake), default=None)
    late = [r for r in here if r['outcome'] == 'took_hold' and r['hold']['take_after_press_ms'] > 150]
    # a press a rule could release early is one with a ping answered by 150; one with none answered stays held (fail
    # toward the hold), so a young unanswered ping is no fast reading
    answered = lambda r: any(rtt is not None and sent + rtt <= 150 for sent, rtt, _ in r['pings']['trips'])
    lreads = [reading_by(r, 150) for r in late if answered(r)]
    lmin = min((v for v in lreads if v is not None), default=None)
    lnone = sum(1 for r in late if not answered(r))
    sides = [v for v in (nmin, lmin) if v is not None]
    hi = min(sides) if sides else None
    lo = pmax
    if lo and hi and hi > lo:
        mid = (lo * hi) ** 0.5
        prop = f'{mid:.0f} ms ({hi / mid:.1f}x under the draggable side, {mid / lo:.1f}x over the plain side)'
    else:
        prop = '–'
    body.append([arch, load, len(plain), f'{pmax}' + (f" ({worst['source']} {worst['cell']})" if worst else ''), len(notake), nmin,
                 len(late), f'{lmin} (n {len(lreads)}; {lnone} with no ping answered by 150, held)', f'{hi / lo:.1f}x' if lo and hi else '–', prop])
table(['arch', 'load', 'plain drags', 'plain max ms', 'no-take presses', 'their min of max ms', 'takes after 150',
       'their min reading by 150 ms', 'gap', 'proposed threshold'], body)

print('\n## 5. Failing toward the hold: pings that were not a fast answer, by class\n')
body = []
for arch, load in sorted({(r['arch'], r['load']) for r in allrows}):
    by = collections.defaultdict(list)
    for r in allrows:
        if (r['arch'], r['load']) == (arch, load) and r.get('hold') and r['hold'].get('held'):
            by[cls(r) if r['source'] != 'edn' else f"{r['outcome']} (edn)"].append(r)
    for g, rs in sorted(by.items()):
        p = [r.get('pings') or {} for r in rs]
        whys = collections.Counter(str(x.get('why') or 'no record: the path reached B') for x in p if not x.get('asked'))
        body.append([arch, load, g, len(rs), sum(1 for x in p if x.get('asked') and x.get('unanswered')),
                     sum(x.get('in_flight', 0) or 0 for x in p), sum(x.get('send_failed', 0) or 0 for x in p),
                     '; '.join(f'{k}: {v}' for k, v in sorted(whys.items())) or '–'])
table(['arch', 'load', 'class', 'held drags', 'with an unanswered ping', 'pings in flight at the end', 'pings failed to send',
       'not asked (why: n)'], body)
