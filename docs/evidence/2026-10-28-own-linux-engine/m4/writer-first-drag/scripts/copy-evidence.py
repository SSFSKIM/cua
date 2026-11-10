#!/usr/bin/env python3
"""Copies task 72's sittings into the evidence directory, every home path replaced by a label: the task's work
directory by `<task72>`, the rest of the home by `<home>`. Text files only (results, summaries, watchdog rows, logs,
the sitting's `xprobe order-watch` record), the sitting's stdout as `stdout.txt`, and the screenshots named with
`--shot <sitting>/<file>`; a text file over 512 KiB is written gzipped (`<name>.gz`).
usage: copy-evidence.py <runs dir> <evidence dir> <sitting>=<evidence name>... [--shot <sitting>/<file>]..."""
import gzip
import os
import shutil
import sys

home = os.path.expanduser('~')
task = os.path.join(home, '.local/share/cua-171/task72')
KEEP = ('.jsonl', '.md', '.out', '.log', '.txt', '.stderr')
BIG = 512 * 1024


def label(text):
    return text.replace(task, '<task72>').replace(home, '<home>')


def write(out, text):
    os.makedirs(os.path.dirname(out), exist_ok=True)
    data = text.encode()
    if len(data) > BIG:
        with open(out + '.gz', 'wb') as raw, gzip.GzipFile(fileobj=raw, mode='wb', mtime=0) as fout:
            fout.write(data)
    else:
        with open(out, 'wb') as fout:
            fout.write(data)


def copy(path, out):
    if os.path.exists(path) and os.path.getsize(path) > 0:
        with open(path, errors='replace') as fin:
            write(out, label(fin.read()))


runs, evidence = sys.argv[1], sys.argv[2]
args = sys.argv[3:]
names = {}
shots = []
while args:
    a = args.pop(0)
    if a == '--shot':
        shots.append(args.pop(0))
    else:
        sitting, name = a.split('=', 1)
        names[sitting] = name
for sitting, name in names.items():
    src = os.path.join(runs, sitting)
    dst = os.path.join(evidence, name)
    for root, _, files in os.walk(src):
        for f in files:
            if f.endswith(KEEP):
                copy(os.path.join(root, f), os.path.join(dst, os.path.relpath(os.path.join(root, f), src)))
    copy(os.path.join(os.path.dirname(runs), sitting + '.out'), os.path.join(dst, 'stdout.txt'))
    print(name, sum(len(fs) for _, _, fs in os.walk(dst)), 'files')
for shot in shots:
    sitting, f = shot.split('/', 1)
    dst = os.path.join(evidence, names[sitting], 'shots', f)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copyfile(os.path.join(runs, sitting, 'run', 'shots', f), dst)
    print('shot', dst)
