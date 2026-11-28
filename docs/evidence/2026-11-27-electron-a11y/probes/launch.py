#!/usr/bin/env python3
"""#228 probe 9: the launch route as cua's launch_app takes it on Linux: `gio launch <desktop entry>` with an environment.

cua's supervisor starts a desktop entry with /usr/bin/gio launch and only these variables of the session
(src/repl-host/launch-services.mjs DESKTOP_ENV): HOME, USER, LOGNAME, LANG, LC_ALL, LC_CTYPE, PATH, DISPLAY,
XAUTHORITY, DBUS_SESSION_BUS_ADDRESS, XDG_RUNTIME_DIR, XDG_DATA_DIRS. The probe writes a desktop entry for cua's
Electron fixture into the session's own applications directory and launches it the same way, under each condition:

  as-cua-launches, switch on     cua's variables only, IsEnabled on
  as-cua-launches, switch off    cua's variables only, both switches off
  session-variable, switch off   the same plus QT_ACCESSIBILITY=1, which a Debian or Ubuntu X session exports to every
                                 application it starts (/etc/X11/Xsession.d/90qt-a11y) and cua's list drops
  cua-variable, switch off       the same plus ACCESSIBILITY_ENABLED=1 (the design's addition)

A row says whether the launched app registered on the accessibility bus, and, after one GetAttributes, whether the
page's button is in a structural read.

usage: launch.py <out.jsonl>
"""
import os
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib  # noqa: E402
from apps import visible_windows  # noqa: E402

DESKTOP_ENV = ['HOME', 'USER', 'LOGNAME', 'LANG', 'LC_ALL', 'LC_CTYPE', 'PATH', 'DISPLAY', 'XAUTHORITY', 'DBUS_SESSION_BUS_ADDRESS', 'XDG_RUNTIME_DIR', 'XDG_DATA_DIRS']


NODE_CALL = '''
import {runGioLaunch} from %s;
const started = Date.now();
const env = JSON.parse(process.argv[2]);
runGioLaunch(process.argv[1], env).then(
  () => console.log(JSON.stringify({settled: 'resolved', ms: Date.now() - started})),
  error => console.log(JSON.stringify({settled: 'rejected', ms: Date.now() - started, message: String(error.message).slice(0, 200)})));
'''


def through_cua(out):
    """The same launch through cua's own function (src/repl-host/launch-services.mjs runGioLaunch), which runs gio with
    pipes for its output: when it settles, and how."""
    import json
    with lib.Session('launch-cua') as session:
        session.set_status('ScreenReaderEnabled', False)
        session.set_status('IsEnabled', True)
        session.a11y()
        applications = os.path.join(session.root, 'home', '.local', 'share', 'applications')
        os.makedirs(applications, exist_ok=True)
        entry = os.path.join(applications, 'cua-electron-fixture.desktop')
        data = os.path.join(session.root, 'fixture-data')
        with open(entry, 'w') as f:
            f.write(f'[Desktop Entry]\nType=Application\nName=cua Electron fixture\nExec={lib.ELECTRON} {lib.FIXTURE} --cua-fixture-user-data={data}\n')
        full = session.env()
        env = {key: full[key] for key in DESKTOP_ENV if key in full}
        module = json.dumps('file://' + os.path.join(lib.REPO, 'src', 'repl-host', 'launch-services.mjs'))
        log = os.path.join(session.root, 'node.log')
        with open(log, 'wb') as sink:
            node = subprocess.Popen(['node', '--input-type=module', '-e', NODE_CALL % module, entry, json.dumps(env)], env=session.env(), stdout=sink, stderr=subprocess.STDOUT,
                                    stdin=subprocess.DEVNULL, start_new_session=True)
            found, _ = lib.wait_for(lambda: visible_windows(session), 20, step=0.1)
            try:
                node.wait(timeout=45)
            except subprocess.TimeoutExpired:
                pass
        text = open(log, errors='replace').read().strip()
        lib.emit({'probe': 'launch', 'condition': "through cua's runGioLaunch, switch on", 'window_appeared': bool(found), 'node_exit': node.poll(), 'answer': text[-300:]}, out)


