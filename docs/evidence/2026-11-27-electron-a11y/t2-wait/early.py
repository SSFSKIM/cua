#!/usr/bin/env python3
"""#228 task 2, fix wave 1: the reads a Chromium window gives in the first moments after the request, caught by
walking its tree with no pause (`lib.walk`: role name, name, children; each failed node counted), so a shape between
the frame alone and the whole views tree shows if there is one. Each distinct shape is kept with its time and failed
count. Samples as `shapes.py`'s; each may be given as `<name>:<runs>`.

usage: early.py <out.jsonl> <apps dir> [sample[:runs] ...]
"""
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'probes'))
sys.path.insert(0, HERE)
import lib  # noqa: E402
import shapes  # noqa: E402


def sample(name, run, out, apps):
    session = lib.Session(f't180-early-{name}-{run}')
    session.start()
    session.set_status('ScreenReaderEnabled', False)
    session.set_status('IsEnabled', True)
    session.a11y()
    try:
        proc = session.spawn(shapes.argv_of(name, session, apps), name=name)
        lib.wait_for(lambda: session.windows_of(proc.pid), 60)
        app, _ = lib.wait_for(lambda: [a for a in lib.registry(session) if a.get('toolkit') == 'Chromium'], 30)
        app = app[0] if app else None
        time.sleep(3)
        row = {'name': name, 'run': run, 'app': app}
        if app:
            row['kick'] = lib.kick(session, app)
            started = time.time()
            seen = []
            last = None
            while time.time() - started < 0.5:
                walked = lib.walk(session, app)
                signature = (walked['nodes'], walked['failed'], tuple(r[:2] for r in walked['rows']))
                if signature != last:
                    seen.append({'ms': round((time.time() - started) * 1000, 1), 'nodes': walked['nodes'], 'failed': walked['failed'],
                                 'tree': lib.render(walked, 80)})
                    last = signature
            row['shapes'] = seen
        lib.emit(row, out)
    finally:
        session.stop()


if __name__ == '__main__':
    out, apps = sys.argv[1], os.path.abspath(sys.argv[2])
    planned = []
    for spec in sys.argv[3:]:
        name, _, runs = spec.partition(':')
        if not (runs or '1').isdigit() or int(runs or 1) < 1:
            sys.exit(f'{spec}: the runs must be a whole number, at least 1')
        planned.append((name, int(runs or 1)))
    for name, runs in planned:
        for run in range(1, runs + 1):
            sample(name, run, out, apps)
