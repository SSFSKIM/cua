#!/usr/bin/env python3
"""#228 probe 5: real applications that embed Chromium, each started once on a private session with IsEnabled on.

The applications are their vendors' packages unpacked in the scratch (never installed), run from there with a
temporary home and profile and, by default, no network: each runs in a network namespace of its own with nothing
but loopback (unshare --user --net), so no instance of the run's reaches its vendor's servers. A row per application:

  identity      its window's WM_CLASS, _NET_WM_PID and WM_WINDOW_ROLE; the executable of that process; the `--type=`
                of its child processes; what the same file checks as detect.py's say of that executable; whether the
                process has libatk-bridge-2.0 mapped
  on the bus    whether that process registered on the accessibility bus, its ToolkitName and Version, its name
  before        a structural read: nodes, and `document web` nodes that have children
  kick          one Accessible.GetAttributes on the application root; when a `document web` with children first shows
                in a structural read; every change of the node count after it (`series`), until it has held for 2 s
  after         nodes, documents

A window with a class and no window role is a GTK dialog the app showed first; the probe presses its default button
once and takes the window that follows, or records that the app ended.

usage: apps.py <out.jsonl> <apps root> [--net] [--flag] [--variable] [name ...]
  --flag adds --force-renderer-accessibility, --variable sets ACCESSIBILITY_ENABLED=1, --net leaves the network on
"""
import glob
import json
import os
import re
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import detect  # noqa: E402
import lib  # noqa: E402

FLAG = '--force-renderer-accessibility'


def catalog(apps, session):
    data = os.path.join(session.root, 'profile')
    cef = glob.glob(os.path.join(apps, 'cef152', '*', 'Release', 'cefsimple'))
    nw = glob.glob(os.path.join(apps, 'nwjs', '*', 'nw'))
    page = 'file://' + os.path.join(lib.PROBE_APP, 'index.html')
    return {
        'code': [os.path.join(apps, 'code/usr/share/code/code'), f'--user-data-dir={data}', f"--extensions-dir={os.path.join(session.root, 'ext')}",
                 '--disable-telemetry', '--disable-updates', '--disable-workspace-trust', '--new-window'],
        'obsidian': [os.path.join(apps, 'obsidian/opt/Obsidian/obsidian'), f'--user-data-dir={data}'],
        'mattermost': [os.path.join(apps, 'mattermost/opt/Mattermost/com.Mattermost.Desktop'), f'--user-data-dir={data}'],
        'github-desktop': [os.path.join(apps, 'github-desktop/usr/lib/github-desktop/github-desktop'), f'--user-data-dir={data}'],
        'bitwarden': [os.path.join(apps, 'bitwarden/opt/Bitwarden/bitwarden'), f'--user-data-dir={data}'],
        'joplin': [os.path.join(apps, 'joplin/opt/Joplin/joplin'), f'--user-data-dir={data}'],
        'signal': [os.path.join(apps, 'signal/opt/Signal/signal-desktop'), f'--user-data-dir={data}'],
        'element': [os.path.join(apps, 'element/opt/Element/element-desktop'), f'--user-data-dir={data}'],
        # CEF's sample opens with Chromium's terms dialog, a window of Chromium's own. `cefsimple-dialog` is read as
        # it stands; `cefsimple` has the dialog accepted first (Return) and is read with its page open.
        'cefsimple-dialog': (cef or ['missing']) + [f'--url={page}', f'--user-data-dir={data}'],
        'cefsimple': (cef or ['missing']) + [f'--url={page}', f'--user-data-dir={data}'],
        'nwjs': (nw or ['missing']) + [lib.PROBE_APP + '-nw', f'--user-data-dir={data}'],
    }


def descendants(pid):
    """Every process below `pid`, by /proc's parent links: [(pid, comm, command line or None when it cannot be read)].

    Chromium rewrites a child's command line as one string, and a sandboxed child is not dumpable, so its
    /proc/<pid>/cmdline may read empty or not at all for the same user: the name (`comm`) always reads.
    """
    parents = {}
    for entry in os.listdir('/proc'):
        if entry.isdigit():
            try:
                with open(f'/proc/{entry}/stat') as f:
                    parents[int(entry)] = int(f.read().rsplit(')', 1)[1].split()[1])
            except (OSError, ValueError, IndexError):
                pass
    found, frontier = [], [pid]
    while frontier:
        parent = frontier.pop()
        for child, its_parent in parents.items():
            if its_parent == parent:
                try:
                    with open(f'/proc/{child}/comm') as f:
                        comm = f.read().strip()
                except OSError:
                    comm = None
                try:
                    with open(f'/proc/{child}/cmdline', 'rb') as f:
                        text = f.read().replace(b'\0', b' ').decode(errors='replace').strip() or None
                except OSError:
                    text = None
                found.append((child, comm, text))
                frontier.append(child)
    return found


