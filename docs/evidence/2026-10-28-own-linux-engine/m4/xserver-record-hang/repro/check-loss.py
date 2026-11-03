#!/usr/bin/env python3
"""Did the record keep every flood request? Each flood client's ChangeProperty count (its flood-*.json) against the
record's `req` lines of that client (its resource-id base), and the gaps in the recorded sequence numbers.
$1: a repro-stall.sh run directory."""
import glob, json, os, sys
run = sys.argv[1]
recorded = {}
for line in open(os.path.join(run, "record.jsonl")):
    try:
        r = json.loads(line)
    except Exception:
        continue
    if r.get("kind") == "req" and r.get("op") == "ChangeProperty" and r.get("name") == "TASK41_FLOOD":
        recorded.setdefault(r["client"], []).append(r["seq"])
total_sent = total_seen = 0
for f in sorted(glob.glob(os.path.join(run, "flood-*.json"))):
    text = open(f).read().strip()
    if not text.startswith("{"):
        print(f"{os.path.basename(f)}: no count ({text[:80]!r})")
        continue
    sent = json.loads(text)
    seqs = recorded.get(sent["base"], [])
    total_sent += sent["changes"]; total_seen += len(seqs)
    print(f"{os.path.basename(f)}: sent {sent['changes']}, recorded {len(seqs)}, missing {sent['changes'] - len(seqs)}")
print(f"all: sent {total_sent}, recorded {total_seen}, missing {total_sent - total_seen}")
