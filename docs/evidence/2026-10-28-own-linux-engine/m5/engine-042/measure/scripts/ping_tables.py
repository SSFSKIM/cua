"""Task 116: the tables from join_samples.py's rows (one or more JSONL files, any architectures and loads).

  python3 -I ping_tables.py <samples.jsonl>...

1. Outcomes per architecture, load, source, cell, lane (and V5's series).
2. The ping predictor (888.2), per architecture and load, on the default lane (`cua`): over every drag with no take whose
   hold ran and asked its source, `tail` (a dragstart of its own with no take by the release) against everything else
   with no take: V5's `no_dragstart` and D1's and D2's `plain` drags, the controls. Thresholds are the controls' 90th,
   95th and 99th percentiles of the first ping's round trip and of the largest (an unanswered ping at its wait,
   censored); a drag is flagged when its value is above the threshold. Hits are tail drags flagged; false alarms are the
   others flagged. "The watch missed" is the tail with no late take reported: the drags only a notice would cover.
3. The round trips' distributions per group (default lane), the takes during the hold, and the tail's dragstarts.
4. The late-take watch (888.4): every late take the watch reported, with the drag's answer, the read's notice and the
   next request's answer, and their count by time after the release.
5. Whether a plain drag's answer waited on the watch: D1's and D2's plain drags' time outside press-to-release
   (`answer_less_hold_ms`) per cell and lane, and each held no-take drag's release after the press past its bound.
6. The sampler and the release (ruling 892): the release after the press per class (a take during the hold, before
   it, or none) and lane, the default lane beside the sampler-off lane (`cua:nopings`).
"""
import collections, json, sys

rows = [json.loads(l) for p in sys.argv[1:] for l in open(p) if l.strip()]
DEFAULT = 'cua'


def pct(xs, q):
    xs = sorted(x for x in xs if x is not None)
    if not xs:
        return None
    return xs[min(len(xs) - 1, int(q * len(xs)))]


def dist(xs):
    xs = [x for x in xs if x is not None]
    if not xs:
        return '–'
    return ' / '.join(f'{pct(xs, q):.1f}' for q in (.5, .9, .95, .99, 1)) + f' (n {len(xs)})'


def d3(xs):
    xs = [x for x in xs if x is not None]
    return '–' if not xs else f'{pct(xs, .5):.1f} / {pct(xs, .95):.1f} / {max(xs):.1f} (n {len(xs)})'


def short(cell):
    return cell.replace('chrome_dnd_', '').replace('_shared', '')


def table(head, keyrows):
    print('| ' + ' | '.join(head) + ' |')
    print('|' + '---|' * len(head))
    for cells in keyrows:
        print('| ' + ' | '.join(map(str, cells)) + ' |')


def pinged(r):
    return isinstance(r.get('pings'), dict) and r['pings'].get('asked') and r['pings'].get('n')


conds = sorted({(r['arch'], r['load']) for r in rows})

print('## 1. Outcomes\n')
KNOWN = ('took_path', 'took_hold', 'tail', 'no_dragstart', 'plain', 'refused')
groups = collections.defaultdict(collections.Counter)
for r in rows:
    series = r['series'] if r['source'] == 'v5' else 'all'
    groups[(r['arch'], r['load'], r['source'], short(r['cell']), r['lane'], series)][r['outcome']] += 1
table(['arch', 'load', 'source', 'cell', 'lane', 'series', 'n', *KNOWN, 'other'],
      [[*k, sum(c.values()), *(c[o] for o in KNOWN), sum(v for o, v in c.items() if o not in KNOWN)] for k, c in sorted(groups.items())])

