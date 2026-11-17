#!/usr/bin/env python3
"""Summarizes native-children.sh's records: per application window, the share of grid points a background press would
deliver to a native child, and the viewable native children (size, depth).
usage: native-summary.py <records.jsonl>"""
import json
import sys

for line in open(sys.argv[1]):
    try:
        record = json.loads(line)
    except ValueError:
        continue
    result = record['result']
    if not result:
        print(f"{record['app']}: no window")
        continue
    kids = [(d['width'], d['height'], d['depth']) for d in result['descendants'] if d['viewable']]
    print(f"{record['app']}: window {result['window']} {result['size']}: {result['on_native_child']} of "
          f"{result['points']} points on a native child ({result['share']:.1%}); {len(kids)} viewable native "
          f"children {kids[:8]}")
