#!/usr/bin/env python3
"""#228 task 2 (session task 180): what a Chromium window's tree shows as its content arrives after the request.

Each sample runs in its own `lib.Session` (`../probes/lib.py`), `IsEnabled` on. Once the application is on the bus and
has settled for 3 s, the probe sends one `GetAttributes` to its application root (`lib.kick`) and walks the tree every
5 ms for 4 s (`lib.walk`: role name, name, children), keeping each shape that differs from the one before. It found the
wait's end (`native/linux-engine/src/wait.rs`): a window with a page shows an empty `document web` among its views at
once, and a window with no page has none.

  fixture           the Electron fixture (a page)
  basewin           an Electron BaseWindow: no web contents (`no-page/`)
  basewin-overlay   the same with its window controls drawn by Chromium
  basewin-panels    the same with no menu and no controls: panels alone (fix wave 1)
  blank             an Electron window on about:blank (`blank/`)
  cef-dialog        CEF 152's sample, its first window Chromium's terms dialog
  code              VS Code 1.148 from its package

usage: shapes.py <out.jsonl> <apps dir> [sample ...]   (apps dir: the unpacked packages, `code/` and `cef152/`)
Third-party samples run with no network (`unshare --user --net`).
"""
import glob
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'probes'))
import lib  # noqa: E402

NO_NETWORK = ['unshare', '--user', '--net', f'--map-user={os.getuid()}', f'--map-group={os.getgid()}', '--']


def argv_of(name, session, apps):
    data = os.path.join(session.root, 'profile')
    if name == 'fixture':
        return lib.fixture_argv(session)
    if name == 'code':
        return [*NO_NETWORK, os.path.join(apps, 'code/usr/share/code/code'), f'--user-data-dir={data}',
                f"--extensions-dir={os.path.join(session.root, 'ext')}", '--disable-telemetry', '--disable-updates',
                '--disable-workspace-trust', '--new-window']
    if name == 'basewin':
        return [lib.ELECTRON, os.path.join(HERE, 'no-page')]
    if name == 'basewin-overlay':
        return [lib.ELECTRON, os.path.join(HERE, 'no-page'), '--t180-overlay']
    if name == 'basewin-panels':
        return [lib.ELECTRON, os.path.join(HERE, 'no-page'), '--t180-panels']
    if name == 'blank':
        return [lib.ELECTRON, os.path.join(HERE, 'blank')]
    if name == 'cef-dialog':
        return [*NO_NETWORK, glob.glob(os.path.join(apps, 'cef152/*/Release/cefsimple'))[0], '--url=about:blank', f'--user-data-dir={data}']
    raise KeyError(name)


def sample(name, out, apps):
    session = lib.Session('t180-shapes-' + name)
    session.start()
    session.set_status('ScreenReaderEnabled', False)
    session.set_status('IsEnabled', True)
    session.a11y()
    try:
        proc = session.spawn(argv_of(name, session, apps), name=name)
        windows, _ = lib.wait_for(lambda: session.windows_of(proc.pid), 60)
        app, _ = lib.wait_for(lambda: [a for a in lib.registry(session) if a.get('toolkit') == 'Chromium'], 30)
        app = app[0] if app else None
        time.sleep(3)
        row = {'name': name, 'windows': [session.wm_class(w) for w in (windows or [])], 'app': app}
        if not app:
            lib.emit(row, out)
            return
        row['before'] = lib.render(lib.walk(session, app), 20)
        row['kick'] = lib.kick(session, app)
        started = time.time()
        shapes = []
        last = None
        while time.time() - started < 4:
            walked = lib.walk(session, app)
            signature = (walked['nodes'], tuple(r[:2] for r in walked['rows'][:80]))
            if signature != last:
                shapes.append({'ms': round((time.time() - started) * 1000, 1), 'nodes': walked['nodes'], 'tree': lib.render(walked, 80)})
                last = signature
            time.sleep(0.005)
        row['shapes'] = shapes
        lib.emit(row, out)
    finally:
        session.stop()


if __name__ == '__main__':
    out, apps = sys.argv[1], sys.argv[2]
    for name in sys.argv[3:] or ['fixture', 'basewin', 'basewin-overlay', 'blank', 'cef-dialog', 'code']:
        sample(name, out, apps)