def condition(out, name, enabled, extra):
    with lib.Session('launch') as session:
        session.set_status('ScreenReaderEnabled', False)
        session.set_status('IsEnabled', enabled)
        session.a11y()
        applications = os.path.join(session.root, 'home', '.local', 'share', 'applications')
        os.makedirs(applications, exist_ok=True)
        entry = os.path.join(applications, 'cua-electron-fixture.desktop')
        data = os.path.join(session.root, 'fixture-data')
        with open(entry, 'w') as f:
            f.write(f'[Desktop Entry]\nType=Application\nName=cua Electron fixture\nExec={lib.ELECTRON} {lib.FIXTURE} --cua-fixture-user-data={data}\n')
        full = session.env()
        env = {key: full[key] for key in DESKTOP_ENV if key in full}
        env.update(extra)
        started = lib.now_ms()
        # gio's output goes to a file, not a pipe: the launched app inherits whatever gio's output is, and a pipe
        # would stay open for as long as the app runs
        log = os.path.join(session.root, 'gio.log')
        with open(log, 'wb') as sink:
            gio = subprocess.Popen(['/usr/bin/gio', 'launch', entry], env=env, stdout=sink, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, start_new_session=True)
            try:
                code = gio.wait(timeout=30)
            except subprocess.TimeoutExpired:
                code = 'still running after 30 s'
        row = {'probe': 'launch', 'condition': name, 'status': session.status(), 'extra_env': extra, 'gio_exit': code, 'gio_ms': round(lib.now_ms() - started, 1),
               'gio_output': open(log, errors='replace').read().strip()[-200:]}
        found, _ = lib.wait_for(lambda: visible_windows(session), 20, step=0.1)
        if not found:
            row['error'] = 'no window'
            lib.emit(row, out)
            return
        window, pid = found[-1]
        row['window_ms'] = round(lib.now_ms() - started, 1)
        with open(f'/proc/{pid}/environ', 'rb') as f:
            names = sorted(item.split(b'=', 1)[0].decode() for item in f.read().split(b'\0') if b'=' in item)
        row['app_environment_names'] = names
        entry_on_bus, _ = lib.wait_for(lambda: lib.app_of(session, pid), 5)
        row['registered'] = bool(entry_on_bus)
        if entry_on_bus:
            row['before_nodes'] = lib.walk(session, entry_on_bus)['nodes']
            lib.kick(session, entry_on_bus)
            tree, ms = lib.wait_for(lambda: (lambda t: t if lib.has_named(t, 'push button', 'Fixture button') else None)(lib.walk(session, entry_on_bus)), 8)
            row['kick_tree_ms'] = ms if tree else None
            row['after_nodes'] = tree['nodes'] if tree else None
        lib.emit(row, out)
        # the launched app is not a child of the probe: the session's end finds it by its command line, which names
        # its profile in the session's directory, and stops it (its /proc environ reads empty: `app_environment_names`)


if __name__ == '__main__':
    out = sys.argv[1]
    for name, enabled, extra in (('as-cua-launches, switch on', True, {}), ('as-cua-launches, switch off', False, {}),
                                 ('session-variable, switch off', False, {'QT_ACCESSIBILITY': '1'}), ('cua-variable, switch off', False, {'ACCESSIBILITY_ENABLED': '1'})):
        try:
            condition(out, name, enabled, extra)
        except Exception as error:
            lib.emit({'probe': 'launch', 'condition': name, 'error': repr(error)[:300]}, out)
    try:
        through_cua(out)
    except Exception as error:
        lib.emit({'probe': 'launch', 'condition': "through cua's runGioLaunch", 'error': repr(error)[:300]}, out)
