#!/usr/bin/env python3
"""x64 V5 at H8 (ruling 1053): whether a stopped run's first flag has #432's known signature, read from the capture
sidecar's owners.json and the run's flags.jsonl, read-only. The signature: the flag is an outside-peer-connection whose
flagged process is a run-owned chrome (its ancestry passes through wrap71), and the peer inode's owner is the run's
chrome_crashpad (comm `chrome_crashpad`, the handler's name cut to 15), reparented to wrap71 (its parent's cmdline names
wrap71.py), and seen holding the inode in the capture's ss lines (ring.txt, ss-at-flag.txt: whole or narrowed alike). It prints MATCH, with each condition, or NOT MATCHED with the ones that failed; it prints no cmdline beyond
naming wrap71.py's presence, and no path. A MATCH is sent to the design session as the record, and the run is rerun
whole once it rules; anything else holds (the plan).
usage: classify-stop.py <capture dir> <run dir>
"""
import json
import os
import re
import sys

cap, run = sys.argv[1], sys.argv[2]
rec = json.load(open(os.path.join(cap, 'owners.json')))
flags = [json.loads(l) for l in open(os.path.join(run, 'flags.jsonl')) if l.strip()]
flag = rec['flag']
owners, parents = rec['owners_now'], rec['owners_parents']
wrap = [p for p in parents if any('wrap71.py' in a for a in (p.get('cmdline') or []))]
inode = str(rec.get('peer_inode') or '')
ss_text = open(os.path.join(cap, 'ring.txt')).read() + open(os.path.join(cap, 'ss-at-flag.txt')).read()
ss_lines = [l for l in ss_text.splitlines() if inode and re.search(rf'(?<![0-9]){re.escape(inode)}(?![0-9])', l)]
checks = {
    'the first flag is an outside-peer-connection': flag.get('kind') == 'outside-peer-connection',
    'the flag names no peer pid (the peer outside the run, as the watchdog saw it)': not flag.get('peer_pids'),
    'the flagged process is a chrome': all((f.get('comm') or '').startswith('chrome') for f in rec['flagged_pids']) and bool(rec['flagged_pids']),
    'the peer inode has exactly one owner now': len(owners) == 1,
    "the owner is a chrome_crashpad": bool(owners) and (owners[0].get('comm') or '').startswith('chrome_crashpad'),
    "the owner's parent is wrap71 (its cmdline names wrap71.py)": len(wrap) == 1 and bool(owners) and owners[0].get('ppid') == wrap[0]['pid'],
    "the capture's ss lines show that owner holding the peer inode": bool(owners) and any(f'pid={owners[0]["pid"]},' in l for l in ss_lines),
    "the flagged chrome's ancestry passes through that wrap71": bool(wrap) and all(any(a['pid'] == wrap[0]['pid'] for a in f.get('ancestry', [])) for f in rec['flagged_pids']),
}
print(f"flags in the run: {len(flags)}, kinds {sorted({f.get('kind') for f in flags})}")
for k, v in checks.items():
    print(f"  {'yes' if v else 'NO '} {k}")
print('MATCH: #432\'s known signature (ruling 1053)' if all(checks.values()) else 'NOT MATCHED: the stop holds (ruling 1053)')
sys.exit(0 if all(checks.values()) else 1)
