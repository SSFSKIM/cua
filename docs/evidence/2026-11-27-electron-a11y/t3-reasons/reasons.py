#!/usr/bin/env python3
"""#228 task 3 (session task 181): the live tests of the engine's two reasons, `tree_unavailable: {reason}`: the
pre-flight's §G 3, the `asked` case of §G 4, and the windows that must get no field.

It extends the runners of tasks 1 and 2 (`../t1-rule/rule.py`, `../t2-wait/wait.py`): each run in its own
`lib.Session` (a private Xvfb display, never :0, a session bus and an accessibility bus of its own, a temporary home);
an unfiltered `dbus-monitor --monitor` of the run's own, each observation between two markers; the engine run as the
service runs it (`cua-engine server --desktop dedicated --stats`). Third-party applications (gedit, Chrome, NW.js) run
with no network (`unshare --user --net`). The session's environment is `lib.Session.env`'s fixed list, which names
none of `ACCESSIBILITY_ENABLED`, `GNOME_ACCESSIBILITY` and `QT_ACCESSIBILITY`.

Every observation is made by the candidate (ENGINE) and by the base (MAIN, a build of the engine before task 3) on the
same window, the candidate first, so the base's answer shows what changed: the candidate's answer less its
`tree_unavailable` must equal the base's, key for key, and the field is the only difference. Observations ask for no
screenshot, so the answers carry no file paths.

  off-the-bus   §G 3: the Electron fixture started by hand with both switches off and no variable. It is never on the
                bus; the candidate's state read answers the X11 tree with `{reason: "no_provider"}`, on every read; a
                screenshot (`tree_wanted: false`) gets no field. The registry is empty then.
  off-the-bus-beside  the same, with gedit on the bus first: association names gedit's process, finds no application
                of the fixture's, and the answer is the same.
  asked        §G 4's field: the fixture with --disable-renderer-accessibility, `IsEnabled` on. The first observation
                asks, waits the bound, and is answered bare with `{reason: "asked"}`; the next two ask nothing, wait for
                nothing, and have no field.
  gedit         a negative: gedit, on the bus with its tree. No field.
  chrome-on     a negative: a Chrome of the run's own, no flag, `IsEnabled` on: on the bus, its frame bare, its role
                `browser`, so it is never asked. No field.
  chrome-off    a negative: the same Chrome with both switches off: not on the bus, its role `browser`. No field.
  nwjs          a negative: NW.js, which has no bridge at all (the pre-flight's §C): never on the bus, its role
                `pop-up`. No field.

A scenario may be given as `<name>:<runs>`. Every run's row carries `checks` and `passed`; the run exits 1 when any
did not pass or failed to run.

usage: reasons.py <out.jsonl> <apps dir> [scenario[:runs] ...]   (ENGINE: the candidate; MAIN: the base; apps dir: the
unpacked packages, NW.js among them)
"""
import glob
import json
import os
import re
import shutil
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'probes'))
sys.path.insert(0, os.path.join(HERE, '..', 't1-rule'))
sys.path.insert(0, os.path.join(HERE, '..', 't2-wait'))
import lib  # noqa: E402
import rule  # noqa: E402
import wait  # noqa: E402

ENGINE = os.environ['ENGINE']
MAIN = os.environ['MAIN']
APPS = None  # set from the command line
VARIABLES = ('ACCESSIBILITY_ENABLED', 'GNOME_ACCESSIBILITY', 'QT_ACCESSIBILITY')
NO_PROVIDER = {'reason': 'no_provider'}
ASKED = {'reason': 'asked'}


Engine = wait.Engine  # each request timed, its stats line and output kept


def observe(engine, window, tree_wanted=True):
    read = wait.observe(engine, window) if tree_wanted else rule.observe(engine, window, tree_wanted=False)
    read['output'] = engine.last_output
    read['tree_unavailable'] = engine.last_output.get('tree_unavailable')
    return read


def without_field(output):
    return {k: v for k, v in (output or {}).items() if k != 'tree_unavailable'}


def strip(read):
    read = rule.strip(read)
    read.pop('output', None)
    return read


def start_session(label, enabled):
    session = lib.Session(label)
    session.start()
    session.set_status('ScreenReaderEnabled', False)
    session.set_status('IsEnabled', enabled)
    session.a11y()
    return session