def child_types(pid):
    """What a Chromium-family process's children say they are: {`--type=` value: count}, and how many could not be read."""
    types, unread, names = {}, 0, {}
    for _, comm, text in descendants(pid):
        names[comm] = names.get(comm, 0) + 1
        if text is None:
            unread += 1
            continue
        for kind in re.findall(r'--type=([a-z-]+)', text):
            types[kind] = types.get(kind, 0) + 1
    return {'types': types, 'unreadable': unread, 'names': names}


def maps_bridge(pid):
    """Whether the process has libatk-bridge-2.0 mapped: the library Chromium's AT-SPI bridge is (None: unreadable)."""
    try:
        with open(f'/proc/{pid}/maps') as f:
            return 'libatk-bridge-2.0' in f.read()
    except OSError:
        return None


def environment(pid):
    """What /proc/<pid>/environ still shows of a process's environment: how many variables, and the accessibility
    ones by name and value. Electron's main process reads empty here (its start rewrites that memory); NW.js's reads
    whole."""
    try:
        with open(f'/proc/{pid}/environ', 'rb') as f:
            items = [item.decode(errors='replace') for item in f.read().split(b'\0') if b'=' in item]
    except OSError:
        return {'readable': False}
    wanted = ('ACCESSIBILITY_ENABLED', 'GNOME_ACCESSIBILITY', 'QT_ACCESSIBILITY')
    return {'readable': True, 'variables': len(items), 'accessibility': [item for item in items if item.split('=', 1)[0] in wanted]}


def visible_windows(session):
    """Viewable windows on the private display that name a process other than the window manager: [(window, pid)].

    A window need not have a WM_CLASS to count: CEF's sample sets none.
    """
    done = subprocess.run(['xdotool', 'search', '--onlyvisible', '--name', '.*'], env=session.env(), capture_output=True, text=True, timeout=10)
    managers = {proc.pid for name, proc in session.procs if name == 'openbox'}
    out = []
    for line in done.stdout.split():
        if not line.isdigit():
            continue
        prop = subprocess.run(['xprop', '-id', line, '_NET_WM_PID', 'WM_CLASS'], env=session.env(), capture_output=True, text=True, timeout=10).stdout
        if '_NET_WM_PID(CARDINAL)' not in prop or 'openbox' in prop.lower():
            continue
        pid = int(prop.split('_NET_WM_PID(CARDINAL) = ')[1].split()[0])
        if pid not in managers:
            out.append((int(line), pid))
    return out


def documents(tree):
    return sum(1 for role, _, kids in tree['web_documents'] if kids > 0)


