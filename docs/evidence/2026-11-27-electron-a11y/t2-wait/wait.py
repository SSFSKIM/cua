#!/usr/bin/env python3
"""#228 task 2 (session task 180): the live tests of the engine's wait, the pre-flight's §G 2, 4, 9 and 10, and the
wait's measurement on the engine's own frame.

It extends task 1's runner (`../t1-rule/rule.py`): each run in its own `lib.Session` (a private Xvfb display, a session
bus and accessibility bus of its own, a temporary home), `IsEnabled` on and `ScreenReaderEnabled` off; an unfiltered
`dbus-monitor --monitor` of the run's own, each observation between two markers; the engine run as the service runs
it (`cua-engine server --desktop dedicated --stats`), its `--stats` line read after each answer. Third-party
applications (VS Code, CEF) run with no network (`unshare --user --net`). Each request is timed from the line written
to the engine to its answer read.

  fixture-started   §G 2: the Electron fixture started by hand, no flag. Its first get_window_state has the button,
                    within the bound; the second asks and waits for nothing.
  fixture-disabled  §G 4: the fixture with --disable-renderer-accessibility. The first observation waits the bound
                    and is answered bare; the second and third wait for nothing.
  vscode            §G 9: VS Code from its package, started by hand. The first observation has at least 300 nodes, or
                    is bare after waiting the whole bound; the second has its page; its argv.json has no
                    force-renderer-accessibility.
  vscode-3s         a measurement: VS Code observed 3 s after it is on the bus (the pre-flight's timing), when its
                    workbench may still be building (some 290 to 300 nodes); the wait's checks, as vscode-early's.
  vscode-early      a measurement: VS Code observed 1 s after it is on the bus, its workbench still loading. The wait
                    ends on the page VS Code has so far, within the bound; three observations 1.5 s apart.
  vscode-flag-early the control for it: VS Code started with --force-renderer-accessibility, observed the same way.
  no-page           §G 10: an Electron window with no page (`no-page/`: a BaseWindow, its controls drawn by Chromium),
                    answered promptly, within the bound, with its buttons.
  panels            fix wave 1: an Electron window whose views are panels alone (`no-page/ --t180-panels`) waits the
                    bound, as it tells nothing of a page, and is answered with its panels.
  twins             fix wave 1: two same-title windows of one process (`twins/`), told apart by cua's own routes;
                    the wait confirms its read again, and each window answers its own page.
  cef-dialog        §G 10's dialog of Chromium's own, CEF's terms dialog: not asked under ruling 1251 (its window has
                    no role; the engine finds no frame for it at all), so it is answered at once, with no request and
                    no wait.

A scenario may be given as `<name>:<runs>`, its runs at least 1. Every run's row carries `checks` and `passed`; the run exits 1 when any
did not pass or failed to run.

usage: wait.py <out.jsonl> <apps dir> [scenario[:runs] ...]   (ENGINE: the engine; apps dir: the unpacked packages)
"""
import glob
import json
import os
import re
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'probes'))
sys.path.insert(0, os.path.join(HERE, '..', 't1-rule'))
import lib  # noqa: E402
import rule  # noqa: E402

ENGINE = os.environ['ENGINE']
APPS = None  # set from the command line
WAIT_RS = os.path.join(lib.REPO, 'native', 'linux-engine', 'src', 'wait.rs')
BOUND_MS = int(re.search(r'pub const BOUND: Duration = Duration::from_millis\((\d+)\);', open(WAIT_RS).read()).group(1))
NO_WAIT_MS = 250  # an observation that waits for nothing: one read of a bare frame, far under a gap's worth of reads
BUTTONS = ('Close', 'Minimize', 'Maximize', 'Restore')


class Engine(rule.Engine):
    """Task 1's engine, each request timed and its stats line and output kept."""

    def ask(self, command, payload):
        started = time.monotonic()
        answer = super().ask(command, payload)
        self.last_ms = round((time.monotonic() - started) * 1000, 1)
        self.last_stats = answer[1]
        self.last_output = answer[0].get('output') or {}
        return answer


def observe(engine, window):
    read = rule.observe(engine, window)
    read['request_ms'] = engine.last_ms
    read['wait'] = (read['ask'] or {}).get('wait')
    read['identity'] = (engine.last_stats.get('tree') or {}).get('identity')
    read['tree_unavailable'] = engine.last_output.get('tree_unavailable')
    return read


