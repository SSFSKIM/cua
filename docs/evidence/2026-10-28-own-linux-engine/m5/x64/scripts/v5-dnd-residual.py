#!/usr/bin/env python3
# Task 89: for every cua sample of a V5 cell, the engine's own timings: elapsed (receipt to answer), the wall press to
# release, the settle after an in-time cancel, and what is left (elapsed - (release - press) - settle): the time before
# the press and after the release (and settle), which bounds where the answer lies against the release.
# usage: v5-dnd-residual.py <results.jsonl[.gz]> <op>
import gzip, json, sys
path, op = sys.argv[1], sys.argv[2]
opener = gzip.open if path.endswith('.gz') else open
with opener(path, 'rt') as f:
    for line in f:
        r = json.loads(line)
        if r.get('kind') != 'sample' or r.get('engine') != 'cua' or r.get('op') != op:
            continue
        e = r.get('engine_stats') or {}
        w = e.get('wall') or {}
        d = e.get('dnd') or {}
        el = e.get('elapsed_ms')
        span = (w['release_ms'] - w['press_ms']) if w.get('press_ms') and w.get('release_ms') else None
        st = d.get('settle_ms') or 0
        left = round(el - span - st, 2) if el is not None and span is not None else None
        print(f"{r.get('block')}/{r.get('i')} {r.get('series'):4} ok={r.get('ok')!s:5} outcome={d.get('outcome')} elapsed={el} press->release={round(span, 2) if span else None} settle={round(st, 1)} left={left} late={json.dumps(e.get('late_dnd'))}")
