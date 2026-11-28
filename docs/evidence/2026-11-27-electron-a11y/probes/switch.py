#!/usr/bin/env python3
"""#228 probe 12: what setting the session's two switches writes.

In a private session (its dconf file in its temporary home): the two GSettings keys before; after `IsEnabled` is set
on over the bus; after `ScreenReaderEnabled` is set on; after both are set off again. `IsEnabled` is
`org.gnome.desktop.interface toolkit-accessibility`, `ScreenReaderEnabled` is `org.gnome.desktop.a11y.applications
screen-reader-enabled` (at-spi-bus-launcher.c), the key a GNOME, MATE, Unity or Cinnamon session starts Orca by.

usage: switch.py <out.jsonl>
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib  # noqa: E402


def keys(session):
    return {'toolkit-accessibility': session.gsettings('get', 'org.gnome.desktop.interface', 'toolkit-accessibility'),
            'screen-reader-enabled': session.gsettings('get', 'org.gnome.desktop.a11y.applications', 'screen-reader-enabled')}


if __name__ == '__main__':
    out = sys.argv[1]
    with lib.Session('switch') as session:
        session.set_status('ScreenReaderEnabled', False)
        session.set_status('IsEnabled', False)
        time.sleep(0.5)
        lib.emit({'probe': 'switch', 'step': 'both set off', 'status': session.status(), 'gsettings': keys(session)}, out)
        session.set_status('IsEnabled', True)
        time.sleep(0.5)
        lib.emit({'probe': 'switch', 'step': 'IsEnabled set on', 'status': session.status(), 'gsettings': keys(session)}, out)
        session.set_status('IsEnabled', False)
        session.set_status('ScreenReaderEnabled', True)
        time.sleep(0.5)
        lib.emit({'probe': 'switch', 'step': 'IsEnabled set off, then ScreenReaderEnabled set on', 'status': session.status(), 'gsettings': keys(session)}, out)
        session.set_status('ScreenReaderEnabled', False)
        time.sleep(0.5)
        lib.emit({'probe': 'switch', 'step': 'ScreenReaderEnabled set off', 'status': session.status(), 'gsettings': keys(session)}, out)
        dconf = os.path.join(session.root, 'home', '.config', 'dconf', 'user')
        lib.emit({'probe': 'switch', 'step': 'where it was written', 'session_dconf_file_exists': os.path.exists(dconf), 'path': dconf.replace(session.root, '<session>')}, out)