def waited_the_bound_bare(read):
    """An observation answered bare after waiting the whole bound: what §G 9 accepts for a first observation in place of
    the page, its answer saying so (task 3's `tree_unavailable: {reason: "asked"}`)."""
    wait = read['wait'] or {}
    return wait.get('end') == 'bound' and read['nodes'] == 1 and wait.get('ms', 0) >= BOUND_MS - 25 \
        and read['tree_unavailable'] == {'reason': 'asked'}


def names(node, role):
    found = [node.get('name')] if node.get('role') == role else []
    for child in node.get('children', []):
        found += names(child, role)
    return found


def from_engine(engine, read):
    return all(q['sender'] in engine.connections() for q in read['requests'])


def run_app(label, argv_of, title, settle, body, out, extra=None):
    """One run: a session, the application started by hand, the monitor and the engine; `body` reads and checks."""
    session = rule.start_session(label)
    row = {'status': session.status(), 'bound_ms': BOUND_MS, **(extra or {})}
    checks = {}
    try:
        argv = argv_of(session)
        row['argv'] = [a.replace(session.root, '<session>').replace(APPS or '\0', '<apps>') for a in argv]
        app = session.spawn(argv, name=label)
        checks['window_shown'] = bool(lib.wait_for(lambda: session.windows_of(app.pid), 60, step=0.25)[0])
        checks['on_the_bus'] = bool(lib.wait_for(lambda: [a for a in lib.registry(session) if a.get('toolkit') == 'Chromium'], 30)[0])
        time.sleep(settle)
        monitor = rule.Monitor(session)
        engine = Engine(session, monitor, ENGINE)
        row['engine'] = engine.version
        try:
            window = rule.window_of(engine, lambda w: title in (w.get('title') or ''), timeout=30)
            checks['listed'] = bool(window)
            if window:
                row['window'] = {k: window.get(k) for k in ('id', 'app', 'title')}
                row['xprop'] = session.wm_class(window['id'])
                body(engine, window, session, row, checks)
        finally:
            engine.stop()
            monitor.stop()
    except Exception as error:
        row['error'] = repr(error)[:400]
        checks['ran'] = False
    finally:
        session.stop()
    return rule.finish(row, checks, out)


def fixture(flags=()):
    return lambda session: lib.fixture_argv(session, flags)


def fixture_started(out, run):
    def body(engine, window, session, row, checks):
        first = observe(engine, window)
        second = observe(engine, window)
        reads = [first, second]
        for read in reads:
            read['fixture_button'] = rule.has(read['tree'], 'push button', 'Fixture button')
        row['reads'] = [rule.strip(r) for r in reads]
        checks.update({
            'answered': all(r['ok'] and r['source'] == 'at_spi' for r in reads),
            'first_has_the_button': first['fixture_button'],
            'first_asked_once_from_the_engine': first['seen']['GetAttributes'] == 1 and from_engine(engine, first),
            'first_waited_and_ended_on_the_page': (first['wait'] or {}).get('end') == 'page',
            'first_within_the_bound': first['request_ms'] <= BOUND_MS,
            'second_has_the_button': second['fixture_button'],
            'second_asked_nothing_and_waited_for_nothing': second['seen']['GetAttributes'] == 0 and second['ask'] is None
            and second['request_ms'] < NO_WAIT_MS,
        })
    return run_app(f't180-started-{run}', fixture(), 'cua Electron fixture', 2, body, out,
                   {'scenario': 'fixture-started', 'test': '§G 2', 'run': run})


