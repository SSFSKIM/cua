# Native baseline summary

Runs: run-1 (2026-10-18T15:14:27.827Z to 2026-10-18T15:20:12.541Z); run-2 (2026-10-18T15:20:53.663Z to 2026-10-18T15:26:37.089Z); run-3 (2026-10-18T15:27:17.691Z to 2026-10-18T15:33:00.883Z).

| Attested | Value |
|---|---|
| Device | cua-gce |
| Host commit | 7b8787312a156d7029ecf04aff1cbc355de2e9ae |
| REPL host | cua (initialize: cua-repl-host 0.5.0) |
| Runtime release | 26.928.40906-linux-arm64 |
| Hardware | Google Compute Engine, arm64, 4 CPUs, 16 GiB |
| OS | Ubuntu 24.04.5 LTS (7.0.0-1014-gcp) |
| Display | 1280 x 800 points at scale 1 (1280 x 800 pixels) |
| Service | computer surface, answered by vendor (helper: pinned runtime) |
| Sandbox | scoped (platform default) |
| Sample plan | 5 cold, 30 warm, 10 tasks |

Milliseconds. Latency columns cover successful samples only (invalidated samples, whose target was not the scratch document, are counted apart); wall is the harness's time around the MCP call (it includes the ssh pipe), in-cell is `performance.now()` inside the cell on the device.

| Operation | Samples | OK | Invalid | Errors | Wall median | Wall p95 | Wall max | In-cell median | In-cell p95 | In-cell max |
|---|---|---|---|---|---|---|---|---|---|---|
| ssh.roundtrip | 15 | 15 | 0 | 0 | 2276.2 | 2617.7 | 2617.7 | – | – | – |
| cold.miss.initialize | 6 | 6 | 0 | 0 | 2625.4 | 2765.1 | 2765.1 | – | – | – |
| cold.miss.tools_list | 6 | 6 | 0 | 0 | 328.7 | 418.1 | 418.1 | – | – | – |
| cold.miss.first_js | 6 | 6 | 0 | 0 | 735.1 | 772.5 | 772.5 | 0.01 | 0.02 | 0.02 |
| cold.miss.total | 6 | 6 | 0 | 0 | 3695.2 | 3898.5 | 3898.5 | – | – | – |
| cold.hit.initialize | 9 | 9 | 0 | 0 | 2454.2 | 2873.6 | 2873.6 | – | – | – |
| cold.hit.tools_list | 9 | 9 | 0 | 0 | 358.6 | 447.1 | 447.1 | – | – | – |
| cold.hit.first_js | 9 | 9 | 0 | 0 | 825.8 | 901.7 | 901.7 | 0.01 | 0.02 | 0.02 |
| cold.hit.total | 9 | 9 | 0 | 0 | 3628.7 | 4185.1 | 4185.1 | – | – | – |
| warm.noop | 90 | 90 | 0 | 0 | 175.3 | 217.1 | 281.3 | 0.01 | 0.03 | 0.06 |
| warm.getState | 90 | 90 | 0 | 0 | 177.6 | 253.2 | 268.9 | 5.73 | 7.72 | 18.9 |
| warm.listApps | 90 | 90 | 0 | 0 | 173.8 | 249.6 | 301.1 | 5.71 | 6.80 | 10.7 |
| setup.findWindow | 3 | 3 | 0 | 0 | 178.9 | 201.2 | 201.2 | 9.34 | 9.38 | 9.38 |
| bind.getApp | 3 | 3 | 0 | 0 | 533.9 | 537.0 | 537.0 | 363.1 | 366.4 | 366.4 |
| warm.getAXState | 90 | 90 | 0 | 0 | 522.6 | 563.3 | 688.3 | 333.3 | 347.3 | 355.8 |
| warm.getScreenshot | 90 | 90 | 0 | 0 | 779.3 | 829.1 | 885.3 | 447.2 | 457.5 | 461.5 |
| task.act | 30 | 30 | 0 | 0 | 16497.1 | 16561.3 | 16606.0 | 16146.7 | 16185.2 | 16191.9 |
| task.verify | 30 | 30 | 0 | 0 | 686.8 | 737.3 | 752.2 | 331.0 | 344.9 | 345.8 |
| task.clear | 30 | 30 | 0 | 0 | 1472.5 | 1589.4 | 1749.2 | 1137.4 | 1150.9 | 1151.5 |
| task.total | 30 | 30 | 0 | 0 | 18667.9 | 18784.3 | 19006.4 | 17617.1 | 17658.3 | 17681.0 |
| method.typeText | 3 | 3 | 0 | 0 | 1642.9 | 1643.2 | 1643.2 | 1477.1 | 1478.3 | 1478.3 |
| method.paste | 3 | 3 | 0 | 0 | 1639.5 | 1707.3 | 1707.3 | 1475.8 | 1481.5 | 1481.5 |
| method.paste.format | 3 | 3 | 0 | 0 | 164.3 | 178.2 | 178.2 | 0.07 | 0.07 | 0.07 |
| method.setValue | 3 | 3 | 0 | 0 | 164.8 | 174.8 | 174.8 | 0.13 | 0.15 | 0.15 |
| method.selectText | 3 | 3 | 0 | 0 | 168.0 | 171.3 | 171.3 | 0.11 | 0.21 | 0.21 |
| method.scroll.pages | 3 | 3 | 0 | 0 | 167.4 | 171.5 | 171.5 | 0.11 | 0.12 | 0.12 |
| end_task | 3 | 3 | 0 | 0 | 159.7 | 165.7 | 165.7 | – | – | – |
| setup.findTarget | 6 | 6 | 0 | 0 | 186.2 | 197.1 | 197.1 | 12.1 | 16.0 | 16.0 |

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
| warm.getState | apps 4 (4–4); browsers 0 (0–0) |
| warm.listApps | apps 4 (4–4); running 1 (1–1) |
| setup.findWindow | windowId 20971768 (20971768–20971768); app org.gnome.gedit; windows 3 (3–3) |
| bind.getApp | approvals 0 (0–0) |
| warm.getAXState | source at_spi; chars 9104 (9104–9104); lines 382 (382–382); elements 381 (381–381) |
| warm.getScreenshot | bytes 35571 (35513–35631); width 910 (910–910); height 756 (756–756); format jpeg; sha256 912352313b246eaf, ba6cc641e4df43dd, e88240f635457fe1 |
| task.act | actions 43 (43–43); observations 1 (1–1) |
| task.verify | observations 1 (1–1) |
| task.clear | actions 2 (2–2); observations 1 (1–1) |
| task.total | cells 3 (3–3); actions 45 (45–45); observations 3 (3–3); outcome typed with pressKey, verified, cleared |
| method.typeText | outcome threw; methodError D-Bus org.freedesktop.DBus.Properties.Get failed: org.freedesktop.DBus.Error.NoReply: Message recipient disconnected from message bus without replying; target exited |
| method.paste | outcome threw; methodError D-Bus org.freedesktop.DBus.Properties.Get failed: org.freedesktop.DBus.Error.NoReply: Message recipient disconnected from message bus without replying; target exited |
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

No problems: every run is complete and attests the same commit, REPL host, release, hardware, OS, display, service, sandbox and sample plan.
