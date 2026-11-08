# #321's A/B offline: per head (A, B: the artifact's first directory) and cell, over every results.json under the run
# directories given: delivery, the watch's raises inside the hold and after it (visible), front app and key window held;
# the delivery record's transientRaise (seen, ms, outlivedHold), screenHoldMs, capped, guardMs, activationClickKind and the
# click's answer latency; transientRaise read against the watch; and every guard above 250 ms with its record.
#   python3 -I ab.py <run dir>...
import json
import os
import statistics as st
import sys
from collections import defaultdict

POINTER = ['pointerdown', 'mousedown', 'mouseup', 'click']


def k282_delivered(c):
    label, d = c['label'], c.get('delta') or {}
    k = c.get('click') or {}
    answer = (k.get('error') or {}).get('errorName') or ('success' if 'result' in k else 'none')
    if label == 'geometry' or label.startswith('b-noobs'):
        return answer, None
    if 'reload' in label:
        return answer, answer == 'success' and d.get('loads', 0) >= 1
    own = {'checkbox': d.get('optionChange') == 1, 'button': d.get('applyClick') == 1, 'textarea': d.get('textFocus') == 1}
    target = 'checkbox' if 'checkbox' in label else 'button' if 'button' in label else 'textarea'
    return answer, answer == 'success' and all(d.get(p) == 1 for p in POINTER[:3]) and d.get('click', 0) >= 1 and own[target]


def deliver_ok(c):
    d = c.get('delta')
    if d is None:
        return (c.get('delivered') or {}).get('ok')
    t = c.get('target')
    pointer = all(d.get(p) == 1 for p in POINTER[:3]) and d.get('click', 0) >= 1
    own = d.get('optionChange') == 1 if t == 'checkbox' else d.get('applyClick') == 1 if t == 'button' else d.get(f'focus_{t}') == 1 and c.get('active') == t
    return (c.get('answer') or {}).get('answer') == 'success' and pointer and own


def watched(w, dl, cover_bundle, cover_name):
    """The watch against the cover's front window: a span above it inside the hold, past the hold's end (visible),
    inside the guard (from the hold's start to the guard's end), still above at the watch's end; front and key held."""
    changes = (w or {}).get('changes') or []
    if not changes:
        return None
    hs = (dl or {}).get('holdStartedAt')
    he = hs + (dl.get('screenHoldMs') or 0) if hs is not None else None
    ge = dl['postedAt'] + (dl.get('guardMs') or 0) if dl and dl.get('postedAt') is not None else None
    inside = after = in_guard = False
    first_visible = None
    for i, c in enumerate(changes):
        if not c.get('aboveFront'):
            continue
        end = changes[i + 1]['atMs'] if i + 1 < len(changes) else float('inf')
        if he is None or end > he:
            after = True
            first_visible = first_visible or c
        if hs is not None and c['atMs'] < he:
            inside = True
        if hs is not None and ge is not None and end > hs and c['atMs'] < ge:
            in_guard = True
    return {'inside': inside, 'after': after, 'inGuard': in_guard, 'stuck': bool(changes[-1].get('aboveFront')),
            'front': all(c.get('frontmost') == cover_bundle for c in changes),
            'key': all((c.get('key') or '').startswith(cover_name + ':') for c in changes),
            'samples': (w or {}).get('samples'), 'firstVisible': first_visible}


def q(xs, p):
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(p * len(xs)))] if xs else None


def dist(xs):
    xs = [x for x in xs if isinstance(x, (int, float))]
    return f"n={len(xs)} min={min(xs):.0f} p50={st.median(xs):.0f} p95={q(xs, .95):.0f} max={max(xs):.0f}" if xs else '-'


