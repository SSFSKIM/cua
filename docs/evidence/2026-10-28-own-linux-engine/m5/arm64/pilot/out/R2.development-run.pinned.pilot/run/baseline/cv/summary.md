# Native baseline summary

Runs: run-1 (2026-11-18T01:57:17.853Z to 2026-11-18T02:00:38.222Z); run-2 (2026-11-18T02:03:24.467Z to 2026-11-18T02:06:44.986Z); run-3 (2026-11-18T02:09:23.404Z to 2026-11-18T02:12:43.781Z).

| Attested | Value |
|---|---|
| Device | cua-171-arm64 |
| Host commit | da306cc6319e7e9da282812402308c074b872dee |
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
| ssh.roundtrip | 15 | 15 | 0 | 0 | 183.7 | 184.6 | 184.6 | – | – | – |
| cold.miss.initialize | 6 | 6 | 0 | 0 | 421.1 | 429.1 | 429.1 | – | – | – |
| cold.miss.tools_list | 6 | 6 | 0 | 0 | 1.57 | 1.64 | 1.64 | – | – | – |
| cold.miss.first_js | 6 | 6 | 0 | 0 | 224.5 | 229.2 | 229.2 | 0.01 | 0.01 | 0.01 |
| cold.miss.total | 6 | 6 | 0 | 0 | 645.9 | 660.0 | 660.0 | – | – | – |
| cold.hit.initialize | 9 | 9 | 0 | 0 | 348.4 | 353.2 | 353.2 | – | – | – |
| cold.hit.tools_list | 9 | 9 | 0 | 0 | 0.69 | 0.81 | 0.81 | – | – | – |
| cold.hit.first_js | 9 | 9 | 0 | 0 | 296.7 | 301.2 | 301.2 | 0.01 | 0.01 | 0.01 |
| cold.hit.total | 9 | 9 | 0 | 0 | 645.6 | 653.3 | 653.3 | – | – | – |
| warm.noop | 90 | 90 | 0 | 0 | 8.46 | 10.8 | 12.5 | 0.01 | 0.01 | 0.02 |
| warm.getState | 90 | 90 | 0 | 0 | 8.36 | 10.7 | 15.0 | 1.79 | 2.23 | 6.22 |
| warm.listApps | 90 | 90 | 0 | 0 | 8.19 | 10.5 | 11.3 | 1.76 | 2.31 | 3.38 |
| setup.findWindow | 3 | 3 | 0 | 0 | 263.9 | 263.9 | 263.9 | 255.4 | 255.4 | 255.4 |
| bind.getApp | 3 | 3 | 0 | 0 | 185.7 | 186.2 | 186.2 | 177.7 | 178.3 | 178.3 |
| approval.elicitation | 3 | 3 | 0 | 0 | 14.2 | 14.4 | 14.4 | – | – | – |
| warm.getAXState | 90 | 90 | 0 | 0 | 169.6 | 173.0 | 178.2 | 162.0 | 165.1 | 167.3 |
| warm.getScreenshot | 90 | 90 | 0 | 0 | 277.5 | 279.4 | 282.0 | 269.8 | 271.8 | 273.5 |
| task.act | 30 | 30 | 0 | 0 | 16022.3 | 16028.9 | 16029.0 | 16014.7 | 16020.7 | 16021.2 |
| task.verify | 30 | 30 | 0 | 0 | 264.3 | 266.7 | 266.9 | 256.5 | 259.1 | 259.2 |
| task.clear | 30 | 30 | 0 | 0 | 979.6 | 982.5 | 982.6 | 972.1 | 974.6 | 974.8 |
| task.total | 30 | 30 | 0 | 0 | 17266.7 | 17273.5 | 17274.2 | 17243.9 | 17250.1 | 17251.4 |
| method.typeText | 3 | 3 | 0 | 0 | 786.8 | 788.3 | 788.3 | 779.2 | 780.7 | 780.7 |
| method.paste | 3 | 3 | 0 | 0 | 786.8 | 788.5 | 788.5 | 779.4 | 781.0 | 781.0 |
| method.paste.format | 3 | 3 | 0 | 0 | 7.80 | 9.31 | 9.31 | 0.05 | 0.05 | 0.05 |
| method.setValue | 3 | 3 | 0 | 0 | 7.74 | 9.43 | 9.43 | 0.08 | 0.10 | 0.10 |
| method.selectText | 3 | 3 | 0 | 0 | 7.80 | 9.30 | 9.30 | 0.07 | 0.09 | 0.09 |
| method.scroll.pages | 3 | 3 | 0 | 0 | 7.98 | 8.45 | 8.45 | 0.08 | 0.09 | 0.09 |
| end_task | 3 | 3 | 0 | 0 | 1.99 | 2.00 | 2.00 | – | – | – |
| setup.findTarget | 6 | 6 | 0 | 0 | 267.7 | 269.5 | 269.5 | 259.8 | 261.4 | 261.4 |

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
| warm.getScreenshot | bytes 35790 (35544–36121); width 910 (910–910); height 756 (756–756); format jpeg; sha256 6 distinct |
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
