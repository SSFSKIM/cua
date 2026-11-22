#!/usr/bin/env python3
# Task 130: from an engine's xtrace log, each drag's input events (SendEvent or XTEST) around its press and release,
# with the requests between them, as relative times. usage: ends.py <xtrace> [tail events] [head events]
import re, sys
path = sys.argv[1]
tail = int(sys.argv[2]) if len(sys.argv) > 2 else 12
head = int(sys.argv[3]) if len(sys.argv) > 3 else 6
req = re.compile(r'^(\d+\.\d+) (\d+):<:([0-9a-f]+): *\d+: Request\((\d+)\): (\w+)(.*)$')
ev = re.compile(r'(EnterNotify|LeaveNotify|MotionNotify|ButtonPress|ButtonRelease|FocusIn|FocusOut|KeyPress|KeyRelease|ClientMessage)\(\d+\)(.*)')
lines = []
for line in open(path, errors='replace'):
    m = req.match(line)
    if not m:
        continue
    t, conn, seq, op, name, rest = m.groups()
    t = float(t)
    if name == 'SendEvent':
        e = ev.search(rest)
        kind = e.group(1) if e else 'other'
        body = e.group(2) if e else rest
        def f(k):
            mm = re.search(k + r'=([^ ]+)', body)
            return mm.group(1) if mm else '-'
        dest = re.search(r'destination=(\S+)', rest).group(1)
        info = f"{kind} dest={dest} root=({f('root-x')},{f('root-y')}) ev=({f('event-x')},{f('event-y')}) state={f('state')} detail={f('detail')} time={f('time')}"
        if kind == 'ClientMessage':
            info = 'ClientMessage ' + body[:160]
        lines.append((t, conn, 'EV', info))
    elif op == '132' or name.startswith('XTEST') or 'FakeInput' in rest[:40]:
        lines.append((t, conn, 'XT', name + rest[:120]))
    else:
        lines.append((t, conn, 'RQ', name + rest[:100]))
# split into drags by ButtonPress ... ButtonRelease
idx = [i for i, l in enumerate(lines) if l[2] == 'EV' and l[3].startswith(('ButtonPress', 'ButtonRelease'))]
presses = [i for i in idx if lines[i][3].startswith('ButtonPress')]
releases = [i for i in idx if lines[i][3].startswith('ButtonRelease')]
print(f'{path}: {len(presses)} presses, {len(releases)} releases')
for p, r in zip(presses, releases):
    t0 = lines[p][0]
    evs = [i for i in range(p, r + 1) if lines[i][2] in ('EV', 'XT')]
    mot = [i for i in evs if 'MotionNotify' in lines[i][3]]
    print(f'--- drag: press at {t0:.3f}, release +{(lines[r][0]-t0)*1000:.1f} ms, {len(mot)} motions, {len(evs)} input events')
    if len(mot) > 1:
        gaps = [(lines[b][0] - lines[a][0]) * 1000 for a, b in zip(mot, mot[1:])]
        gaps.sort()
        print(f'    motion spacing ms p50 {gaps[len(gaps)//2]:.2f} max {gaps[-1]:.2f}')
    shown = set(range(max(0, p - 3), min(len(lines), p + head))) | set(range(max(0, r - tail), min(len(lines), r + 25)))
    for i in sorted(shown):
        t, conn, k, info = lines[i]
        print(f'  {(t-t0)*1000:9.1f} c{conn} {k} {info}')
