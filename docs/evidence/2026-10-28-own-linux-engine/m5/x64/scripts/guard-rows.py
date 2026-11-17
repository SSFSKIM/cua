#!/usr/bin/env python3
# Task 89: the README's guard rows for each :0 step: wrap71's samples, flags, decoy connections and leftovers
# (wrap-summary.json), owner-watch's last line, owner-diff's differing lines, and the pointer's restore line.
# usage: guard-rows.py <label> <step dir>...   (label names the attempt, e.g. "sitting 1")
import json, os, sys
label = sys.argv[1]
for d in sys.argv[2:]:
    step = os.path.basename(d).split('.')[0]
    try:
        s = json.load(open(os.path.join(d, 'wrap-summary.json')))
    except Exception:
        print(f'| {step} ({label}) | – | – | – | not run | | | |')
        continue
    rd = lambda f: open(os.path.join(d, f)).read() if os.path.exists(os.path.join(d, f)) else ''
    watch = (rd('owner-watch.log').strip().split('\n') or [''])[-1]
    watch = watch.split('Z ', 1)[-1] if 'Z ' in watch else watch
    diff = [l[2:] for l in rd('owner-diff.txt').split('\n') if l.startswith('> ')]
    diff = '; '.join(x.split(' ')[0] + ' ' + x.split(' ')[1] for x in diff) if diff else 'none'
    ptr = [l for l in rd('pointer.txt').split('\n') if 'restored' in l]
    left = ', '.join(f"{x['pid']} {x['comm']}" for x in s.get('leftovers', [])) or 'none'
    print(f"| {step} ({label}) | {s.get('samples')} | {len(s.get('flags', []))} | {len(s.get('decoy_connections', []))} | {left} | {watch} | {diff} | {(ptr[0].strip() if ptr else 'no restore line')} |")