cells = defaultdict(lambda: defaultdict(list))
outliers = []
for top in sys.argv[1:]:
    for root, _, files in os.walk(top):
        if 'results.json' not in files:
            continue
        rel = os.path.relpath(root, top).split(os.sep)
        head = rel[1] if len(rel) > 1 else rel[0]  # the artifact's first directory: A, B (or an earlier run's variant)
        data = json.load(open(os.path.join(root, 'results.json')))
        for c in data['cells']:
            if 'p321' in c or c.get('label') == 'geometry':
                app, cell = 'safari-282', c['label']
                answer, ok = k282_delivered(c)
                p = c.get('p321') or {}
                dl, w = p.get('delivery'), p.get('watch')
                meta = ((c.get('click') or {}).get('result') or (c.get('click') or {}).get('error') or {}).get('meta') or {}
                kind, ms = meta.get('activationClickKind'), None
                cover = ('com.apple.TextEdit', 'TextEdit')
            elif 'judged' in c or 'delivered' in c:
                app, cell = data['config'].get('browser'), c['cell']
                answer, ok = (c.get('answer') or {}).get('answer', 'none'), deliver_ok(c)
                dl, w = c.get('delivery'), c.get('watch')
                kind, ms = (c.get('answer') or {}).get('activationClickKind'), c.get('clickMs')
                cover = ('com.ssfskim.probe313', 'Probe313') if app == 'native' else ('com.apple.TextEdit', 'TextEdit')
            else:
                continue
            s = cells[(app, cell, head)]
            label = f"{'/'.join(rel)}/{c.get('label')}"
            s['n'].append(1)
            s['answers'].append(answer)
            s['kind'].append(json.dumps(kind, sort_keys=True) if kind else '-')
            if ok is not None:
                s['ok'].append(bool(ok))
                if not ok:
                    s['fails'].append(label)
            if ms is not None:
                s['ms'].append(ms)
            j = watched(w, dl, *cover)
            if j:
                for k in ('inside', 'after', 'stuck', 'front', 'key', 'inGuard'):
                    s[k].append(j[k])
                s['samples'].append(j['samples'])
            if dl:
                tr = dl.get('transientRaise')
                s['held'].append(1)
                s['capped'].append(bool(dl.get('capped')))
                s['hold'].append(dl.get('screenHoldMs'))
                s['guard'].append(dl.get('guardMs'))
                s['repaired'].append(bool((dl.get('restores') or 0) > 0 or dl.get('repairedAfterRelease')))
                s['repairedAfter'].append(bool(dl.get('repairedAfterRelease')))
                s['raiseLeft'].append(bool(dl.get('raiseLeft')))
                if tr is not None:
                    s['tr'].append(tr)
                    if j:
                        s['truth'].append((tr.get('seen'), j['inGuard'], tr.get('outlivedHold'), j['after'], label))
                if (dl.get('guardMs') or 0) > 250:
                    outliers.append((head, app, cell, label, dl, j and {k: j[k] for k in ('inside', 'after', 'samples')}))
                if j and j['after']:
                    fv = j['firstVisible']
                    s['visible'].append(f"{label} guardMs={dl.get('guardMs')} hold={dl.get('screenHoldMs')} capped={dl.get('capped')} "
                                        f"tr={json.dumps(tr)} risesAfterPost={round(fv['atMs'] - dl['postedAt']) if dl.get('postedAt') else '-'} "
                                        f"risesVsRelease={round(fv['atMs'] - dl['holdStartedAt'] - (dl.get('screenHoldMs') or 0)) if dl.get('holdStartedAt') else '-'}")


def count(xs):
    out = defaultdict(int)
    for x in xs:
        out[x] += 1
    return dict(out)


for key in sorted(cells):
    s = cells[key]
    app, cell, head = key
    tr = s['tr']
    print(f"{app:10} {cell:28} {head} n={len(s['n'])} delivered={sum(s['ok'])}/{len(s['ok'])} answers={count(s['answers'])} kinds={count(s['kind'])}")
    if s['inside'] or s['held']:
        print(f"    watch: inside hold={sum(s['inside'])} visible after hold={sum(s['after'])} stuck={sum(s['stuck'])} front held={sum(s['front'])}/{len(s['front'])} "
              f"key held={sum(s['key'])}/{len(s['key'])} samples {dist(s['samples'])}")
    if s['held']:
        print(f"    record: capped={sum(s['capped'])}/{len(s['held'])} repaired={sum(s['repaired'])} repairedAfterRelease={sum(s['repairedAfter'])} "
              f"raiseLeft={sum(s['raiseLeft'])} screenHoldMs {dist(s['hold'])} guardMs {dist(s['guard'])}")
    if tr:
        print(f"    transientRaise: seen={sum(bool(t.get('seen')) for t in tr)}/{len(tr)} outlivedHold={sum(bool(t.get('outlivedHold')) for t in tr)} "
              f"ms {dist([t.get('ms') for t in tr if t.get('seen')])}")
        truth = s['truth']
        print(f"    vs watch: seen&watch={sum(1 for t in truth if t[0] and t[1])} seen&!watch={sum(1 for t in truth if t[0] and not t[1])} "
              f"!seen&watch={sum(1 for t in truth if not t[0] and t[1])} outlived&visible={sum(1 for t in truth if t[2] and t[3])} "
              f"outlived&!visible={sum(1 for t in truth if t[2] and not t[3])} !outlived&visible={sum(1 for t in truth if not t[2] and t[3])}")
        for t in truth:
            if bool(t[2]) != bool(t[3]) or (not t[0] and t[1]):
                print(f"      mismatch {t[4]}: seen={t[0]} watchInGuard={t[1]} outlivedHold={t[2]} visible={t[3]}")
    if s['ms']:
        print(f"    click answer ms {dist(s['ms'])}")
    for v in s['visible'] if 'shared' in cell or cell.startswith('a-main') else []:
        print(f"      visible {v}")
    if s['fails']:
        print(f"    fails {s['fails'][:6]}")

print('\nguards above 250 ms:')
for o in outliers:
    print(f"  {o[0]} {o[1]} {o[2]} {o[3]}: {json.dumps(o[4], sort_keys=True)} watch {o[5]}")
