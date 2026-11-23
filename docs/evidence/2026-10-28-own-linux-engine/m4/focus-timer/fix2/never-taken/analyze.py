#!/usr/bin/env python3
# The never-taken probe's analysis: per run, on terminal A's X connection (through the probe's xtrace proxy, each line
# stamped on arrival, ms on the probe's clock): the new owner's XFixes notice, A's TARGETS conversion and the owner's
# answer, the paste chord's key events (and the window they went to), every data conversion and its answer, any
# conversion after the engine answered, and the connection's request sequence over the run (no gap = nothing lost).
# usage: python3 -I analyze.py <run dir> [--excerpts <dir>]  (excerpts: every missed run's lines, and three passing runs')
import json
import re
import sys
from pathlib import Path

run_dir = Path(sys.argv[1])
excerpts = Path(sys.argv[sys.argv.index('--excerpts') + 1]) if '--excerpts' in sys.argv else None

rows = [json.loads(l) for l in open(run_dir / 'runs.jsonl') if l.strip()]
meta = next(r for r in rows if r['kind'] == 'meta')
runs = [r for r in rows if r['kind'] == 'run']
ends = {r['trial']: r for r in rows if r['kind'] == 'run-end'}

LINE = re.compile(r'^(?P<t>[\d.]+) (?P<c>\d{3}):(?P<d>[<>]):(?P<rest>.*)$')
SEQ = re.compile(r'^(?P<seq>[0-9a-f]{4}):')

lines = []
# each line's place in the trace: xtrace writes a connection's messages in the order it forwards them, so the order of
# two lines of one connection and one direction is the order the client received them, whatever their stamps
order = []
base = {}
with open(run_dir / 'xtrace.stamped.log', errors='replace') as f:
    for raw in f:
        m = LINE.match(raw.rstrip('\n'))
        if not m:
            continue
        t, c, d, rest = float(m['t']), m['c'], m['d'], m['rest']
        b = re.search(r'resource-id=0x([0-9a-f]+)', rest)
        if b:
            base[c] = int(b.group(1), 16)
        s = SEQ.match(rest)
        lines.append((t, c, d, int(s['seq'], 16) if s else None, rest))
        order.append(len(order))

MASK = 0x1FFFFF
a_base = meta['a'] & ~MASK
a_conns = sorted(c for c, v in base.items() if v == a_base)
# the server's own connection is the one whose key events name A's window
a_conn = next((c for (t, c, d, s, rest) in lines if 'KeyPress' in rest and f'event=0x{meta["a"]:08x}' in rest), None)


def seq_gaps(conn, t0, t1):
    """Requests on `conn` stamped in [t0, t1) whose sequence is not the previous request's plus one."""
    prev = None
    gaps = []
    n = 0
    for (t, c, d, s, rest) in lines:
        if c != conn or d != '<' or s is None or not (t0 <= t < t1):
            continue
        n += 1
        if prev is not None and s != (prev + 1) & 0xFFFF:
            gaps.append((prev, s, t))
        prev = s
    return n, gaps


def field(rest, name):
    m = re.search(name + r'=(0x[0-9a-f]+)(?:\("([^"]*)"\))?', rest)
    return (m.group(2) or m.group(1)) if m else None


