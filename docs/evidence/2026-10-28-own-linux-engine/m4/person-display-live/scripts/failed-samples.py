#!/usr/bin/python3 -I
# Task 50: the samples of one scene and op of a run's results.jsonl for one engine, without the stacking lists, for
# reading a failed verdict.
# usage: failed-samples.py <results.jsonl> <scene> <op> <engine>
import json, sys

res, scene, op, engine = sys.argv[1:5]
for line in open(res):
    r = json.loads(line)
    if r.get('kind') == 'sample' and r.get('scene') == scene and r.get('op') == op and r.get('engine') == engine:
        r['witness_changes'] = [{k: v for k, v in c.items() if k not in ('from', 'to')} for c in r.get('witness_changes', [])]
        keep = {k: v for k, v in r.items() if k not in ('run', 'kind', 'scene', 'op', 'engine', 'digest')}
        print(json.dumps(keep)[:1400])
