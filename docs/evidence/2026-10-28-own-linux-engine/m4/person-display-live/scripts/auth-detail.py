#!/usr/bin/python3 -I
# Task 50: the processes of a guarded step whose XAUTHORITY was unset, with their DISPLAY (an X client of a created
# display with none would fall back to ~/.Xauthority).
# usage: auth-detail.py <step dir>
import json, os, sys

s = json.load(open(os.path.join(sys.argv[1], 'wrap-summary.json')))
for p in s['processes']:
    env = p['env']
    if env is not None and 'XAUTHORITY' not in env:
        print(p['pid'], p['comm'], 'DISPLAY=' + str(env.get('DISPLAY')), p['argv'][:140])
