#!/usr/bin/python3 -I
# Task 50: prints a guarded step's guard summary (wrap-summary.json) and the run's end row (results.jsonl), compactly.
# usage: summ.py <step dir>
import json, os, sys

d = sys.argv[1]
s = json.load(open(os.path.join(d, 'wrap-summary.json')))
print('exit', s['exit'], 'samples', s['samples'], 'maps', s['maps_samples'], 'ss', s['ss_samples'], 'processes', len(s['processes']), 'browsers', len(s['browsers']))
print('flags', s['flags'])
print('decoys', s['decoy_connections'])
print('leftovers', s['leftovers'])
print('xauthority', json.dumps(s['xauthority_by_class']))
print('outside peers', json.dumps(s['outside_peers_allowed'], indent=0))
print('home paths', json.dumps(s['home_paths_by_comm'], indent=0))
print('browser nss', json.dumps(s['browser_run_home_nss']), json.dumps(s['run_home_nss_dirs'])[:400])
profiles = {(b['kind'], b['type'], b['profile'] is not None, b['argv_has_profile']) for b in s['browsers']}
print('browser kinds', sorted(map(str, profiles)))
homes = {b['home'] for b in s['browsers'] if b['home']}
print('browser homes (readable)', sorted(homes)[:5])
res = os.path.join(d, 'run', 'results.jsonl')
if os.path.exists(res):
    for line in open(res):
        r = json.loads(line)
        if r.get('kind') in ('end', 'meta'):
            print(r['kind'], json.dumps(r)[:3000])
