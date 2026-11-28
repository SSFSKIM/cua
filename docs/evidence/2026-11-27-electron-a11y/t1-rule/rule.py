#!/usr/bin/env python3
"""#228 task 1 (session task 179): the live tests of the engine's rule, the pre-flight's §G 5 to 8.

Each scenario runs in its own `lib.Session` (the pre-flight's probes, `../probes/lib.py`: a private Xvfb display, a
session bus and an accessibility bus of its own, a temporary home), with `IsEnabled` on and `ScreenReaderEnabled`
off. Third-party applications (gedit, kate, qtcreator, Chrome) run in a network namespace with loopback only.

The bus is watched by a `dbus-monitor --monitor` of the run's own with no filter: every method call, from every
sender, with its string arguments. Each observation is bracketed by two markers, a `GetAttributes` the probe sends
from its own connection to the registry's desktop object (not an application, so nothing turns on): a read's calls
are the monitor's messages between its two markers, and the second marker's arrival proves the monitor has seen
everything routed before it. The markers are the probe's own and are never counted. A request is counted from any
other sender; the engine's own calls are those of the connections that said `Hello` after it started.

  fixture-bare     §G 5, and the rule's positive case: the Electron fixture with no flag. Two screenshots
                   (`tree_wanted: false`), then three state reads.
  fixture-flag     §G 6: the fixture started with --force-renderer-accessibility. Two state reads.
  others           §G 7: gedit, the harness's GTK 4 scene, kate, qtcreator and a bare GTK 3 frame. Two state reads of
                   each by main's engine (MAIN), by the candidate (ENGINE), and by main's again (its steadiness).
  chrome-tabbed    §G 8: a Chrome of the run's own (no flag), its tabbed window observed first, then its pop-up.
  chrome-popup     §G 8: the same, the pop-up observed first.

Every scenario's row carries `checks` (each expectation, true or false) and `passed`; the run exits 1 when any
scenario did not pass or failed to run.

usage: rule.py <out.jsonl> [scenario ...]      (ENGINE: the candidate; MAIN: a build of main, for `others`)
"""
import json
import os
import re
import subprocess
import sys
import threading
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'probes'))
import lib  # noqa: E402
from gi.repository import GLib  # noqa: E402

ENGINE = os.environ['ENGINE']
MAIN = os.environ.get('MAIN')
FLAG = '--force-renderer-accessibility'
CHROME = '/opt/google/chrome/chrome'
PAGES = os.path.join(lib.REPO, 'scripts', 'linux-engine-diff', 'pages')
NO_NETWORK = ['unshare', '--user', '--net', f'--map-user={os.getuid()}', f'--map-group={os.getgid()}', '--']
REQUESTS = ('GetAttributes', 'GetRelationSet')
HEADER = re.compile(r'^(method call|method return|error|signal) ')
STRING = re.compile(r'^\s+string "(.*)"$')