print('\n## 2. The ping predictor (default lane)\n')
for arch, load in conds:
    here = [r for r in rows if (r['arch'], r['load']) == (arch, load) and r['lane'] == DEFAULT]
    notake = [r for r in here if r['outcome'] in ('tail', 'no_dragstart', 'plain')]
    asked = [r for r in notake if pinged(r)]
    tail = [r for r in asked if r['outcome'] == 'tail']
    quiet = [r for r in tail if not r.get('late')]
    plain = [r for r in asked if r['outcome'] == 'plain']
    nostart = [r for r in asked if r['outcome'] == 'no_dragstart']
    unpinged = collections.Counter(
        (r['outcome'], r['cell'], 'no hold' if not r.get('hold') else 'not asked' if r.get('pings') and not r['pings'].get('asked') else 'no ping sent')
        for r in notake if not pinged(r))
    print(f'### {arch}, load {load}\n')
    print(f'No-take drags: {len(notake)}; with pings: tail {len(tail)} (the watch missed {len(quiet)}), plain {len(plain)} '
          f'({", ".join(f"{k} {v}" for k, v in sorted(collections.Counter(r["source"] for r in plain).items()))}), '
          f'V5 no-dragstart {len(nostart)}. Without pings: {"; ".join(f"{k}: {v}" for k, v in sorted(unpinged.items())) or "none"}.\n')
    # each control set sets its own thresholds: D1's and D2's plain drags (another scene, no ballast) and V5's scene's own
    # select control (`sel`: the same page and ballast); a notice on a V5 no-dragstart drag is a false alarm too
    for name, controls in (("D1's and D2's plain drags", [r for r in plain if r['source'] in ('d1', 'd2')]),
                           ("V5's scene's select control", [r for r in plain if r['source'] == 'sel'])):
        if not controls:
            print(f'{name}: none with pings, no thresholds.\n')
            continue
        print(f'Thresholds from {name} (n {len(controls)}):\n')
        out = []
        for metric in ('max_ms', 'first_ms'):
            for q in (.9, .95, .99):
                th = pct([r['pings'][metric] for r in controls], q)
                f = lambda rs: sum(1 for r in rs if (r['pings'][metric] or 0) > th)
                out.append([metric, f'p{int(q * 100)}', f'{th:.1f}', f'{f(tail)}/{len(tail)}', f'{f(quiet)}/{len(quiet)}',
                            f'{f(controls)}/{len(controls)}', f'{f(nostart)}/{len(nostart)}',
                            f'{f(controls) + f(nostart)}/{len(controls) + len(nostart)}'])
        table(['metric', "controls' percentile", 'threshold ms', 'tail hits', 'of them the watch missed', 'false alarms, controls',
               'false alarms, V5 no-dragstart', 'false alarms, both'], out)
        print()

print('## 3. Round trips (p50 / p90 / p95 / p99 / max, ms), default lane\n')
out = []
for arch, load in conds:
    by = collections.defaultdict(list)
    for r in rows:
        if (r['arch'], r['load']) != (arch, load) or r['lane'] != DEFAULT or not pinged(r):
            continue
        g = r['outcome'] if r['outcome'] != 'plain' else f"plain {r['cell']}"
        if r['source'] == 'v5':
            g = f"{g} ({short(r['cell'])})"
        by[g].append(r)
        if r['outcome'] == 'plain':
            by['plain, all controls'].append(r)
    for g, rs in sorted(by.items()):
        out.append([arch, load, g, dist([r['pings']['first_ms'] for r in rs]), dist([r['pings']['max_ms'] for r in rs]),
                    dist([r['pings']['n'] for r in rs]), sum(1 for r in rs if r['pings']['unanswered'])])
table(['arch', 'load', 'group', 'first ping', 'largest ping', 'pings a drag', 'drags with an unanswered ping'], out)

print('\nTakes during the hold, ms after the press:\n')
th = collections.defaultdict(list)
for r in rows:
    if r['outcome'] == 'took_hold':
        th[(r['arch'], r['load'], r['source'], short(r['cell']), r['lane'])].append(r['hold']['take_after_press_ms'])
table(['arch', 'load', 'source', 'cell', 'lane', 'p50 / p90 / p95 / p99 / max'], [[*k, dist(xs)] for k, xs in sorted(th.items())])

print("\nThe tail: the page's dragstart after the press (ms):\n")
tl = collections.defaultdict(list)
for r in rows:
    if r['outcome'] == 'tail':
        tl[(r['arch'], r['load'], short(r['cell']), r['lane'])].append(r)
