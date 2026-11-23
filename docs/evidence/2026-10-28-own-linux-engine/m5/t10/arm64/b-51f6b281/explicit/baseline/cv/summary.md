# Native baseline summary

Runs: run-1 (2026-11-22T06:39:25.438Z to 2026-11-22T06:42:48.118Z); run-2 (2026-11-22T06:45:20.629Z to 2026-11-22T06:48:43.297Z); run-3 (2026-11-22T06:51:18.939Z to 2026-11-22T06:54:41.835Z).

| Attested | Value |
|---|---|
| Device | cua-171-arm64 |
| Host commit | 51f6b281692c47060a47399b72da363748aad7db |
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
| ssh.roundtrip | 15 | 15 | 0 | 0 | 185.7 | 188.7 | 188.7 | – | – | – |
| cold.miss.initialize | 6 | 6 | 0 | 0 | 440.7 | 444.7 | 444.7 | – | – | – |
| cold.miss.tools_list | 6 | 6 | 0 | 0 | 1.63 | 1.71 | 1.71 | – | – | – |
| cold.miss.first_js | 6 | 6 | 0 | 0 | 234.8 | 236.9 | 236.9 | 0.01 | 0.01 | 0.01 |
| cold.miss.total | 6 | 6 | 0 | 0 | 676.4 | 681.9 | 681.9 | – | – | – |
| cold.hit.initialize | 9 | 9 | 0 | 0 | 362.7 | 365.9 | 365.9 | – | – | – |
| cold.hit.tools_list | 9 | 9 | 0 | 0 | 0.76 | 0.82 | 0.82 | – | – | – |
| cold.hit.first_js | 9 | 9 | 0 | 0 | 308.5 | 314.3 | 314.3 | 0.01 | 0.01 | 0.01 |
| cold.hit.total | 9 | 9 | 0 | 0 | 672.5 | 679.1 | 679.1 | – | – | – |
| warm.noop | 90 | 90 | 0 | 0 | 8.44 | 11.6 | 12.0 | 0.01 | 0.01 | 0.03 |
| warm.getState | 90 | 90 | 0 | 0 | 8.56 | 11.4 | 15.1 | 1.74 | 3.02 | 6.45 |
| warm.listApps | 90 | 90 | 0 | 0 | 8.65 | 12.4 | 14.9 | 1.79 | 3.09 | 7.69 |
| setup.findWindow | 3 | 3 | 0 | 0 | 265.5 | 265.8 | 265.8 | 255.3 | 255.7 | 255.7 |
| bind.getApp | 3 | 3 | 0 | 0 | 213.2 | 218.3 | 218.3 | 203.1 | 209.9 | 209.9 |
| approval.elicitation | 3 | 3 | 0 | 0 | 15.6 | 16.4 | 16.4 | – | – | – |
| warm.getAXState | 90 | 90 | 0 | 0 | 187.5 | 194.3 | 195.5 | 179.1 | 185.5 | 187.7 |
| warm.getScreenshot | 90 | 90 | 0 | 0 | 296.5 | 301.8 | 306.4 | 288.1 | 294.1 | 298.5 |
| task.act | 30 | 30 | 0 | 0 | 16053.7 | 16063.8 | 16067.8 | 16045.9 | 16055.6 | 16059.7 |
| task.verify | 30 | 30 | 0 | 0 | 282.5 | 285.7 | 287.7 | 274.4 | 277.7 | 279.9 |
| task.clear | 30 | 30 | 0 | 0 | 998.5 | 1001.7 | 1003.1 | 990.4 | 993.1 | 995.3 |
| task.total | 30 | 30 | 0 | 0 | 17332.6 | 17344.6 | 17348.3 | 17309.3 | 17320.0 | 17324.1 |
| method.typeText | 3 | 3 | 0 | 0 | 793.5 | 796.3 | 796.3 | 785.8 | 786.6 | 786.6 |
| method.paste | 3 | 3 | 0 | 0 | 795.8 | 796.7 | 796.7 | 787.5 | 788.1 | 788.1 |
| method.paste.format | 3 | 3 | 0 | 0 | 8.05 | 9.95 | 9.95 | 0.05 | 0.05 | 0.05 |
| method.setValue | 3 | 3 | 0 | 0 | 9.54 | 9.65 | 9.65 | 0.08 | 0.08 | 0.08 |
| method.selectText | 3 | 3 | 0 | 0 | 9.82 | 9.83 | 9.83 | 0.07 | 0.07 | 0.07 |
| method.scroll.pages | 3 | 3 | 0 | 0 | 9.54 | 11.8 | 11.8 | 0.08 | 0.08 | 0.08 |
| end_task | 3 | 3 | 0 | 0 | 2.01 | 2.14 | 2.14 | – | – | – |
| setup.findTarget | 6 | 6 | 0 | 0 | 267.1 | 267.8 | 267.8 | 258.8 | 259.7 | 259.7 |

| Operation | Observed (median, range) |
|---|---|
| cold.miss.initialize | planned miss |
| cold.miss.tools_list | planned miss |
| cold.miss.first_js | planned miss; documentChars 24726 (24726–24726) |
| cold.miss.total | planned miss |
| cold.hit.initialize | planned hit |
| cold.hit.tools_list | planned hit |
| cold.hit.first_js | planned hit; documentChars 24726 (24726–24726) |
| cold.hit.total | planned hit |
| warm.getState | apps 18 (18–18); browsers 0 (0–0) |
| warm.listApps | apps 18 (18–18); running 0 (0–0) |
| setup.findWindow | windowId 8388708 (8388708–8388708); app org.gnome.gedit; windows 2 (2–2) |
| bind.getApp | approvals 1 (1–1) |
| approval.elicitation | app org.gnome.gedit; action accept |
| warm.getAXState | source at_spi; chars 9104 (9104–9220); lines 382 (382–384); elements 381 (381–383) |
| warm.getScreenshot | bytes 35649 (35640–35821); width 910 (910–910); height 756 (756–756); format jpeg; sha256 6 distinct |
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
