#!/usr/bin/env python3
"""#228 probe 10: the same two questions on older Electron builds, with the probe app.

For each build (Electron's own release archive, unpacked in the scratch):
  switch        IsEnabled on, no variable: is the app on the accessibility bus? (Chromium reads the switch from 112.)
  variable      both switches off, ACCESSIBILITY_ENABLED=1: on the bus? Then one Accessible.GetAttributes on the
                application root: does the page's button reach a structural read, how fast, and what does the app's own
                app.isAccessibilitySupportEnabled() say after it?

usage: versions.py <out.jsonl> <apps root> [version ...]
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib  # noqa: E402
from running import ProbeApp, switches_bridge_on, switches_off  # noqa: E402

VERSIONS = ['22.3.27', '32.3.0', '36.0.0', '37.0.0', '44.9.0']


def binary(apps, version):
    return lib.ELECTRON if version == '44.9.0' else os.path.join(apps, f'electron-{version}', 'electron')


def one(out, apps, version, mode):
    with lib.Session(f'ver-{version.replace(".", "-")}') as session:
        status = (switches_bridge_on if mode == 'switch' else switches_off)(session)
        lib.ELECTRON = binary(apps, version)
        app = ProbeApp(session, env={'ACCESSIBILITY_ENABLED': '1'} if mode == 'variable' else None)
        shown = app.wait_event('ready-to-show', 30)
        time.sleep(1.5)
        start = [r for r in app.log() if r['event'] == 'main-start']
        row = {'probe': 'versions', 'electron': start[0].get('electron') if start else version, 'chrome': start[0].get('chrome') if start else None,
               'mode': mode, 'status': status, 'shown': bool(shown)}
        entry = lib.app_of(session, app.pid)
        row['registered'] = bool(entry)
        if entry and mode == 'variable':
            before = lib.walk(session, entry)
            row['before'] = {'nodes': before['nodes'], 'button': lib.has_named(before, 'push button', 'Probe button')}
            row['mode_before'] = app.mode()
            row['kick'] = lib.kick(session, entry)
            kicked = lib.now_ms()
            tree, _ = lib.wait_for(lambda: (lambda t: t if lib.has_named(t, 'push button', 'Probe button') else None)(lib.walk(session, entry)), 10)
            row['tree_ms'] = round(lib.now_ms() - kicked, 1) if tree else None
            row['after_nodes'] = (tree or lib.walk(session, entry))['nodes']
            time.sleep(0.3)
            row['mode_after'] = app.mode()
        lib.emit(row, out)


if __name__ == '__main__':
    out, apps = sys.argv[1], sys.argv[2]
    default = lib.ELECTRON
    for version in (sys.argv[3:] or VERSIONS):
        for mode in ('switch', 'variable'):
            try:
                one(out, apps, version, mode)
            except Exception as error:
                lib.emit({'probe': 'versions', 'electron': version, 'mode': mode, 'error': repr(error)[:300]}, out)
            finally:
                lib.ELECTRON = default
