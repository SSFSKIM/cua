#!/usr/bin/env python3
"""#228 task 1 (session task 179): the live tests of the engine's rule, the pre-flight's §G 5 to 8.

Each scenario runs in its own `lib.Session` (the pre-flight's probes, `../probes/lib.py`: a private Xvfb display, a
session bus and an accessibility bus of its own, a temporary home), with `IsEnabled` on and `ScreenReaderEnabled`
off. A `dbus-monitor --monitor` of the run's own watches the accessibility bus for every `Accessible.GetAttributes`,
`Accessible.GetRelationSet` and `Properties.Get` of `ToolkitName`, from any sender; the probe's own sentinel call is
the one it sends itself, and is not counted. The engines are started as the service starts them (`cua-engine server
--desktop dedicated`), with `--stats`, whose line gives each request's bus calls by member and the rule's record
(`ask`).

  fixture-bare     §G 5, and the rule's positive case: the Electron fixture with no flag. Two screenshots
                   (`tree_wanted: false`), then three state reads.
  fixture-flag     §G 6: the fixture started with --force-renderer-accessibility. Two state reads.
  others           §G 7: gedit, the harness's GTK 4 scene, kate, qtcreator and a bare GTK 3 frame. Two state reads of
                   each by the base engine (BASE, the build of the branch's base) and two by the candidate (ENGINE).
  chrome-tabbed    §G 8: a Chrome of the run's own (no flag, no network), its tabbed window observed first, then its
                   pop-up.
  chrome-popup     §G 8: the same, the pop-up observed first.

usage: rule.py <out.jsonl> [scenario ...]      (ENGINE, BASE: the two engine binaries)
"""
import json
import os
import subprocess
import sys
import threading
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'probes'))
import lib  # noqa: E402
from gi.repository import GLib  # noqa: E402

ENGINE = os.environ['ENGINE']
BASE = os.environ.get('BASE')
FLAG = '--force-renderer-accessibility'
CHROME = '/opt/google/chrome/chrome'
REPO = lib.REPO
PAGES = os.path.join(REPO, 'scripts', 'linux-engine-diff', 'pages')
WATCHED = ('GetAttributes', 'GetRelationSet', 'Get')


class Monitor:
    """The accessibility bus's requests that turn a Chromium app's mode on, and the toolkit reads, from any sender."""

    def __init__(self, session):
        address = lib.call(session.bus(), 'org.a11y.Bus', '/org/a11y/bus', 'org.a11y.Bus', 'GetAddress', None, '(s)').unpack()[0]
        rules = ["type='method_call',interface='org.a11y.atspi.Accessible',member='GetAttributes'",
                 "type='method_call',interface='org.a11y.atspi.Accessible',member='GetRelationSet'",
                 "type='method_call',interface='org.freedesktop.DBus.Properties',member='Get',arg1='ToolkitName'"]
        self.proc = subprocess.Popen(['dbus-monitor', '--address', address, '--monitor', *rules], stdout=subprocess.PIPE,
                                     stderr=subprocess.DEVNULL, text=True, start_new_session=True, env=session.env())
        self.lines = []
        self.lock = threading.Lock()
        threading.Thread(target=self._read, daemon=True).start()
        self.own = session.a11y().get_unique_name()
        # the sentinel: one ToolkitName read of the probe's own, seen before anything is counted
        seen = None
        for _ in range(40):
            try:
                lib.call(session.a11y(), 'org.a11y.atspi.Registry', '/org/a11y/atspi/accessible/root', lib.PROPS, 'Get',
                         GLib.Variant('(ss)', ('org.a11y.atspi.Application', 'ToolkitName')), '(v)', 2000)
            except GLib.Error:
                pass
            seen, _ = lib.wait_for(lambda: [c for c in self.calls() if c['sender'] == self.own], 0.25)
            if seen:
                break
        if not seen:
            raise RuntimeError('the monitor saw no sentinel')

    def _read(self):
        for line in self.proc.stdout:
            with self.lock:
                self.lines.append(line)

    def calls(self):
        with self.lock:
            lines = list(self.lines)
        out = []
        for line in lines:
            if not line.startswith('method call '):
                continue
            fields = dict(part.split('=', 1) for part in line.replace(';', ' ').split() if '=' in part)
            if fields.get('member') in WATCHED:
                out.append({'member': fields['member'], 'sender': fields.get('sender'), 'destination': fields.get('destination'),
                            'path': fields.get('path')})
        return out

    def counted(self):
        """The calls of every sender but the probe's own."""
        return [c for c in self.calls() if c['sender'] != self.own]

    def stop(self):
        lib.Session.stop_group(self.proc, grace=2)


