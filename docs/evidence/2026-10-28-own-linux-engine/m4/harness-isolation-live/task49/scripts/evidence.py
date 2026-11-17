#!/usr/bin/python3 -I
# Task 49: copies a session's files into the repository's evidence directory. Large JSON lines are gzipped; the run's
# own decoy sockets, pid files and markers are left out. Prints what it copied.
# usage: evidence.py <session dir> <destination dir> [<phase results dir>]
import gzip, os, shutil, sys

src, dst = sys.argv[1], sys.argv[2]
extra = sys.argv[3] if len(sys.argv) > 3 else None
SKIP = {'decoy', 'driver.pid', 'session.done'}


def copy_tree(a, b):
    for root, dirs, files in os.walk(a):
        dirs[:] = [d for d in dirs if d not in SKIP]
        rel = os.path.relpath(root, a)
        for f in files:
            if f in SKIP:
                continue
            s = os.path.join(root, f)
            if os.path.islink(s) or not os.path.isfile(s):
                continue
            t = os.path.join(b, rel, f)
            os.makedirs(os.path.dirname(t), exist_ok=True)
            if os.path.getsize(s) > 200_000 and not f.endswith('.gz'):
                with open(s, 'rb') as i, gzip.open(t + '.gz', 'wb') as o:
                    shutil.copyfileobj(i, o)
                print('gz ', os.path.relpath(t + '.gz', dst))
            else:
                shutil.copy2(s, t)
                print('cp ', os.path.relpath(t, dst))


copy_tree(src, dst)
if extra:
    copy_tree(extra, dst)
