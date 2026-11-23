#!/usr/bin/env python3
"""x64 V5 at H8 (ruling 1054, condition (b)): a whole capture (task 136's flag-capture.py) filtered the way the narrowed
writer (flag-capture-narrow.py) writes it, into a new directory; the original is only read. ring.txt and ss-at-flag.txt
keep only the lines that involve the flag's peer inode (as a whole number) or its peer path, each ring sample's time
with its count; owners.json keeps owners_now, owners_parents, flagged_pids and proc_net_unix as written (they come from
/proc at the flag, not from the ring), and its holders_in_ring is recomputed from the narrowed lines, the way the narrowed
writer computes it, and compared with the original's. Prints counts only, never a line.
usage: narrow-filter.py <capture dir> <new dir>
"""
import json
import os
import re
import sys

src, dst = sys.argv[1], sys.argv[2]
os.makedirs(dst, exist_ok=False)
rec = json.load(open(os.path.join(src, 'owners.json')))
flag = rec['flag']
inode, path = str(flag.get('peer_inode') or ''), flag.get('peer_path') or ''


def involves(line):
    if inode and re.search(rf'(?<![0-9]){re.escape(inode)}(?![0-9])', line):
        return True
    return bool(path) and path not in ('*', '@') and path in line


samples, cur = [], None
for line in open(os.path.join(src, 'ring.txt')).read().splitlines():
    m = re.fullmatch(r'=== ([0-9.]+)', line)
    if m:
        cur = (m.group(1), [])
        samples.append(cur)
    elif cur is not None:
        cur[1].append(line)
kept = []
with open(os.path.join(dst, 'ring.txt'), 'w') as f:
    for t, lines in samples:
        k = [l for l in lines if involves(l)]
        kept.extend(k)
        f.write(f'=== {t} ({len(k)} lines involving the peer)\n' + ''.join(l + '\n' for l in k))
at = [l for l in open(os.path.join(src, 'ss-at-flag.txt')).read().splitlines() if involves(l)]
with open(os.path.join(dst, 'ss-at-flag.txt'), 'w') as f:
    f.write(''.join(l + '\n' for l in at))
holders = set()
for line in kept + at:
    if re.search(rf'(?<![0-9]){re.escape(inode)}(?![0-9])', line):
        for name, pid in re.findall(r'\("([^"]*)",pid=(\d+)', line):
            holders.add((int(pid), name))
orig = {(h['pid'], h['comm']) for h in rec.get('holders_in_ring', [])}
out = dict(rec)
out['holders_in_ring'] = [h for h in rec.get('holders_in_ring', []) if (h['pid'], h['comm']) in holders]
out['narrowed'] = {'ring_lines': len(kept), 'ss_at_flag_lines': len(at), 'from': 'narrow-filter.py over the whole capture'}
with open(os.path.join(dst, 'owners.json'), 'w') as f:
    json.dump(out, f, indent=1)
whole = sum(len(l) for _, l in samples)
print(f'ring samples {len(samples)}, lines {whole} -> kept {len(kept)}; ss-at-flag kept {len(at)}')
print(f'holders in the ring: the original {len(orig)}, from the narrowed lines {len(holders)}; the same: {orig == holders}')
