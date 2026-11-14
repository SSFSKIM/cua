# Item B's proof, read from a run's results.jsonl: every foreground sample (gnome-text-editor's), the sample before
# it, its foreground_start record, its witness, and any map or unmap inside its span. Any lane counts: a vendor build's
# gnome-text-editor sample that sees another client's unmap fails its strict witness just as cua's fails the allowance.
# usage: python3 -I analyze-b.py <results.jsonl> [--quiet]
import json
import sys

rows = [json.loads(line) for line in open(sys.argv[1])]
samples = [r for r in rows if r.get('kind') == 'sample']
stats = {'foreground': 0, 'after_chrome': 0, 'red': 0, 'red_after_chrome': 0, 'cua_red': 0, 'unmap_in_span': 0,
         'activated_front': 0, 'popups_at_start': 0, 'not_quiet': 0, 'max_waited_ms': 0}
prev = None
for s in samples:
    if s['scene'] == 'gnome-text-editor':
        stats['foreground'] += 1
        after_chrome = prev is not None and prev['scene'].startswith('chrome')
        stats['after_chrome'] += after_chrome
        start = s.get('foreground_start')
        if start:
            stats['activated_front'] += bool(start.get('activated_front'))
            stats['popups_at_start'] += start.get('popups_at_start', 0) > 0
            stats['not_quiet'] += start.get('quiet') is False
            if start.get('popups_at_start', 0) > 0:
                stats['max_waited_ms'] = max(stats['max_waited_ms'], start.get('waited_ms', 0))
        unmaps = [x for x in (s.get('witness_restacks') or []) if x.get('kind') in ('map', 'unmap')]
        red = s.get('witness') is False
        stats['red'] += red
        stats['red_after_chrome'] += red and after_chrome
        stats['cua_red'] += red and s['engine'] == 'cua'
        stats['unmap_in_span'] += bool(unmaps)
        if '--quiet' not in sys.argv and (after_chrome or red or unmaps or (start and start.get('popups_at_start'))):
            print(json.dumps({'block': s['block'], 'engine': s['engine'], 'i': s['i'], 'after': f"{prev['engine']}:{prev['scene']}" if prev else None, 'foreground_start': start, 'witness': s.get('witness'), 'fields': s.get('witness_fields'), 'map_unmap': unmaps[:4]}))
    prev = s
print(json.dumps(stats))
