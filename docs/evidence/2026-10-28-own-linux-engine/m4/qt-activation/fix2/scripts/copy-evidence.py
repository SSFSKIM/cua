#!/usr/bin/env python3
"""Copies task 61 fix 2's files into the evidence directory, every home path replaced by a label: this wave's work
directory by `<task61fix2>`, the earlier fix's by `<task61fix>`, task 59's by `<task59>`, the shared checkout by
`<checkout>`, the rest of the home by `<home>`. Text files only.
usage: copy-evidence.py <evidence dir> <source>=<evidence name>..."""
import os
import sys

home = os.path.expanduser('~')
share = os.path.join(home, '.local/share/cua-171')
LABELS = [
    (os.path.join(share, 'task61fix2'), '<task61fix2>'),
    (os.path.join(share, 'task61fix'), '<task61fix>'),
    (os.path.join(share, 'task59'), '<task59>'),
    (os.path.join(home, 'Developer/GitHub/cua/.claude/worktrees/cua-171'), '<checkout>'),
    (home, '<home>'),
]

evidence = sys.argv[1]
for arg in sys.argv[2:]:
    src, name = arg.split('=', 1)
    dst = os.path.join(evidence, name)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    with open(src, errors='replace') as fin:
        text = fin.read()
    for path, label in LABELS:
        text = text.replace(path, label)
    with open(dst, 'w') as fout:
        fout.write(text)
    print(name)
