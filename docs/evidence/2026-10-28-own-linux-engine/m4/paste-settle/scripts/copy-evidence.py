#!/usr/bin/env python3
"""Copies task 60's sittings into the evidence directory, every home path replaced by a label: the task's work
directory by `<task60>`, the rest of the home by `<home>`. Text files only (results, summaries, watchdog rows, logs).
usage: copy-evidence.py <runs dir> <evidence dir> <sitting>=<evidence name>..."""
import os
import sys

home = os.path.expanduser('~')
task = os.path.join(home, '.local/share/cua-171/task60')
KEEP = ('.jsonl', '.md', '.out', '.log', '.txt', '.stderr')


def label(text):
    return text.replace(task, '<task60>').replace(home, '<home>')


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
            out = os.path.join(dst, os.path.relpath(path, src))
            os.makedirs(os.path.dirname(out), exist_ok=True)
            with open(path, errors='replace') as fin, open(out, 'w') as fout:
                fout.write(label(fin.read()))
    log = src + '.out'
    if os.path.exists(log):
        with open(log, errors='replace') as fin, open(os.path.join(dst, 'stdout.txt'), 'w') as fout:
            fout.write(label(fin.read()))
    print(name, sum(len(fs) for _, _, fs in os.walk(dst)), 'files')
