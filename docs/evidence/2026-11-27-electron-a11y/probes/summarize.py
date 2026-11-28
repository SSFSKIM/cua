#!/usr/bin/env python3
"""Writes out/summary.md from the probes' rows: one table per probe, every number taken from the .jsonl files beside it.

usage: summarize.py   (reads and writes ../out)
"""
import json
import os
import statistics

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'out')


def rows(name):
    path = os.path.join(OUT, name + '.jsonl')
    return [json.loads(line) for line in open(path)] if os.path.exists(path) else []


def yes(value):
    return 'yes' if value else ('no' if value is not None else '')


def cell(value):
    # a cell's own pipes would end it
    return '' if value is None else str(value).replace('|', '/')


def table(lines, head, body):
    lines += ['| ' + ' | '.join(head) + ' |', '|' + '---|' * len(head)]
    lines += ['| ' + ' | '.join(cell(c) for c in row) + ' |' for row in body]
    lines.append('')


def switches(status):
    return ('on' if status.get('IsEnabled') else 'off') + ' / ' + ('on' if status.get('ScreenReaderEnabled') else 'off') if status else ''


def main():
    lines = ['# #228 probes: the rows, as tables', '',
             'Written by `probes/summarize.py` from the `.jsonl` files in this directory; each table names its file. Times are milliseconds.', '']

    lines += ['## 1. At launch: the Electron fixture (`matrix.jsonl`)', '',
              'Switches are `IsEnabled / ScreenReaderEnabled` as read back before the launch. "Nodes" is a structural read (role name, name, children). "After the request" is one',
              '`Accessible.GetAttributes` on the application root; "app says" is the fixture\'s own record of `app.isAccessibilitySupportEnabled()`.', '']
    body = []
    for r in rows('matrix'):
        if 'error' in r:
            body.append([r['condition'], 'error: ' + r['error']])
            continue
        log = r.get('fixture_accessibility_log') or []
        says = ', then '.join(str(x['enabled']).lower() for x in log)
        body.append([r['condition'], ' '.join(f'{k}={v}' for k, v in r['env'].items()) + ' ' + ' '.join(r['args']), switches(r.get('status_at_launch')),
                     yes(r.get('registered')), (r.get('read1') or {}).get('nodes'), yes((r.get('read1') or {}).get('button')) if r.get('read1') else '',
                     r.get('kick_tree_ms') if r.get('kick') else ('not sent' if r.get('registered') else ''), (r.get('read3') or {}).get('nodes'), says])
    table(lines, ['condition', 'variable and arguments', 'switches', 'on the bus', 'nodes', 'page button', 'button after the request, ms', 'nodes after', 'app says'], body)

    lines += ['## 2. On a running app (`running.jsonl`)', '']
    body = []
    for r in rows('running'):
        if 'step' not in r:
            body.append([r['scenario'], 'error: ' + str(r.get('error'))])
            continue
        mode = r.get('mode') or {}
        body.append([r['scenario'], r['step'], switches(r.get('status')), yes(r.get('registered')) if 'registered' in r else '', r.get('nodes'),
                     yes(r.get('marker')) if 'marker' in r else (yes(r.get('nodes') and r['nodes'] > 2) if r.get('tree_ms') is not None else ''), r.get('tree_ms'),
                     ', '.join(mode.get('features') or []) if mode else '', cell(mode.get('enabled')).lower() if mode else ''])
    table(lines, ['scenario', 'step', 'switches', 'on the bus', 'nodes', 'page button', 'button after, ms', 'the app\'s mode (`getAccessibilitySupportFeatures`)', '`isAccessibilitySupportEnabled`'], body)

    lines += ['## 3. Cost on the probe app (`cost.jsonl`)', '', '**Startup**, N fresh launches per mode, times from the spawn: median (min to max).', '']
    body = []
    for r in rows('cost'):
        if r.get('summary') and r['part'] == 'startup':
            fmt = lambda k: f"{r[k]['median']:.0f} ({r[k]['min']:.0f} to {r[k]['max']:.0f})" if k in r else ''
            body.append([r['mode'], r['n'], fmt('ready_ms'), fmt('did_finish_load_ms'), fmt('ready_to_show_ms'), fmt('registered_ms'), fmt('first_tree_ms')])
    table(lines, ['mode', 'N', 'app ready', 'page loaded', 'window shown', 'on the bus', 'page button in a read'], body)
    lines += ['**The DOM benchmark** (2,000 rows built, rewritten 5 times, cleared), N runs after a warm-up: median (min to max). CPU seconds are the process\'s own, over the benchmark and 1.5 s after it.', '']
    body = []
    memory = {}
    for r in rows('cost'):
        if r.get('part') == 'bench' and not r.get('summary') and 'error' not in r:
            memory.setdefault(r['mode'], []).append(r['working_set_kb'])
    for r in rows('cost'):
        if r.get('summary') and r['part'] == 'bench':
            fmt = lambda k, d=0: f"{r[k]['median']:.{d}f} ({r[k]['min']:.{d}f} to {r[k]['max']:.{d}f})" if k in r else ''
            last = memory.get(r['mode'], [{}])[-1]
            body.append([r['mode'], r['n'], fmt('totalMs'), fmt('buildMs'), fmt('mutateMs'), fmt('cpu:Tab', 2), fmt('cpu:Browser', 2),
                         f"{last.get('Tab', 0) / 1024:.0f}", f"{last.get('Browser', 0) / 1024:.0f}"])
    table(lines, ['mode', 'N', 'page total', 'build', 'rewrite', 'renderer CPU s', 'browser CPU s', 'renderer MB after', 'browser MB after'], body)
    lines += ['**Idle**, 10 s with nothing happening: CPU seconds per process.', '']
    body = [[r['mode'], r['cpu_seconds'].get('Browser'), r['cpu_seconds'].get('Tab'), r['cpu_seconds'].get('GPU')] for r in rows('cost') if r.get('part') == 'idle']
    table(lines, ['mode', 'browser', 'renderer', 'GPU'], body)

    lines += ['## 4. cua-engine on the fixture (`engine.jsonl`)', '']
    body = []
    for r in rows('engine'):
        for i, read in enumerate(r.get('reads', [])):
            body.append([r['state'], r['engine'] if i == 0 else '', i + 1, read.get('source'), read.get('nodes'), json.dumps(read.get('truncated')) if read.get('truncated') else '', read.get('ms')])
        if 'error' in r:
            body.append([r['state'], 'error: ' + r['error']])
    table(lines, ['state', 'engine', 'read', '`ax_tree_source`', 'nodes', '`truncated`', 'ms'], body)

    lines += ['## 5. Other applications on the same bus (`others.jsonl`)', '', 'Per application: on the bus (nodes in a structural read) / CPU seconds so far / resident MB.', '']
    names = ['gedit (GTK 3)', 'gnome-text-editor (GTK 4)', 'kate (Qt 5)', 'qtcreator (Qt 6)', 'fixture (Electron)']
    body = []
    for r in rows('others'):
        if 'error' in r:
            body.append([r['scenario'], 'error: ' + r['error']])
            continue
        cells = []
        for name in names:
            a = r['apps'].get(name, {})
            usage = a.get('usage') or {}
            cells.append((f"yes ({a.get('nodes')})" if a.get('registered') else 'no') + f" / {usage.get('cpu_s')} / {usage.get('rss_mb')}")
        body.append([r['scenario'], r['step'], ' '.join(f'{k}={v}' for k, v in (r.get('env') or {}).items()), switches(r.get('status'))] + cells)
    table(lines, ['scenario', 'step', 'variable', 'switches'] + names, body)

    lines += ['## 6. Chrome, an instance of the run\'s own (`chrome.jsonl`)', '']
    body = []
    for r in rows('chrome'):
        before, after = r.get('before') or {}, r.get('after') or {}
        role = next((part.replace('WM_WINDOW_ROLE(STRING) = ', '') for part in (r.get('window') or '').split(' | ') if part.startswith('WM_WINDOW_ROLE(STRING)')), '')
        klass = (r.get('window') or '').split(' | ')[0].replace('WM_CLASS(STRING) = ', '')
        body.append([r.get('version'), klass, role, yes(r.get('registered')), r.get('toolkit'), r.get('app_name'), before.get('nodes'),
                     json.dumps(before.get('roles_top')), yes(r.get('page_button_before')), r.get('page_button_ms'), after.get('nodes'), yes(r.get('closed_by_shortcut')), r.get('chrome_processes_left')])
    table(lines, ['version', 'class', 'role', 'on the bus', 'toolkit', 'name', 'nodes, no flag', 'roles', 'page button', 'button after the request, ms', 'nodes after', 'closed by shortcut', 'Chrome processes left'], body)

    lines += ['## 7. Real applications (`apps.jsonl`, and `apps-nwjs-forced.jsonl` for the last row)', '',
              'Each started once with IsEnabled on, no flag, no network; the last row is NW.js again with `ACCESSIBILITY_ENABLED=1` and `--force-renderer-accessibility`.',
              '"Chromium files" is the check of the running executable\'s directory (detect.py\'s D3). `apps-first-run.jsonl` is an earlier run of the same probe, kept for its',
              'timings (VS Code: the document 680 ms after the request, the tree still growing until 2,146 ms); its `child_types` is empty by a parsing fault since fixed, and its',
              '`screen_reader_optimized` matched the editor\'s own label, not the mode.', '']
    body = []
    for r in rows('apps') + [dict(r, sample=r['sample'] + ', variable and flag') for r in rows('apps-nwjs-forced')]:
        checks = r.get('file_checks') or {}
        window = r.get('window') or ''
        klass = window.split(' | ')[0].replace('WM_CLASS(STRING) = ', '') if window else ''
        role = next((p.replace('WM_WINDOW_ROLE(STRING) = ', '') for p in window.split(' | ') if p.startswith('WM_WINDOW_ROLE(STRING)')), '')
        kids = r.get('children') or {}
        note = r.get('error') or ''
        if r.get('dialog_first'):
            note = (note + '; ' if note else '') + 'a GTK dialog first: ' + r['dialog_first'].split('_NET_WM_NAME(UTF8_STRING) = ')[-1]
        if r.get('registry'):
            note += '; on the bus all the same: ' + ', '.join(f"{a['name']} ({a['toolkit']})" for a in r['registry'])
        body.append([r['sample'], (checks.get('electron_version') or '') + ' ' + (checks.get('chrome_version') or ''), note, klass, role, yes(r.get('registered')) if 'registered' in r else '',
                     r.get('toolkit'), r.get('app_name'), (r.get('before') or {}).get('nodes'), r.get('document_ms'), r.get('stable_ms'), (r.get('after') or {}).get('nodes'),
                     yes(checks.get('chromium')) if checks else '', json.dumps(kids.get('types')) + f", {kids.get('unreadable')} unreadable" if kids else ''])
    table(lines, ['sample', 'Electron and Chromium', 'note', 'class', 'role', 'on the bus', 'toolkit', 'name on the bus', 'nodes before', 'document after the request, ms', 'stable, ms', 'nodes after',
                  'Chromium files', 'children by `--type=`'], body)

    lines += ['## 8. Older Electron builds, the probe app (`versions.jsonl`)', '']
    body = []
    for r in rows('versions'):
        after = r.get('mode_after') or {}
        body.append([r.get('electron'), r.get('chrome'), 'IsEnabled on, no variable' if r.get('mode') == 'switch' else 'switches off, ACCESSIBILITY_ENABLED=1', r.get('error') or '', yes(r.get('registered')) if 'registered' in r else '',
                     (r.get('before') or {}).get('nodes'), r.get('tree_ms'), r.get('after_nodes'), cell(after.get('enabled')).lower(), ', '.join(after.get('features') or []) if after.get('features') is not None else ('not offered' if after else '')])
    table(lines, ['Electron', 'Chromium', 'started with', 'error', 'on the bus', 'nodes before', 'button after the request, ms', 'nodes after', '`isAccessibilitySupportEnabled` after', 'features after'], body)

    lines += ['## 9. The launch route (`launch.jsonl`)', '']
    body = []
    for r in rows('launch'):
        names = [n for n in r.get('app_environment_names', []) if 'ACCESS' in n]
        gio = f"exit {r.get('gio_exit')} after {r.get('gio_ms')} ms" if 'gio_exit' in r else (r.get('answer') or '')
        body.append([r['condition'], switches(r.get('status')), r.get('error') or '', gio, ', '.join(names), yes(r.get('registered')) if 'registered' in r else '', r.get('before_nodes'), r.get('kick_tree_ms'), r.get('after_nodes')])
    table(lines, ['condition', 'switches', 'error', '`gio launch`', 'accessibility variables the app got', 'on the bus', 'nodes', 'button after the request, ms', 'nodes after'], body)

    lines += ['## 10. VS Code, through cua-engine (`vscode.jsonl`)', '']
    body = []
    for r in rows('vscode'):
        for s in r.get('steps', []):
            mentions = '; '.join(f"{m['role']}: {m['name']}" for m in (s.get('screen_reader_mentions') or [])[:3])
            body.append([r['variant'], s['step'], s.get('source'), s.get('nodes'), mentions, s.get('picture')])
        body.append([r['variant'], 'argv.json at the end', '', '', json.dumps(r.get('argv_json')), ''])
        if 'error' in r:
            body.append([r['variant'], 'error: ' + r['error'], '', '', '', ''])
    table(lines, ['variant', 'step', 'source', 'nodes', 'elements that mention a screen reader', 'picture'], body)

    lines += ['## 11. Before launch, from files (`detect.jsonl`)', '', 'D1 `resources/app.asar` beside the executable; D2 the executable holds `ELECTRON_RUN_AS_NODE`; D3 Chromium\'s runtime files beside it.', '']
    body = []
    for r in rows('detect'):
        body.append([r['sample'], r['truth'], (r.get('exec') or r.get('program') or '')[:60], r['elf'], r.get('via'), yes(r.get('asar')) if r.get('asar') is not None else '',
                     yes(r.get('marker')) if r.get('marker') is not None else '', yes(r.get('chromium')) if r.get('chromium') is not None else '',
                     (r.get('electron_version') or '') + ' ' + (r.get('chrome_version') or '')])
    table(lines, ['sample', 'is', 'Exec or program', 'program is', 'executable found through', 'D1', 'D2', 'D3', 'versions in the files'], body)

    lines += ['## 12. What setting the switches writes (`switch.jsonl`)', '']
    body = [[r['step'], switches(r.get('status')), (r.get('gsettings') or {}).get('toolkit-accessibility'), (r.get('gsettings') or {}).get('screen-reader-enabled')] for r in rows('switch') if 'gsettings' in r]
    table(lines, ['step', 'switches', '`org.gnome.desktop.interface toolkit-accessibility`', '`org.gnome.desktop.a11y.applications screen-reader-enabled`'], body)

    lines += ['## 13. Read from files (`facts.jsonl`)', '', 'How often each variable\'s name occurs in a library or executable, and what the Chromium-family ones link.', '']
    facts = rows('facts')
    linked = {r['what']: ', '.join(r['links']) for r in facts if r.get('part') == 'bridge'}
    body = []
    for r in facts:
        if r.get('part') == 'variables':
            o = r.get('occurrences') or {}
            body.append([r['what'], o.get('ACCESSIBILITY_ENABLED'), o.get('GNOME_ACCESSIBILITY'), o.get('QT_ACCESSIBILITY'), o.get('SAL_ACCESSIBILITY_ENABLED'), linked.get(r['what'], '')])
    table(lines, ['file of', '`ACCESSIBILITY_ENABLED`', '`GNOME_ACCESSIBILITY`', '`QT_ACCESSIBILITY`', '`SAL_ACCESSIBILITY_ENABLED`', 'links (ATK and AT-SPI libraries)'], body)
    for r in facts:
        if r.get('part') == 'session':
            lines += [f"- `{r['file']}` ({r['owner'].split(':')[0]}): `{'; '.join(r['lines'][:2])}`."]
        elif r.get('part') == 'wrapper':
            lines += [f"- `google-chrome` on PATH is `{r['google_chrome_on_path']}`: `{(r.get('content') or [''])[-1]}`."]
        elif r.get('part') == 'entries':
            lines += [f"- The samples' desktop entries ({r['entries']} files of {r['samples']} samples): DBusActivatable in {len(r['dbus_activatable'])}, the word Electron in {len(r['name_electron'])}."]
        elif r.get('part') == 'engine':
            lines += [f"- `{r['source']}`: lines outside comments that name `GetAttributes` or `GetRelationSet`: {len(r['lines_naming_either_request_outside_comments'])}."]
        elif r.get('part') == 'dconf':
            lines += [f"- The person's dconf file was last written {r['person_dconf_file_mtime']} (read {r['read_at']}, after every probe)."]
    lines.append('')

    with open(os.path.join(OUT, 'summary.md'), 'w') as f:
        f.write('\n'.join(lines))
    print(f'summary.md: {len(lines)} lines')


if __name__ == '__main__':
    main()
