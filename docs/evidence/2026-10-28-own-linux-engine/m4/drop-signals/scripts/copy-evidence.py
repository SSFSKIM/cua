#!/usr/bin/env python3
"""Copies task 68's sittings into the evidence directory, every home path replaced by a label: the task's work
directory by `<task68>`, the rest of the home by `<home>`. Text files only (results, summaries, watchdog rows, logs),
its stdout as `stdout.txt` (the whole-run `xprobe order-watch` record, 14-24 MB a run, is left out); a file over 512 KiB is
written gzipped (`<name>.gz`).
usage: copy-evidence.py <runs dir> <evidence dir> <sitting>=<evidence name>..."""
import gzip
import os
import sys

home = os.path.expanduser('~')
task = os.path.join(home, '.local/share/cua-171/task68')
KEEP = ('.jsonl', '.md', '.out', '.log', '.txt', '.stderr')
BIG = 512 * 1024


def label(text):
    return text.replace(task, '<task68>').replace(home, '<home>')


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
for arg in sys.argv[3:]:
    sitting, name = arg.split('=', 1)
    src = os.path.join(runs, sitting)
    dst = os.path.join(evidence, name)
    for root, _, files in os.walk(src):
        for f in files:
            if f.endswith(KEEP) and f != 'order.jsonl':
                copy(os.path.join(root, f), os.path.join(dst, os.path.relpath(os.path.join(root, f), src)))
    copy(src + '.out', os.path.join(dst, 'stdout.txt'))

    print(name, sum(len(fs) for _, _, fs in os.walk(dst)), 'files')