def fixture_disabled(out, run):
    def body(engine, window, session, row, checks):
        first = observe(engine, window)
        later = [observe(engine, window)]
        time.sleep(1.5)
        later.append(observe(engine, window))
        reads = [first, *later]
        row['reads'] = [rule.strip(r) for r in reads]
        wait = first['wait'] or {}
        checks.update({
            'answered': all(r['ok'] and r['source'] == 'at_spi' for r in reads),
            'first_asked_once_from_the_engine': first['seen']['GetAttributes'] == 1 and from_engine(engine, first),
            'first_waited_the_bound': wait.get('end') == 'bound' and BOUND_MS - 25 <= wait.get('ms', 0) <= BOUND_MS + 5,
            'first_answered_bare': first['nodes'] == 1,
            'first_request_within_the_bound_and_its_first_read': first['request_ms'] <= BOUND_MS + 100,
            'later_left_as_asked_before': all(r['ask'] == {'left': 'asked_before'} for r in later),
            'later_waited_for_nothing': all(r['wait'] is None and r['request_ms'] < NO_WAIT_MS for r in later),
            'later_asked_nothing': all(r['seen']['GetAttributes'] == 0 for r in later),
            'later_still_bare': all(r['nodes'] == 1 for r in later),
        })
    return run_app(f't180-disabled-{run}', fixture(('--disable-renderer-accessibility',)), 'cua Electron fixture', 2, body, out,
                   {'scenario': 'fixture-disabled', 'test': '§G 4', 'run': run})


def vscode(out, run, settle, scenario, mode):
    """`mode`: `g9`, §G 9's checks on a VS Code that has loaded; `loading`, a VS Code still loading its workbench, whose
    page is what it has so far (the wait's checks, and the node counts against `flag`'s); `flag`, the control: VS Code
    started with --force-renderer-accessibility, observed at the same moment (its argv.json then changes, as the
    pre-flight's §D found, so that is not checked)."""
    def argv_of(session):
        data = os.path.join(session.root, 'profile')
        return [*rule.NO_NETWORK, os.path.join(APPS, 'code/usr/share/code/code'), f'--user-data-dir={data}',
                f"--extensions-dir={os.path.join(session.root, 'ext')}", '--disable-telemetry', '--disable-updates',
                '--disable-workspace-trust', '--new-window', *(['--force-renderer-accessibility'] if mode == 'flag' else [])]

    def body(engine, window, session, row, checks):
        first = observe(engine, window)
        time.sleep(1.5)
        second = observe(engine, window)
        reads = [first, second]
        if mode != 'g9':
            time.sleep(1.5)
            reads.append(observe(engine, window))
        row['reads'] = [rule.strip(r) for r in reads]
        row['nodes'] = [r['nodes'] for r in reads]
        time.sleep(5)  # VS Code writes argv.json as soon as it believes a screen reader is there
        row['argv_json'] = {}
        for folder, _, files in os.walk(session.root):
            if 'argv.json' in files:
                path = os.path.join(folder, 'argv.json')
                text = open(path, errors='replace').read()
                row['argv_json'][os.path.relpath(path, session.root)] = [line.strip() for line in text.split('\n') if 'force-renderer-accessibility' in line]
        if mode == 'flag':
            checks['answered'] = all(r['ok'] and r['source'] == 'at_spi' for r in reads)
            checks['never_asked'] = all(r['seen']['GetAttributes'] == 0 and r['ask'] is None for r in reads)
            return
        # a VS Code still loading may not be associated at the first observation (answered from X11, the rule never
        # reached): the observation that asked is then the first one the engine read from the bus
        if mode == 'g9':
            checks['answered'] = all(r['ok'] and r['source'] == 'at_spi' for r in reads)
            asking = 0
        else:
            checks['answered'] = all(r['ok'] for r in reads)
            asking = next((i for i, r in enumerate(reads) if r['source'] == 'at_spi'), 0)
            row['asking_observation'] = asking
        wait = reads[asking]['wait'] or {}
        checks.update({
            'asked_once_from_the_engine': reads[asking]['seen']['GetAttributes'] == 1 and from_engine(engine, reads[asking])
            and sum(r['seen']['GetAttributes'] for r in reads) == 1,
            'wait_within_the_bound': wait.get('ms', BOUND_MS + 10) <= BOUND_MS + 5,
            'later_asked_nothing_and_waited_for_nothing': all(r['seen']['GetAttributes'] == 0 and r['wait'] is None for r in reads[asking + 1:]),
            'argv_json_found': bool(row['argv_json']),
            'argv_json_never_forces_accessibility': not any(row['argv_json'].values()),
        })
        if mode == 'g9':
            checks['first_has_its_page_or_is_bare_at_the_bound'] = (first['nodes'] or 0) >= 300 or waited_the_bound_bare(first)
            checks['second_has_its_page'] = (second['nodes'] or 0) >= 300
        else:
            checks['first_ended_on_its_content'] = wait.get('end') in ('page', 'bound')
    return run_app(f't180-{scenario}-{run}', argv_of, 'Visual Studio Code', settle, body, out,
                   {'scenario': scenario, 'test': '§G 9' if mode == 'g9' else 'measurement', 'run': run, 'settle_s': settle})