class Engine:
    def __init__(self, session, binary):
        self.binary = binary
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

    def stop(self):
        lib.Session.stop_group(self.proc, grace=2)


def count(node):
    return 1 + sum(count(child) for child in node.get('children', []))


def has(node, role, name):
    return (node.get('role') == role and node.get('name') == name) or any(has(c, role, name) for c in node.get('children', []))


def observe(engine, monitor, window, tree_wanted=True, screenshot=False):
    """One get_window_state, with what the bus saw during it."""
    before = len(monitor.counted())
    payload = {'window': window, 'include_screenshot': screenshot}
    if not tree_wanted:
        payload['tree_wanted'] = False
    answer, stats = engine.ask('get_window_state', payload)
    time.sleep(0.3)  # the monitor's copy of the last call
    seen = monitor.counted()[before:]
    output = answer.get('output') or {}
    tree = output.get('ax_tree') or {}
    bus = stats.get('bus', {})
    return {'ok': answer.get('ok'), 'error': answer.get('error'), 'tree_wanted': tree_wanted, 'screenshot': screenshot,
            'source': output.get('ax_tree_source'), 'nodes': count(tree) if tree else None,
            'screenshots': len(output.get('screenshots') or []), 'truncated': output.get('truncated'),
            'ask': stats.get('ask'), 'bus_calls': bus.get('calls'), 'by_member': bus.get('by_member'),
            'seen': {m: sum(1 for c in seen if c['member'] == m) for m in WATCHED}, 'seen_calls': seen, 'tree': tree}


def listed(engine, match):
    answer, _ = engine.ask('list_windows', {})
    return [w for w in answer.get('output') or [] if match(w)]


def window_of(engine, match, timeout=30):
    found, _ = lib.wait_for(lambda: listed(engine, match), timeout, step=0.25)
    return found[0] if found else None


def fixture_session(label, args):
    session = lib.Session(label)
    session.start()
    session.set_status('ScreenReaderEnabled', False)
    session.set_status('IsEnabled', True)
    session.a11y()
    app = session.spawn(lib.fixture_argv(session, args), name='fixture')
    return session, app


def strip(read):
    read = dict(read)
    read.pop('tree', None)
    return read


def fixture_bare(out):
    session, app = fixture_session('t179-bare', ())
    row = {'scenario': 'fixture-bare', 'test': '§G 5 and the positive case', 'status': session.status()}
    try:
        lib.wait_for(lambda: session.windows_of(app.pid), 30)
        lib.wait_for(lambda: lib.app_of(session, app.pid), 15)
        time.sleep(2)
        monitor = Monitor(session)
        engine = Engine(session, ENGINE)
        row['engine'] = engine.version
        try:
            window = window_of(engine, lambda w: w.get('title') == 'cua Electron fixture')
            row['window'] = window and {k: window.get(k) for k in ('id', 'app', 'title')}
            row['role'] = session.wm_class(window['id']) if window else None
            log_before = lib.fixture_log(session)
            shots = [observe(engine, monitor, window, tree_wanted=False, screenshot=True) for _ in range(2)]
            entry = lib.app_of(session, app.pid)
            walked = lib.walk(session, entry) if entry else None
            row['screenshots'] = [strip(r) for r in shots]
            row['after_screenshots'] = {'walk_nodes': walked and walked['nodes'], 'log_before': log_before,
                                        'log_after': lib.fixture_log(session)}
            reads = []
            for pause in (0, 1.5, 0):
                time.sleep(pause)
                read = observe(engine, monitor, window)
                read['fixture_button'] = has(read['tree'], 'push button', 'Fixture button')
                reads.append(strip(read))
            row['reads'] = reads
            row['log_end'] = lib.fixture_log(session)
            row['monitor_all'] = monitor.counted()
            row['verdict'] = {
                'screenshot_sent_no_GetAttributes': all(r['seen']['GetAttributes'] == 0 for r in shots),
                'screenshot_read_no_ToolkitName': all(r['seen']['Get'] == 0 for r in shots),
                'mode_unchanged_after_screenshots': walked is not None and walked['nodes'] <= 2,
                'first_read_sent_one_GetAttributes': reads[0]['seen']['GetAttributes'] == 1,
                'second_read_has_the_button': reads[1]['fixture_button'],
                'no_GetAttributes_after_the_first': all(r['seen']['GetAttributes'] == 0 for r in reads[1:]),
                'GetRelationSet_never': all(c['member'] != 'GetRelationSet' for c in monitor.counted()),
            }
        finally:
            engine.stop()
            monitor.stop()
    finally:
        session.stop()
    lib.emit(row, out)


