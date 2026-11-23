#!/usr/bin/env python3
"""Probe driver (task 61 fix, ruling A), run inside a private Xvfb with a session bus (modal-probe.sh): does background
input to a main window that a modal dialog of its own blocks move the X input focus (with a window manager: the active
window) to the dialog? The same probe as task 61's Qt one (mechanism/modal-probe.txt): a front window of the probe's
holds the focus, a fresh engine sends one background input to the blocked main window, and the focus is read 0.3 s
later; a control with nothing sent first. Prints one line per run and a summary line per family.

usage: modal-probe.py <engine> <xprobe> <wm: none|openbox> <family> <fixture argv...>
  family: a label; the input is press_key "a", or for gtk4 (whose keys shared mode refuses) the main window's "probe"
  button's primary element click (its AT-SPI action, inside the window's input session and its synthetic FocusIn)."""
import json
import subprocess
import sys
import time

engine, xprobe, wm, family = sys.argv[1:5]
fixture = sys.argv[5:]
RUNS, CONTROLS = 5, 3
FRONT = __file__.rsplit('/', 1)[0] + '/front.py'


def sh(*argv):
    return subprocess.run(argv, capture_output=True, text=True, timeout=30).stdout.strip()


def focus():
    return sh('xdotool', 'getwindowfocus')


def active():
    out = sh('xprop', '-root', '_NET_ACTIVE_WINDOW')
    return str(int(out.split()[-1], 16)) if '#' in out else 'none'


def give_front(front):
    if wm == 'openbox':
        sh('xdotool', 'windowactivate', '--sync', front)
    else:
        sh('xdotool', 'windowfocus', '--sync', front)


def request(command, payload):
    line = json.dumps({'id': 1, 'command': command, 'input': payload}) + '\n'
    out = subprocess.run([engine, 'server'], input=line, capture_output=True, text=True, timeout=30).stdout
    return json.loads(out.splitlines()[0]) if out else None


def find(node, role, name):
    if node.get('role') in role and node.get('name') == name:
        return node
    for child in node.get('children', []):
        found = find(child, role, name)
        if found:
            return found
    return None


# the front window: a plain GTK 3 window of the probe's, which a window manager manages as any client
front_proc = subprocess.Popen([sys.executable, FRONT], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
front = str(json.loads(front_proc.stdout.readline())['xid'])
time.sleep(0.5)
app = subprocess.Popen(fixture, stdout=subprocess.PIPE, text=True)
ids = json.loads(app.stdout.readline())
main, dialog = str(ids['main']), str(ids['dialog'])
time.sleep(0.5)
props = sh('xprop', '-id', dialog, 'WM_TRANSIENT_FOR', '_NET_WM_STATE')
print(f'{family} [{wm}]: dialog {dialog} {props!r}; main {main}; front {front}')
payload = {'window': {'id': int(main)}, 'key': 'a'}
command = 'press_key'
if family == 'gtk4':
    deadline = time.time() + 30
    button = None
    while time.time() < deadline and not button:
        state = request('get_window_state', {'window': {'id': int(main)}, 'include_screenshot': False})
        tree = (state or {}).get('output') or {}
        root = tree.get('ax_tree') or {}
        button = find(root, ('push button', 'button'), 'probe') if isinstance(root, dict) else None
        if not button:
            time.sleep(0.5)
    if not button:
        print(f'{family} [{wm}]: no probe button in the tree: {json.dumps(state)[:300]}')
        sys.exit(1)
    command, payload = 'click', {'window': {'id': int(main)}, 'element_id': button['id']}
for i in range(1, CONTROLS + 1):
    give_front(front)
    time.sleep(0.6)
    print(f'{family} [{wm}] control {i}: nothing sent, focus {focus()} active {active()} (front {front})')
moved = 0
for i in range(1, RUNS + 1):
    give_front(front)
    time.sleep(0.3)
    before = (focus(), active())
    answer = request(command, payload)
    time.sleep(0.3)
    after = (focus(), active())
    if before[0] != front or (wm == 'openbox' and before[1] != front):
        print(f'{family} [{wm}] {command} {i}: INVALID, the front window did not hold the focus before: {before}')
        continue
    took = after[0] != front or (wm == 'openbox' and after[1] != front)
    moved += took
    print(f'{family} [{wm}] {command} {i}: before focus/active {before}, answer ok={answer and answer.get("ok")} '
          f'{(answer or {}).get("error")}, after focus/active {after}{"  <- moved" if took else ""}')
print(f'{family} [{wm}]: the X focus or the active window moved off the front window after {moved} of {RUNS} '
      f'background {command}s to the blocked main window')
app.terminate()
app.wait(timeout=15)
front_proc.kill()