def run(label, enabled, argv_of, match, settle, body, out, extra, on_bus=None, chrome=False, companion=None):
    """One run: a session with `IsEnabled` as `enabled`, the application started by hand, the monitor; `body` reads
    with the candidate and the base and checks. `on_bus`: whether the application must be on the bus (None: either).
    `companion`: another application's argv, started first and on the bus before the application starts."""
    session = start_session(label, enabled)
    row = {'status': session.status(), **extra}
    checks = {'switches_as_wanted': session.status() == {'IsEnabled': enabled, 'ScreenReaderEnabled': False},
              'no_variable_in_the_environment': not any(v in session.env() for v in VARIABLES)}
    try:
        if companion:
            other = companion(session)
            row['companion_argv'] = [a.replace(session.root, '<session>') for a in other]
            session.spawn(other, name=f'{label}-companion')
            found, _ = lib.wait_for(lambda: [a for a in lib.registry(session) if a.get('pid')], 30, step=0.25)
            row['companion_on_the_bus'] = [a.get('toolkit') for a in found or []]
            checks['companion_on_the_bus_its_process_named'] = bool(found)
        argv = argv_of(session)
        row['argv'] = [a.replace(session.root, '<session>').replace(APPS or '\0', '<apps>') for a in argv]
        app = session.spawn(argv, name=label)
        if chrome:
            app.no_signal = True  # ended with its display, unsignalled (rule.py's Chrome)
        checks['window_shown'] = bool(lib.wait_for(lambda: session.windows_of(app.pid), 60, step=0.25)[0])
        if on_bus is not None:
            # an application that would join the bus does so as its first window opens; give it a while either way
            joined, _ = lib.wait_for(lambda: [a for a in lib.registry(session) if a.get('toolkit') == 'Chromium'], 15 if on_bus else 6)
            row['chromium_on_the_bus'] = len(joined or [])
            checks['on_the_bus' if on_bus else 'not_on_the_bus'] = bool(joined) == on_bus
        time.sleep(settle)
        monitor = rule.Monitor(session)
        try:
            candidate = Engine(session, monitor, ENGINE)
            row['engine'] = candidate.version
            try:
                window = rule.window_of(candidate, match, timeout=30)
                checks['listed'] = bool(window)
                if window:
                    row['window'] = {k: window.get(k) for k in ('id', 'app', 'title')}
                    row['xprop'] = session.wm_class(window['id'])
                    body(candidate, window, session, row, checks)
            finally:
                candidate.stop()
            if 'window' in row:
                base = Engine(session, monitor, MAIN)
                row['base_engine'] = base.version
                try:
                    row['base_reads'] = [observe(base, row['window_ref']) for _ in range(row.get('base_observations', 1))]
                finally:
                    base.stop()
                compare(row, checks)
        finally:
            monitor.stop()
    except Exception as error:
        row['error'] = repr(error)[:400]
        checks['ran'] = False
    finally:
        if chrome:
            root = session.root
            session.stop(keep=True)
            lib.wait_for(lambda: not [p for p in lib.leftovers(root) if lib.is_chrome(p)], 20)
            row['chrome_processes_left'] = len([p for p in lib.leftovers(root) if lib.is_chrome(p)])
            checks['no_chrome_process_left'] = row['chrome_processes_left'] == 0
            if row['chrome_processes_left'] == 0:
                shutil.rmtree(root, ignore_errors=True)
        else:
            session.stop()
    row.pop('window_ref', None)
    row['reads'] = [strip(r) for r in row.get('reads', [])]
    row['base_reads'] = [strip(r) for r in row.get('base_reads', [])]
    return rule.finish(row, checks, out)


def compare(row, checks):
    """The candidate's state reads less their field against the base's, read for read (the first base read against the
    candidate's first state read, and so on)."""
    mine = [r for r in row['reads'] if r['tree_wanted']]
    base = row['base_reads']
    checks['base_answered'] = bool(base) and all(r['ok'] for r in base)
    checks['base_has_no_field'] = all(r['tree_unavailable'] is None for r in base)
    checks['the_field_is_the_only_difference'] = len(base) <= len(mine) and all(
        without_field(m['output']) == b['output'] for m, b in zip(mine, base))