def fixture_flag(out):
    session, app = fixture_session('t179-flag', (FLAG,))
    row = {'scenario': 'fixture-flag', 'test': '§G 6', 'status': session.status()}
    try:
        lib.wait_for(lambda: session.windows_of(app.pid), 30)
        lib.wait_for(lambda: lib.app_of(session, app.pid), 15)
        time.sleep(2)
        monitor = Monitor(session)
        engine = Engine(session, ENGINE)
        row['engine'] = engine.version
        try:
            window = window_of(engine, lambda w: w.get('title') == 'cua Electron fixture')
            row['window'] = window and {k: window.get(k) for k in ('id', 'app', 'title')}
            reads = []
            for _ in range(2):
                read = observe(engine, monitor, window)
                read['fixture_button'] = has(read['tree'], 'push button', 'Fixture button')
                reads.append(strip(read))
                time.sleep(0.5)
            row['reads'] = reads
            row['monitor_all'] = monitor.counted()
            row['verdict'] = {
                'tree_had_content': all(r['nodes'] and r['nodes'] > 2 and r['fixture_button'] for r in reads),
                'no_GetAttributes': all(r['seen']['GetAttributes'] == 0 for r in reads),
                'no_ToolkitName_read': all(r['seen']['Get'] == 0 for r in reads),
                'no_ask_record': all(r['ask'] is None for r in reads),
            }
        finally:
            engine.stop()
            monitor.stop()
    finally:
        session.stop()
    lib.emit(row, out)


def others(out):
    session = lib.Session('t179-others')
    session.start()
    row = {'scenario': 'others', 'test': '§G 7', 'apps': {}}
    try:
        session.set_status('ScreenReaderEnabled', False)
        session.set_status('IsEnabled', True)
        session.a11y()
        row['status'] = session.status()
        scratch = os.path.join(session.root, 'scratch')
        os.makedirs(scratch)
        apps = []
        for name, argv in (
            ('gedit', ['gedit', '--standalone']),
            ('gtk4', ['python3', '-I', os.path.join(PAGES, 'gtk4-input.py')]),
            ('kate', ['kate', '-n', '-b']),
            ('qtcreator', ['qtcreator', '-settingspath', os.path.join(session.root, 'qtcreator')]),
            ('bare-gtk3', ['python3', '-I', os.path.join(HERE, 'bare-gtk3.py')]),
        ):
            title = f't179-{name}'
            if name in ('gedit', 'kate', 'qtcreator'):
                path = os.path.join(scratch, f'{title}.txt')
                with open(path, 'w') as f:
                    f.write(f'{name} scene for task 179\n')
                argv = [*argv, path]
            else:
                argv = [*argv, title]
            proc = session.spawn(argv, name=name)
            apps.append((name, title, proc))
        time.sleep(12)  # qtcreator takes the longest to register
        monitor = Monitor(session)
        for label, binary in (('base', BASE), ('candidate', ENGINE), ('base-again', BASE)):
            engine = Engine(session, binary)
            try:
                for name, title, proc in apps:
                    window = window_of(engine, lambda w, t=title: t in (w.get('title') or ''), timeout=20)
                    entry = row['apps'].setdefault(name, {'window': window and {k: window.get(k) for k in ('id', 'app', 'title')}})
                    if not window:
                        entry[label] = {'error': 'not listed'}
                        continue
                    entry.setdefault('role', session.wm_class(window['id']))
                    entry[label] = {'engine': engine.version, 'reads': [strip(observe(engine, monitor, window)) for _ in range(2)]}
            finally:
                engine.stop()
        row['monitor_all'] = monitor.counted()
        monitor.stop()
        verdict = {}
        for name, entry in row['apps'].items():
            base, cand = entry.get('base', {}).get('reads'), entry.get('candidate', {}).get('reads')
            again = entry.get('base-again', {}).get('reads')
            if not (base and cand):
                verdict[name] = 'missing'
                continue
            same = [b['by_member'] == c['by_member'] for b, c in zip(base, cand)]
            base_steady = [b['by_member'] == a['by_member'] for b, a in zip(base, again or [])]
            verdict[name] = {
                'nodes': [r['nodes'] for r in cand],
                'by_member_same_as_base': same,
                'by_member_candidate_minus_base': [
                    {m: c['by_member'].get(m, 0) - b['by_member'].get(m, 0) for m in sorted(set(b['by_member']) | set(c['by_member']))
                     if c['by_member'].get(m, 0) != b['by_member'].get(m, 0)} for b, c in zip(base, cand)],
                'base_steady': base_steady,
                'GetAttributes': sum(r['seen']['GetAttributes'] for r in cand),
                'ToolkitName_reads_by_candidate': [r['seen']['Get'] for r in cand],
                'ToolkitName_reads_by_base': [r['seen']['Get'] for r in base],
                'ask': [r['ask'] for r in cand],
            }
        row['verdict'] = verdict
    finally:
        session.stop()
    lib.emit(row, out)


