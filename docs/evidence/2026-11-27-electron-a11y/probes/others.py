#!/usr/bin/env python3
"""#228 probe 6: what the session's switches do to the other applications on the same bus.

One private session per scenario, with one application of each family started in it: gedit (GTK 3), gnome-text-editor
(GTK 4), kate (Qt 5), qtcreator (Qt 6) and cua's Electron fixture (Chromium). After each step a row says which of them
are on the accessibility bus (by the process that owns each bus name), their node counts from a structural read, and
each process's CPU seconds and resident memory.

  flip          all started with both switches off; then IsEnabled on; then ScreenReaderEnabled on
  on-at-start   all started with IsEnabled on
  qt-variable   all started with both switches off and QT_ACCESSIBILITY=1 in their environment, which every X session
                on Debian and Ubuntu exports (/etc/X11/Xsession.d/90qt-a11y, from the at-spi2-core package)

usage: others.py <out.jsonl> [scenario ...]
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib  # noqa: E402

TICKS = os.sysconf('SC_CLK_TCK')
PAGE = os.sysconf('SC_PAGE_SIZE')


def launch(session, env=None):
    root = session.root
    note = os.path.join(root, 'note.txt')
    with open(note, 'w') as f:
        f.write('one line\n')
    return {
        'gedit (GTK 3)': session.spawn(['gedit', '--standalone', note], env, name='gedit'),
        'gnome-text-editor (GTK 4)': session.spawn(['gnome-text-editor', '--standalone', note], env, name='gte'),
        'kate (Qt 5)': session.spawn(['kate', '-b', '-n', note], env, name='kate'),
        'qtcreator (Qt 6)': session.spawn(['qtcreator', '-settingspath', os.path.join(root, 'qtc'), '-noload', 'Welcome', note], env, name='qtcreator'),
        'fixture (Electron)': session.spawn(lib.fixture_argv(session), env, name='fixture'),
    }


def usage(pid):
    try:
        with open(f'/proc/{pid}/stat') as f:
            fields = f.read().rsplit(')', 1)[1].split()
        return {'cpu_s': round((int(fields[11]) + int(fields[12])) / TICKS, 2), 'rss_mb': round(int(fields[21]) * PAGE / 1048576, 1)}
    except (OSError, ValueError, IndexError):
        return None


def group_of(pid):
    try:
        return os.getpgid(pid)
    except ProcessLookupError:
        return None


def observe(session, apps):
    entries = lib.registry(session)
    out = {}
    for label, proc in apps.items():
        mine = [e for e in entries if e['pid'] is not None and group_of(e['pid']) == proc.pid]
        row = {'registered': bool(mine), 'usage': usage(proc.pid)}
        if mine:
            tree = lib.walk(session, mine[0], limit=3000)
            row.update({'toolkit': f"{mine[0]['toolkit']} {mine[0]['version']}", 'nodes': tree['nodes']})
        out[label] = row
    return out


def scenario(out, name, switches, env=None, flips=()):
    with lib.Session(f'others-{name}') as session:
        session.set_status('ScreenReaderEnabled', False)
        session.set_status('IsEnabled', False)
        for key, value in switches.items():
            session.set_status(key, value)
        session.a11y()
        status = session.status()
        apps = launch(session, env)
        time.sleep(14)
        lib.emit({'probe': 'others', 'scenario': name, 'step': 'started, 14 s later', 'env': env or {}, 'status': status, 'apps': observe(session, apps)}, out)
        for key in flips:
            session.set_status(key, True)
            time.sleep(5)
            lib.emit({'probe': 'others', 'scenario': name, 'step': f'{key} on, 5 s later', 'status': session.status(), 'apps': observe(session, apps)}, out)


SCENARIOS = {
    'flip': lambda out: scenario(out, 'flip', {}, flips=('IsEnabled', 'ScreenReaderEnabled')),
    'on-at-start': lambda out: scenario(out, 'on-at-start', {'IsEnabled': True}),
    'qt-variable': lambda out: scenario(out, 'qt-variable', {}, env={'QT_ACCESSIBILITY': '1'}),
}

if __name__ == '__main__':
    out = sys.argv[1]
    for name in (sys.argv[2:] or list(SCENARIOS)):
        try:
            SCENARIOS[name](out)
        except Exception as error:
            lib.emit({'probe': 'others', 'scenario': name, 'error': repr(error)[:300]}, out)
