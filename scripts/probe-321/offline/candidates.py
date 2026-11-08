# #321 offline: per engine variant and cell, over every artifact under the run directories given: delivery, raises
# inside the hold and after it (visible), front app and key window held, from #282's kit (row.p321) and deliver.mjs.
#   python3 -I candidates.py <run dir>...
import json
import os
import sys
from collections import defaultdict

POINTER = ['pointerdown', 'mousedown', 'mouseup', 'click']


def k282_delivered(c):
    """#282's cell delivered: the answer, and for a click the pointer events 1/1/1/1 and the control's change."""
    label, d = c['label'], c.get('delta') or {}
    if label == 'geometry':
        g = c.get('geometry') or {}
        return f"geometry frameEqual={g.get('frameEqual')} apEqual={g.get('activationPointEqual')}", None
    k = c.get('click') or {}
    answer = (k.get('error') or {}).get('errorName') or ('success' if 'result' in k else 'none')
    if label.startswith('b-noobs'):
        return answer, None  # its expected answer is main's: compared against main, not judged here
    if 'reload' in label:
        return answer, answer == 'success' and d.get('loads', 0) >= 1
    own = {'checkbox': d.get('optionChange') == 1, 'button': d.get('applyClick') == 1, 'textarea': d.get('textFocus') == 1}
    target = 'checkbox' if 'checkbox' in label else 'button' if 'button' in label else 'textarea'
    # A click on the checkbox's label also clicks the box (two click events), as in deliver_ok.
    ok = answer == 'success' and all(d.get(p) == 1 for p in POINTER[:3]) and d.get('click', 0) >= 1 and own[target]
    return answer, ok


def rejudge(w, delivery, cover_bundle, cover_name):
    """watch.mjs's judge again, against the cover's front window (aboveFront): #282's kit opens a new document per
    repetition, and TextEdit restores the earlier ones behind Safari, so aboveAny counts those."""
    changes = (w or {}).get('changes') or []
    if not changes:
        return None
    hold_start = (delivery or {}).get('holdStartedAt')
    hold_end = hold_start + (delivery.get('screenHoldMs') or 0) if hold_start is not None else None
    inside = after = False
    for i, c in enumerate(changes):
        if not c.get('aboveFront'):
            continue
        end = changes[i + 1]['atMs'] if i + 1 < len(changes) else float('inf')
        if hold_end is None or end > hold_end:
            after = True
        if hold_start is not None and c['atMs'] < hold_end:
            inside = True
    return {'raisedInsideHold': inside, 'raisedAfterHold': after, 'stuck': bool(changes[-1].get('aboveFront')),
            'frontHeld': all(c.get('frontmost') == cover_bundle for c in changes),
            'keyHeld': all((c.get('key') or '').startswith(cover_name + ':') for c in changes)}


def deliver_ok(c):
    """deliver.mjs's cell, judged again: pointerdown, mousedown and mouseup once and click at least once (a click on the
    checkbox's label also clicks the box: two click events), and the control's own change."""
    d = c.get('delta')
    if d is None:
        return (c.get('delivered') or {}).get('ok')  # native: the caret moved
    t = c.get('target')
    pointer = all(d.get(p) == 1 for p in POINTER[:3]) and d.get('click', 0) >= 1
    own = d.get('optionChange') == 1 if t == 'checkbox' else d.get('applyClick') == 1 if t == 'button' else d.get(f'focus_{t}') == 1 and c.get('active') == t
    return (c.get('answer') or {}).get('answer') == 'success' and pointer and own


cells = defaultdict(lambda: {'n': 0, 'delivered': 0, 'judged': 0, 'inside': 0, 'after': 0, 'front': 0, 'key': 0, 'stuck': 0, 'capped': 0, 'repaired': 0, 'held': 0, 'answers': defaultdict(int), 'kinds': defaultdict(int), 'fails': []})
for top in sys.argv[1:]:
    for root, _, files in os.walk(top):
        if 'results.json' not in files:
            continue
        data = json.load(open(os.path.join(root, 'results.json')))
        parts = os.path.relpath(root, top).split(os.sep)
        art = parts[0]
        variant = data['config'].get('variant') or data['config'].get('head') or art.split('-')[2]
        for c in data['cells']:
            if 'p321' in c or c.get('label') == 'geometry':  # #282's kit
                key = (variant, 'safari-282', c['label'])
                answer, ok = k282_delivered(c)
                p = c.get('p321') or {}
                j = rejudge(p.get('watch'), p.get('delivery'), 'com.apple.TextEdit', 'TextEdit')
                kind = (((c.get('click') or {}).get('result') or (c.get('click') or {}).get('error') or {}).get('meta') or {}).get('activationClickKind')
            elif 'judged' in c or 'delivered' in c:
                key = (variant, data['config'].get('browser'), c['cell'])
                answer = (c.get('answer') or {}).get('answer', 'none')
                ok = deliver_ok(c)
                native = data['config'].get('browser') == 'native'
                j = rejudge(c.get('watch'), c.get('delivery'), 'com.ssfskim.probe313' if native else 'com.apple.TextEdit', 'Probe313' if native else 'TextEdit')
                kind = (c.get('answer') or {}).get('activationClickKind')
            else:
                continue
            s = cells[key]
            s['n'] += 1
            s['answers'][answer] += 1
            s['kinds'][json.dumps(kind, sort_keys=True) if kind else '-'] += 1
            if ok:
                s['delivered'] += 1
            elif ok is False:
                s['fails'].append(f"{art}/{c.get('label')}")
            dl = (c.get('p321') or {}).get('delivery') if 'p321' in c else c.get('delivery')
            if dl:
                s['held'] += 1
                s['capped'] += bool(dl.get('capped'))
                s['repaired'] += bool((dl.get('restores') or 0) > 0 or dl.get('repairedAfterRelease'))
            if j:
                s['judged'] += 1
                s['inside'] += bool(j.get('raisedInsideHold'))
                s['after'] += bool(j.get('raisedAfterHold'))
                s['front'] += bool(j.get('frontHeld'))
                s['key'] += bool(j.get('keyHeld'))
                s['stuck'] += bool(j.get('stuck'))

for key in sorted(cells):
    s = cells[key]
    print(f"{key[0]:5} {key[1]:12} {key[2]:28} n={s['n']:3} delivered={s['delivered']:3} raised inside hold={s['inside']:3} after hold={s['after']:3} "
          f"stuck={s['stuck']:3} capped={s['capped']}/{s['held']} repaired={s['repaired']}/{s['held']} front held={s['front']}/{s['judged']} key held={s['key']}/{s['judged']} answers={dict(s['answers'])} kinds={dict(s['kinds'])}"
          + (f" fails={s['fails'][:4]}" if s['fails'] else ''))
