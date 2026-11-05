# cross-press.py <run-dir>: for every synthetic left press (SendEvent) in the request record, the crossing events
# delivered to any client between 50 ms before the press and its release, and the real pointer then, by server time.
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
cross = [c for c in load(d + '/crossing.jsonl') if c.get('kind') in ('enter', 'leave')]
ptr = [c for c in load(d + '/crossing.jsonl') if c.get('kind') == 'pointer']
presses = [r for r in req if r.get('kind') == 'send_event' and r.get('event') == 'button_press' and r.get('detail') == 1]
n_with = 0
for p in presses:
    rel = next((r for r in req if r.get('kind') == 'send_event' and r.get('event') == 'button_release' and r.get('client') == p['client'] and r['server_time'] >= p['server_time']), None)
    if not rel:
        continue
    t0, t1 = p['server_time'], rel['server_time']
    near = [c for c in cross if t0 - 50 <= c['server_time'] <= t1]
    if near:
        n_with += 1
        print(f"press {t0} (+{t1 - t0} ms to release, wall {p['wall_ms']}):", [(c['kind'], c['server_time'] - t0, hex(c['client']), c['mode'], c['detail'], c['window']) for c in near])
print(f"{len(presses)} presses, {n_with} with a crossing event between 50 ms before the press and the release")
