#!/usr/bin/env python3
"""#228 probe 2: what turns the tree on in an Electron app that is already running.

Each scenario is one private session and one app instance; a row is written after every step.

  started-off          the fixture with both switches off, no variable, no flag; then, in turn: IsEnabled on,
                       ScreenReaderEnabled on, a process named orca, a real key press in its window
  started-flag-only    the fixture with --force-renderer-accessibility and both switches off; then IsEnabled on, then
                       a real key press (atk_util_auralinux.cc HandleAtkKeyEvent retries the bridge when the mode has
                       kNativeAPIs)
  app-enables-itself   the probe app with both switches off; app.setAccessibilitySupportEnabled(true); IsEnabled on;
                       a key press
  kick-attributes      the probe app with IsEnabled on: the mode before, after a structural read, after
                       Accessible.GetAttributes on the application root, and 45 s later
  kick-relations       the same with Accessible.GetRelationSet
  kick-on-frame        the same with GetAttributes on the frame instead of the application root
  kick-with-orca       the same with a process named orca already running
  app-enables-bridge-on  the probe app with IsEnabled on; setAccessibilitySupportEnabled(true), then (false)
  orca-after-request   the probe app with IsEnabled on and no process named orca: one GetAttributes; then a process
                       named orca starts; then the requests a screen reader would send (GetAttributes, GetRelationSet)
                       and a wait. Chromium looks for Orca only when the mode changes, and the second request changes
                       nothing: does the app ever get the mode Orca gets when it is there first (kick-with-orca)?

usage: running.py <out.jsonl> [scenario ...]
"""
import json
import os
import shutil
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib  # noqa: E402

FLAG = '--force-renderer-accessibility'


class ProbeApp:
    def __init__(self, session, args=(), env=None):
        self.session = session
        self.dir = os.path.join(session.root, 'probe')
        self.sent = 0
        self.proc = session.spawn([lib.ELECTRON, lib.PROBE_APP, f'--probe-dir={self.dir}', *args], env, name='probe-app')
        self.pid = self.proc.pid

    def log(self):
        try:
            with open(os.path.join(self.dir, 'probe.jsonl')) as f:
                return [json.loads(line) for line in f if line.strip()]
        except OSError:
            return []

    def wait_event(self, event, timeout=20):
        found, _ = lib.wait_for(lambda: [row for row in self.log() if row.get('event') == event], timeout)
        return found[-1] if found else None

    def command(self, op, timeout=60, **more):
        self.sent += 1
        number = self.sent
        tmp = os.path.join(self.dir, f'.cmd-{number}.tmp')
        with open(tmp, 'w') as f:
            json.dump({'op': op, **more}, f)
        os.rename(tmp, os.path.join(self.dir, f'cmd-{number}.json'))
        found, _ = lib.wait_for(lambda: [row for row in self.log() if row.get('event') == 'result' and row.get('id') == number], timeout)
        return found[-1] if found else {'error': 'no answer'}

    def mode(self):
        answer = self.command('state')
        return {'enabled': answer.get('enabled'), 'features': answer.get('features')}


def switches_off(session):
    session.set_status('ScreenReaderEnabled', False)
    session.set_status('IsEnabled', False)
    session.a11y()
    return session.status()


def switches_bridge_on(session):
    session.set_status('ScreenReaderEnabled', False)
    session.set_status('IsEnabled', True)
    session.a11y()
    return session.status()


def observe(session, pid, marker):
    """Whether the app is on the bus, and a structural read of it."""
    entry = lib.app_of(session, pid)
    if not entry:
        return {'registered': False}
    tree = lib.walk(session, entry)
    return {'registered': True, 'nodes': tree['nodes'], 'marker': lib.has_named(tree, 'push button', marker), 'web_documents': len(tree['web_documents'])}


