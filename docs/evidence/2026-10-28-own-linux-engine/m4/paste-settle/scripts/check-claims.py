#!/usr/bin/env python3
"""Checks the README's acceptance claims over the sittings: audits clean and none deferred, every shipped series
reached with no miss, the shipped paste's settle waits, and the stop medians. usage: check-claims.py <evidence dir>"""
import json
import os
import statistics
import sys

ev = sys.argv[1]
for s in ['idle', 'load2']:
    rows = [json.loads(l) for l in open(os.path.join(ev, 'accept', s, 'results.jsonl'))]
    audits = [r for r in rows if r.get('kind') == 'focus-timer-audit']
    print(s, 'audits', len(audits), 'clean', sum(r['clean'] for r in audits), 'deferred', sum(r['deferred'] for r in audits))
    series = [r for r in rows if r.get('kind') == 'focus-timer-series' and r['lane'] == 'shipped']
    print(s, 'shipped series', len(series), 'reached', sum(r['reached'] for r in series), 'misses', sum(r['misses'] for r in series), 'raw', sum(r['raw']['misses'] for r in series))
    waits = [r['settle']['waited_median'] for r in series if r['scenario'] == 'paste']
    after = [r['settle']['after_key_median'] for r in series if r['scenario'] == 'paste']
    print(s, 'paste settle waited medians', min(waits), max(waits), 'after the key', min(after), max(after))
    for kind in ['keys', 'clicks']:
        for fam in ['chrome', 'electron']:
            st = [r for r in rows if r.get('kind') == 'focus-timer-stop' and r['family'] == fam and r['input'] == kind and r['signal'] == 'SIGTERM']
            print(s, fam, kind, len(st), sum(r['ok'] for r in st), statistics.median(r['exited_after_answer_ms'] for r in st))