class Monitor:
    """Every message on the accessibility bus, in the order the bus routed them."""

    def __init__(self, session):
        address = lib.call(session.bus(), 'org.a11y.Bus', '/org/a11y/bus', 'org.a11y.Bus', 'GetAddress', None, '(s)').unpack()[0]
        self.proc = subprocess.Popen(['dbus-monitor', '--address', address, '--monitor'], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                     text=True, start_new_session=True, env=session.env())
        self.messages = []
        self.own_marks = []  # the indexes of the probe's own markers
        self.hellos = []  # (index, sender) of every Hello but the probe's
        self.lock = threading.Lock()
        self.session = session
        self.own = session.a11y().get_unique_name()
        self.markers = 0
        threading.Thread(target=self._read, daemon=True).start()
        # dbus-monitor prints its own NameLost once it has become a monitor; the first marker then proves it sees calls
        up, _ = lib.wait_for(lambda: any(m['member'] == 'NameLost' for m in list(self.messages)), 10)
        if not up:
            raise RuntimeError('dbus-monitor did not become a monitor within 10 s')
        self.mark()

    def _read(self):
        for line in self.proc.stdout:
            header = HEADER.match(line)
            with self.lock:
                if header:
                    fields = dict(part.split('=', 1) for part in line[header.end():].replace(';', ' ').split() if '=' in part)
                    message = {'type': header.group(1), 'sender': fields.get('sender'), 'destination': fields.get('destination'),
                               'path': fields.get('path'), 'interface': fields.get('interface'), 'member': fields.get('member'), 'args': []}
                    if message['type'] == 'method call':
                        if message['sender'] == self.own and message['member'] == 'GetAttributes':
                            self.own_marks.append(len(self.messages))
                        elif message['member'] == 'Hello' and message['sender'] != self.own:
                            self.hellos.append((len(self.messages), message['sender']))
                    self.messages.append(message)
                elif self.messages and (arg := STRING.match(line.rstrip('\n'))):
                    self.messages[-1]['args'].append(arg.group(1))

    def mark(self, timeout=10):
        """Sends one marker and returns the index of its message once the monitor has it: everything the bus routed
        before it is in `messages` below that index."""
        self.markers += 1
        want = self.markers
        try:
            lib.call(self.session.a11y(), 'org.a11y.atspi.Registry', '/org/a11y/atspi/accessible/root', lib.ACC, 'GetAttributes', None, None, 3000)
        except GLib.Error:
            pass  # the call is the marker, whatever its reply
        deadline = time.time() + timeout
        while time.time() < deadline:
            with self.lock:
                if len(self.own_marks) >= want:
                    return self.own_marks[want - 1]
            time.sleep(0.02)
        raise RuntimeError(f'the monitor did not see marker {want} within {timeout} s')

    def between(self, start, end):
        with self.lock:
            return [m for m in self.messages[start + 1:end] if m['type'] == 'method call' and m['sender'] != self.own]

    def hellos_since(self, start):
        with self.lock:
            return {sender for index, sender in self.hellos if index > start}

    def stop(self):
        lib.Session.stop_group(self.proc, grace=2)


class Engine:
    def __init__(self, session, monitor, binary):
        self.monitor = monitor
        self.started_at = monitor.mark()
        self.proc = subprocess.Popen([binary, 'server', '--desktop', 'dedicated', '--stats'], env=session.env(), stdin=subprocess.PIPE,
                                     stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True, text=True)
        self.next = 0
        self.version = subprocess.run([binary, '--version'], capture_output=True, text=True).stdout.strip()

    def ask(self, command, payload):
        self.next += 1
        self.proc.stdin.write(json.dumps({'id': self.next, 'command': command, 'input': payload}) + '\n')
        self.proc.stdin.flush()
        answer = json.loads(self.proc.stdout.readline())
        stats = json.loads(self.proc.stderr.readline()).get('stats', {})
        return answer, stats

    def connections(self):
        return self.monitor.hellos_since(self.started_at)

    def stop(self):
        lib.Session.stop_group(self.proc, grace=2)


def count(node):
    return 1 + sum(count(child) for child in node.get('children', []))


def has(node, role, name):
    return (node.get('role') == role and node.get('name') == name) or any(has(c, role, name) for c in node.get('children', []))


def is_toolkit_read(m):
    return m['member'] == 'Get' and m['interface'] == 'org.freedesktop.DBus.Properties' and m['args'][1:2] == ['ToolkitName']


