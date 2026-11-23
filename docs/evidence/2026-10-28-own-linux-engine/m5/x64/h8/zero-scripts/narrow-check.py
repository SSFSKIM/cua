#!/usr/bin/env python3
"""x64 V5 at H8 (ruling 1054, condition (a)): whether a narrowed capture wrote only lines that name the flagged peer inode
or its peer path. Every line of ring.txt but its sample headers (`=== <time> (<n> lines involving the peer)`) and every
line of ss-at-flag.txt must name the flag's peer_inode as a whole number or contain its peer_path. It prints the counts
and the number of lines that don't, never a line. usage: narrow-check.py <capture dir> <flags.jsonl>
"""
import json
import os
import re
import sys

cap, flags = sys.argv[1], sys.argv[2]
flag = json.loads(next(l for l in open(flags) if l.strip()))
inode, path = str(flag.get('peer_inode') or ''), flag.get('peer_path') or ''


def names(line):
    if inode and re.search(rf'(?<![0-9]){re.escape(inode)}(?![0-9])', line):
        return True
    return bool(path) and path not in ('*', '@') and path in line


ring = [l for l in open(os.path.join(cap, 'ring.txt')).read().splitlines()]
headers = [l for l in ring if re.fullmatch(r'=== [0-9.]+ \([0-9]+ lines involving the peer\)', l)]
body = [l for l in ring if l not in headers]
at = [l for l in open(os.path.join(cap, 'ss-at-flag.txt')).read().splitlines()]
bad = [l for l in body + at if not names(l)]
rec = json.load(open(os.path.join(cap, 'owners.json')))
print(f'ring.txt: {len(headers)} sample headers, {len(body)} lines; ss-at-flag.txt: {len(at)} lines; owners.json narrowed counts {rec.get("narrowed")}')
print(f'lines that name neither the inode nor the peer path: {len(bad)}')
print('PASS: only lines naming the peer inode or its path were written' if not bad and (body or at) else 'FAIL')
sys.exit(0 if not bad and (body or at) else 1)