def press_key(session, pid):
    """A real key press (XTEST) in the app's window, on the private display."""
    windows = session.windows_of(pid)
    if not windows:
        return 'no window'
    env = session.env()
    subprocess.run(['xdotool', 'windowactivate', '--sync', str(windows[-1])], env=env, capture_output=True, timeout=10)
    subprocess.run(['xdotool', 'key', 'shift'], env=env, capture_output=True, timeout=10)
    return f'shift pressed in window {windows[-1]}'


def fake_orca(session):
    path = os.path.join(session.root, 'orca')
    shutil.copy('/usr/bin/sleep', path)
    return session.spawn([path, '600'], name='orca')


def step(out, scenario, name, **fields):
    lib.emit({'probe': 'running', 'scenario': scenario, 'step': name, **fields}, out)


def started_off(out, scenario='started-off', args=(), marker='Fixture button'):
    with lib.Session('run-off') as session:
        status = switches_off(session)
        app = session.spawn(lib.fixture_argv(session, args), name='fixture')
        lib.wait_for(lambda: session.windows_of(app.pid), 20)
        time.sleep(2)
        step(out, scenario, 'started', status=status, args=list(args), **observe(session, app.pid, marker), fixture_log=lib.fixture_log(session)[-1:])
        session.set_status('IsEnabled', True)
        time.sleep(3)
        step(out, scenario, 'IsEnabled on, 3 s later', status=session.status(), **observe(session, app.pid, marker))
        if not args:
            session.set_status('ScreenReaderEnabled', True)
            time.sleep(3)
            step(out, scenario, 'ScreenReaderEnabled on, 3 s later', status=session.status(), **observe(session, app.pid, marker))
            fake_orca(session)
            time.sleep(3)
            step(out, scenario, 'a process named orca, 3 s later', **observe(session, app.pid, marker))
        pressed = press_key(session, app.pid)
        time.sleep(3)
        step(out, scenario, 'a real key press, 3 s later', key=pressed, **observe(session, app.pid, marker), fixture_log=lib.fixture_log(session)[-1:])


def app_enables_itself(out):
    scenario = 'app-enables-itself'
    with lib.Session('run-self') as session:
        status = switches_off(session)
        app = ProbeApp(session)
        app.wait_event('ready-to-show')
        time.sleep(1)
        step(out, scenario, 'started', status=status, mode=app.mode(), **observe(session, app.pid, 'Probe button'))
        answer = app.command('enable')
        time.sleep(2)
        step(out, scenario, 'app.setAccessibilitySupportEnabled(true), 2 s later', error=answer.get('error'), mode=app.mode(), **observe(session, app.pid, 'Probe button'))
        session.set_status('IsEnabled', True)
        time.sleep(3)
        step(out, scenario, 'IsEnabled on, 3 s later', status=session.status(), **observe(session, app.pid, 'Probe button'))
        pressed = press_key(session, app.pid)
        time.sleep(3)
        step(out, scenario, 'a real key press, 3 s later', key=pressed, mode=app.mode(), **observe(session, app.pid, 'Probe button'))


def kick(out, scenario, method='GetAttributes', on_frame=False, orca=False, linger=45):
    with lib.Session(scenario[:20]) as session:
        status = switches_bridge_on(session)
        if orca:
            fake_orca(session)
            time.sleep(0.3)
        app = ProbeApp(session)
        app.wait_event('ready-to-show')
        time.sleep(1)
        step(out, scenario, 'started', status=status, mode=app.mode(), events=[row['event'] for row in app.log()])
        step(out, scenario, 'a structural read', **observe(session, app.pid, 'Probe button'), mode=app.mode())
        entry = lib.app_of(session, app.pid)
        path = None
        if on_frame:
            kids = lib.call(session.a11y(), entry['bus'], entry['path'], lib.ACC, 'GetChildren', None, '(a(so))').unpack()[0]
            path = kids[0][1]
        answer = lib.kick(session, entry, method, path)
        kicked = lib.now_ms()
        tree, _ = lib.wait_for(lambda: (lambda t: t if lib.has_named(t, 'push button', 'Probe button') else None)(lib.walk(session, entry)), 8)
        step(out, scenario, f'{method} on the {"frame" if on_frame else "application root"}', kick=answer,
             tree_ms=round(lib.now_ms() - kicked, 1) if tree else None, nodes=tree['nodes'] if tree else None, mode=app.mode(),
             log=[{k: row.get(k) for k in ('event', 'enabled', 'features', 'argument')} for row in app.log() if row['event'] in ('mode-changed', 'accessibility-support-changed')])
        if linger:
            time.sleep(linger)
            step(out, scenario, f'{linger} s later, untouched', **observe(session, app.pid, 'Probe button'), mode=app.mode())


