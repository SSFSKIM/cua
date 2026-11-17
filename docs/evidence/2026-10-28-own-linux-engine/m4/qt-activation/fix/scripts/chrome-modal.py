#!/usr/bin/env python3
"""Probe fixture (task 61 fix, ruling A): a Chrome window of the probe's own (its own profile under the scratch HOME the
wrapper sets, on the probe's private display and bus) blocked by a modal dialog: the file chooser its page's
`<input type=file>` opens, clicked through the engine's element click (its AT-SPI action). Prints
`{"main": xid, "dialog": xid}` once the dialog is mapped, transient for the main window and modal; then waits to be
killed, and ends its Chrome.
usage: chrome-modal.py <title> <engine>"""
import json
import os
import signal
import subprocess
import sys
import time

title, engine = sys.argv[1], sys.argv[2]
home = os.environ['HOME']
page = os.path.join(home, 'page.html')
with open(page, 'w') as f:
    f.write(f'<!doctype html><title>{title}</title><input type=file id=f aria-label="probe file">'
            '<textarea id=t></textarea>')
chrome = subprocess.Popen(['google-chrome', f'--user-data-dir={home}/profile', '--no-first-run',
                           '--no-default-browser-check', '--disable-search-engine-choice-screen',
                           '--password-store=basic', '--force-renderer-accessibility', '--new-window',
                           f'file://{page}'], env={**os.environ, 'ACCESSIBILITY_ENABLED': '1'},
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)


def end(*_):
    os.killpg(chrome.pid, signal.SIGTERM)
    sys.exit(0)


signal.signal(signal.SIGTERM, end)


def sh(*argv):
    return subprocess.run(argv, capture_output=True, text=True, timeout=30).stdout.strip()


def request(command, payload):
    line = json.dumps({'id': 1, 'command': command, 'input': payload}) + '\n'
    out = subprocess.run([engine, 'server'], input=line, capture_output=True, text=True, timeout=30).stdout
    return json.loads(out.splitlines()[0]) if out else None


def find(node, test):
    if test(node):
        return node
    for child in node.get('children', []):
        found = find(child, test)
        if found:
            return found
    return None


deadline = time.time() + 60
main = None
while time.time() < deadline and not main:
    ids = sh('xdotool', 'search', '--onlyvisible', '--name', title).split()
    main = int(ids[0]) if ids else None
    time.sleep(0.5)
assert main, 'Chrome window'
button = None
while time.time() < deadline and not button:
    state = request('get_window_state', {'window': {'id': main}, 'include_screenshot': False}) or {}
    root = (state.get('output') or {}).get('ax_tree') or {}
    button = find(root, lambda n: n.get('role') in ('push button', 'button') and 'probe file' in (n.get('name') or ''))
    if not button:
        time.sleep(0.5)
assert button, f'the file input in the tree: {json.dumps(state)[:400]}'
before = set(sh('xdotool', 'search', '--onlyvisible', '--name', '.').split())
answer = request('click', {'window': {'id': main}, 'element_id': button['id']})
dialog = None
while time.time() < deadline and not dialog:
    for w in set(sh('xdotool', 'search', '--onlyvisible', '--name', '.').split()) - before:
        props = sh('xprop', '-id', w, 'WM_TRANSIENT_FOR', '_NET_WM_STATE')
        if 'window id' in props and '_NET_WM_STATE_MODAL' in props:
            dialog = int(w)
    time.sleep(0.3)
assert dialog, f'a modal transient after the click {answer}'
print(json.dumps({'main': main, 'dialog': dialog}), flush=True)
while True:
    time.sleep(1)