def observe(engine, window, tree_wanted=True, screenshot=False):
    """One get_window_state between two markers: its answer, and every call the bus routed meanwhile."""
    monitor = engine.monitor
    start = monitor.mark()
    payload = {'window': window, 'include_screenshot': screenshot}
    if not tree_wanted:
        payload['tree_wanted'] = False
    answer, stats = engine.ask('get_window_state', payload)
    end = monitor.mark()
    calls = monitor.between(start, end)
    mine = engine.connections()
    by_member = {}
    for m in calls:
        if m['sender'] in mine:
            key = f"{m['interface']}.{m['member']}"
            by_member[key] = by_member.get(key, 0) + 1
    output = answer.get('output') or {}
    tree = output.get('ax_tree') or {}
    return {'ok': answer.get('ok') is True, 'error': answer.get('error'), 'tree_wanted': tree_wanted, 'screenshot': screenshot,
            'source': output.get('ax_tree_source'), 'nodes': count(tree) if tree else None,
            'screenshots': len(output.get('screenshots') or []), 'truncated': output.get('truncated'), 'ask': stats.get('ask'),
            'seen': {'GetAttributes': sum(1 for m in calls if m['member'] == 'GetAttributes'),
                     'GetRelationSet': sum(1 for m in calls if m['member'] == 'GetRelationSet'),
                     'ToolkitName': sum(1 for m in calls if is_toolkit_read(m))},
            'requests': [{k: m[k] for k in ('sender', 'destination', 'path', 'member')} for m in calls if m['member'] in REQUESTS],
            'engine_calls': sum(by_member.values()), 'engine_by_member': by_member, 'stats_by_member': (stats.get('bus') or {}).get('by_member'),
            'tree': tree}


def strip(read):
    read = dict(read)
    read.pop('tree', None)
    return read


def listed(engine, match):
    answer, _ = engine.ask('list_windows', {})
    return [w for w in answer.get('output') or [] if match(w)]


def window_of(engine, match, timeout=30):
    found, _ = lib.wait_for(lambda: listed(engine, match), timeout, step=0.25)
    return found[0] if found else None


def start_session(label):
    session = lib.Session(label)
    session.start()
    session.set_status('ScreenReaderEnabled', False)
    session.set_status('IsEnabled', True)
    session.a11y()
    return session


def finish(row, checks, out):
    row['checks'] = checks
    row['passed'] = bool(checks) and all(checks.values())
    lib.emit(row, out)
    return row['passed']


def fixture_bare(out):
    session = start_session('t179-bare')
    app = session.spawn(lib.fixture_argv(session), name='fixture')
    row = {'scenario': 'fixture-bare', 'test': '§G 5 and the positive case', 'status': session.status()}
    checks = {}
    try:
        checks['fixture_window_shown'] = bool(lib.wait_for(lambda: session.windows_of(app.pid), 30)[0])
        entry, _ = lib.wait_for(lambda: lib.app_of(session, app.pid), 15)
        checks['fixture_on_the_bus'] = bool(entry)
        time.sleep(2)
        monitor = Monitor(session)
        engine = Engine(session, monitor, ENGINE)
        row['engine'] = engine.version
        try:
            window = window_of(engine, lambda w: w.get('title') == 'cua Electron fixture')
            checks['fixture_listed'] = bool(window)
            row['window'] = window and {k: window.get(k) for k in ('id', 'app', 'title')}
            row['xprop'] = session.wm_class(window['id']) if window else None
            log_before = lib.fixture_log(session)
            shots = [observe(engine, window, tree_wanted=False, screenshot=True) for _ in range(2)]
            walked = lib.walk(session, entry) if entry else None
            log_after = lib.fixture_log(session)
            row['screenshots'] = [strip(r) for r in shots]
            row['after_screenshots'] = {'walk_nodes': walked and walked['nodes'], 'log_before': log_before, 'log_after': log_after}
            reads = []
            for pause in (0, 1.5, 0):
                time.sleep(pause)
                read = observe(engine, window)
                read['fixture_button'] = has(read['tree'], 'push button', 'Fixture button')
                reads.append(strip(read))
            row['reads'] = reads
            checks.update({
                'screenshots_answered_with_a_picture': all(r['ok'] and r['screenshots'] == 1 for r in shots),
                'screenshots_bare': all(r['source'] == 'at_spi' and r['nodes'] == 1 for r in shots),
                'screenshot_sent_no_GetAttributes': all(r['seen']['GetAttributes'] == 0 for r in shots),
                'screenshot_read_no_ToolkitName': all(r['seen']['ToolkitName'] == 0 for r in shots),
                'fixture_log_unchanged_by_screenshots': bool(log_before) and log_after == log_before,
                'mode_unchanged_after_screenshots': walked is not None and walked['nodes'] <= 2,
                'reads_answered': all(r['ok'] for r in reads),
                'first_read_bare': reads[0]['nodes'] == 1,
                'first_read_sent_one_GetAttributes_from_the_engine': reads[0]['seen']['GetAttributes'] == 1
                and all(q['sender'] in engine.connections() for q in reads[0]['requests']),
                'first_read_one_ToolkitName': reads[0]['seen']['ToolkitName'] == 1,
                'second_read_has_the_button': reads[1]['fixture_button'],
                'no_GetAttributes_after_the_first': all(r['seen']['GetAttributes'] == 0 for r in reads[1:]),
                'GetRelationSet_never': all(r['seen']['GetRelationSet'] == 0 for r in shots + reads),
            })
        finally:
            engine.stop()
            monitor.stop()
    finally:
        session.stop()
    return finish(row, checks, out)


