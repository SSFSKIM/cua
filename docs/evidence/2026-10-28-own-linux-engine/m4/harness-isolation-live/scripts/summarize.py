#!/usr/bin/python3 -I
# Task 46: one line per guarded session (wrap-summary.json): processes, samples, stop flags, decoy connections,
# leftovers, any Chromium-like process, and the person's-home paths any run process held open.
import json, sys

for d in sys.argv[1:]:
    s = json.load(open(f'{d}/wrap-summary.json'))
    chromium = [p['argv'][:80] for p in s['processes'] if 'chrom' in p['argv'].lower() or 'electron' in p['argv'].lower()]
    print(json.dumps({'run': d.rstrip('/').split('/')[-1], 'exit': s['exit'], 'processes': len(s['processes']), 'samples': s['samples'], 'ss_samples': s['ss_samples'], 'gap_ms': s['sample_gap_ms'], 'flags': s['flags'], 'decoy_connections': s['decoy_connections'], 'leftovers': s['leftovers'], 'chromium_like': chromium, 'home_paths': s['home_paths_by_comm']}))
