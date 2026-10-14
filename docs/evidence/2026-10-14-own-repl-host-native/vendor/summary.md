# Native baseline summary

Runs: run-1 (2026-10-14T19:31:45.950Z to 2026-10-14T19:35:43.452Z); run-2 (2026-10-14T19:35:43.948Z to 2026-10-14T19:39:39.747Z); run-3 (2026-10-14T19:39:40.254Z to 2026-10-14T19:43:39.877Z).

| Attested | Value |
|---|---|
| Device | cua-linux |
| Host commit | 1d34683496332c702016bf41683633663d56aa60 |
| REPL host | vendor (initialize: rmcp 1.5.0) |
| Runtime release | 26.928.40906-linux-arm64 |
| Hardware | Apple Virtualization Generic Platform, arm64, 4 CPUs, 8 GiB |
| OS | Ubuntu 24.04.5 LTS (7.0.0-38-generic) |
| Display | 1440 x 900 points at scale 1 (1440 x 900 pixels) |
| Service | computer surface, answered by vendor (helper: pinned runtime) |
| Sandbox | disabled (platform default) |
| Sample plan | 5 cold, 30 warm, 10 tasks |

Milliseconds. Latency columns cover successful samples only (invalidated samples, whose target was not the scratch document, are counted apart); wall is the harness's time around the MCP call (it includes the ssh pipe), in-cell is `performance.now()` inside the cell on the device.

| Operation | Samples | OK | Invalid | Errors | Wall median | Wall p95 | Wall max | In-cell median | In-cell p95 | In-cell max |
|---|---|---|---|---|---|---|---|---|---|---|
| ssh.roundtrip | 15 | 15 | 0 | 0 | 188.7 | 245.8 | 245.8 | – | – | – |
| cold.miss.initialize | 6 | 6 | 0 | 0 | 339.1 | 443.3 | 443.3 | – | – | – |
| cold.miss.tools_list | 6 | 6 | 0 | 0 | 2.33 | 3.14 | 3.14 | – | – | – |
| cold.miss.first_js | 6 | 6 | 0 | 0 | 137.6 | 164.9 | 164.9 | 0.01 | 0.02 | 0.02 |
| cold.miss.total | 6 | 6 | 0 | 0 | 478.0 | 610.9 | 610.9 | – | – | – |
| cold.hit.initialize | 9 | 9 | 0 | 0 | 253.4 | 268.3 | 268.3 | – | – | – |
| cold.hit.tools_list | 9 | 9 | 0 | 0 | 1.09 | 1.33 | 1.33 | – | – | – |
| cold.hit.first_js | 9 | 9 | 0 | 0 | 201.9 | 213.6 | 213.6 | 0.01 | 0.01 | 0.01 |
| cold.hit.total | 9 | 9 | 0 | 0 | 451.4 | 476.7 | 476.7 | – | – | – |
| warm.noop | 90 | 90 | 0 | 0 | 1.87 | 3.42 | 4.04 | 0.00 | 0.01 | 0.01 |
| warm.getState | 90 | 90 | 0 | 0 | 7.38 | 13.4 | 18.3 | 5.14 | 10.4 | 15.6 |
| warm.listApps | 90 | 90 | 0 | 0 | 7.03 | 10.1 | 30.1 | 5.00 | 7.00 | 23.2 |
| setup.findWindow | 3 | 3 | 0 | 0 | 297.8 | 310.6 | 310.6 | 292.5 | 305.1 | 305.1 |
| bind.getApp | 3 | 3 | 0 | 0 | 509.3 | 513.0 | 513.0 | 506.0 | 509.6 | 509.6 |
| warm.getAXState | 90 | 90 | 0 | 0 | 428.3 | 708.6 | 1082.6 | 424.9 | 701.8 | 1079.5 |
| warm.getScreenshot | 90 | 90 | 0 | 0 | 532.0 | 709.9 | 1025.5 | 526.7 | 700.1 | 1021.5 |
| task.act | 30 | 30 | 0 | 0 | 17351.1 | 17544.9 | 17572.4 | 17346.9 | 17526.3 | 17568.0 |
| task.verify | 30 | 30 | 0 | 0 | 530.3 | 744.2 | 843.0 | 522.8 | 736.5 | 837.2 |
| task.clear | 30 | 30 | 0 | 0 | 1292.8 | 1366.9 | 1400.6 | 1289.4 | 1363.0 | 1396.0 |
| task.total | 30 | 30 | 0 | 0 | 19223.3 | 19410.1 | 19429.4 | 19211.3 | 19378.9 | 19410.7 |
| method.typeText | 3 | 3 | 0 | 0 | 1458.4 | 1485.3 | 1485.3 | 1453.5 | 1482.0 | 1482.0 |
| method.paste | 3 | 3 | 0 | 0 | 1484.5 | 1487.9 | 1487.9 | 1481.6 | 1484.8 | 1484.8 |
| method.paste.format | 3 | 3 | 0 | 0 | 3.53 | 3.94 | 3.94 | 0.06 | 0.08 | 0.08 |
| method.setValue | 3 | 3 | 0 | 0 | 3.21 | 3.50 | 3.50 | 0.14 | 0.17 | 0.17 |
| method.selectText | 3 | 3 | 0 | 0 | 3.27 | 5.93 | 5.93 | 0.09 | 0.10 | 0.10 |
| method.scroll.pages | 3 | 3 | 0 | 0 | 3.20 | 3.97 | 3.97 | 0.09 | 0.17 | 0.17 |
| end_task | 3 | 3 | 0 | 0 | 2.68 | 2.68 | 2.68 | – | – | – |
| setup.findTarget | 6 | 6 | 0 | 0 | 316.0 | 339.5 | 339.5 | 311.8 | 336.1 | 336.1 |

| Operation | Observed (median, range) |
|---|---|
| cold.miss.initialize | planned miss |
| cold.miss.tools_list | planned miss |
| cold.miss.first_js | planned miss; documentChars 19775 (19775–19775) |
| cold.miss.total | planned miss |
| cold.hit.initialize | planned hit |
| cold.hit.tools_list | planned hit |
| cold.hit.first_js | planned hit; documentChars 19775 (19775–19775) |
| cold.hit.total | planned hit |
| warm.getState | apps 10 (10–10); browsers 0 (0–0) |
| warm.listApps | apps 10 (10–10); running 1 (1–1) |
| setup.findWindow | windowId 23068920 (23068920–23068920); app org.gnome.gedit; windows 3 (3–3) |
| bind.getApp | approvals 0 (0–0) |
| warm.getAXState | source at_spi; chars 10875 (10677–10997); lines 400 (398–402); elements 399 (397–401) |
| warm.getScreenshot | bytes 35698 (35648–35765); width 910 (910–910); height 756 (756–756); format jpeg; sha256 1cf3bc9ff0c85c48, 72a5f0136c1b1e31, 7ee2e7a4c40e21ae |
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
| setup.findTarget | windowId 25166072 (25166072–25166072); app org.gnome.gedit; windows 4 (4–4); for method.paste, method.typeText |

## Invalidated samples

None.

## Errors

None.

## Problems

No problems: every run is complete and attests the same commit, REPL host, release, hardware, OS, display, service, sandbox and sample plan.