def fixture_flag(out):
    session = start_session('t179-flag')
    app = session.spawn(lib.fixture_argv(session, (FLAG,)), name='fixture')
    row = {'scenario': 'fixture-flag', 'test': '§G 6', 'status': session.status()}
    checks = {}
    try:
        checks['fixture_window_shown'] = bool(lib.wait_for(lambda: session.windows_of(app.pid), 30)[0])
        checks['fixture_on_the_bus'] = bool(lib.wait_for(lambda: lib.app_of(session, app.pid), 15)[0])
        time.sleep(2)
        monitor = Monitor(session)
        engine = Engine(session, monitor, ENGINE)
        row['engine'] = engine.version
        try:
            window = window_of(engine, lambda w: w.get('title') == 'cua Electron fixture')
            checks['fixture_listed'] = bool(window)
            row['window'] = window and {k: window.get(k) for k in ('id', 'app', 'title')}
            reads = []
            for _ in range(2):
                read = observe(engine, window)
                read['fixture_button'] = has(read['tree'], 'push button', 'Fixture button')
                reads.append(strip(read))
                time.sleep(0.5)
            row['reads'] = reads
            checks.update({
                'reads_answered': all(r['ok'] for r in reads),
                'tree_had_content': all(r['nodes'] and r['nodes'] > 2 and r['fixture_button'] for r in reads),
                'no_GetAttributes': all(r['seen']['GetAttributes'] == 0 for r in reads),
                'no_GetRelationSet': all(r['seen']['GetRelationSet'] == 0 for r in reads),
                'no_ToolkitName_read': all(r['seen']['ToolkitName'] == 0 for r in reads),
                'no_ask_record': all(r['ask'] is None for r in reads),
            })
        finally:
            engine.stop()
            monitor.stop()
    finally:
        session.stop()
    return finish(row, checks, out)


