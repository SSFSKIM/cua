# popup-timing.py <run-dir>: per synthetic press, every crossing event delivered to Chrome's client from 20 ms before
# the press to the release, and the first motion past 4 px, ms after the press (X server clock).
import json, sys
d = sys.argv[1]
def load(f):
    out = []
    for l in open(f):
        try:
            out.append(json.loads(l))
        except Exception:
            pass
    return out
req = load(d + '/reqwatch.jsonl')
cross = [c for c in load(d + '/crossing.jsonl') if c.get('kind') in ('enter', 'leave') and c.get('client') == 0x600000]
for p in [r for r in req if r.get('kind') == 'send_event' and r.get('event') == 'button_press' and r.get('detail') == 1]:
    rel = next((r for r in req if r.get('kind') == 'send_event' and r.get('event') == 'button_release' and r.get('client') == p['client'] and r['server_time'] >= p['server_time']), None)
    if not rel:
        continue
    t0 = p['server_time']
    mot = [m for m in req if m.get('kind') == 'motion' and m.get('client') == p['client'] and t0 <= m['server_time'] <= rel['server_time'] and abs(m['x'] - p['x']) >= 4]
    take = next((r for r in req if r.get('kind') == 'set_selection_owner' and r.get('selection') == 466 and r.get('owner') and t0 <= r['server_time'] <= rel['server_time']), None)
    cs = [(c['kind'], c['server_time'] - t0, c['mode']) for c in cross if t0 - 20 <= c['server_time'] <= rel['server_time']]
    print(f"cross {mot[0]['server_time'] - t0 if mot else None} take {take['server_time'] - t0 if take else None} crossings {cs}")
