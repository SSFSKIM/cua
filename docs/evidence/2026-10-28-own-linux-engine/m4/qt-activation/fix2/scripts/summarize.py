#!/usr/bin/env python3
"""The survey's table (task 61, fix 2): per application, its windows by place and whether each carries _XEMBED_INFO.
usage: summarize.py <survey.jsonl>..."""
import collections
import json
import sys

apps = collections.OrderedDict()
for path in sys.argv[1:]:
    for line in open(path):
        if not line.startswith('{'):
            continue
        r = json.loads(line)
        a = apps.setdefault(r['app'], {'version': r['version'], 'error': False, 'n': collections.Counter(), 'values': set()})
        if 'error' in r:
            a['error'] = True
            continue
        has = r['xembed'] is not None
        a['n'][(r['where'], has)] += 1
        if has:
            a['values'].add(r['xembed'])


def cell(a, where):
    yes, no = a['n'][(where, True)], a['n'][(where, False)]
    return f'{yes} of {yes + no}' if yes + no else '-'


print('| Family (application) | Version | Top-levels with it | Children with it | Other windows of the client with it | Value |')
print('|---|---|---|---|---|---|')
for name, a in apps.items():
    if a['error'] and not a['n']:
        print(f"| {name} | {a['version']} | no window found | | | |")
        continue
    values = ', '.join(sorted(a['values'])) or '-'
    print(f"| {name} | {a['version']} | {cell(a, 'toplevel')} | {cell(a, 'child')} | {cell(a, 'other')} | {values} |")
