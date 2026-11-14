#!/usr/bin/env python3
# Task 77: L3a's chrome-text clipboard_read runs in detail, the trials named.
import json, sys
rows = [json.loads(l) for l in open(sys.argv[1])]
want = {int(x) for x in sys.argv[2:]}
for r in rows:
    if r.get('kind') == 'settle-run' and r.get('cell') == 'chrome-text clipboard_read background' and r.get('trial') in want:
        print('== trial', r['trial'])
        for k in ('answers', 'answered_ms', 'waited_ms', 'read_ms', 'late_ms', 'sent', 'landed', 'deferred', 'desktop_clean', 'front_active', 'route', 'before', 'after', 'input', 'source', 'load'):
            print('  ', k, json.dumps(r.get(k))[:600])
