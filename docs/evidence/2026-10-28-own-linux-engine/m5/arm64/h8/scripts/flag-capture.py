#!/usr/bin/env python3
"""Task 136 (rulings 1046, 1047): a capture sidecar beside a :0 sitting, capture only.

It runs as its own process, started just before the sitting launcher and stopped after it, and is never part of the
sitting. Every 100 ms it samples `ss -xpe` into an in-memory ring of the last 3 s. It watches the sitting's
flags.jsonl, read-only. At the first flag line it writes, into its capture dir (outside the repository):
  - ring.txt: the ring, and ss-at-flag.txt: one more `ss -xpe`;
  - owners.json: the flag, the flagged peer inode resolved against /proc/*/fd (socket:[inode]) now, the same inode's
    holders in the ring's samples, and /proc/net/unix's lines for the peer path. Ruling 1047's limits: cmdline, ppid
    and start time only for the process owning the flagged peer inode and for its parent; every other process pid and
    comm only (an ancestry is a list of pid and comm); never an environment.
It reads no window title, sends no signal, connects to no display and no session bus, and touches no harness file but
flags.jsonl. It exits when --until names a file that exists, or on SIGTERM or SIGINT from whoever started it.
usage: flag-capture.py --flags <flags.jsonl> --out <capture dir> --until <stop file> [--period 0.1] [--ring 3]
"""
import argparse
import collections
import json
import os
import re
import signal
import subprocess
import sys
import time

ap = argparse.ArgumentParser()
ap.add_argument('--flags', required=True)
ap.add_argument('--out', required=True)
ap.add_argument('--until', required=True)
ap.add_argument('--period', type=float, default=0.1)
ap.add_argument('--ring', type=float, default=3.0)
a = ap.parse_args()

stop = False


def on_signal(_sig, _frame):
    global stop
    stop = True


signal.signal(signal.SIGTERM, on_signal)
signal.signal(signal.SIGINT, on_signal)
os.makedirs(a.out, exist_ok=True)
log = open(os.path.join(a.out, 'sidecar.log'), 'a', buffering=1)


def note(msg):
    log.write(f'{time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())} {msg}\n')


def ss():
    try:
        return subprocess.run(['ss', '-xpe'], capture_output=True, text=True, timeout=2).stdout
    except Exception as e:  # a failed sample is recorded, never fatal
        return f'ss failed: {e}\n'


def comm(pid):
    try:
        with open(f'/proc/{pid}/comm') as f:
            return f.read().strip()
    except OSError:
        return None


def stat(pid):
    """ppid and start time (clock ticks since boot) from /proc/<pid>/stat."""
    try:
        with open(f'/proc/{pid}/stat') as f:
            s = f.read()
        rest = s[s.rindex(')') + 2:].split()
        return int(rest[1]), int(rest[19])
    except (OSError, ValueError, IndexError):
        return None, None


def cmdline(pid):
    try:
        with open(f'/proc/{pid}/cmdline', 'rb') as f:
            return [x.decode('utf-8', 'replace') for x in f.read().split(b'\0') if x]
    except OSError:
        return None


def full(pid):
    """Ruling 1047's full record: only for the owner of the flagged inode and its parent."""
    ppid, start = stat(pid)
    return {'pid': pid, 'comm': comm(pid), 'ppid': ppid, 'start_ticks': start, 'cmdline': cmdline(pid)}


def ancestry(pid):
    out = []
    while pid and pid > 1 and len(out) < 40:
        out.append({'pid': pid, 'comm': comm(pid)})
        pid, _ = stat(pid)
    return out


def holders_now(inode):
    target = f'socket:[{inode}]'
    found = []
    for d in os.listdir('/proc'):
        if not d.isdigit():
            continue
        try:
            for fd in os.listdir(f'/proc/{d}/fd'):
                try:
                    if os.readlink(f'/proc/{d}/fd/{fd}') == target:
                        found.append(int(d))
                        break
                except OSError:
                    pass
        except OSError:
            pass
    return found


def holders_in(text, inode):
    """The pid and comm of each process `ss -xpe` names on a line with the inode (its own or its peer's)."""
    out = set()
    for line in text.splitlines():
        if re.search(rf'(?<![0-9]){inode}(?![0-9])', line):
            for name, pid in re.findall(r'\("([^"]*)",pid=(\d+)', line):
                out.add((int(pid), name))
    return [{'pid': p, 'comm': c} for p, c in sorted(out)]


def unix_lines(path):
    try:
        with open('/proc/net/unix') as f:
            return [l.rstrip('\n') for l in f if path and l.rstrip('\n').endswith(' ' + path)]
    except OSError:
        return []


ring = collections.deque(maxlen=max(1, int(a.ring / a.period)))
seen = 0
captured = False
note(f'start pid {os.getpid()} flags {a.flags} period {a.period} s ring {a.ring} s')
while not stop and not os.path.exists(a.until):
    t0 = time.monotonic()
    ring.append((time.time(), ss()))
    if not captured and os.path.exists(a.flags):
        try:
            with open(a.flags) as f:
                lines = [l for l in f.read().splitlines() if l.strip()]
        except OSError:
            lines = []
        if len(lines) > seen:
            flag = json.loads(lines[0])
            seen = len(lines)
            at = ss()
            with open(os.path.join(a.out, 'ring.txt'), 'w') as f:
                for t, text in ring:
                    f.write(f'=== {t:.3f}\n{text}')
            with open(os.path.join(a.out, 'ss-at-flag.txt'), 'w') as f:
                f.write(at)
            inode = str(flag.get('peer_inode') or '')
            now = holders_now(inode) if inode else []
            owners = [full(p) for p in now]
            parents = [full(o['ppid']) for o in owners if o.get('ppid')]
            in_ring = holders_in(''.join(t for _, t in ring) + at, inode) if inode else []
            flagged = [{'pid': p, 'comm': comm(p), 'ancestry': ancestry(p)} for p in flag.get('pids', [])]
            rec = {'flag': flag, 'peer_inode': inode, 'owners_now': owners, 'owners_parents': parents,
                   'holders_in_ring': [dict(h, ancestry=ancestry(h['pid'])) for h in in_ring],
                   'flagged_pids': flagged, 'proc_net_unix': unix_lines(flag.get('peer_path')),
                   'ring_samples': len(ring)}
            with open(os.path.join(a.out, 'owners.json'), 'w') as f:
                json.dump(rec, f, indent=1)
            captured = True
            note(f'captured at the first flag line: inode {inode}, owners now {len(owners)}, holders in the ring {len(in_ring)}')
    time.sleep(max(0.0, a.period - (time.monotonic() - t0)))
note(f'exit (stop file {os.path.exists(a.until)}, signal {stop}, captured {captured})')
sys.exit(0)
