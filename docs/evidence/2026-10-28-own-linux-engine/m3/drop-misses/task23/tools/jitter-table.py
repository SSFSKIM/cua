#!/usr/bin/env python3
# jitter-table.py <jitter.jsonl>: task 23's jitter probe by engine: answers, selections landed, the samples sent under
# the atomic press's grab, whether they crossed the threshold, and the grab's duration (p50, max).
import json
import statistics
import sys

rows = [json.loads(line) for line in open(sys.argv[1])]
setup = next(r for r in rows if r.get("setup"))
print(f"jitter points {setup['jitter']}; engines {', '.join(e['label'] for e in setup['engines'])}")
for label in [e["label"] for e in setup["engines"]]:
    r = [x for x in rows if x.get("engine") == label]
    press = [x["press"] for x in r if x.get("press")]
    grabs = [p["grab_ms"] for p in press]
    print(
        f"{label:7} drags {len(r)}  ok {sum(x['ok'] for x in r)}  landed {sum(x['landed'] for x in r)}  "
        f"samples under grab {sorted({p['samples'] for p in press})}  crossed {sorted({str(p.get('crossed')) for p in press})}  "
        f"grab p50 {statistics.median(grabs):.3f} ms max {max(grabs):.3f} ms"
    )