def app_enables_bridge_on(out):
    scenario = 'app-enables-bridge-on'
    with lib.Session('run-self-on') as session:
        status = switches_bridge_on(session)
        app = ProbeApp(session)
        app.wait_event('ready-to-show')
        time.sleep(1)
        step(out, scenario, 'started', status=status, mode=app.mode(), **observe(session, app.pid, 'Probe button'))
        app.command('enable')
        entry = lib.app_of(session, app.pid)
        tree, ms = lib.wait_for(lambda: (lambda t: t if lib.has_named(t, 'push button', 'Probe button') else None)(lib.walk(session, entry)), 8)
        step(out, scenario, 'app.setAccessibilitySupportEnabled(true)', tree_ms=ms if tree else None, nodes=tree['nodes'] if tree else None, mode=app.mode(),
             log=[{k: row.get(k) for k in ('event', 'enabled', 'features', 'argument')} for row in app.log() if row['event'] in ('mode-changed', 'accessibility-support-changed')])
        app.command('disable')
        time.sleep(2)
        step(out, scenario, 'app.setAccessibilitySupportEnabled(false), 2 s later', mode=app.mode(), **observe(session, app.pid, 'Probe button'))


def orca_after_request(out):
    scenario = 'orca-after-request'
    with lib.Session('orca-after') as session:
        status = switches_bridge_on(session)
        app = ProbeApp(session)
        app.wait_event('ready-to-show')
        time.sleep(1)
        entry = lib.app_of(session, app.pid)
        step(out, scenario, 'started, no process named orca', status=status, mode=app.mode())
        first = lib.kick(session, entry)
        lib.wait_for(lambda: lib.has_named(lib.walk(session, entry), 'push button', 'Probe button'), 8)
        time.sleep(1)
        step(out, scenario, 'GetAttributes on the application root', kick=first, mode=app.mode())
        fake_orca(session)
        time.sleep(3)
        step(out, scenario, 'a process named orca starts, 3 s later', mode=app.mode())
        second = lib.kick(session, entry)
        third = lib.kick(session, entry, 'GetRelationSet')
        lib.walk(session, entry)
        time.sleep(5)
        step(out, scenario, 'GetAttributes and GetRelationSet again, 5 s later', kicks=[second, third], mode=app.mode(), **observe(session, app.pid, 'Probe button'))
        pressed = press_key(session, app.pid)
        time.sleep(3)
        step(out, scenario, 'a real key press in the window, 3 s later', key=pressed, mode=app.mode())


SCENARIOS = {
    'started-off': lambda out: started_off(out),
    'started-flag-only': lambda out: started_off(out, 'started-flag-only', (FLAG,)),
    'app-enables-itself': app_enables_itself,
    'kick-attributes': lambda out: kick(out, 'kick-attributes'),
    'kick-relations': lambda out: kick(out, 'kick-relations', 'GetRelationSet', linger=0),
    'kick-on-frame': lambda out: kick(out, 'kick-on-frame', on_frame=True, linger=0),
    'kick-with-orca': lambda out: kick(out, 'kick-with-orca', orca=True, linger=0),
    'app-enables-bridge-on': app_enables_bridge_on,
    'orca-after-request': orca_after_request,
}

if __name__ == '__main__':
    out = sys.argv[1]
    for name in (sys.argv[2:] or list(SCENARIOS)):
        try:
            SCENARIOS[name](out)
        except Exception as error:
            lib.emit({'probe': 'running', 'scenario': name, 'error': repr(error)[:300]}, out)
