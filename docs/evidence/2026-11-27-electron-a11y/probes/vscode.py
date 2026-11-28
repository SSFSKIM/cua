#!/usr/bin/env python3
"""#228 probe 11: what a person would see in VS Code (1.148.0, Electron 43.8.10) when its accessibility turns on.

VS Code is the vendor's package unpacked in the scratch, run with a temporary home, profile and extensions directory,
no network (a namespace with loopback only), IsEnabled on. cua's installed engine takes the pictures and reads the
tree, as it would for an agent:

  request   no flag. A picture and a read before anything; one Accessible.GetAttributes on the application root; a
            picture and a read 5 s and 15 s later.
  flag      started with --force-renderer-accessibility. A picture and a read.

A row has the engine's node count, every element whose name mentions a screen reader, where the picture went
(out/vscode-<variant>-<step>.jpg), and what the instance's argv.json says of force-renderer-accessibility at the end
(VS Code writes the flag there itself once it believes a screen reader is attached).

usage: vscode.py <out.jsonl> <apps root> [request|flag ...]
"""
import json
import os
import shutil
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib  # noqa: E402
from apps import FLAG, catalog, visible_windows  # noqa: E402
from engine import Engine, count  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'out')


def mentions(node, found=None):
    found = [] if found is None else found
    text = ' '.join(str(node.get(k) or '') for k in ('name', 'description', 'value'))
    if 'screen reader' in text.lower():
        found.append({'role': node.get('role'), 'name': (node.get('name') or '')[:120]})
    for child in node.get('children', []):
        mentions(child, found)
    return found


def look(engine, window, variant, step):
    answer, ms = engine.ask('get_window_state', {'window': window, 'include_screenshot': True})
    output = answer.get('output') or {}
    tree = output.get('ax_tree') or {}
    picture = None
    shots = output.get('screenshots') or []
    if shots and shots[0].get('filepath'):
        picture = f'vscode-{variant}-{step}.jpg'
        shutil.copy(shots[0]['filepath'], os.path.join(OUT, picture))
    return {'step': step, 'ok': answer.get('ok'), 'error': answer.get('error'), 'ms': ms, 'source': output.get('ax_tree_source'), 'nodes': count(tree) if tree else None,
            'truncated': output.get('truncated'), 'screen_reader_mentions': mentions(tree) if tree else None, 'picture': picture}


def run(out, apps, variant):
    with lib.Session(f'vscode-{variant}') as session:
        session.set_status('ScreenReaderEnabled', False)
        session.set_status('IsEnabled', True)
        session.a11y()
        argv = catalog(apps, session)['code'] + ([FLAG] if variant == 'flag' else [])
        argv = ['unshare', '--user', '--net', f'--map-user={os.getuid()}', f'--map-group={os.getgid()}', '--'] + argv
        app = session.spawn(argv, name='code')
        found, _ = lib.wait_for(lambda: visible_windows(session), 60, step=0.25)
        row = {'probe': 'vscode', 'variant': variant, 'status': session.status()}
        if not found:
            row['error'] = 'no window'
            lib.emit(row, out)
            return
        time.sleep(8)  # the workbench finishes loading
        window_id, pid = (visible_windows(session) or found)[-1]
        engine = Engine(session)
        try:
            listed, _ = engine.ask('list_windows', {})
            mine = [w for w in (listed.get('output') or []) if w.get('id') == window_id]
            if not mine:
                row['error'] = f'window {window_id} is not in the engine\'s list'
                row['listed'] = [{k: w.get(k) for k in ('id', 'app', 'title')} for w in (listed.get('output') or [])]
                lib.emit(row, out)
                return
            row['window'] = {k: mine[0].get(k) for k in ('id', 'app', 'title')}
            steps = [look(engine, mine[0], variant, 'start')]
            if variant == 'request':
                entry = lib.app_of(session, pid)
                row['kick'] = lib.kick(session, entry)
                time.sleep(5)
                steps.append(look(engine, mine[0], variant, 'after-5s'))
                time.sleep(10)
                steps.append(look(engine, mine[0], variant, 'after-15s'))
            row['steps'] = steps
        finally:
            engine.stop()
        # VS Code on Linux writes "force-renderer-accessibility": true into its argv.json once it believes a screen
        # reader is attached (workbench.contrib.linuxAccessibility), which then holds for every later start
        row['argv_json'] = {}
        for folder, _, files in os.walk(session.root):
            if 'argv.json' in files:
                path = os.path.join(folder, 'argv.json')
                text = open(path, errors='replace').read()
                row['argv_json'][os.path.relpath(path, session.root)] = [line.strip() for line in text.split('\n') if 'force-renderer-accessibility' in line]
        lib.emit(row, out)


if __name__ == '__main__':
    out, apps = sys.argv[1], sys.argv[2]
    for variant in ([a for a in sys.argv[3:]] or ['request', 'flag']):
        try:
            run(out, apps, variant)
        except Exception as error:
            lib.emit({'probe': 'vscode', 'variant': variant, 'error': repr(error)[:300]}, out)
