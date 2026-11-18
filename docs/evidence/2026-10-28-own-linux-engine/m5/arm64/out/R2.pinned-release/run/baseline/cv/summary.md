# Native baseline summary

Runs: run-1 (2026-11-18T14:20:02.852Z to 2026-11-18T14:23:24.048Z); run-2 (2026-11-18T14:26:08.404Z to 2026-11-18T14:29:29.275Z); run-3 (2026-11-18T14:32:28.043Z to 2026-11-18T14:35:49.481Z).

| Attested | Value |
|---|---|
| Device | cua-171-arm64 |
| Host commit | f6275fb600ae719f29cf32b206676e1a70a02e26 |
| REPL host | cua (initialize: cua-repl-host 0.5.0) |
| Engine | vendor (answered: sky_linux_arm64 of the run's runtime) |
| Approved engine | – |
| Runtime release | 26.928.40906-linux-arm64 |
| Hardware | Google Compute Engine, arm64, 8 CPUs, 31 GiB |
| OS | Ubuntu 24.04.5 LTS (7.0.0-1017-gcp) |
| Display | 1280 x 800 points at scale 1 (1280 x 800 pixels) |
| Service | computer surface, answered by vendor |
| Sandbox | scoped (platform default) |
| Sample plan | 5 cold, 30 warm, 10 tasks |

Milliseconds. Latency columns cover successful samples only (invalidated samples, whose target was not the scratch document, are counted apart); wall is the harness's time around the MCP call (it includes the ssh pipe), in-cell is `performance.now()` inside the cell on the device.

| Operation | Samples | OK | Invalid | Errors | Wall median | Wall p95 | Wall max | In-cell median | In-cell p95 | In-cell max |
|---|---|---|---|---|---|---|---|---|---|---|
| ssh.roundtrip | 15 | 15 | 0 | 0 | 186.4 | 374.9 | 374.9 | – | – | – |
| cold.miss.initialize | 6 | 6 | 0 | 0 | 430.7 | 436.5 | 436.5 | – | – | – |
| cold.miss.tools_list | 6 | 6 | 0 | 0 | 1.64 | 1.72 | 1.72 | – | – | – |
| cold.miss.first_js | 6 | 6 | 0 | 0 | 233.6 | 237.2 | 237.2 | 0.01 | 0.01 | 0.01 |
| cold.miss.total | 6 | 6 | 0 | 0 | 666.5 | 673.7 | 673.7 | – | – | – |
| cold.hit.initialize | 9 | 9 | 0 | 0 | 356.6 | 366.0 | 366.0 | – | – | – |
| cold.hit.tools_list | 9 | 9 | 0 | 0 | 0.71 | 0.84 | 0.84 | – | – | – |
| cold.hit.first_js | 9 | 9 | 0 | 0 | 305.0 | 308.0 | 308.0 | 0.01 | 0.01 | 0.01 |
| cold.hit.total | 9 | 9 | 0 | 0 | 661.2 | 666.1 | 666.1 | – | – | – |
| warm.noop | 90 | 90 | 0 | 0 | 8.67 | 11.3 | 13.2 | 0.01 | 0.01 | 0.02 |
| warm.getState | 90 | 90 | 0 | 0 | 8.48 | 11.0 | 13.8 | 1.74 | 2.02 | 6.34 |
| warm.listApps | 90 | 90 | 0 | 0 | 8.57 | 9.24 | 10.3 | 1.70 | 2.08 | 3.90 |
| setup.findWindow | 3 | 3 | 0 | 0 | 263.8 | 264.4 | 264.4 | 255.2 | 255.7 | 255.7 |
| bind.getApp | 3 | 3 | 0 | 0 | 189.8 | 190.4 | 190.4 | 181.6 | 182.1 | 182.1 |
| approval.elicitation | 3 | 3 | 0 | 0 | 13.8 | 14.9 | 14.9 | – | – | – |
| warm.getAXState | 90 | 90 | 0 | 0 | 169.3 | 173.3 | 177.2 | 161.7 | 165.3 | 167.7 |
| warm.getScreenshot | 90 | 90 | 0 | 0 | 279.3 | 285.3 | 298.8 | 271.5 | 277.4 | 290.9 |
| task.act | 30 | 30 | 0 | 0 | 16051.8 | 16064.8 | 16074.4 | 16044.0 | 16056.8 | 16066.3 |
| task.verify | 30 | 30 | 0 | 0 | 265.7 | 269.4 | 271.8 | 257.5 | 260.7 | 264.0 |
| task.clear | 30 | 30 | 0 | 0 | 981.5 | 985.5 | 988.0 | 973.6 | 977.9 | 979.9 |
| task.total | 30 | 30 | 0 | 0 | 17300.0 | 17322.3 | 17324.9 | 17277.1 | 17297.4 | 17301.0 |
| method.typeText | 3 | 3 | 0 | 0 | 786.5 | 787.5 | 787.5 | 778.8 | 779.5 | 779.5 |
| method.paste | 3 | 3 | 0 | 0 | 786.9 | 788.3 | 788.3 | 779.3 | 780.9 | 780.9 |
| method.paste.format | 3 | 3 | 0 | 0 | 7.95 | 8.05 | 8.05 | 0.05 | 0.06 | 0.06 |
| method.setValue | 3 | 3 | 0 | 0 | 8.00 | 8.04 | 8.04 | 0.10 | 0.10 | 0.10 |
| method.selectText | 3 | 3 | 0 | 0 | 8.10 | 8.11 | 8.11 | 0.07 | 0.14 | 0.14 |
| method.scroll.pages | 3 | 3 | 0 | 0 | 8.23 | 9.02 | 9.02 | 0.08 | 0.14 | 0.14 |
| end_task | 3 | 3 | 0 | 0 | 1.92 | 1.97 | 1.97 | – | – | – |
| setup.findTarget | 6 | 6 | 0 | 0 | 266.8 | 267.5 | 267.5 | 258.4 | 258.9 | 258.9 |

| Operation | Observed (median, range) |
|---|---|
| cold.miss.initialize | planned miss |
| cold.miss.tools_list | planned miss |
| cold.miss.first_js | planned miss; documentChars 22409 (22409–22409) |
| cold.miss.total | planned miss |
| cold.hit.initialize | planned hit |
| cold.hit.tools_list | planned hit |
| cold.hit.first_js | planned hit; documentChars 22409 (22409–22409) |
| cold.hit.total | planned hit |
| warm.getState | apps 18 (18–18); browsers 0 (0–0) |
| warm.listApps | apps 18 (18–18); running 0 (0–0) |
| setup.findWindow | windowId 8388708 (8388708–8388708); app org.gnome.gedit; windows 2 (2–2) |
| bind.getApp | approvals 1 (1–1) |
| approval.elicitation | app org.gnome.gedit; action accept |
| warm.getAXState | source at_spi; chars 9104 (9104–9220); lines 382 (382–384); elements 381 (381–383) |
| warm.getScreenshot | bytes 35728 (35528–35962); width 910 (910–910); height 756 (756–756); format jpeg; sha256 6 distinct |
| task.act | actions 43 (43–43); observations 1 (1–1) |
| task.verify | observations 1 (1–1) |
| task.clear | actions 2 (2–2); observations 1 (1–1) |
| task.total | cells 3 (3–3); actions 45 (45–45); observations 3 (3–3); outcome typed with pressKey, verified, cleared |
| method.typeText | outcome threw; methodError D-Bus org.freedesktop.DBus.Properties.Get failed: org.freedesktop.DBus.Error.ServiceUnknown: The name :1.195 was not provided by any .service files, D-Bus org.freedesktop.DBus.Properties.Get failed: org.freedesktop.DBus.Error.ServiceUnknown: The name :1.297 was not provided by any .service files, D-Bus org.freedesktop.DBus.Properties.Get failed: org.freedesktop.DBus.Error.ServiceUnknown: The name :1.93 was not provided by any .service files; target exited |
| method.paste | outcome threw; methodError D-Bus org.freedesktop.DBus.Properties.Get failed: org.freedesktop.DBus.Error.ServiceUnknown: The name :1.198 was not provided by any .service files, D-Bus org.freedesktop.DBus.Properties.Get failed: org.freedesktop.DBus.Error.ServiceUnknown: The name :1.300 was not provided by any .service files, D-Bus org.freedesktop.DBus.Properties.Get failed: org.freedesktop.DBus.Error.ServiceUnknown: The name :1.96 was not provided by any .service files; target exited |
| method.paste.format | outcome threw; methodError Linux paste supports only text format.; target survived |
| method.setValue | outcome threw; methodError setValue is unavailable on Linux; use click, pressKey, and typeText.; target survived |
| method.selectText | outcome threw; methodError selectText is unavailable on Linux.; target survived |
| method.scroll.pages | outcome threw; methodError Linux scroll accepts { pixels }, not pages.; target survived |
| setup.findTarget | windowId 12583012 (12583012–12583012); app org.gnome.gedit; windows 3 (3–3); for method.paste, method.typeText |

## Invalidated samples

None.

## Errors

None.

## Problems

No problems: every run is complete and attests the same commit, REPL host, engine, approved engine, release, hardware, OS, display, service, sandbox and sample plan.
