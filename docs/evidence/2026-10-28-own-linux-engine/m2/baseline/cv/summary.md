# Native baseline summary

Runs: run-1 (2026-10-30T15:45:16.604Z to 2026-10-30T15:49:55.097Z); run-2 (2026-10-30T15:53:13.092Z to 2026-10-30T15:57:51.069Z); run-3 (2026-10-30T16:01:09.445Z to 2026-10-30T16:05:47.490Z).

| Attested | Value |
|---|---|
| Device | cua-171 |
| Host commit | 426e25f2cf3d44bef8d6db65ce6bba31f90781bd |
| REPL host | cua (initialize: cua-repl-host 0.5.0) |
| Engine | vendor (answered: sky_linux_x64 of the run's runtime) |
| Approved engine | – |
| Runtime release | 26.928.40906-linux-x64 |
| Hardware | vServer, x64, 8 CPUs, 15 GiB |
| OS | Ubuntu 24.04.4 LTS (6.8.0-138-generic) |
| Display | 1280 x 800 points at scale 1 (1280 x 800 pixels) |
| Service | computer surface, answered by vendor |
| Sandbox | scoped (platform default) |
| Sample plan | 5 cold, 30 warm, 10 tasks |

Milliseconds. Latency columns cover successful samples only (invalidated samples, whose target was not the scratch document, are counted apart); wall is the harness's time around the MCP call (it includes the ssh pipe), in-cell is `performance.now()` inside the cell on the device.

| Operation | Samples | OK | Invalid | Errors | Wall median | Wall p95 | Wall max | In-cell median | In-cell p95 | In-cell max |
|---|---|---|---|---|---|---|---|---|---|---|
| ssh.roundtrip | 15 | 15 | 0 | 0 | 288.8 | 338.6 | 338.6 | – | – | – |
| cold.miss.initialize | 6 | 6 | 0 | 0 | 669.7 | 692.0 | 692.0 | – | – | – |
| cold.miss.tools_list | 6 | 6 | 0 | 0 | 2.21 | 3.65 | 3.65 | – | – | – |
| cold.miss.first_js | 6 | 6 | 0 | 0 | 370.5 | 411.8 | 411.8 | 0.01 | 0.03 | 0.03 |
| cold.miss.total | 6 | 6 | 0 | 0 | 1050.3 | 1086.6 | 1086.6 | – | – | – |
| cold.hit.initialize | 9 | 9 | 0 | 0 | 527.4 | 561.0 | 561.0 | – | – | – |
| cold.hit.tools_list | 9 | 9 | 0 | 0 | 1.10 | 1.59 | 1.59 | – | – | – |
| cold.hit.first_js | 9 | 9 | 0 | 0 | 511.4 | 572.9 | 572.9 | 0.01 | 0.08 | 0.08 |
| cold.hit.total | 9 | 9 | 0 | 0 | 1022.8 | 1130.1 | 1130.1 | – | – | – |
| warm.noop | 90 | 90 | 0 | 0 | 14.1 | 22.4 | 27.5 | 0.01 | 0.02 | 0.04 |
| warm.getState | 90 | 90 | 0 | 0 | 24.0 | 31.8 | 55.5 | 9.32 | 15.5 | 27.0 |
| warm.listApps | 90 | 90 | 0 | 0 | 23.4 | 35.8 | 41.1 | 9.47 | 16.1 | 22.0 |
| setup.findWindow | 3 | 3 | 0 | 0 | 285.9 | 303.4 | 303.4 | 273.2 | 289.5 | 289.5 |
| bind.getApp | 3 | 3 | 0 | 0 | 764.3 | 832.0 | 832.0 | 742.9 | 815.2 | 815.2 |
| approval.elicitation | 3 | 3 | 0 | 0 | 41.9 | 70.1 | 70.1 | – | – | – |
| warm.getAXState | 90 | 90 | 0 | 0 | 519.4 | 674.0 | 840.7 | 504.3 | 661.7 | 820.1 |
| warm.getScreenshot | 90 | 90 | 0 | 0 | 638.0 | 859.4 | 982.6 | 621.9 | 836.7 | 962.5 |
| task.act | 30 | 30 | 0 | 0 | 16953.5 | 17099.1 | 17110.2 | 16940.8 | 17075.9 | 17098.1 |
| task.verify | 30 | 30 | 0 | 0 | 583.2 | 712.3 | 811.7 | 571.6 | 693.7 | 797.6 |
| task.clear | 30 | 30 | 0 | 0 | 1315.0 | 1440.6 | 1444.1 | 1302.6 | 1420.3 | 1431.1 |
| task.total | 30 | 30 | 0 | 0 | 18889.2 | 19094.9 | 19141.9 | 18851.5 | 19047.1 | 19102.4 |
| method.typeText | 3 | 3 | 0 | 0 | 10236.0 | 10237.6 | 10237.6 | 10223.3 | 10224.8 | 10224.8 |
| method.paste | 3 | 3 | 0 | 0 | 10241.2 | 10246.6 | 10246.6 | 10228.5 | 10229.9 | 10229.9 |
| method.paste.format | 3 | 3 | 0 | 0 | 14.8 | 16.8 | 16.8 | 0.10 | 0.10 | 0.10 |
| method.setValue | 3 | 3 | 0 | 0 | 13.4 | 20.1 | 20.1 | 0.17 | 0.23 | 0.23 |
| method.selectText | 3 | 3 | 0 | 0 | 17.9 | 19.9 | 19.9 | 0.15 | 0.17 | 0.17 |
| method.scroll.pages | 3 | 3 | 0 | 0 | 13.3 | 20.2 | 20.2 | 0.19 | 0.20 | 0.20 |
| end_task | 3 | 3 | 0 | 0 | 2.92 | 3.32 | 3.32 | – | – | – |
| setup.findTarget | 6 | 6 | 0 | 0 | 303.0 | 319.3 | 319.3 | 288.8 | 302.8 | 302.8 |

| Operation | Observed (median, range) |
|---|---|
| cold.miss.initialize | planned miss |
| cold.miss.tools_list | planned miss |
| cold.miss.first_js | planned miss; documentChars 18784 (18784–18784) |
| cold.miss.total | planned miss |
| cold.hit.initialize | planned hit |
| cold.hit.tools_list | planned hit |
| cold.hit.first_js | planned hit; documentChars 18784 (18784–18784) |
| cold.hit.total | planned hit |
| warm.getState | apps 15 (15–15); browsers 0 (0–0) |
| warm.listApps | apps 15 (15–15); running 1 (1–1) |
| setup.findWindow | windowId 20971768 (20971768–20971768); app org.gnome.gedit; windows 3 (3–3) |
| bind.getApp | approvals 1 (1–1) |
| approval.elicitation | app org.gnome.gedit; action accept |
| warm.getAXState | source at_spi; chars 9104 (9104–9220); lines 382 (382–384); elements 381 (381–383) |
| warm.getScreenshot | bytes 35617 (35607–35694); width 910 (910–910); height 756 (756–756); format jpeg; sha256 27b92e81880d8668, 77b69cf72437a71f, dcf8c04ed4ed99d1 |
| task.act | actions 43 (43–43); observations 1 (1–1) |
| task.verify | observations 1 (1–1) |
| task.clear | actions 2 (2–2); observations 1 (1–1) |
| task.total | cells 3 (3–3); actions 45 (45–45); observations 3 (3–3); outcome typed with pressKey, verified, cleared |
| method.typeText | outcome threw; methodError editable Paste did not insert text; target survived |
| method.paste | outcome threw; methodError editable Paste did not insert text; target survived |
| method.paste.format | outcome threw; methodError Linux paste supports only text format.; target survived |
| method.setValue | outcome threw; methodError setValue is unavailable on Linux; use click, pressKey, and typeText.; target survived |
| method.selectText | outcome threw; methodError selectText is unavailable on Linux.; target survived |
| method.scroll.pages | outcome threw; methodError Linux scroll accepts { pixels }, not pages.; target survived |
| setup.findTarget | windowId 23068920 (23068920–23068920); app org.gnome.gedit; windows 4 (4–4); for method.paste, method.typeText |

## Invalidated samples

None.

## Errors

None.

## Problems

No problems: every run is complete and attests the same commit, REPL host, engine, approved engine, release, hardware, OS, display, service, sandbox and sample plan.
