#!/usr/bin/env python3
"""Task 136 (ruling 1047, point 3): flag-capture.py proved before the counted V5 rerun. This process opens an abstract
unix socket of its own (a listener and a connected pair), starts the sidecar against a fresh flags.jsonl and capture
dir, lets it sample, then writes one synthetic flag line naming the accepted socket's inode and the listener's abstract
path. It checks that the sidecar resolves the owner (this process) and its parent, that only the owner and the parent
carry cmdline, ppid and start time, that no record anywhere holds an environment, and that the sidecar exits on its stop
file within a second. Prints PASS or the failures. No display, no bus, no signal to anything but the sidecar it starts.
usage: flag-capture-test.py <sidecar> <scratch dir>
"""
import json
import os
import socket
import subprocess
import sys
import time

sidecar, scratch = sys.argv[1], sys.argv[2]
os.makedirs(scratch, exist_ok=True)
flags, out, until = (os.path.join(scratch, n) for n in ('flags.jsonl', 'capture', 'STOP'))
for p in (flags, until):
    if os.path.exists(p):
        os.remove(p)
name = f'cua171-flagtest-{os.getpid()}'
srv = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
srv.bind('\0' + name)
srv.listen(1)
cli = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
cli.connect('\0' + name)
acc, _ = srv.accept()
inode = os.fstat(acc.fileno()).st_ino
p = subprocess.Popen([sys.executable, sidecar, '--flags', flags, '--out', out, '--until', until])
time.sleep(1.0)
with open(flags, 'w') as f:
    f.write(json.dumps({'t': 1.0, 'kind': 'outside-peer-connection', 'pids': [os.getpid()], 'comm': 'python3',
                        'peer_path': '@' + name, 'peer_pids': [], 'peer_comm': None, 'peer_inode': str(inode)}) + '\n')
time.sleep(1.0)
open(until, 'w').close()
t0 = time.monotonic()
try:
    code = p.wait(timeout=5)
except subprocess.TimeoutExpired:
    p.kill()
    code = 'did not exit'
took = time.monotonic() - t0
fails = []
rec = json.load(open(os.path.join(out, 'owners.json')))
owners = rec['owners_now']
if [o['pid'] for o in owners] != [os.getpid()]:
    fails.append(f'owners now {[o["pid"] for o in owners]}, not this process {os.getpid()}')
if not rec['owners_parents'] or rec['owners_parents'][0]['pid'] != os.getppid():
    fails.append('the owner\'s parent was not recorded')
for o in owners + rec['owners_parents']:
    if set(o) != {'pid', 'comm', 'ppid', 'start_ticks', 'cmdline'}:
        fails.append(f'full record fields {sorted(o)}')
for group in ('holders_in_ring', 'flagged_pids'):
    for h in rec[group]:
        extra = set(h) - {'pid', 'comm', 'ancestry'}
        if extra:
            fails.append(f'{group} carries {sorted(extra)}')
        for anc in h.get('ancestry', []):
            if set(anc) != {'pid', 'comm'}:
                fails.append(f'an ancestry entry carries {sorted(anc)}')
if not any(h['pid'] == os.getpid() for h in rec['holders_in_ring']):
    fails.append('the ring did not show this process on the inode')
if not rec['proc_net_unix']:
    fails.append('no /proc/net/unix line for the peer path')
text = json.dumps(rec)
if 'environ' in text or 'HOME=' in text or 'PATH=' in text:
    fails.append('an environment reached the record')
written = sorted(os.listdir(out))
if written != ['owners.json', 'ring.txt', 'sidecar.log', 'ss-at-flag.txt']:
    fails.append(f'unexpected files {written}')
if code != 0 or took > 1.5:
    fails.append(f'exit {code} after {took:.2f} s')
print(json.dumps({'owner': owners[0] if owners else None, 'parent_pid': rec['owners_parents'][0]['pid'] if rec['owners_parents'] else None,
                  'holders_in_ring': rec['holders_in_ring'], 'proc_net_unix_lines': len(rec['proc_net_unix']), 'ring_samples': rec['ring_samples'],
                  'files': written, 'sidecar_exit': code, 'exit_after_stop_s': round(took, 2)}, indent=1))
print('PASS' if not fails else 'FAIL: ' + '; '.join(fails))
sys.exit(0 if not fails else 1)
