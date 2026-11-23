#!/usr/bin/env python3
"""Probe driver (task 61 fix: a modal dialog that maps while a request runs), inside a private Xvfb (opener-probe.sh):
a background click on a Qt button that opens a modal dialog of the application's own. Does the new dialog take the X
focus or the active window from the probe's front window? 5 clicks; the dialog closes itself between them.
usage: opener-probe.py <engine> <wm: none|openbox> qt5|qt6"""
import json
import subprocess
import sys
import time

engine, wm, binding = sys.argv[1:4]
here = __file__.rsplit('/', 1)[0]


def sh(*argv):
    return subprocess.run(argv, capture_output=True, text=True, timeout=30).stdout.strip()


def state():
    out = sh('xprop', '-root', '_NET_ACTIVE_WINDOW')
    return sh('xdotool', 'getwindowfocus'), (str(int(out.split()[-1], 16)) if '#' in out else 'none')


front_proc = subprocess.Popen([sys.executable, f'{here}/front.py'], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                              text=True)
front = str(json.loads(front_proc.stdout.readline())['xid'])
app = subprocess.Popen([sys.executable, f'{here}/qt-opener.py', 'cua171-opener', binding], stdout=subprocess.PIPE,
                       stderr=subprocess.DEVNULL, text=True)
main = json.loads(app.stdout.readline())['main']
deadline = time.time() + 30
while time.time() < deadline:
    line = json.dumps({'id': 1, 'command': 'get_window_state', 'input': {'window': {'id': main},
                                                                        'include_screenshot': False}}) + '\n'
    out = subprocess.run([engine, 'server'], input=line, capture_output=True, text=True, timeout=30).stdout
    if '"ax_tree_source":"at_spi"' in out.replace(' ', ''):
        break
    time.sleep(0.5)
moved = 0
for i in range(1, 6):
    sh('xdotool', 'windowactivate' if wm == 'openbox' else 'windowfocus', '--sync', front)
    time.sleep(0.5)
    before = state()
    line = json.dumps({'id': 1, 'command': 'click', 'input': {'window': {'id': main}, 'x': 150, 'y': 75}}) + '\n'
    answer = subprocess.run([engine, 'server'], input=line, capture_output=True, text=True, timeout=30).stdout
    time.sleep(0.5)
    after = state()
    took = after[0] != front or (wm == 'openbox' and after[1] != front)
    moved += took
    print(f'{binding} [{wm}] click {i}: before {before}, answer {answer.strip()[:90]}, after {after}'
          f'{"  <- moved" if took else ""}', flush=True)
    time.sleep(1.5)
print(f'{binding} [{wm}]: a background click that opened a modal dialog moved the focus or the active window off the '
      f'front window {moved} of 5 times')
app.terminate()
front_proc.terminate()
