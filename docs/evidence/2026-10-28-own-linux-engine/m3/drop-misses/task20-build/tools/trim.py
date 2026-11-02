#!/usr/bin/env python3
# trim.py <in.jsonl> <out.jsonl>: a park run's rows for the evidence: per drag the lane, trial, park, real pointer,
# kind, landed, the answer (the sentence's first words), the time, the buttonless moves the page saw, and the engine's
# route and press record; the setup line as it is.
import json
import sys

with open(sys.argv[1]) as src, open(sys.argv[2], "w") as out:
    for line in src:
        row = json.loads(line)
        if row.get("setup"):
            out.write(json.dumps(row) + "\n")
            continue
        stats = row.get("stats") or {}
        keep = {k: row.get(k) for k in ("lane", "i", "park", "pointer", "kind", "landed", "ok", "ms", "buttonless", "cancels")}
        if not row["ok"]:
            keep["error"] = row["error"][:80]
        if stats:
            keep["route"] = stats.get("route")
            if stats.get("press"):
                keep["press"] = stats["press"]
        out.write(json.dumps({k: v for k, v in keep.items() if v is not None}) + "\n")
