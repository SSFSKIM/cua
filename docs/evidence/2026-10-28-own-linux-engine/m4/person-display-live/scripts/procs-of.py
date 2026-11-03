#!/usr/bin/python3 -I
# Task 50: the run processes of a guarded step whose command line matches a pattern, with when the guard first and
# last saw them (seconds since the step's start). Labels in command lines are the run's own.
# usage: procs-of.py <step dir> <regex>
import json, os, re, sys

s = json.load(open(os.path.join(sys.argv[1], 'wrap-summary.json')))
for p in sorted(s['processes'], key=lambda p: p['first']):
    if re.search(sys.argv[2], p['argv']):
        print(p['first'], p['last'], p['pid'], p['comm'], re.sub(r'/tmp/c50-\w+/cua171-run-\w+', '<scratch>', p['argv'])[:200])