def others(out):
    session = start_session('t179-others')
    row = {'scenario': 'others', 'test': '§G 7', 'status': session.status(), 'apps': {}}
    checks = {}
    try:
        scratch = os.path.join(session.root, 'scratch')
        os.makedirs(scratch)
        apps = []
        for name, argv, third_party in (
            ('gedit', ['gedit', '--standalone'], True),
            ('gtk4', ['python3', '-I', os.path.join(PAGES, 'gtk4-input.py')], False),
            ('kate', ['kate', '-n', '-b'], True),
            ('qtcreator', ['qtcreator', '-settingspath', os.path.join(session.root, 'qtcreator')], True),
            ('bare-gtk3', ['python3', '-I', os.path.join(HERE, 'bare-gtk3.py')], False),
        ):
            title = f't179-{name}'
            if third_party:
                path = os.path.join(scratch, f'{title}.txt')
                with open(path, 'w') as f:
                    f.write(f'{name} scene for task 179\n')
                argv = [*NO_NETWORK, *argv, path]
            else:
                argv = [*argv, title]
            row['apps'][name] = {'argv': [a.replace(session.root, '<session>') for a in argv]}
            apps.append((name, title, session.spawn(argv, name=name)))
        time.sleep(12)  # qtcreator takes the longest to register
        monitor = Monitor(session)
        try:
            for label, binary in (('main', MAIN), ('candidate', ENGINE), ('main-again', MAIN)):
                engine = Engine(session, monitor, binary)
                try:
                    for name, title, _ in apps:
                        entry = row['apps'][name]
                        window = window_of(engine, lambda w, t=title: t in (w.get('title') or ''), timeout=20)
                        entry.setdefault('window', window and {k: window.get(k) for k in ('id', 'app', 'title')})
                        if not window:
                            entry[label] = {'engine': engine.version, 'error': 'not listed'}
                            continue
                        entry.setdefault('xprop', session.wm_class(window['id']))
                        entry[label] = {'engine': engine.version, 'reads': [strip(observe(engine, window)) for _ in range(2)]}
                finally:
                    engine.stop()
        finally:
            monitor.stop()
        for name, entry in row['apps'].items():
            main, cand, again = (entry.get(k, {}).get('reads') for k in ('main', 'candidate', 'main-again'))
            if not (main and cand and again):
                checks[f'{name}_read_by_all_three'] = False
                continue
            diff = [{m: c['engine_by_member'].get(m, 0) - b['engine_by_member'].get(m, 0)
                     for m in sorted(set(b['engine_by_member']) | set(c['engine_by_member']))
                     if c['engine_by_member'].get(m, 0) != b['engine_by_member'].get(m, 0)} for b, c in zip(main, cand)]
            entry['candidate_minus_main'] = diff
            reads = main + cand + again
            checks[f'{name}_answered'] = all(r['ok'] and r['source'] == 'at_spi' for r in reads)
            checks[f'{name}_engine_calls_seen'] = all(r['engine_calls'] > 0 for r in reads)
            checks[f'{name}_main_steady'] = [r['engine_by_member'] for r in main] == [r['engine_by_member'] for r in again]
            checks[f'{name}_no_GetAttributes'] = all(r['seen']['GetAttributes'] == 0 and r['seen']['GetRelationSet'] == 0 for r in reads)
            if name == 'bare-gtk3':
                checks['bare-gtk3_is_bare'] = all(r['nodes'] == 1 for r in reads)
                checks['bare-gtk3_one_ToolkitName_read_more_than_main'] = diff == [{'org.freedesktop.DBus.Properties.Get': 1}, {}] \
                    and [r['seen']['ToolkitName'] for r in cand] == [r['seen']['ToolkitName'] + d for r, d in zip(main, (1, 0))]
            else:
                checks[f'{name}_has_a_tree'] = all(r['nodes'] and r['nodes'] > 1 for r in reads)
                checks[f'{name}_same_calls_as_main'] = diff == [{}, {}]
    except Exception as error:
        row['error'] = repr(error)[:400]
        checks['ran'] = False
    finally:
        session.stop()
    return finish(row, checks, out)


PAGE = """<!doctype html><title>{title}</title><body><h1>{title}</h1><button>Chrome page button</button>{script}</body>"""