PAGE = """<!doctype html><title>{title}</title><body><h1>{title}</h1><button>Chrome page button</button>{script}</body>"""


def chrome(out, first):
    session = lib.Session(f't179-chrome-{first}')
    session.start()
    root = session.root
    row = {'scenario': f'chrome-{first}', 'test': '§G 8', 'first': first}
    try:
        session.set_status('ScreenReaderEnabled', False)
        session.set_status('IsEnabled', True)
        session.a11y()
        row['status'] = session.status()
        pages = os.path.join(root, 'pages')
        os.makedirs(pages)
        with open(os.path.join(pages, 'popup.html'), 'w') as f:
            f.write(PAGE.format(title='t179 Chrome pop-up', script=''))
        with open(os.path.join(pages, 'tabbed.html'), 'w') as f:
            f.write(PAGE.format(title='t179 Chrome tabbed', script="<script>window.open('popup.html', 't179', 'popup,width=480,height=360')</script>"))
        profile = os.path.join(root, 'chrome-profile')
        os.makedirs(profile, mode=0o700)
        argv = ['unshare', '--user', '--net', f'--map-user={os.getuid()}', f'--map-group={os.getgid()}', '--',
                CHROME, f'--user-data-dir={profile}', '--no-first-run', '--no-default-browser-check', '--disable-search-engine-choice-screen',
                '--password-store=basic', '--disable-popup-blocking', '--new-window', 'file://' + os.path.join(pages, 'tabbed.html')]
        row['argv'] = [a.replace(root, '<session>') for a in argv]
        row['version'] = subprocess.run([CHROME, '--version'], capture_output=True, text=True, env=session.env()).stdout.strip()
        proc = session.spawn(argv, name='chrome')
        proc.no_signal = True
        monitor = None
        engine = Engine(session, ENGINE)
        row['engine'] = engine.version
        try:
            titled = lambda t: (lambda w: (w.get('title') or '').startswith(t))  # noqa: E731
            tabbed = window_of(engine, titled('t179 Chrome tabbed'), timeout=60)
            popup = window_of(engine, titled('t179 Chrome pop-up'), timeout=30)
            row['windows'] = {name: w and {k: w.get(k) for k in ('id', 'app', 'title')} for name, w in (('tabbed', tabbed), ('popup', popup))}
            if not (tabbed and popup):
                row['error'] = 'a window did not show'
                row['log_tail'] = open(proc.logfile, errors='replace').read()[-600:]
            else:
                row['roles'] = {'tabbed': session.wm_class(tabbed['id']), 'popup': session.wm_class(popup['id'])}
                time.sleep(3)
                monitor = Monitor(session)
                order = [('tabbed', tabbed), ('popup', popup)] if first == 'tabbed' else [('popup', popup), ('tabbed', tabbed)]
                reads = []
                for name, window in order + order:
                    read = strip(observe(engine, monitor, window))
                    read['window'] = name
                    reads.append(read)
                row['reads'] = reads
                row['monitor_all'] = monitor.counted()
                row['verdict'] = {
                    'no_GetAttributes': all(r['seen']['GetAttributes'] == 0 for r in reads),
                    'no_GetRelationSet': all(r['seen']['GetRelationSet'] == 0 for r in reads),
                    'ToolkitName_reads': sum(r['seen']['Get'] for r in reads),
                    'asks': [r['ask'] for r in reads],
                    'nodes': [r['nodes'] for r in reads],
                }
        finally:
            engine.stop()
            if monitor:
                monitor.stop()
    finally:
        session.stop(keep=True)  # the display goes; the run's Chrome ends with it, unsignalled
        lib.wait_for(lambda: not [p for p in lib.leftovers(root) if lib.is_chrome(p)], 20)
        row['chrome_processes_left'] = len([p for p in lib.leftovers(root) if lib.is_chrome(p)])
        if row['chrome_processes_left'] == 0:
            import shutil
            shutil.rmtree(root, ignore_errors=True)
    lib.emit(row, out)


SCENARIOS = {
    'fixture-bare': fixture_bare,
    'fixture-flag': fixture_flag,
    'others': others,
    'chrome-tabbed': lambda out: chrome(out, 'tabbed'),
    'chrome-popup': lambda out: chrome(out, 'popup'),
}

if __name__ == '__main__':
    out = sys.argv[1]
    for name in sys.argv[2:] or SCENARIOS:
        try:
            SCENARIOS[name](out)
        except Exception as error:
            lib.emit({'scenario': name, 'error': repr(error)[:400]}, out)
