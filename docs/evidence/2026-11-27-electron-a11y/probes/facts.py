#!/usr/bin/env python3
"""#228 probe 13: facts read from files on this host and in the unpacked packages (no display, no application run).

  variables    which libraries and executables hold the names of Chromium's three variables (and LibreOffice's own)
  bridge       which Chromium-family binaries link libatk-bridge-2.0, the library its AT-SPI bridge is
  session      the Xsession script that exports QT_ACCESSIBILITY, and the package that owns it
  wrapper      what `google-chrome` on this VM's PATH is
  entries      the samples' desktop entries: whether any is DBusActivatable, whether any names Electron
  engine       whether cua's engine source calls either of the two requests
  dconf        the time of the person's dconf file (never opened: its metadata only), after every probe

usage: facts.py <out.jsonl> <apps root>
"""
import glob
import mmap
import os
import re
import shutil
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib  # noqa: E402

NAMES = [b'ACCESSIBILITY_ENABLED', b'GNOME_ACCESSIBILITY', b'QT_ACCESSIBILITY', b'SAL_ACCESSIBILITY_ENABLED']


def counts(path):
    """How often each name occurs in a file; ACCESSIBILITY_ENABLED is counted where it is not part of SAL_..."""
    try:
        with open(path, 'rb') as f, mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ) as m:
            out = {}
            for name in NAMES:
                out[name.decode()] = len(re.findall(re.escape(name), m))
            out['ACCESSIBILITY_ENABLED'] -= out['SAL_ACCESSIBILITY_ENABLED']
            return out
    except (OSError, ValueError):
        return None


def links(path):
    done = subprocess.run(['ldd', path], capture_output=True, text=True, timeout=30)
    return sorted({line.split()[0] for line in done.stdout.split('\n') if 'atk' in line or 'atspi' in line})


def main():
    out, apps = sys.argv[1], sys.argv[2]
    cef = glob.glob(os.path.join(apps, 'cef152', '*', 'Release', 'libcef.so'))
    nw = glob.glob(os.path.join(apps, 'nwjs', '*', 'lib', 'libnw.so'))
    files = {
        'GTK 3': '/usr/lib/x86_64-linux-gnu/libgtk-3.so.0', 'GTK 4': '/usr/lib/x86_64-linux-gnu/libgtk-4.so.1',
        'Qt 5 Gui': '/usr/lib/x86_64-linux-gnu/libQt5Gui.so.5', 'Qt 6 Gui': '/usr/lib/x86_64-linux-gnu/libQt6Gui.so.6',
        'Qt 5 Core': '/usr/lib/x86_64-linux-gnu/libQt5Core.so.5', 'Qt 6 Core': '/usr/lib/x86_64-linux-gnu/libQt6Core.so.6',
        'ATK': '/usr/lib/x86_64-linux-gnu/libatk-1.0.so.0', 'the ATK bridge': '/usr/lib/x86_64-linux-gnu/libatk-bridge-2.0.so.0',
        'libatspi': '/usr/lib/x86_64-linux-gnu/libatspi.so.0', 'LibreOffice': '/usr/lib/libreoffice/program/libmergedlo.so',
        'Firefox (snap) libxul': '/snap/firefox/current/usr/lib/firefox/libxul.so', 'Google Chrome': '/opt/google/chrome/chrome',
        'Electron 44.9.0': lib.ELECTRON, 'CEF 152 libcef': cef[0] if cef else '', 'NW.js 0.120 libnw': nw[0] if nw else '',
    }
    for label, path in files.items():
        lib.emit({'probe': 'facts', 'part': 'variables', 'what': label, 'file': path.replace(apps, '<apps>'), 'occurrences': counts(os.path.realpath(path)) if path else None}, out)
    for label in ('Google Chrome', 'Electron 44.9.0', 'CEF 152 libcef', 'NW.js 0.120 libnw'):
        lib.emit({'probe': 'facts', 'part': 'bridge', 'what': label, 'links': links(files[label])}, out)
    script = '/etc/X11/Xsession.d/90qt-a11y'
    owner = subprocess.run(['dpkg', '-S', script], capture_output=True, text=True).stdout.strip()
    lib.emit({'probe': 'facts', 'part': 'session', 'file': script, 'owner': owner,
              'lines': [line.strip() for line in open(script) if line.strip() and not line.startswith('#')]}, out)
    wrapper = shutil.which('google-chrome')
    lib.emit({'probe': 'facts', 'part': 'wrapper', 'google_chrome_on_path': wrapper, 'content': open(wrapper).read().strip().split('\n') if wrapper else None}, out)
    entries = sorted(glob.glob(os.path.join(apps, '*', 'usr', 'share', 'applications', '*.desktop')))
    texts = {os.path.relpath(e, apps): open(e, errors='replace').read() for e in entries}
    lib.emit({'probe': 'facts', 'part': 'entries', 'entries': len(texts), 'samples': len({name.split('/')[0] for name in texts}),
              'dbus_activatable': [name for name, text in texts.items() if re.search(r'^DBusActivatable\s*=\s*true', text, re.M)],
              'name_electron': [name for name, text in texts.items() if 'electron' in text.lower()]}, out)
    source = os.path.join(lib.REPO, 'native', 'linux-engine', 'src')
    calls = []
    for folder, _, names in os.walk(source):
        for name in names:
            if name.endswith('.rs'):
                for number, line in enumerate(open(os.path.join(folder, name), errors='replace'), 1):
                    if ('GetAttributes' in line or 'GetRelationSet' in line) and not line.strip().startswith('//'):
                        calls.append(f'{os.path.relpath(os.path.join(folder, name), lib.REPO)}:{number}')
    lib.emit({'probe': 'facts', 'part': 'engine', 'source': 'native/linux-engine/src', 'lines_naming_either_request_outside_comments': calls}, out)
    dconf = os.path.expanduser('~/.config/dconf/user')
    lib.emit({'probe': 'facts', 'part': 'dconf', 'person_dconf_file_mtime': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(os.stat(dconf).st_mtime)),
              'read_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}, out)


if __name__ == '__main__':
    main()
