#!/usr/bin/env python3
"""Checks two README claims over the sittings: every missed zero-lane run's FocusOut records went within 0.01 ms of
their input and on their own request's line; the not-clean audits' forbidden requests and problems."""
import json
import sys

worst = 0
foreign = 0
for path in sys.argv[1:]:
    with open(path) as f:
        for line in f:
            r = json.loads(line)
            if r.get('kind') == 'focus-timer-run' and r['lane'] == 'control-0ms' and not r['ok']:
                for out in r.get('focus_outs', []):
                    worst = max(worst, out['after_input_ms'])
                    if out['reported_on'] != out['scheduled_by']:
                        foreign += 1
            if r.get('kind') == 'focus-timer-audit' and not r['clean']:
                print(path, r['family'], r['lane'], 'forbidden', r['forbidden'], 'problems', r['problems'], 'runs', r['runs'])
print('worst after_input_ms', worst, 'reported on another line', foreign)