table(['arch', 'load', 'cell', 'lane', 'p50 / p90 / p95 / p99 / max', 'past B', 'late take reported'],
      [[*k, dist([r['dragstart_ms'] for r in rs]),
        sum(1 for r in rs if r['dragstart_ms'] is not None and r['hold'] and r['dragstart_ms'] > r['hold']['bound_ms']),
        sum(1 for r in rs if r.get('late'))] for k, rs in sorted(tl.items())])

print('\n## 4. The late-take watch\n')
late = [r for r in rows if r.get('late')]
table(['arch', 'load', 'source', 'cell', 'lane', 'outcome', 'ok', 'take after release ms', 'escaped', 'read notice', 'next request'],
      [[r['arch'], r['load'], r['source'], short(r['cell']), r['lane'], r['outcome'], r['ok'], r['late']['after_release_ms'],
        r['late']['escaped'], (r.get('late_read_notice') or '–')[:60],
        'ok' if (r.get('late_next') or {}).get('ok') else ((r.get('late_next') or {}).get('error') or '–')[:90]]
       for r in sorted(late, key=lambda r: (r['arch'], r['load'], r['source'], r['late']['after_release_ms'] or 0))])
buckets = collections.Counter()
for r in late:
    a = r['late']['after_release_ms']
    b = 'unconfirmed or failed' if a is None else '<= 300' if a <= 300 else '300-700' if a <= 700 else '> 700'
    buckets[(r['arch'], r['load'], r['lane'], b)] += 1
print('\nBy time after the release: ' + ('; '.join(f'{a} load {l} {ln} {b}: {n}' for (a, l, ln, b), n in sorted(buckets.items())) or 'none'))

print("\n## 5. Plain drags' answers and the hold's release\n")
print('Time outside press-to-release (answer_ms less the release after the press; ms):\n')
pl = collections.defaultdict(list)
for r in rows:
    if r['outcome'] == 'plain' and r.get('answer_less_hold_ms') is not None:
        pl[(r['arch'], r['load'], r['cell'], r['lane'])].append(r['answer_less_hold_ms'])
table(['arch', 'load', 'cell', 'lane', 'p50 / p90 / p95 / p99 / max', '>= 300'],
      [[*k, dist(xs), sum(1 for x in xs if x >= 300)] for k, xs in sorted(pl.items())])
print('\nHeld drags with no take whose path ended before B: the release after the press, past the bound (ms). A path that '
      'itself ran past B (arm64 at twice the load, Electron) is held for nothing and released at its end.\n')
rb = collections.defaultdict(list)
for r in rows:
    h = r.get('hold')
    if (h and h.get('held') and not h.get('taken') and r.get('release_after_press_ms') is not None
            and (h.get('path_ms') or 0) < h['bound_ms']):
        rb[(r['arch'], r['load'], r['source'], r['lane'])].append(r['release_after_press_ms'] - h['bound_ms'])
table(['arch', 'load', 'source', 'lane', 'p50 / p90 / p95 / p99 / max', '> 25 ms past'],
      [[*k, dist(xs), sum(1 for x in xs if x > 25)] for k, xs in sorted(rb.items())])

print('\n## 6. The sampler and the release (ruling 892)\n')
print("The engine's wall release after its press, p50 / p95 / max (ms); a refused drag records none, so its answer time "
      'stands beside it.\n')
CLASS = {'took_hold': 'take during the hold', 'took_path': 'take before the hold', 'tail': 'no take', 'no_dragstart': 'no take',
         'plain': 'no take'}
rel = collections.defaultdict(list)
for r in rows:
    if r['outcome'] in CLASS:
        rel[(r['arch'], r['load'], r['source'], short(r['cell']), CLASS[r['outcome']], r['lane'])].append(r)
table(['arch', 'load', 'source', 'cell', 'class', 'lane', 'release after press', 'answer'],
      [[*k, d3([r['release_after_press_ms'] for r in rs]), d3([r['answer_ms'] for r in rs])] for k, rs in sorted(rel.items())])
