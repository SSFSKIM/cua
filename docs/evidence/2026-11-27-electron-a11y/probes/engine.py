#!/usr/bin/env python3
"""#228 probe 7: what cua's own engine answers for the Electron fixture in each state.

The engine is the installed cua-engine (PROBE_ENGINE, else the cua home's), started as the service starts it
(`cua-engine server --desktop dedicated`) on the private session, one engine per state. For each state it lists the
windows, finds the fixture's, and asks get_window_state without a screenshot twice. A row has the tree's source, its
node count, its top of tree, `truncated`, and the time the request took.

  bridge-off        both switches off: the app is not on the bus
  bridge-on         IsEnabled on, nothing else
  bridge-on+kick    the same, then one Accessible.GetAttributes from the probe (not from the engine), then the engine
  flag              IsEnabled on and --force-renderer-accessibility

usage: engine.py <out.jsonl>
"""
import json
import os
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib  # noqa: E402

ENGINE = os.environ.get('PROBE_ENGINE', '/Users/new/.local/share/cua/engine/linux/cua-engine')
FLAG = '--force-renderer-accessibility'


class Engine:
    def __init__(self, session):
        self.proc = subprocess.Popen([ENGINE, 'server', '--desktop', 'dedicated'], env=session.env(), stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                     stderr=subprocess.DEVNULL, start_new_session=True, text=True)
        self.next = 0

    def ask(self, command, payload):
        self.next += 1
        started = lib.now_ms()
        self.proc.stdin.write(json.dumps({'id': self.next, 'command': command, 'input': payload}) + '\n')
        self.proc.stdin.flush()
        line = self.proc.stdout.readline()
        return json.loads(line), round(lib.now_ms() - started, 1)

    def stop(self):
        lib.Session.stop_group(self.proc, grace=2)


def count(node):
    return 1 + sum(count(child) for child in node.get('children', []))


def top(node, depth=0, lines=None, limit=14):
    lines = [] if lines is None else lines
    if len(lines) < limit:
        lines.append(f"{'  ' * depth}{node.get('role')} {json.dumps(node.get('name', ''))}")
        for child in node.get('children', []):
            top(child, depth + 1, lines, limit)
    return lines


def state(out, name, bridge, args=(), kick=False):
    with lib.Session(f'engine-{name[:14].replace("+", "-")}') as session:
        session.set_status('ScreenReaderEnabled', False)
        session.set_status('IsEnabled', bridge)
        session.a11y()
        app = session.spawn(lib.fixture_argv(session, args), name='fixture')
        lib.wait_for(lambda: session.windows_of(app.pid), 20)
        time.sleep(2)
        row = {'probe': 'engine', 'state': name, 'status': session.status(), 'args': list(args), 'engine': subprocess.run([ENGINE, '--version'], capture_output=True, text=True).stdout.strip()}
        if kick:
            entry = lib.app_of(session, app.pid)
            row['kick'] = lib.kick(session, entry)
            time.sleep(1)
        engine = Engine(session)
        try:
            listed, _ = engine.ask('list_windows', {})
            windows = listed.get('output') or []
            mine = [w for w in windows if 'fixture' in json.dumps(w).lower()]
            row['listed'] = [{k: w.get(k) for k in ('id', 'app', 'title')} for w in windows][:6]
            if not mine:
                row['error'] = 'the fixture window is not listed'
            else:
                reads = []
                for _ in range(2):
                    answer, ms = engine.ask('get_window_state', {'window': mine[0], 'include_screenshot': False})
                    output = answer.get('output') or {}
                    tree = output.get('ax_tree') or {}
                    reads.append({'ok': answer.get('ok'), 'error': answer.get('error'), 'ms': ms, 'source': output.get('ax_tree_source'),
                                  'nodes': count(tree) if tree else None, 'truncated': output.get('truncated'), 'top': top(tree) if tree else None,
                                  'keys': sorted(output.keys())})
                    time.sleep(0.5)
                row['reads'] = reads
        finally:
            engine.stop()
        lib.emit(row, out)


if __name__ == '__main__':
    out = sys.argv[1]
    for name, bridge, args, kick in (('bridge-off', False, (), False), ('bridge-on', True, (), False), ('bridge-on+kick', True, (), True), ('flag', True, (FLAG,), False)):
        try:
            state(out, name, bridge, args, kick)
        except Exception as error:
            lib.emit({'probe': 'engine', 'state': name, 'error': repr(error)[:300]}, out)
