#!/usr/bin/python3 -I
# Task 58: copies a guarded step's files into the repository's evidence directory (task 49's evidence.py, with labels):
# every path under the home is replaced by a symbolic label (the harness checkout, the shared checkout, this task's
# directory, cua's home, the home itself), so no path of the home reaches the public repository. Large files are
# gzipped; the guard's decoy sockets, pid files and markers are left out. Prints what it copied and how many paths
# each label replaced.
# usage: copy58.py <step dir> <destination dir>
import collections, gzip, os, sys

src, dst = sys.argv[1], sys.argv[2]
HOME = os.path.expanduser('~')
LABELS = [
    (HOME + '/.local/share/cua-171/live-43', '<harness checkout>'),
    (HOME + '/Developer/GitHub/cua/.claude/worktrees/cua-171', '<shared checkout>'),
    (HOME + '/.local/share/cua-171/task58', '<task58>'),
    (HOME + '/.local/share/cua-171', '<cua-171>'),
    (HOME + '/.local/share/cua', '<cua home>'),
    (HOME, '<home>'),
]
SKIP = {'decoy', 'driver.pid', 'session.done', 'start.marker'}
counts = collections.Counter()


def label(data):
    text = data.decode('utf8', 'surrogateescape')
    for path, name in LABELS:
        n = text.count(path)
        if n:
            counts[name] += n
            text = text.replace(path, name)
    return text.encode('utf8', 'surrogateescape')


for root, dirs, files in os.walk(src):
    dirs[:] = [d for d in dirs if d not in SKIP]
    rel = os.path.relpath(root, src)
    for f in files:
        if f in SKIP:
            continue
        s = os.path.join(root, f)
        if os.path.islink(s) or not os.path.isfile(s):
            continue
        data = gzip.open(s).read() if f.endswith('.gz') else open(s, 'rb').read()
        data = label(data)
        t = os.path.join(dst, rel, f[:-3] if f.endswith('.gz') else f)
        os.makedirs(os.path.dirname(t), exist_ok=True)
        if len(data) > 200_000:
            with gzip.open(t + '.gz', 'wb') as o:
                o.write(data)
            print('gz ', os.path.relpath(t + '.gz', dst))
        else:
            with open(t, 'wb') as o:
                o.write(data)
            print('cp ', os.path.relpath(t, dst))
for name, n in sorted(counts.items()):
    print('label', name, n)