def chrome(out, first):
    session = start_session(f't179-chrome-{first}')
    root = session.root
    row = {'scenario': f'chrome-{first}', 'test': '§G 8', 'first': first, 'status': session.status()}
    checks = {}
    try:
        pages = os.path.join(root, 'pages')
        os.makedirs(pages)
        with open(os.path.join(pages, 'popup.html'), 'w') as f:
            f.write(PAGE.format(title='t179 Chrome pop-up', script=''))
        with open(os.path.join(pages, 'tabbed.html'), 'w') as f:
            f.write(PAGE.format(title='t179 Chrome tabbed', script="<script>window.open('popup.html', 't179', 'popup,width=480,height=360')</script>"))
        profile = os.path.join(root, 'chrome-profile')
        os.makedirs(profile, mode=0o700)
        argv = [*NO_NETWORK, CHROME, f'--user-data-dir={profile}', '--no-first-run', '--no-default-browser-check',
                '--disable-search-engine-choice-screen', '--password-store=basic', '--disable-popup-blocking', '--new-window',
                'file://' + os.path.join(pages, 'tabbed.html')]
        row['argv'] = [a.replace(root, '<session>') for a in argv]
        row['version'] = subprocess.run([CHROME, '--version'], capture_output=True, text=True, env=session.env()).stdout.strip()
        proc = session.spawn(argv, name='chrome')
        proc.no_signal = True
        monitor = Monitor(session)
        engine = Engine(session, monitor, ENGINE)
        row['engine'] = engine.version
        try:
            titled = lambda t: (lambda w: (w.get('title') or '').startswith(t))  # noqa: E731
            tabbed = window_of(engine, titled('t179 Chrome tabbed'), timeout=60)
            popup = window_of(engine, titled('t179 Chrome pop-up'), timeout=30)
            row['windows'] = {name: w and {k: w.get(k) for k in ('id', 'app', 'title')} for name, w in (('tabbed', tabbed), ('popup', popup))}
            checks['both_windows_shown'] = bool(tabbed and popup)
            if tabbed and popup:
                row['xprop'] = {'tabbed': session.wm_class(tabbed['id']), 'popup': session.wm_class(popup['id'])}
                checks['roles_are_chromes'] = 'WM_WINDOW_ROLE(STRING) = "browser"' in row['xprop']['tabbed'] \
                    and 'WM_WINDOW_ROLE(STRING) = "pop-up"' in row['xprop']['popup']
                time.sleep(3)
                order = [('tabbed', tabbed), ('popup', popup)] if first == 'tabbed' else [('popup', popup), ('tabbed', tabbed)]
                reads = []
                for name, window in order + order:
                    read = strip(observe(engine, window))
                    read['window'] = name
                    reads.append(read)
                row['reads'] = reads
                checks.update({
                    'reads_answered': all(r['ok'] and r['source'] == 'at_spi' for r in reads),
                    'frames_bare': all(r['nodes'] == 1 for r in reads),
                    'first_observed_is_first': reads[0]['window'] == first,
                    'no_GetAttributes': all(r['seen']['GetAttributes'] == 0 for r in reads),
                    'no_GetRelationSet': all(r['seen']['GetRelationSet'] == 0 for r in reads),
                    'one_ToolkitName_read_in_all': sum(r['seen']['ToolkitName'] for r in reads) == 1,
                    'left_at_the_role': all((r['ask'] or {}).get('left') == 'role' for r in reads),
                })
        finally:
            engine.stop()
            monitor.stop()
    finally:
        session.stop(keep=True)  # the display goes; the run's Chrome ends with it, unsignalled
        lib.wait_for(lambda: not [p for p in lib.leftovers(root) if lib.is_chrome(p)], 20)
        row['chrome_processes_left'] = len([p for p in lib.leftovers(root) if lib.is_chrome(p)])
        checks['no_chrome_process_left'] = row['chrome_processes_left'] == 0
        if row['chrome_processes_left'] == 0:
            import shutil
            shutil.rmtree(root, ignore_errors=True)
    return finish(row, checks, out)


SCENARIOS = {
    'fixture-bare': fixture_bare,
    'fixture-flag': fixture_flag,
    'others': others,
    'chrome-tabbed': lambda out: chrome(out, 'tabbed'),
    'chrome-popup': lambda out: chrome(out, 'popup'),
}

if __name__ == '__main__':
    out = sys.argv[1]
    failed = []
    for name in sys.argv[2:] or SCENARIOS:
        try:
            passed = SCENARIOS[name](out)
        except Exception as error:
            lib.emit({'scenario': name, 'error': repr(error)[:400], 'passed': False}, out)
            passed = False
        if not passed:
            failed.append(name)
    print(json.dumps({'failed': failed}), flush=True)
    sys.exit(1 if failed else 0)
