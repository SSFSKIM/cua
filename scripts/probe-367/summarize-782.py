# Read downloaded hosted artifacts as data; never run from an artifact directory.
import json
import pathlib
import shutil
import sys

if len(sys.argv) != 4:
    raise SystemExit("usage: summarize-782.py <artifact-root> <output-directory> <run-url>")
root, out, url = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]), sys.argv[3]
out.mkdir(parents=True, exist_ok=True)
rows = []

def clean(value):
    return str(value if value is not None else 'none').replace('|', '/').replace('\n', ' ')

def table(headers, values):
    return '\n'.join('| ' + ' | '.join(map(clean, row)) + ' |' for row in [headers, ['---'] * len(headers), *values])

def placement(info):
    pinned = info['pinnedWindowServer']
    return {'activeSpace': info['activeSpace'], 'windowSpaces': pinned['spaces'], 'frame': pinned['cgBounds'],
            'frontmost': info['frontmost'], 'inOnscreenList': pinned['inOnscreenList'],
            'allCGOnscreen': pinned['allCGOnscreen'], 'includingCGOnscreen': pinned['includingCGOnscreen'], 'AXWindowsCount': len(info.get('windows', []))}

def response(call, kind):
    text = call.get('value') if isinstance(call.get('value'), str) else '\n'.join(call.get('emitted', []))
    return {'ok': call['ok'], 'answer': kind if call['ok'] else 'throws', 'error': call.get('error'), 'text': text,
            'placementLine': next((line for line in text.splitlines() if line.startswith('[window')), None),
            'screenshotOmitted': call.get('meta', {}).get('cua/screenshotOmitted'), 'elapsedMs': call['elapsedMs']}

for head in ('main', 'fix'):
    for row in json.loads((root / head / 'results.json').read_text()):
        assert row['onlyOtherSpace'] and row['assertionFailures'] == []
        for group in ('onScreenControlAssertions', 'anotherRaiseAssertions'):
            assert all(value is True for value in row[group].values())
        record = {'head': head, 'sha': row['sha'], 'app': row['scene'], 'windowNumber': row['windowNumber'],
                  'otherSpace': {name: response(row[key], kind) for name, key, kind in (
                      ('getApp', 'anotherGetApp', 'bound App; initial observation emitted'),
                      ('getAXState', 'another', 'state text'), ('getScreenshot', 'anotherScreenshot', 'JPEG bytes'),
                      ('Raise', 'anotherRaise', 'success (undefined)'))},
                  'beforeObservation': placement(row['anotherSpaceOracle']['value']),
                  'afterGetApp': placement(row['anotherGetAppAfter']), 'afterGetAXState': placement(row['anotherAfter']),
                  'afterGetScreenshot': placement(row['anotherScreenshotAfter']),
                  'beforeRaise': placement(row['anotherRaiseBefore']), 'afterRaise': placement(row['anotherRaiseAfter']),
                  'controlOrder': 'after other-Space cell' if 'onScreenControlState' in row else 'before other-Space cell',
                  'observationNamedRefusals': [name for name, key in [('getApp','anotherGetApp'),('getAXState','another'),('getScreenshot','anotherScreenshot')] if (row[key].get('error') or {}).get('errorName') == 'windowOnAnotherSpace'],
                  'assertions': row['anotherRaiseAssertions'],
                  'control': {'observation': response(row.get('onScreenControlState', row['baseline']), 'state text'), 'Raise': response(row['onScreenRaise'], 'success (undefined)'),
                              'afterObservation': response(row['onScreenAfter'], 'state text'),
                              'before': placement(row['onScreenRaiseBefore']), 'after': placement(row['onScreenRaiseAfter']),
                              'assertions': row['onScreenControlAssertions']}}
        rows.append(record)
    target = out / head
    target.mkdir(exist_ok=True)
    for image in (root / head).glob('*.jpg'):
        shutil.copyfile(image, target / image.name)
