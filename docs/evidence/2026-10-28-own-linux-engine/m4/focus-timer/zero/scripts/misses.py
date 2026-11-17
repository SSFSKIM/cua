#!/usr/bin/env python3
"""Lists a sitting's missed control-0ms runs: family, scenario, trial, cause, text got, the paste's observation,
and (with --trace) the kept trace's summary. usage: misses.py <results.jsonl> [lane]"""
import json
import sys

path = sys.argv[1]
lane = sys.argv[2] if len(sys.argv) > 2 else 'control-0ms'
with open(path) as f:
    for line in f:
        r = json.loads(line)
        if r.get('kind') != 'focus-timer-run' or r['lane'] != lane or r['ok']:
            continue
        paste = r.get('paste') or {}
        out = [r['family'], r['scenario'], r['trial'], r['miss'], json.dumps(r['got']), paste.get('observed'), paste.get('expected'), paste.get('transfer')]
        t = r.get('trace')
        if t:
            out += [t['file'], t['requests'], t['composite'], [(hex(s['destination']), s['inputs'], s['closed']) for s in t['sessions']], t['problems']]
        print(*out, sep=' | ')
