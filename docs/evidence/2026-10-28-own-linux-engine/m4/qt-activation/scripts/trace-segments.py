#!/usr/bin/env python3
"""Reads the X trace of a Qt application's own connection (probe-trace.mjs) run by run, by the marks around each click,
and says for each run: whether Qt read the engine's synthetic FocusIn and ButtonPress in one batch (no request of its
own between them), whether it then sent a _NET_ACTIVE_WINDOW request and with which current focus window (the
message's third word: Qt's QGuiApplication::focusWindow() as it handled the press), and whether the front window was
still active after the run. Writes one segment of each kind beside the table.
usage: trace-segments.py <trace> <runs.jsonl> <out dir>"""
import json
import os
import re
import sys

trace_path, runs_path, out = sys.argv[1:4]
data = open(trace_path, 'rb').read()
runs = [json.loads(l) for l in open(runs_path) if l.strip()]
os.makedirs(out, exist_ok=True)


def summary(lines):
    focus_in = next((i for i, l in enumerate(lines) if 'Event (generated) FocusIn(9)' in l), None)
    press = next((i for i, l in enumerate(lines) if 'Event (generated) ButtonPress(4)' in l), None)
    one_batch = None
    if focus_in is not None and press is not None:
        one_batch = not any(':<:' in l for l in lines[focus_in + 1:press])
    asked = [l for l in lines if 'Request(25): SendEvent' in l and '_NET_ACTIVE_WINDOW' in l]
    current = None
    if asked:
        words = re.search(r'data=((?:0x[0-9a-f]{2},?)+)', asked[0]).group(1).split(',')
        current = '0x' + ''.join(reversed(words[8:12])).replace('0x', '')
    return {'one_batch': one_batch, 'activation_request': bool(asked), 'current_focus_window': current}


rows = []
kept = set()
for r in runs:
    start, end = r['trace']
    text = data[start:end].decode('utf-8', 'replace')
    lines = text.splitlines()
    s = summary(lines)
    row = {'run': r['i'], 'front_active': r['front_active'], **s}
    rows.append(row)
    kind = 'activating' if s['activation_request'] else 'plain'
    if kind not in kept:
        kept.add(kind)
        with open(os.path.join(out, f'{kind}-run-{r["i"]}.xtrace.txt'), 'w') as f:
            f.write(text)
print('| run | FocusIn and press read with no request of Qt's between them | _NET_ACTIVE_WINDOW request | its current focus window | front window active after |')
print('|---:|---|---|---|---|')
for row in rows:
    print(f"| {row['run']} | {row['one_batch']} | {row['activation_request']} | {row['current_focus_window'] or '–'} | {row['front_active']} |")