for filename in ('setup.json', 'fixture.json'):
    if (root / filename).is_file():
        shutil.copyfile(root / filename, out / filename)
summary = {'run': url, 'rows': rows, 'timing': 'Direct performance.now() around each awaited public API call; excludes report/file serialization after the call.'}
(out / 'ruling-782.json').write_text(json.dumps(summary, indent=2) + '\n')
text = '# #367 ruling 782 targeted rerun\n\nRun: ' + url + '\n\n'
text += table(['Head / app', 'Product SHA'], [[r['head'] + ' / ' + r['app'], r['sha']] for r in rows]) + '\n\n'
text += 'Missing-primary-AX observation-refusal branch: ' + ('observed in ' + ', '.join(r['app'] + ' (' + '/'.join(r['observationNamedRefusals']) + ')' for r in rows if r['head'] == 'fix' and r['observationNamedRefusals']) if any(r['head'] == 'fix' and r['observationNamedRefusals'] for r in rows) else 'not observed on the fix in this run; successful AX-readable observations do not exercise this conditional path') + '.\n\n'
text += 'Control order: ' + ', '.join(sorted(set(r['controlOrder'] for r in rows))) + '. AXWindows enumeration can be empty even when the engine still reads a primary window through AXFocusedWindow/AXMainWindow; the list alone is not proof that the absence-refusal branch executed.\n\n'
text += '## Other-Space public calls\n\n'
text += table(['Head / app', 'Call', 'Answer', 'Error name', 'Exact error text or placement line', 'Elapsed ms', 'screenshotOmitted'], [
    [r['head'] + ' / ' + r['app'], name, call['answer'], (call.get('error') or {}).get('errorName'),
     (call.get('error') or {}).get('message') or call['placementLine'] or '(full successful state text is retained in ruling-782.json)',
     round(call['elapsedMs'], 3), call['screenshotOmitted']]
    for r in rows for name, call in r['otherSpace'].items()]) + '\n\n'
text += '## Independent Raise before/after\n\n'
text += table(['Head / app', 'Active Space', 'Window Spaces', 'CG frame', 'Frontmost', 'On-screen-only membership', 'Assertions'], [
    [r['head'] + ' / ' + r['app'], str(r['beforeRaise']['activeSpace']) + ' → ' + str(r['afterRaise']['activeSpace']),
     str(r['beforeRaise']['windowSpaces']) + ' → ' + str(r['afterRaise']['windowSpaces']),
     str(r['beforeRaise']['frame']) + ' → ' + str(r['afterRaise']['frame']),
     str(r['beforeRaise']['frontmost']) + ' → ' + str(r['afterRaise']['frontmost']),
     str(r['beforeRaise']['inOnscreenList']) + ' → ' + str(r['afterRaise']['inOnscreenList']), 'all pass'] for r in rows]) + '\n\n'
text += '## On-screen controls\n\n'
text += table(['Head / app', 'Observation before Raise', 'Raise', 'Observation after Raise', 'Placement / frontmost'], [
    [r['head'] + ' / ' + r['app'], 'success ' + str(round(r['control']['observation']['elapsedMs'], 3)) + 'ms',
     'success ' + str(round(r['control']['Raise']['elapsedMs'], 3)) + 'ms',
     'success ' + str(round(r['control']['afterObservation']['elapsedMs'], 3)) + 'ms', 'unchanged; all assertions pass'] for r in rows]) + '\n\n'
text += 'Times are direct public-call measurements. Successful getApp/getAXState full text, exact errors, metadata, raw before/after records and assertions are retained in ruling-782.json and independent-evidence.json. Endpoint samples are1.6s after each attempted public Raise; no continuous transient-Space trace is claimed. Off-display, partial, hidden and cost cells were not run. Native Electron code and product sources were unmodified; only the previously reviewed owned-fixture setup code was present.\n'
(out / 'tables.txt').write_text(text)
print('wrote', out, 'with', len(rows), 'app/head records')
