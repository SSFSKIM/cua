#!/usr/bin/env python3
"""Every window of one application on a private display, and whether it carries _XEMBED_INFO (task 61, fix 2).

Runs inside the survey's own Xvfb (never :0). The application's X client is found from the clients the window manager
lists (_NET_CLIENT_LIST), by resource-id base; every window of that base in the whole root tree is reported, with
where it sits: a listed top-level ("toplevel"), a descendant of one ("child"), or another window of the client
("other": leader, popup, helper). Prints one JSON line per window: no titles or text, only ids, roles and the
property's value.
usage: dump-xembed.py <label> <version>"""
import json
import os
import re
import subprocess
import sys

label, version = sys.argv[1], sys.argv[2]
MASK = 0x1FFFFF  # Xvfb's resource-id mask


def run(*args):
    return subprocess.run(args, capture_output=True, text=True, timeout=20).stdout


def ids(text):
    return [int(m, 16) for m in re.findall(r'0x[0-9a-f]+', text)]


def tree(root_args):
    """(window, depth) for every window under the given root, in xwininfo's order."""
    out = []
    for line in run('xwininfo', '-tree', *root_args).splitlines():
        m = re.match(r'^(\s+)(0x[0-9a-f]+) ', line)
        if m:
            out.append((int(m.group(2), 16), len(m.group(1)) // 3))
    return out


clients = ids(run('xprop', '-root', '-notype', '_NET_CLIENT_LIST').partition('#')[2])
openbox_base = None
check = ids(run('xprop', '-root', '-notype', '_NET_SUPPORTING_WM_CHECK'))
if check:
    openbox_base = check[0] & ~MASK
app_bases = {c & ~MASK for c in clients} - {openbox_base}
under_client = {}
for c in clients:
    for w, _ in tree(['-id', hex(c)]):
        if w != c:
            under_client[w] = c
rows = []
for w, depth in tree(['-root']):
    base = w & ~MASK
    if base not in app_bases:
        continue
    where = 'toplevel' if w in clients else ('child' if w in under_client else 'other')
    raw = run('xprop', '-id', hex(w), '-notype', '_XEMBED_INFO').strip()
    value = raw.partition('=')[2].strip() if '=' in raw else None
    rows.append({'app': label, 'version': version, 'window': hex(w), 'where': where, 'xembed': value})
for row in rows:
    print(json.dumps(row))
if not rows:
    print(json.dumps({'app': label, 'version': version, 'error': 'no application window found'}))
