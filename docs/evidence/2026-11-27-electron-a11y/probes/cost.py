#!/usr/bin/env python3
"""#228 probe 3: what each route costs, on the probe app (Electron 44.9.0).

  startup   per mode, N fresh launches: the app's own times from its spawn (ready, did-finish-load, ready-to-show),
            when it registered on the accessibility bus, and when the page's button was first in a structural read
            ("first tree"). Modes:
              off         both switches off, no flag: no bridge
              bridge      IsEnabled on, nothing else: on the bus, no page tree
              kick        IsEnabled on; one GetAttributes on the application root as soon as it is on the bus
              flag        IsEnabled on and --force-renderer-accessibility
  bench     per mode, one instance: the page's DOM benchmark (2,000 rows built, rewritten 5 times, cleared) 7 times, the
            first dropped; wall time in the page, and the CPU seconds the renderer and the browser process spent on it.
            Modes: off, bridge, kick, flag, and kick+reader: a client re-reading the whole tree during the benchmark.
  idle      per mode, the CPU seconds each process spends in 10 s with nothing happening

usage: cost.py <out.jsonl> [startup|bench|idle ...] [--n N]
"""
import os
import statistics
import sys
import threading
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib  # noqa: E402
from running import FLAG, ProbeApp, switches_bridge_on, switches_off  # noqa: E402

MARKER = ('push button', 'Probe button')


def start(session, mode):
    """Sets the session's switches for `mode` and starts the probe app. Returns the app."""
    (switches_off if mode == 'off' else switches_bridge_on)(session)
    return ProbeApp(session, (FLAG,) if mode == 'flag' else ())


def kick_when_registered(session, app, timeout=10):
    entry, _ = lib.wait_for(lambda: lib.app_of(session, app.pid), timeout, step=0.01)
    if entry:
        lib.kick(session, entry)
    return entry


def startup(out, n):
    for mode in ('off', 'bridge', 'kick', 'flag'):
        for run in range(n):
            with lib.Session(f'cost-{mode}') as session:
                app = start(session, mode)
                t0 = app.proc.t_spawn
                row = {'probe': 'cost', 'part': 'startup', 'mode': mode, 'run': run}
                entry = None
                if mode == 'kick':
                    entry = kick_when_registered(session, app)
                    row['kicked_ms'] = round(lib.now_ms() - t0, 1)
                elif mode != 'off':
                    entry, _ = lib.wait_for(lambda: lib.app_of(session, app.pid), 10, step=0.01)
                row['registered_ms'] = round(lib.now_ms() - t0, 1) if entry else None
                if mode in ('kick', 'flag') and entry:
                    tree, _ = lib.wait_for(lambda: (lambda t: t if lib.has_named(t, *MARKER) else None)(lib.walk(session, entry)), 10, step=0.01)
                    row['first_tree_ms'] = round(lib.now_ms() - t0, 1) if tree else None
                shown = app.wait_event('ready-to-show')
                time.sleep(0.3)
                for event in ('ready', 'did-finish-load', 'ready-to-show'):
                    found = [r for r in app.log() if r['event'] == event]
                    row[event.replace('-', '_') + '_ms'] = round(found[0]['at'] - t0, 1) if found else None
                row['mode_at_show'] = {'enabled': shown.get('enabled'), 'features': shown.get('features')} if shown else None
                lib.emit(row, out)
    summarize(out, 'startup')


def cpu_delta(result):
    """CPU seconds per process type between a bench's before and after."""
    before = {m['pid']: m for m in result['before']}
    out = {}
    for m in result['after']:
        if m['pid'] in before and m['cpuSeconds'] is not None and before[m['pid']]['cpuSeconds'] is not None:
            out[m['type']] = round(out.get(m['type'], 0) + m['cpuSeconds'] - before[m['pid']]['cpuSeconds'], 4)
    return out