def no_page(out, run):
    def body(engine, window, session, row, checks):
        first = observe(engine, window)
        second = observe(engine, window)
        reads = [first, second]
        row['reads'] = [rule.strip(r) for r in reads]
        row['first_buttons'] = names(first['tree'], 'push button')
        wait = first['wait'] or {}
        checks.update({
            'answered': all(r['ok'] and r['source'] == 'at_spi' for r in reads),
            'role_is_electrons': 'WM_WINDOW_ROLE(STRING) = "browser-window"' in row['xprop'],
            'first_asked_once_from_the_engine': first['seen']['GetAttributes'] == 1 and from_engine(engine, first),
            'first_ended_on_no_page': wait.get('end') == 'no_page',
            'first_within_the_bound': first['request_ms'] <= BOUND_MS,
            'first_prompt': wait.get('ms', BOUND_MS) < 250,
            'first_has_its_buttons': all(b in row['first_buttons'] for b in BUTTONS),
            'second_asked_nothing_and_waited_for_nothing': second['seen']['GetAttributes'] == 0 and second['ask'] is None
            and second['request_ms'] < NO_WAIT_MS,
        })
    return run_app(f't180-nopage-{run}', lambda s: [lib.ELECTRON, os.path.join(HERE, 'no-page'), '--t180-overlay'], 't180 base window', 2,
                   body, out, {'scenario': 'no-page', 'test': '§G 10', 'run': run})


def panels(out, run):
    """Fix wave 1: a window whose views are panels alone (`no-page/ --t180-panels`) tells nothing of a page, so the
    wait does not end on it: the bound, then the panels; the next observation waits for nothing."""
    def body(engine, window, session, row, checks):
        first = observe(engine, window)
        second = observe(engine, window)
        reads = [first, second]
        row['reads'] = [rule.strip(r) for r in reads]
        wait = first['wait'] or {}
        checks.update({
            'answered': all(r['ok'] and r['source'] == 'at_spi' for r in reads),
            'first_asked_once_from_the_engine': first['seen']['GetAttributes'] == 1 and from_engine(engine, first),
            'first_waited_the_bound_on_views': wait.get('end') == 'bound' and wait.get('shape') == 'views'
            and BOUND_MS - 25 <= wait.get('ms', 0) <= BOUND_MS + 5,
            'first_answered_with_the_panels': (first['nodes'] or 0) > 1,
            'second_asked_nothing_and_waited_for_nothing': second['seen']['GetAttributes'] == 0 and second['ask'] is None
            and second['request_ms'] < NO_WAIT_MS,
        })
    return run_app(f't180-panels-{run}', lambda s: [lib.ELECTRON, os.path.join(HERE, 'no-page'), '--t180-panels'], 't180 base window', 2,
                   body, out, {'scenario': 'panels', 'test': 'fix wave 1, item 3', 'run': run})


def twins(out, run):
    """Fix wave 1: two windows of one process with the same title (`twins/`), which the engine tells apart by cua's own
    routes; the wait's read is confirmed again before it is the answer, so each window answers its own page."""
    def x_of(session, window):
        done = subprocess.run(['xdotool', 'getwindowgeometry', str(window)], env=session.env(), capture_output=True, text=True, timeout=10)
        found = re.search(r'Position: (\d+),', done.stdout)
        return int(found.group(1)) if found else None

    def body(engine, window, session, row, checks):
        both = rule.listed(engine, lambda w: w.get('title') == 't180 twins')
        checks['two_windows'] = len(both) == 2
        if len(both) != 2:
            return
        both.sort(key=lambda w: x_of(session, w['id']) or 0)
        row['windows'] = [{'id': w['id'], 'x': x_of(session, w['id'])} for w in both]
        # left (asks and waits), right, then each again
        reads = []
        for side, w in zip(('Left', 'Right', 'Left', 'Right'), both + both):
            read = observe(engine, w)
            read['side'] = side
            read['buttons'] = names(read['tree'], 'push button')
            reads.append(read)
        row['reads'] = [rule.strip(r) for r in reads]
        calls = lambda r: r['engine_by_member'].get('org.freedesktop.DBus.GetConnectionUnixProcessID', 0)  # noqa: E731
        checks.update({
            'answered': all(r['ok'] and r['source'] == 'at_spi' for r in reads),
            'told_by_cuas_own_routes': all(r['identity'] in ('position', 'active') for r in reads),
            'first_asked_once_and_waited': reads[0]['seen']['GetAttributes'] == 1 and (reads[0]['wait'] or {}).get('end') == 'page',
            'no_other_request_and_no_other_wait': all(r['seen']['GetAttributes'] == 0 and r['wait'] is None for r in reads[1:]),
            # the page's button, beside the menu bar's own (File, Edit, View, Window)
            'each_window_answers_its_own_page': all([b for b in r['buttons'] if b.endswith(' button')] == [f"{r['side']} button"] for r in reads),
            'the_wait_confirmed_its_read': calls(reads[0]) > calls(reads[1]),
        })
    return run_app(f't180-twins-{run}', lambda s: [lib.ELECTRON, os.path.join(HERE, 'twins')], 't180 twins', 2,
                   body, out, {'scenario': 'twins', 'test': 'fix wave 1, item 2', 'run': run})


