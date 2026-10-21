#!/bin/bash
# Reads only Statsig dynamic config 406601636 (the vendor helper's screenshot sizing) from the mini's helper preferences.
# Run: ssh mini 'bash -s' < scripts/native-baseline/read-sizing-config.sh   Prints one line per cached evaluation; nothing else from the store.
python3 -I - <<'PY'
import plistlib, os, json, datetime
p = os.path.expanduser("~/Library/Preferences/com.openai.sky.CUAService.plist")
print("plist mtime", datetime.datetime.fromtimestamp(os.path.getmtime(p), datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))
store = json.loads(plistlib.load(open(p, "rb"))["com.Statsig.InternalStore.localStorageKeyV2"])
for n, entry in enumerate(store.values()):
    c = (entry.get("dynamic_configs") or {}).get("406601636")
    t = entry.get("time")
    t = datetime.datetime.fromtimestamp(t / 1000, datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") if isinstance(t, (int, float)) else t
    if c is None:
        print(n, "fetched", t, "config absent"); continue
    print(n, "fetched", t, "rule", c.get("rule_id"), "legacy", (c.get("value") or {}).get("should_use_legacy_screenshot_sizing", "absent (false)"), "value", json.dumps(c.get("value"), sort_keys=True))
PY