def electron_role(row):
    return 'WM_WINDOW_ROLE(STRING) = "browser-window"' in row['xprop']


def off_the_bus(out, n, beside=False):
    """`beside`: gedit on the bus first, so association names its process and finds none of them the fixture's (the
    registry is not empty, as it is with the fixture alone)."""
    def body(engine, window, session, row, checks):
        reads = [observe(engine, window), observe(engine, window, tree_wanted=False)]
        time.sleep(1.5)
        reads.append(observe(engine, window))
        row['reads'], row['window_ref'], row['base_observations'] = reads, window, 2
        first, shot, again = reads
        checks.update({
            'role_is_electrons': electron_role(row),
            'answered': all(r['ok'] for r in reads),
            'answered_from_x11_one_node': all(r['source'] == 'x11' and r['nodes'] == 1 for r in reads),
            'state_reads_say_no_provider': first['tree_unavailable'] == NO_PROVIDER and again['tree_unavailable'] == NO_PROVIDER,
            'the_field_is_exactly_the_reason': all(set(r['tree_unavailable'] or {}) == {'reason'} for r in (first, again)),
            'screenshot_has_no_field': shot['tree_unavailable'] is None and 'tree_unavailable' not in shot['output'],
            'no_request_and_no_toolkit_read': all(r['seen']['GetAttributes'] == 0 and r['seen']['ToolkitName'] == 0 for r in reads),
            'no_ask_and_no_wait': all(r['ask'] is None for r in reads),
        })
        if beside:
            pids = lambda r: r['engine_by_member'].get('org.freedesktop.DBus.GetConnectionUnixProcessID', 0)  # noqa: E731
            checks['association_named_the_other_processes'] = all(pids(r) >= 1 for r in reads)
    scenario = 'off-the-bus-beside' if beside else 'off-the-bus'
    return run(f't181-off-{"beside-" if beside else ""}{n}', False, lambda s: lib.fixture_argv(s), lambda w: w.get('title') == 'cua Electron fixture',
               2, body, out, {'scenario': scenario, 'test': '§G 3', 'run': n}, on_bus=False, companion=gedit_argv if beside else None)


def asked(out, n):
    def body(engine, window, session, row, checks):
        reads = [observe(engine, window), observe(engine, window)]
        time.sleep(1.5)
        reads.append(observe(engine, window))
        row['reads'], row['window_ref'] = reads, window
        first, later = reads[0], reads[1:]
        w = first['wait'] or {}
        checks.update({
            'role_is_electrons': electron_role(row),
            'answered_from_the_bus': all(r['ok'] and r['source'] == 'at_spi' for r in reads),
            'first_asked_once_and_waited_the_bound_bare': first['seen']['GetAttributes'] == 1 and w.get('end') == 'bound'
            and w.get('shape') == 'bare' and w.get('ms', 0) >= wait.BOUND_MS - 25 and first['nodes'] == 1,
            'first_says_asked': first['tree_unavailable'] == ASKED,
            'later_asked_nothing_and_waited_for_nothing': all(r['seen']['GetAttributes'] == 0 and r['ask'] == {'left': 'asked_before'}
                                                             and r['request_ms'] < wait.NO_WAIT_MS for r in later),
            'later_still_bare': all(r['nodes'] == 1 for r in later),
            'later_have_no_field': all('tree_unavailable' not in r['output'] for r in later),
        })
    return run(f't181-asked-{n}', True, lambda s: lib.fixture_argv(s, ('--disable-renderer-accessibility',)),
               lambda w: w.get('title') == 'cua Electron fixture', 2, body, out, {'scenario': 'asked', 'test': '§G 4, its field', 'run': n},
               on_bus=True)


def negative(scenario, label, enabled, argv_of, match, settle, n, on_bus, expect, chrome=False):
    """An application that must never get the field: two state reads by the candidate, then one by the base."""
    def body(engine, window, session, row, checks):
        reads = [observe(engine, window)]
        time.sleep(1)
        reads.append(observe(engine, window))
        row['reads'], row['window_ref'] = reads, window
        checks.update({
            'answered': all(r['ok'] for r in reads),
            'no_field': all('tree_unavailable' not in r['output'] for r in reads),
            'no_request': all(r['seen']['GetAttributes'] == 0 for r in reads),
            **expect(row, reads),
        })
    return lambda out: run(f'{label}-{n}', enabled, argv_of, match, settle, body, out, {'scenario': scenario, 'test': 'negative', 'run': n},
                           on_bus=on_bus, chrome=chrome)