def cef_dialog(out, run):
    def argv_of(session):
        cef = glob.glob(os.path.join(APPS, 'cef152', '*', 'Release', 'cefsimple'))[0]
        return [*rule.NO_NETWORK, cef, '--url=about:blank', f"--user-data-dir={os.path.join(session.root, 'profile')}"]

    def body(engine, window, session, row, checks):
        reads = [observe(engine, window) for _ in range(2)]
        row['reads'] = [rule.strip(r) for r in reads]
        # the engine finds no frame for this window (its process sets no class) and answers it from X11, so the rule
        # never sees it; were it found, the rule would leave it at its role
        checks.update({
            'answered': all(r['ok'] for r in reads),
            'no_role': 'WM_WINDOW_ROLE:  not found.' in row['xprop'],
            'not_asked_by_the_rule': all(r['ask'] is None or r['ask'].get('left') == 'role' for r in reads),
            'never_asked': all(r['seen']['GetAttributes'] == 0 for r in reads),
            'never_waited': all(r['wait'] is None and r['request_ms'] < NO_WAIT_MS for r in reads),
        })
    return run_app(f't180-cef-{run}', argv_of, 'Chromium Additional Terms of Service', 3, body, out,
                   {'scenario': 'cef-dialog', 'test': '§G 10, ruling 1251', 'run': run})


SCENARIOS = {
    'fixture-started': fixture_started,
    'fixture-disabled': fixture_disabled,
    'vscode': lambda out, run: vscode(out, run, 8, 'vscode', 'g9'),
    'vscode-3s': lambda out, run: vscode(out, run, 3, 'vscode-3s', 'loading'),
    'vscode-early': lambda out, run: vscode(out, run, 1, 'vscode-early', 'loading'),
    'vscode-flag-early': lambda out, run: vscode(out, run, 1, 'vscode-flag-early', 'flag'),
    'no-page': no_page,
    'panels': panels,
    'twins': twins,
    'cef-dialog': cef_dialog,
}


def plan(specs):
    """The scenarios and their runs, every one checked before anything runs: a known name, and at least one run."""
    planned = []
    for spec in specs:
        name, _, runs = spec.partition(':')
        if name not in SCENARIOS:
            sys.exit(f'{spec}: no such scenario ({", ".join(SCENARIOS)})')
        if not re.fullmatch(r'\d*', runs) or int(runs or 1) < 1:
            sys.exit(f'{spec}: the runs must be a whole number, at least 1')
        planned.append((name, int(runs or 1)))
    return planned


if __name__ == '__main__':
    out, APPS = sys.argv[1], os.path.abspath(sys.argv[2])
    failed = []
    for name, runs in plan(sys.argv[3:] or SCENARIOS):
        for run in range(1, runs + 1):
            try:
                passed = SCENARIOS[name](out, run)
            except Exception as error:
                lib.emit({'scenario': name, 'run': run, 'error': repr(error)[:400], 'passed': False}, out)
                passed = False
            if not passed:
                failed.append(f'{name}:{run}')
    print(json.dumps({'failed': failed}), flush=True)
    sys.exit(1 if failed else 0)
