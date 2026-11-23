#!/usr/bin/env python3
# Task 89 (ruling 749): the three points on V5's flag, from V5's own records only: wrap71's process records
# (wrap-summary.json `processes`: pid, start ticks, comm, ppid, first seen in s, argv, env) and its flag (flags.jsonl).
#  1. which processes served :40 (an xtrace proxy's `-D :40`), when each was first and last seen, against the flag's t;
#  2. pid 465174: its record, and its parent chain through the run's records;
#  3. every process wrap71 recorded that could serve an X display (Xvfb, Xorg, xtrace, Xephyr, Xwayland), with its display.
# usage: v5-flag-proof.py <V5 step dir>
import json, os, re, sys

d = sys.argv[1]
s = json.load(open(os.path.join(d, 'wrap-summary.json')))
procs = s['processes']
by = {p['pid']: p for p in procs}
flag = next(json.loads(l) for l in open(os.path.join(d, 'flags.jsonl')) if '"outside-peer-connection"' in l)
t = flag['t']
print(f"flag: {json.dumps(flag)}")
print(f"record keys: {sorted(procs[0].keys())}")

def short(p):
    return {k: (v if k != 'argv' else v[:260]) for k, v in p.items() if k != 'env'}

print('\n1. processes serving :40 (argv names -D :40) and every xtrace proxy, by first/last seen')
for p in procs:
    a = p.get('argv') or ''
    if 'xtrace' in a and ' -D :' in a:
        m = re.search(r' -D :(\d+)', a)
        print(f"  pid {p['pid']} display :{m.group(1)} first {p.get('first')} last {p.get('last')} ppid {p.get('ppid')} :: {a[:200]}")

print('\n2. pid 465174 and its parent chain')
pid = flag['pids'][0]
seen = set()
while pid in by and pid not in seen:
    seen.add(pid)
    p = by[pid]
    print(f"  {json.dumps(short(p))}")
    pid = p.get('ppid')
if pid not in by:
    print(f"  (pid {pid}: no record of the run's; the chain ends here)")

print('\n3. every X server recorded (Xvfb, Xorg, Xephyr, Xwayland, Xvnc, xtrace)')
for p in procs:
    c = (p.get('comm') or '') + ' ' + (p.get('argv') or '')[:80]
    if re.search(r'\b(Xvfb|Xorg|Xephyr|Xwayland|Xvnc|xtrace)\b', c):
        print(f"  pid {p['pid']} comm {p.get('comm')} first {p.get('first')} last {p.get('last')} :: {(p.get('argv') or '')[:160]}")
