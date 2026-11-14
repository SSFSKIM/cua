"""Task 75: tally the probe reads and the control drag's XRecord account from run.sh's JSONL logs.

usage: python3 -I analyze.py <log.jsonl>...   prints per-log counts, every read short of its final count, and the
control drags whose read missed an event, with what the server recorded for them.
"""
import json
import sys
from collections import Counter

for path in sys.argv[1:]:
    reads = Counter()
    misses = []
    controls = []
    late_ms = []
    queued = []
    runs = set()
    for line in open(path):
        r = json.loads(line)
        runs.add(r["run"])
        if r["kind"] in ("control", "leave"):
            controls.append(r)
            continue
        reads["reads"] += 1
        at, late, synced = r["at_read"], r["late"], r["after_sync"]
        if r["test"].endswith("a_gecko_drag_the_real_pointer_leaves_while_it_runs_is_reported"):
            queued.append(r["queued_bytes_at_read"])
        if late or synced:
            reads["reads with an input after the read"] += 1
            misses.append(r)
            late_ms += [x["ms_after_read"] for x in late]
            if synced:
                reads["reads with an input only after the round trip"] += 1
        if r["server_button_mask"] & 0x1F00:
            reads["reads with a server button down"] += 1
    print(f"== {path}: {len(runs)} runs, {dict(reads)}")
    if queued:
        print(f"   drag test: bytes waiting on the probe's socket at the read: min {min(queued)} max {max(queued)}")
    bad_controls = [c for c in controls if c["count"] != 2]
    print(f"   drags recorded: {len(controls)} (control {sum(c['kind'] == 'control' for c in controls)}), short at the read: {len(bad_controls)}, of them control: {sum(c['kind'] == 'control' for c in bad_controls)}")
    for m in misses:
        print(
            "   MISS", m["run"], m["test"].split("::")[-1], "at read", m["at_read"], "late", m["late"],
            "after sync", m["after_sync"], "queued", m["queued_bytes_at_read"],
            "others at read", m["other_events_at_read"], "late others", m["late_other_events"],
            "mask", m["server_button_mask"], "window view down", m["window_view_button_down_at_read"],
        )
    for c in bad_controls:
        recs = [x for x in c["records"] if x.get("event") in ("ButtonPress", "ButtonRelease")]
        print("   SHORT", c["kind"], c.get("what", ""), c["run"], c["answer"][:60], "count", c["count"], "probe client", c["probe_client"])
        for x in recs:
            print("     ", x["what"], x["event"], "server time", x["server_time"], "client", x["client"], "rec_ms", round(x["rec_ms"], 1))
    if late_ms:
        print(f"   late arrivals: {len(late_ms)}, ms after the read: min {min(late_ms):.1f} max {max(late_ms):.1f}")
    # every control drag's account: two SendEvents and two deliveries to the probe's client
    accounts = Counter()
    for c in controls:
        sends = [x["event"] for x in c["records"] if x.get("what") == "SendEvent" and x["event"].startswith("Button")]
        got = [x["event"] for x in c["records"] if x.get("what") == "delivered" and x["client"] == c["probe_client"]]
        accounts[(c["kind"], tuple(sends), tuple(got), c["count"])] += 1
    for k, n in sorted(accounts.items()):
        print(f"   account {k[0]}: sent={k[1]} queued-to-probe={k[2]} read at 400 ms={k[3]}: {n}")