def bench(out, n):
    for mode in ('off', 'bridge', 'kick', 'flag', 'kick+reader'):
        with lib.Session('bench-' + mode.replace('+', '-')) as session:
            app = start(session, 'kick' if mode == 'kick+reader' else mode)
            app.wait_event('ready-to-show')
            time.sleep(1)
            entry = lib.app_of(session, app.pid)
            if mode.startswith('kick'):
                lib.kick(session, entry)
                lib.wait_for(lambda: lib.has_named(lib.walk(session, entry), *MARKER), 10)
            time.sleep(1)
            stop = threading.Event()
            reads = [0]
            if mode == 'kick+reader':
                def reader():
                    while not stop.is_set():
                        lib.walk(session, entry, limit=6000)
                        reads[0] += 1
                threading.Thread(target=reader, daemon=True).start()
            for run in range(n + 1):
                answer = app.command('bench', timeout=120, items=2000, passes=5, settleMs=1500)
                result = answer.get('result') or {}
                if run == 0 or not result:
                    continue  # the first run warms the page up
                metrics = {m['type']: m['workingSetKb'] for m in result['after']}
                lib.emit({'probe': 'cost', 'part': 'bench', 'mode': mode, 'run': run, 'timings': {k: round(v, 1) for k, v in result['timings'].items()},
                          'cpu_seconds': cpu_delta(result), 'working_set_kb': metrics, 'features': answer.get('features'), 'reads_so_far': reads[0]}, out)
            stop.set()
            time.sleep(0.2)
    summarize(out, 'bench')


def idle(out, n):
    for mode in ('off', 'bridge', 'kick', 'flag'):
        with lib.Session(f'idle-{mode}') as session:
            app = start(session, mode)
            app.wait_event('ready-to-show')
            time.sleep(1)
            if mode == 'kick':
                entry = lib.app_of(session, app.pid)
                lib.kick(session, entry)
                lib.wait_for(lambda: lib.has_named(lib.walk(session, entry), *MARKER), 10)
            time.sleep(3)
            before = app.command('metrics')['result']
            time.sleep(10)
            after = app.command('metrics')['result']
            lib.emit({'probe': 'cost', 'part': 'idle', 'mode': mode, 'seconds': 10, 'cpu_seconds': cpu_delta({'before': before, 'after': after}),
                      'working_set_kb': {m['type']: m['workingSetKb'] for m in after}}, out)


def summarize(out, part):
    import json
    rows = [json.loads(line) for line in open(out) if line.strip()]
    rows = [r for r in rows if r.get('part') == part and 'summary' not in r]
    modes = []
    for r in rows:
        if r['mode'] not in modes:
            modes.append(r['mode'])
    for mode in modes:
        mine = [r for r in rows if r['mode'] == mode]
        summary = {'probe': 'cost', 'part': part, 'mode': mode, 'summary': True, 'n': len(mine)}
        if part == 'startup':
            keys = ['ready_ms', 'did_finish_load_ms', 'ready_to_show_ms', 'registered_ms', 'first_tree_ms']
            values = lambda key: [r[key] for r in mine if r.get(key) is not None]
        else:
            keys = ['totalMs', 'buildMs', 'mutateMs', 'clearMs', 'cpu:Tab', 'cpu:Browser', 'cpu:GPU']
            def values(key):
                if key.startswith('cpu:'):
                    return [r['cpu_seconds'].get(key[4:]) for r in mine if r['cpu_seconds'].get(key[4:]) is not None]
                return [r['timings'][key] for r in mine]
        for key in keys:
            found = values(key)
            if found:
                summary[key] = {'median': round(statistics.median(found), 3), 'min': round(min(found), 3), 'max': round(max(found), 3)}
        lib.emit(summary, out)


if __name__ == '__main__':
    out = sys.argv[1]
    args = sys.argv[2:]
    n = int(args[args.index('--n') + 1]) if '--n' in args else 6
    parts = [a for a in args if a in ('startup', 'bench', 'idle')] or ['startup', 'bench', 'idle']
    for part in parts:
        try:
            {'startup': startup, 'bench': bench, 'idle': idle}[part](out, n)
        except Exception as error:
            lib.emit({'probe': 'cost', 'part': part, 'error': repr(error)[:300]}, out)
