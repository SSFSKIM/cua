#!/usr/bin/env python3
"""Copies task 69's sittings into the evidence directory, every home path replaced by a label: the task's work
directory by `<task69>`, the rest of the home by `<home>` (task 68's copy-evidence.py, adapted). Text files only
(results, summaries, watchdog rows, logs), and the sitting's own output (`<work>/<sitting>.out`) as `sitting.txt`; the
whole-run `xprobe order-watch` record is left out; a file over 512 KiB is written gzipped (`<name>.gz`).
usage: copy-evidence.py <work dir> <evidence dir> <sitting>=<evidence name>..."""
import gzip
import os
import sys

home = os.path.expanduser('~')
KEEP = ('.jsonl', '.md', '.out', '.log', '.txt', '.stderr')
BIG = 512 * 1024


def write(out, text):
    os.makedirs(os.path.dirname(out), exist_ok=True)
    data = text.encode()
    if len(data) > BIG:
        with open(out + '.gz', 'wb') as raw, gzip.GzipFile(fileobj=raw, mode='wb', mtime=0) as fout:
            fout.write(data)
    else:
        with open(out, 'wb') as fout:
            fout.write(data)


work, evidence = sys.argv[1], sys.argv[2]


def label(text):
    return text.replace(work, '<task69>').replace(home, '<home>')


def copy(path, out):
    if os.path.exists(path) and os.path.getsize(path) > 0:
        with open(path, errors='replace') as fin:
            write(out, label(fin.read()))


for arg in sys.argv[3:]:
    sitting, name = arg.split('=', 1)
    src = os.path.join(work, 'runs', sitting)
    dst = os.path.join(evidence, name)
    for root, _, files in os.walk(src):
        for f in files:
            if f.endswith(KEEP) and f != 'order.jsonl':
                copy(os.path.join(root, f), os.path.join(dst, os.path.relpath(os.path.join(root, f), src)))
    copy(os.path.join(work, sitting + '.out'), os.path.join(dst, 'sitting.txt'))
    print(name, sum(len(fs) for _, _, fs in os.walk(dst)), 'files')
