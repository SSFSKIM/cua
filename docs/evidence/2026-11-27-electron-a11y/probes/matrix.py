#!/usr/bin/env python3
"""#228 probe 1: what puts the Electron fixture's tree on the accessibility bus, set before the app starts.

One private session per condition (lib.Session). Each row records, for cua's fixture on Electron 44.9.0:
  - the bus's switches as read back before the launch;
  - whether the app registered on the accessibility bus, and how long after its spawn;
  - a structural read of its tree (role name, name, children: what cua's engine asks for), twice 1.5 s apart, so a
    read that changed the tree by itself would show;
  - then one Accessible.GetAttributes on the application root (the "kick"), and how long until the page's button is
    in the tree;
  - the fixture's own record of app.isAccessibilitySupportEnabled().

usage: matrix.py <out.jsonl> [condition ...]
"""
import os
import shutil
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib  # noqa: E402

FLAG = '--force-renderer-accessibility'
# name: (bus switches set before the launch, environment, arguments, a process named orca first)
CONDITIONS = {
    'baseline': ({}, {}, [], False),
    'flag': ({}, {}, [FLAG], False),
    'env-ACCESSIBILITY_ENABLED': ({}, {'ACCESSIBILITY_ENABLED': '1'}, [], False),
    'env-GNOME_ACCESSIBILITY': ({}, {'GNOME_ACCESSIBILITY': '1'}, [], False),
    'env-QT_ACCESSIBILITY': ({}, {'QT_ACCESSIBILITY': '1'}, [], False),
    'bus-IsEnabled': ({'IsEnabled': True}, {}, [], False),
    'bus-ScreenReaderEnabled': ({'ScreenReaderEnabled': True}, {}, [], False),
    'gsettings-toolkit-accessibility': ({'gsettings': True}, {}, [], False),
    'flag+env': ({}, {'ACCESSIBILITY_ENABLED': '1'}, [FLAG], False),
    'flag+bus-IsEnabled': ({'IsEnabled': True}, {}, [FLAG], False),
    'flag=basic+bus-IsEnabled': ({'IsEnabled': True}, {}, [FLAG + '=basic'], False),
    'bus-IsEnabled+orca-process': ({'IsEnabled': True}, {}, [], True),
    'bus-IsEnabled+env=0': ({'IsEnabled': True}, {'ACCESSIBILITY_ENABLED': '0'}, [], False),
    'bus-IsEnabled+disable-renderer-accessibility': ({'IsEnabled': True}, {}, ['--disable-renderer-accessibility'], False),
    'bus-IsEnabled+disable-platform-integration': ({'IsEnabled': True}, {}, ['--disable-platform-accessibility-integration'], False),
}


def fake_orca(session):
    """A process of the run's whose name is `orca` (a copy of sleep): what Chromium's DiscoverOrca looks for."""
    path = os.path.join(session.root, 'orca')
    shutil.copy('/usr/bin/sleep', path)
    return session.spawn([path, '600'], name='orca')


def run(name, out):
    switches, env, args, orca = CONDITIONS[name]
    with lib.Session(name.replace('=', '-').replace('+', '-')[:24]) as session:
        record = {'probe': 'matrix', 'condition': name, 'env': env, 'args': args, 'orca_process': orca, 'display': session.display}
        if switches.get('gsettings'):
            # the key alone, written before the launcher starts: off first (the user value over the system default),
            # read back through the launcher, then on
            session.gsettings('set', 'org.gnome.desktop.interface', 'toolkit-accessibility', 'false')
            record['status_with_key_false'] = session.status()
            session.gsettings('set', 'org.gnome.desktop.interface', 'toolkit-accessibility', 'true')
            time.sleep(0.5)
            record['gsettings_toolkit_accessibility'] = session.gsettings('get', 'org.gnome.desktop.interface', 'toolkit-accessibility')
        # As found, IsEnabled is true in any session on this VM: cua's provisioning made toolkit-accessibility a system
        # dconf default (deploy/cloud-vm/cua-provision.sh). So every condition sets both switches itself, off unless it
        # names one; the launcher writes them to the session's own dconf file, in its temporary home.
        record['status_as_found'] = session.status()
        if not switches.get('gsettings'):
            session.set_status('ScreenReaderEnabled', False)
            session.set_status('IsEnabled', False)
        for key in ('IsEnabled', 'ScreenReaderEnabled'):
            if key in switches:
                session.set_status(key, switches[key])
        record['status_at_launch'] = session.status()
        session.a11y()  # the accessibility bus is up before the app starts, as in a desktop session
        if orca:
            fake_orca(session)
            time.sleep(0.3)
        app = session.spawn(lib.fixture_argv(session, args), env, name='fixture')
        windows, ms = lib.wait_for(lambda: session.windows_of(app.pid), 20)
        record['window_ms'] = round(lib.now_ms() - app.t_spawn, 1) if windows else None
        record['wm_class'] = session.wm_class(windows[-1]) if windows else None
        entry, _ = lib.wait_for(lambda: lib.app_of(session, app.pid), 6)
        record['registered'] = bool(entry)
        record['registered_ms'] = round(lib.now_ms() - app.t_spawn, 1) if entry else None
        if entry:
            record['toolkit'] = f"{entry['toolkit']} {entry['version']}"
            record['app_name'] = entry['name']
            first = lib.walk(session, entry)
            record['read1'] = {'nodes': first['nodes'], 'failed': first['failed'], 'roles': first['roles'], 'button': lib.has_named(first, 'push button', 'Fixture button'),
                               'at_ms': round(lib.now_ms() - app.t_spawn, 1)}
            record['read1_tree'] = lib.render(first, 40)
            time.sleep(1.5)
            second = lib.walk(session, entry)
            record['read2'] = {'nodes': second['nodes'], 'button': lib.has_named(second, 'push button', 'Fixture button')}
            if not record['read2']['button']:
                record['kick'] = lib.kick(session, entry, 'GetAttributes')
                kicked_at = lib.now_ms()
                tree, _ = lib.wait_for(lambda: (lambda t: t if lib.has_named(t, 'push button', 'Fixture button') else None)(lib.walk(session, entry)), 8)
                record['kick_tree_ms'] = round(lib.now_ms() - kicked_at, 1) if tree else None
                final = tree or lib.walk(session, entry)
                record['read3'] = {'nodes': final['nodes'], 'roles': final['roles'], 'button': lib.has_named(final, 'push button', 'Fixture button')}
                record['read3_tree'] = lib.render(final, 60)
        time.sleep(0.3)
        record['fixture_accessibility_log'] = [{'ms': round(row['at'] - app.t_spawn, 1), 'enabled': row['enabled'], 'source': row['source']} for row in lib.fixture_log(session)]
        lib.emit(record, out)


if __name__ == '__main__':
    out = sys.argv[1]
    for name in (sys.argv[2:] or list(CONDITIONS)):
        try:
            run(name, out)
        except Exception as error:  # a failed condition is a row, not the end of the run
            lib.emit({'probe': 'matrix', 'condition': name, 'error': repr(error)[:300]}, out)