out = []
for i, r in enumerate(runs):
    t0 = r['started_ms']
    t1 = runs[i + 1]['started_ms'] if i + 1 < len(runs) else float('inf')
    answered = t0 + r['answered_ms']
    closed = t0 + r['closed_ms']
    mine = [(t, c, d, s, rest) for (t, c, d, s, rest) in lines if c == a_conn and t0 <= t < t1]
    idx = [i for i, (t, c, d, s, rest) in enumerate(lines) if c == a_conn and t0 <= t < t1]
    owner_set = next((t for (t, c, d, s, rest) in mine if 'XFIXES-SelectionNotify' in rest and 'set owner' in rest), None)
    # the owner's end: its window destroyed or its client closed (the engine's exit)
    owner_gone = next((t for (t, c, d, s, rest) in mine if 'XFIXES-SelectionNotify' in rest and 'set owner' not in rest), None)
    convs = []
    for (t, c, d, s, rest) in mine:
        if d == '<' and 'ConvertSelection' in rest and 'CLIPBOARD' in rest:
            convs.append({'at': t, 'seq': s, 'target': field(rest, 'target'), 'time': field(rest, 'time'), 'answer': None})
    for j, (t, c, d, s, rest) in zip(idx, mine):
        if d == '>' and 'Event' in rest and ' SelectionNotify(' in rest and 'CLIPBOARD' in rest:
            tgt = field(rest, 'target')
            for cv in convs:
                if cv['answer'] is None and cv['target'] == tgt and cv['at'] <= t:
                    cv['answer'] = {'at': t, 'line': j, 'ms': round(t - cv['at'], 3), 'property': field(rest, 'property'), 'generated': '(generated)' in rest}
                    break
    keys = []
    for j, (t, c, d, s, rest) in zip(idx, mine):
        m = re.search(r'Event (\(generated\) )?(KeyPress|KeyRelease)\(\d\) keycode=(0x[0-9a-f]+).*?event=(0x[0-9a-f]+).*?state=(\S+)', rest)
        if m:
            keys.append({'at': t, 'line': j, 'seq': s, 'kind': m.group(2), 'keycode': m.group(3), 'window': m.group(4), 'state': m.group(5), 'generated': bool(m.group(1))})
    # the chord: Control_L (0x25), Shift_L (0x32), v (0x37) with Shift,Control, and their releases (within 50 ms of v)
    v = next((k for k in keys if k['kind'] == 'KeyPress' and k['keycode'] == '0x37' and 'Control' in k['state']), None)
    chord = [k for k in keys if v and abs(k['at'] - v['at']) < 50 and k['keycode'] in ('0x25', '0x32', '0x37')]
    targets = [cv for cv in convs if cv['target'] == 'TARGETS']
    data = [cv for cv in convs if cv['target'] != 'TARGETS']
    first = next((cv['answer'] for cv in targets if cv['answer'] and owner_set and cv['at'] >= owner_set), None)
    first_targets_answer = first['at'] if first else None
    n, gaps = seq_gaps(a_conn, t0, t1)
    rec = {
        'trial': r['trial'],
        'outcome': r['outcome'],
        'got_bytes': r['got_bytes'],
        'engine_log': (r['paste'] or {}).get('log'),
        'transfer': (r['paste'] or {}).get('transfer'),
        'owner_set_ms': round(owner_set - t0, 1) if owner_set else None,
        'targets': [{**cv, 'at_ms': round(cv['at'] - t0, 1), 'answer_ms': cv['answer']['ms'] if cv['answer'] else None, 'answer_property': cv['answer']['property'] if cv['answer'] else None} for cv in targets],
        'chord_v_ms': round(v['at'] - t0, 1) if v else None,
        'chord_window': v['window'] if v else None,
        'chord_generated': v['generated'] if v else None,
        'chord_keys': [f"{k['kind']} {k['keycode']} {k['state']} +{round(k['at'] - t0, 1)}" for k in chord],
        # in the order A received them: the chord's v press before the owner's answer to A's TARGETS
        'chord_before_targets_answer': (v['line'] < first['line']) if (v and first) else (True if v and not first else None),
        # an event's sequence is the last request of A's the server had processed when it sent the event: a v press
        # whose sequence is at least that of A's TARGETS conversion was sent after the server had handed that
        # conversion to the owner (as a SelectionRequest)
        'targets_request_seq': targets[0]['seq'] if targets else None,
        'chord_v_seq': v['seq'] if v else None,
        'targets_requested_before_chord_sent': ((v['seq'] - targets[0]['seq']) & 0xFFFF) < 0x8000 if (v and targets) else None,
        'targets_answer_after_chord_ms': round(first_targets_answer - v['at'], 1) if (v and first_targets_answer) else None,
        'owner_to_targets_request_ms': round(targets[0]['at'] - owner_set, 1) if (targets and owner_set) else None,
        'data': [{'target': cv['target'], 'at_ms': round(cv['at'] - t0, 1), 'answer_ms': cv['answer']['ms'] if cv['answer'] else None, 'answer_property': cv['answer']['property'] if cv['answer'] else None, 'after_answer': cv['at'] > answered} for cv in data],
        'answered_ms': round(r['answered_ms'], 1),
        'engine_closed_ms': round(r['closed_ms'], 1),
        'owner_gone_ms': round(owner_gone - t0, 1) if owner_gone else None,
        # every conversion of A's after the engine answered, and the ones that are not the owner-change refresh of
        # TARGETS after the owner's end
        'conversions_after_answer_all': [{'target': cv['target'], 'at_ms': round(cv['at'] - t0, 1), 'answer_property': cv['answer']['property'] if cv['answer'] else None} for cv in convs if cv['at'] > answered],
        'conversions_after_answer': [{'target': cv['target'], 'at_ms': round(cv['at'] - t0, 1)} for cv in convs if cv['at'] > answered and not (owner_gone and cv['at'] > owner_gone and cv['target'] == 'TARGETS')],
        'window_ms': round(t1 - t0, 1) if t1 != float('inf') else None,
        'a_requests': n,
        'a_seq_gaps': gaps,
    }
    out.append(rec)
    # every run that missed, and the first three that passed, for contrast
    if excerpts is not None and (r['outcome'] != 'ok' or sum(1 for o in out if o['outcome'] == 'ok') <= 3):
        excerpts.mkdir(parents=True, exist_ok=True)
        keep = re.compile(r'Selection|XFIXES|KeyPress|KeyRelease|FocusIn|FocusOut|GetProperty|DeleteProperty|Reply to GetSelectionOwner')
        with open(excerpts / f"trial-{r['trial']}.log", 'w') as f:
            f.write(f"# trial {r['trial']} ({r['outcome']}): lines of terminal A's connection {a_conn} (and B's selection lines), ms from the run's start\n")
            for (t, c, d, s, rest) in lines:
                if not (t0 <= t < t1):
                    continue
                if (c == a_conn and keep.search(rest)) or (c != a_conn and ('Selection' in rest or 'XFIXES' in rest)):
                    f.write(f'+{t - t0:9.3f} {c}:{d}:{rest[:400]}\n')

total_n, total_gaps = seq_gaps(a_conn, 0, float('inf'))
summary = {
    'a_conn': a_conn,
    'a_conns_same_client': a_conns,
    'runs': len(out),
    'outcomes': {k: sum(1 for o in out if o['outcome'] == k) for k in sorted({o['outcome'] for o in out})},
    'a_requests_whole_trace': total_n,
    'a_seq_gaps_whole_trace': total_gaps,
}
json.dump({'summary': summary, 'runs': out}, sys.stdout, indent=1)
print()
