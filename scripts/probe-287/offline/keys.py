# #287 offline: the node keys a skyshot dump carries (which attributes a browser exposes to the engine).
#   python3 -I scripts/probe-287/offline/keys.py <skyshot.json>...
import json
import sys

for path in sys.argv[1:]:
    nodes = json.load(open(path))['nodes']
    keys = set()
    for n in nodes:
        keys |= set(n)
    ids = [n.get('identifier') for n in nodes if n.get('identifier')][:8]
    classes = [n.get('domClassList') for n in nodes if n.get('domClassList')][:4]
    print(path.split('/')[-4], sorted(keys), 'identifiers', ids, 'classes', classes)
