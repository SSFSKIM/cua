#!/usr/bin/env python3
"""Copies the second fix wave's sittings into the evidence directory, every home path replaced by a label: the wave's work
directory by `<task73fix2>`, the rest of the home by `<home>`. The run's results, summary and watchdog rows, the
sitting's session, stdout and display record (`xprobe order-watch`, as `order.jsonl`), and the sitting's own output
(`<name>.out`, as `sitting.txt`); a file over 512 KiB is written gzipped (`<name>.gz`). The engines' `--stats` lines
(stderr.log) stay behind: each row of results.jsonl carries the records it reads.
usage: copy-evidence.py <runs dir> <evidence dir> <sitting>..."""
import gzip
import os
import sys

home = os.path.expanduser('~')
task = os.path.join(home, '.local/share/cua-171/task73fix2')
BIG = 512 * 1024
FILES = {
    'run/results.jsonl': 'run/results.jsonl',
    'run/summary.md': 'run/summary.md',
    'run/watchdog.jsonl': 'run/watchdog.jsonl',
    'session.jsonl': 'session.jsonl',
    'stdout.log': 'stdout.log',
    'watchdog.jsonl': 'watchdog.jsonl',
    'order.jsonl': 'order.jsonl',
}


def label(text):
    return text.replace(task, '<task73fix2>').replace(home, '<home>')


def write(out, text):
    os.makedirs(os.path.dirname(out), exist_ok=True)
    data = text.encode()
    if len(data) > BIG:
        with open(out + '.gz', 'wb') as raw, gzip.GzipFile(fileobj=raw, mode='wb', mtime=0) as fout:
            fout.write(data)
    else:
        with open(out, 'wb') as fout:
            fout.write(data)


runs, dest, names = sys.argv[1], sys.argv[2], sys.argv[3:]
for name in names:
    for src, dst in FILES.items():
        path = os.path.join(runs, name, src)
        if os.path.exists(path):
            with open(path, encoding='utf-8', errors='replace') as fin:
                write(os.path.join(dest, name, dst), label(fin.read()))
    out = os.path.join(runs, name + '.out')
    if os.path.exists(out):
        with open(out, encoding='utf-8', errors='replace') as fin:
            write(os.path.join(dest, name, 'sitting.txt'), label(fin.read()))
    print(name)
