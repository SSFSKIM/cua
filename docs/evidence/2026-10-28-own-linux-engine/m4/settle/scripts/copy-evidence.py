#!/usr/bin/env python3
"""Copies task 62's sittings into the evidence directory, every home path replaced by a label: the task's work
directory by `<task62>`, the rest of the home by `<home>`. Text files only (results, summaries, watchdog rows, logs);
a file over 512 KiB is written gzipped (`<name>.gz`), so the repository holds the sittings whole at a tenth the size.
usage: copy-evidence.py <runs dir> <evidence dir> <sitting>=<evidence name>..."""
import gzip
import os
import sys

home = os.path.expanduser('~')
task = os.path.join(home, '.local/share/cua-171/task62')
KEEP = ('.jsonl', '.md', '.out', '.log', '.txt', '.stderr')
BIG = 512 * 1024


def label(text):
    return text.replace(task, '<task62>').replace(home, '<home>')


def write(out, text):
    os.makedirs(os.path.dirname(out), exist_ok=True)
    data = text.encode()
    if len(data) > BIG:
        with open(out + '.gz', 'wb') as raw, gzip.GzipFile(fileobj=raw, mode='wb', mtime=0) as fout:
            fout.write(data)
    else:
        with open(out, 'wb') as fout:
            fout.write(data)


runs, evidence = sys.argv[1], sys.argv[2]
for arg in sys.argv[3:]:
    sitting, name = arg.split('=', 1)
    src = os.path.join(runs, sitting)
    dst = os.path.join(evidence, name)
    for root, _, files in os.walk(src):
        for f in files:
            if not f.endswith(KEEP):
                continue
            path = os.path.join(root, f)
            if os.path.getsize(path) == 0:
                continue
            with open(path, errors='replace') as fin:
                write(os.path.join(dst, os.path.relpath(path, src)), label(fin.read()))
    log = src + '.out'
    if os.path.exists(log):
        with open(log, errors='replace') as fin:
            write(os.path.join(dst, 'stdout.txt'), label(fin.read()))
    print(name, sum(len(fs) for _, _, fs in os.walk(dst)), 'files')
