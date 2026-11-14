#!/usr/bin/python3 -I
# Task 50: every row of a run's results.jsonl that carries a non-empty foreign finding (route audits, the harness's
# trace in the end row), printed with its kind, scene, op, engine and the findings only.
# usage: foreign-rows.py <results.jsonl>
import json, sys


def walk(o, path=''):
    if isinstance(o, dict):
        for k, v in o.items():
            if k == 'foreign' and v:
                yield path + '.' + k, v
            else:
                yield from walk(v, path + '.' + k)
    elif isinstance(o, list):
        for i, v in enumerate(o):
            yield from walk(v, f'{path}[{i}]')


for n, line in enumerate(open(sys.argv[1]), 1):
    r = json.loads(line)
    for where, v in walk(r):
        print(n, r.get('kind'), r.get('scene'), r.get('op'), r.get('engine'), r.get('block'), r.get('series'), r.get('i'), where, json.dumps(v)[:1500])
