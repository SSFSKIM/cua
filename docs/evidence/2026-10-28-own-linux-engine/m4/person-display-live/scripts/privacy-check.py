#!/usr/bin/python3 -I
# Task 50: before committing, every evidence file (gzipped ones decompressed in memory) is searched for
#   - paths under the person's home other than the run's own tooling (each distinct hit printed with its count), and
#   - the current title of each window of the owner's Chrome on :0 (read from _NET_WM_NAME into memory only, never
#     printed or written: only whether it, or any of its words of 6+ characters, occurs, and in which file).
# Nothing is written.
# usage: privacy-check.py <owner chrome pid> <dir>...
import collections, gzip, os, re, subprocess, sys

H = '/Users/new/'
OWN = ('/Users/new/.local/share/cua-171', '/Users/new/Developer/GitHub/cua', '/Users/new/.local/share/cua/runtimes')
env = {'DISPLAY': ':0', 'XAUTHORITY': H + '.Xauthority', 'PATH': '/usr/bin:/bin'}
owner = sys.argv[1]
ids = subprocess.run(['xdotool', 'search', '--pid', owner], capture_output=True, text=True, env=env).stdout.split()
titles = []
for i in ids:
    out = subprocess.run(['xprop', '-id', i, '_NET_WM_NAME', 'WM_NAME'], capture_output=True, text=True, env=env).stdout
    for m in re.findall(r'= "(.*)"', out):
        if m:
            titles.append(m)
words = {w for t in titles for w in re.findall(r'\w{6,}', t)} - {'Google', 'Chrome', 'google', 'chrome'}
print(f'owner windows read: {len(ids)}, titles held in memory: {len(titles)}, words of 6+ characters: {len(words)}')
hits = collections.Counter()
found = collections.Counter()
files = 0
for d in sys.argv[2:]:
    for root, _, fs in os.walk(d):
        for f in fs:
            p = os.path.join(root, f)
            files += 1
            data = gzip.open(p).read() if p.endswith('.gz') else open(p, 'rb').read()
            text = data.decode('utf8', 'replace')
            for m in re.findall(r'/Users/new/[^\s"\',)\]}\\]*', text):
                if not m.startswith(OWN):
                    hits[m] += 1
            for t in titles:
                if t in text:
                    found[f'a whole owner title in {p}'] += 1
            for w in words:
                if w in text:
                    found[f'an owner title word in {p}'] += 1
print(f'files scanned: {files}')
for k, v in hits.most_common():
    print('path', v, k)
for k, v in found.most_common():
    print('TITLE', v, k)
if not found:
    print('no owner title or title word found')
