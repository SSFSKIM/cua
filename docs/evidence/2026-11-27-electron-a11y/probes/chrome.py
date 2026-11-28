#!/usr/bin/env python3
"""#228 probe 8: why Chrome shows a tree without the flag, on an instance of the run's own.

One Google Chrome of the run's: the installed binary (/opt/google/chrome/chrome, not the provisioning wrapper on PATH,
which adds --force-renderer-accessibility), a profile created inside the session's temporary directory
(--user-data-dir), the session's temporary home, the private display and session bus, and a network namespace with
nothing but loopback. No signal is ever sent to it: the probe asks its window to close with Ctrl+Shift+W, then the
session's display stops and Chrome ends with it. The last row says whether any process of it was left.

Rows: the tree with IsEnabled on and no flag (nodes, the roles, whether a `document web` has children), then after one
Accessible.GetAttributes on the application root.

usage: chrome.py <out.jsonl>
"""
import os
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib  # noqa: E402
from apps import child_types, documents, maps_bridge, visible_windows  # noqa: E402

CHROME = '/opt/google/chrome/chrome'


def main(out):
    session = lib.Session('chrome')
    session.start()
    root = session.root
    row = {'probe': 'chrome'}
    try:
        session.set_status('ScreenReaderEnabled', False)
        session.set_status('IsEnabled', True)
        session.a11y()
        profile = os.path.join(root, 'chrome-profile')
        os.makedirs(profile, mode=0o700)
        page = 'file://' + os.path.join(lib.PROBE_APP, 'index.html')
        argv = ['unshare', '--user', '--net', f'--map-user={os.getuid()}', f'--map-group={os.getgid()}', '--',
                CHROME, f'--user-data-dir={profile}', '--no-first-run', '--no-default-browser-check', '--disable-search-engine-choice-screen',
                '--password-store=basic', '--new-window', page]
        row['argv'] = [a.replace(root, '<session>') for a in argv]
        row['version'] = subprocess.run([CHROME, '--version'], capture_output=True, text=True, env=session.env()).stdout.strip()
        chrome = session.spawn(argv, name='chrome')
        chrome.no_signal = True
        found, _ = lib.wait_for(lambda: visible_windows(session), 60, step=0.25)
        if not found:
            row['error'] = 'no window in 60 s'
            row['log_tail'] = open(chrome.logfile, errors='replace').read()[-500:]
            lib.emit(row, out)
            return
        time.sleep(4)
        window, pid = (visible_windows(session) or found)[-1]
        row['window'] = session.wm_class(window)
        entry, _ = lib.wait_for(lambda: lib.app_of(session, pid), 8)
        row['registered'] = bool(entry)
        if entry:
            row['toolkit'] = f"{entry['toolkit']} {entry['version']}"
            row['app_name'] = entry['name']
            before = lib.walk(session, entry)
            row['before'] = {'nodes': before['nodes'], 'documents_with_children': documents(before), 'web_documents': before['web_documents'],
                             'roles_top': sorted(before['roles'].items(), key=lambda kv: -kv[1])[:10]}
            row['before_tree'] = lib.render(before, 45)
            row['page_button_before'] = lib.has_named(before, 'push button', 'Probe button')
            row['kick'] = lib.kick(session, entry)
            kicked = lib.now_ms()
            tree, _ = lib.wait_for(lambda: (lambda t: t if lib.has_named(t, 'push button', 'Probe button') else None)(lib.walk(session, entry)), 20, step=0.1)
            row['page_button_ms'] = round(lib.now_ms() - kicked, 1) if tree else None
            after = tree or lib.walk(session, entry)
            row['after'] = {'nodes': after['nodes'], 'documents_with_children': documents(after)}
        row['children'] = child_types(pid)
        row['bridge_library_mapped'] = maps_bridge(pid)
        # ask the window to close; no signal
        subprocess.run(['xdotool', 'windowactivate', '--sync', str(window)], env=session.env(), capture_output=True, timeout=10)
        subprocess.run(['xdotool', 'key', 'ctrl+shift+w'], env=session.env(), capture_output=True, timeout=10)
        gone, ms = lib.wait_for(lambda: chrome.poll() is not None, 10)
        row['closed_by_shortcut'] = bool(gone)
    finally:
        session.stop(keep=True)  # the display goes; Chrome, if still up, ends with it
        left, _ = lib.wait_for(lambda: not [p for p in lib.leftovers(root) if lib.is_chrome(p)], 15)
        row['chrome_processes_left'] = len([p for p in lib.leftovers(root) if lib.is_chrome(p)])
        lib.emit(row, out)
        if row['chrome_processes_left'] == 0:
            import shutil
            shutil.rmtree(root, ignore_errors=True)


if __name__ == '__main__':
    main(sys.argv[1])
