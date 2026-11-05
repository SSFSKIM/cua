#!/usr/bin/env python3
"""Copies task 61's sittings into the evidence directory, every home path replaced by a label: task 61's work
directory by `<task61>`, task 60's fix's by `<task60-fix>`, task 60's and task 59's by `<task60>` and `<task59>`, the rest of the home by `<home>`,
and the shared checkout by `<checkout>`. Text files only (results, summaries, watchdog rows, logs).
usage: copy-evidence.py <runs dir> <evidence dir> <sitting>=<evidence name>..."""
import os
import sys

home = os.path.expanduser('~')
share = os.path.join(home, '.local/share/cua-171')
LABELS = [
    (os.path.join(share, 'task61'), '<task61>'),
    (os.path.join(share, 'task60-fix'), '<task60-fix>'),
    (os.path.join(share, 'task60'), '<task60>'),
    (os.path.join(share, 'task59'), '<task59>'),
    (os.path.join(home, 'Developer/GitHub/cua/.claude/worktrees/cua-171'), '<checkout>'),
    (home, '<home>'),
]
KEEP = ('.jsonl', '.md', '.out', '.log', '.txt', '.stderr', '.json')


def label(text):
    for path, name in LABELS:
        text = text.replace(path, name)
    return text


runs, evidence = sys.argv[1], sys.argv[2]
for arg in sys.argv[3:]:
    sitting, name = arg.split('=', 1)
    src = os.path.join(runs, sitting)
    dst = os.path.join(evidence, name)
    if os.path.isfile(src):
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        with open(src, errors='replace') as fin, open(dst, 'w') as fout:
            fout.write(label(fin.read()))
        print(name, 'file')
        continue
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
