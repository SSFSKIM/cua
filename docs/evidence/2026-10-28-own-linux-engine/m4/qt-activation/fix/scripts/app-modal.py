#!/usr/bin/env python3
"""Probe fixture (task 61 fix, ruling A, on a real Qt application): starts the application (its own process, in the
scratch home the wrapper sets, on the probe's private display), activates its window there, opens its modal Open dialog
with Ctrl+O (XTEST on the private display, before any front window of the probe's exists), and prints
`{"main": xid, "dialog": xid}` once a modal transient of the application is mapped. Waits to be killed, then ends it.
usage: app-modal.py <command...>"""
import json
import os
import signal
import subprocess
import sys
import time

app = subprocess.Popen(sys.argv[1:], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)


def end(*_):
    os.killpg(app.pid, signal.SIGTERM)
    sys.exit(0)


signal.signal(signal.SIGTERM, end)


def sh(*argv):
    return subprocess.run(argv, capture_output=True, text=True, timeout=30).stdout.strip()


def clients():
    return [int(w, 16) for w in sh('xprop', '-root', '_NET_CLIENT_LIST').replace(',', ' ').split() if w.startswith('0x')]


deadline = time.time() + 90
before = set(clients())
main = None
while time.time() < deadline and not main:
    new = [w for w in clients() if w not in before]
    main = new[0] if new else None
    time.sleep(0.5)
assert main, 'the application window'
time.sleep(4)
# the application's main window: its new client that is no transient (a splash may have come and gone)
main = [w for w in clients() if w not in before and 'window id' not in sh('xprop', '-id', str(w), 'WM_TRANSIENT_FOR')][0]
dialog = None
for attempt in range(3):
    sh('xdotool', 'windowactivate', '--sync', str(main))
    time.sleep(1)
    sh('xdotool', 'key', 'ctrl+o')
    until = time.time() + 8
    while time.time() < until and not dialog:
        for w in clients():
            if w == main or w in before:
                continue
            props = sh('xprop', '-id', str(w), 'WM_TRANSIENT_FOR', '_NET_WM_STATE')
            if 'window id' in props and '_NET_WM_STATE_MODAL' in props:
                dialog = w
        time.sleep(0.3)
    if dialog:
        break
    print(f'attempt {attempt}: no modal transient yet; clients {clients()}, focus {sh("xdotool", "getwindowfocus")}',
          file=sys.stderr, flush=True)
assert dialog, 'a modal transient after Ctrl+O'
print(json.dumps({'main': main, 'dialog': dialog}), flush=True)
while True:
    time.sleep(1)
