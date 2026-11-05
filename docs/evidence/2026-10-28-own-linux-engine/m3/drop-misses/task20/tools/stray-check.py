# stray-check.py <run-dir>: crossing events delivered to Chrome's client between a press (+1 ms, after the engine's own
# synthetic Enters that precede it) and the take (or the release when there is none), other than the take's own grab
# crossings: what a real pointer event during the press window would look like.
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
presses = [r for r in req if r.get('kind') == 'send_event' and r.get('event') == 'button_press' and r.get('detail') == 1]
found = 0
for p in presses:
    rel = next((r for r in req if r.get('kind') == 'send_event' and r.get('event') == 'button_release' and r.get('client') == p['client'] and r['server_time'] >= p['server_time']), None)
    if not rel:
        continue
    take = next((r for r in req if r.get('kind') == 'set_selection_owner' and r.get('selection') == 466 and r.get('owner') and p['server_time'] <= r['server_time'] <= rel['server_time']), None)
    end = take['server_time'] if take else rel['server_time']
    odd = [c for c in cross if c.get('client') == 0x600000 and p['server_time'] + 1 <= c['server_time'] < end]
    if odd:
        found += 1
        print(p['server_time'], 'take' if take else 'no take', [(c['kind'], c['server_time'] - p['server_time'], c['mode'], c['detail']) for c in odd])
print(f"{len(presses)} presses; {found} with a crossing to Chrome between the press and the take")