def run(name, argv, session, out, net, flag, variable=False):
    row = {'probe': 'apps', 'sample': name, 'flag': flag, 'variable': variable, 'network': net, 'argv0': argv[0].replace('/Users/new/.local/share/cua-171/t177/apps/', '')}
    session.set_status('ScreenReaderEnabled', False)
    session.set_status('IsEnabled', True)
    session.a11y()
    row['status'] = session.status()
    if flag:
        argv = argv + [FLAG]
    if not net:
        argv = ['unshare', '--user', '--net', f'--map-user={os.getuid()}', f'--map-group={os.getgid()}', '--'] + argv
    app = session.spawn(argv, {'ACCESSIBILITY_ENABLED': '1'} if variable else None, name=name)
    found, ms = lib.wait_for(lambda: visible_windows(session), 60, step=0.25)
    if not found:
        row['error'] = 'no window in 60 s'
        row['log_tail'] = open(app.logfile, errors='replace').read()[-600:]
        # what the display and the bus hold all the same: every window that names a class, mapped or not, and the
        # applications on the accessibility bus
        tree = subprocess.run(['xwininfo', '-root', '-tree'], env=session.env(), capture_output=True, text=True, timeout=10).stdout
        row['windows_unmapped_or_not'] = [line.strip()[:120] for line in tree.split('\n') if '0x' in line and '("' in line and 'penbox' not in line and 'OPENBOX' not in line][:6]
        row['registry'] = [{k: a[k] for k in ('pid', 'toolkit', 'name')} for a in lib.registry(session)]
        lib.emit(row, out)
        return
    row['window_ms'] = round(lib.now_ms() - app.t_spawn, 1)
    time.sleep(4)  # a splash window may be replaced by the main one
    found = visible_windows(session) or found
    window, pid = found[-1]
    read = lambda: subprocess.run(['xprop', '-id', str(window), 'WM_CLASS', 'WM_WINDOW_ROLE', '_NET_WM_NAME'], env=session.env(), capture_output=True, text=True, timeout=10).stdout
    props = read()
    if name == 'cefsimple' and 'Terms of Service' in props:
        row['terms_dialog_accepted'] = True
        subprocess.run(['xdotool', 'windowactivate', '--sync', str(window)], env=session.env(), capture_output=True, timeout=10)
        subprocess.run(['xdotool', 'key', 'Return'], env=session.env(), capture_output=True, timeout=10)
        time.sleep(8)
        found = visible_windows(session) or found
        window, pid = found[-1]
        props = read()
    if 'WM_WINDOW_ROLE(STRING)' not in props and 'WM_CLASS(STRING)' in props:
        # Electron gives each of its windows a role; a window with a class and no role is GTK's own dialog (a message
        # box an app shows before its main window). Its default button is pressed once, to let the app go on. (CEF's
        # sample sets neither a class nor a role on its window, and is left alone.)
        row['dialog_first'] = ' | '.join(line.strip() for line in props.strip().split('\n'))
        subprocess.run(['xdotool', 'windowactivate', '--sync', str(window)], env=session.env(), capture_output=True, timeout=10)
        subprocess.run(['xdotool', 'key', 'Return'], env=session.env(), capture_output=True, timeout=10)
        time.sleep(8)
        if app.poll() is not None or not visible_windows(session):
            row['error'] = 'the app ended when its first dialog was answered'
            row['log_tail'] = open(app.logfile, errors='replace').read()[-400:]
            lib.emit(row, out)
            return
        found = visible_windows(session)
        window, pid = found[-1]
        props = read()
    row['window'] = ' | '.join(line.strip() for line in props.strip().split('\n'))
    row['windows'] = len(found)
    try:
        exe = os.readlink(f'/proc/{pid}/exe')
    except OSError:
        exe = None
    row['exe'] = exe.replace('/Users/new/.local/share/cua-171/t177/apps/', '') if exe else None
    row['children'] = child_types(pid)
    row['bridge_library_mapped'] = maps_bridge(pid)
    row['environment'] = environment(pid)
    row['file_checks'] = detect.examine(exe) if exe and os.path.isfile(exe) else None
    entry, _ = lib.wait_for(lambda: lib.app_of(session, pid), 20)
    row['registered'] = bool(entry)
    if not entry:
        row['registry'] = [{k: a[k] for k in ('pid', 'toolkit', 'name')} for a in lib.registry(session)]
        lib.emit(row, out)
        return
    row['toolkit'] = f"{entry['toolkit']} {entry['version']}"
    row['app_name'] = entry['name']
    before = lib.walk(session, entry)
    row['before'] = {'nodes': before['nodes'], 'documents_with_children': documents(before), 'failed': before['failed']}
    if documents(before) == 0:
        row['kick'] = lib.kick(session, entry)
        kicked = lib.now_ms()
        # the node count of each structural read after the request, written when it changes: [ms since the request,
        # nodes, documents with children]; the reads go on until the count has held for 2 s, at most 25 s
        series, last, since, document_ms = [], None, time.time(), None
        deadline = time.time() + 25
        while time.time() < deadline and time.time() - since < 2.0:
            tree = lib.walk(session, entry)
            at = round(lib.now_ms() - kicked, 1)
            if document_ms is None and documents(tree):
                document_ms = at
            if tree['nodes'] != last:
                last, since = tree['nodes'], time.time()
                series.append([at, tree['nodes'], documents(tree)])
            time.sleep(0.05)
        row['document_ms'] = document_ms
        row['stable_ms'] = series[-1][0] if series else None
        row['series'] = series[:40]
    after = lib.walk(session, entry)
    names = [n for _, _, n, _ in after['rows'] if n]
    row['after'] = {'nodes': after['nodes'], 'documents_with_children': documents(after), 'failed': after['failed'],
                    'roles_top': sorted(after['roles'].items(), key=lambda kv: -kv[1])[:8]}
    row['sample_names'] = [n[:40] for n in names[:14]]
    lib.emit(row, out)


def main():
    out, apps = sys.argv[1], sys.argv[2]
    args = sys.argv[3:]
    net, flag, variable = '--net' in args, '--flag' in args, '--variable' in args
    wanted = [a for a in args if not a.startswith('--')]
    names = wanted or ['code', 'obsidian', 'mattermost', 'github-desktop', 'bitwarden', 'joplin', 'signal', 'element', 'cefsimple-dialog', 'cefsimple', 'nwjs']
    for name in names:
        try:
            with lib.Session(f'app-{name[:12]}') as session:
                table = catalog(apps, session)
                run(name, table[name], session, out, net, flag, variable)
        except Exception as error:
            lib.emit({'probe': 'apps', 'sample': name, 'flag': flag, 'error': repr(error)[:300]}, out)


if __name__ == '__main__':
    main()