def gedit_argv(session):
    path = os.path.join(session.root, 't181-gedit.txt')
    with open(path, 'w') as f:
        f.write('gedit scene for task 181\n')
    return [*rule.NO_NETWORK, 'gedit', '--standalone', path]


def chrome_argv(session):
    pages = os.path.join(session.root, 'pages')
    os.makedirs(pages)
    with open(os.path.join(pages, 'tabbed.html'), 'w') as f:
        f.write(rule.PAGE.format(title='t181 Chrome tabbed', script=''))
    profile = os.path.join(session.root, 'chrome-profile')
    os.makedirs(profile, mode=0o700)
    return [*rule.NO_NETWORK, rule.CHROME, f'--user-data-dir={profile}', '--no-first-run', '--no-default-browser-check',
            '--disable-search-engine-choice-screen', '--password-store=basic', '--new-window', 'file://' + os.path.join(pages, 'tabbed.html')]


def nwjs_argv(session):
    nw = glob.glob(os.path.join(APPS, 'nwjs', '*', 'nw'))[0]
    return [*rule.NO_NETWORK, nw, lib.PROBE_APP + '-nw', f"--user-data-dir={os.path.join(session.root, 'profile')}"]


def role_is(role):
    return lambda row, reads: {f'role_is_{role}': f'WM_WINDOW_ROLE(STRING) = "{role}"' in row['xprop']}


def chrome_expect(source):
    def expect(row, reads):
        found = role_is('browser')(row, reads)
        found['answered_from_' + source] = all(r['source'] == source and r['nodes'] == 1 for r in reads)
        if source == 'at_spi':
            found['left_at_the_role'] = all((r['ask'] or {}).get('left') == 'role' for r in reads[:1])
        return found
    return expect


def scenario(name):
    titled = lambda t: (lambda w: (w.get('title') or '').startswith(t))  # noqa: E731
    gedit = lambda row, reads: {'has_its_tree': all(r['source'] == 'at_spi' and (r['nodes'] or 0) > 1 for r in reads)}  # noqa: E731
    nwjs = lambda row, reads: {**role_is('pop-up')(row, reads), 'answered_from_x11': all(r['source'] == 'x11' for r in reads)}  # noqa: E731
    return {
        'off-the-bus': off_the_bus,
        'off-the-bus-beside': lambda out, n: off_the_bus(out, n, beside=True),
        'asked': asked,
        'gedit': lambda out, n: negative('gedit', 't181-gedit', True, gedit_argv, lambda w: 't181-gedit' in (w.get('title') or ''), 3, n,
                                         None, gedit)(out),
        'chrome-on': lambda out, n: negative('chrome-on', 't181-chrome-on', True, chrome_argv, titled('t181 Chrome tabbed'), 3, n, True,
                                             chrome_expect('at_spi'), chrome=True)(out),
        'chrome-off': lambda out, n: negative('chrome-off', 't181-chrome-off', False, chrome_argv, titled('t181 Chrome tabbed'), 3, n, False,
                                              chrome_expect('x11'), chrome=True)(out),
        'nwjs': lambda out, n: negative('nwjs', 't181-nwjs', True, nwjs_argv, titled('cua a11y probe (nw)'), 3, n, False, nwjs)(out),
    }[name]


SCENARIOS = ('off-the-bus', 'off-the-bus-beside', 'asked', 'gedit', 'chrome-on', 'chrome-off', 'nwjs')


def plan(specs):
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
    wait.APPS = APPS
    failed = []
    for name, runs in plan(sys.argv[3:] or SCENARIOS):
        for n in range(1, runs + 1):
            try:
                passed = scenario(name)(out, n)
            except Exception as error:
                lib.emit({'scenario': name, 'run': n, 'error': repr(error)[:400], 'passed': False}, out)
                passed = False
            if not passed:
                failed.append(f'{name}:{n}')
    print(json.dumps({'failed': failed}), flush=True)
    sys.exit(1 if failed else 0)
