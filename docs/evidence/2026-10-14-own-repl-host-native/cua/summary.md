# Native baseline summary

Runs: run-1 (2026-10-15T18:13:37.364Z to 2026-10-15T18:20:10.985Z); run-2 (2026-10-15T18:20:12.065Z to 2026-10-15T18:26:21.255Z); run-3 (2026-10-15T18:26:21.913Z to 2026-10-15T18:32:22.578Z).

| Attested | Value |
|---|---|
| Device | cua-linux |
| Host commit | a5ccc1b40b85fd688cd4f47d52a70ee3a09ec09b |
| REPL host | cua (initialize: cua-repl-host 0.4.0) |
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
| ssh.roundtrip | 15 | 15 | 0 | 0 | 335.3 | 645.2 | 645.2 | – | – | – |
| cold.miss.initialize | 6 | 6 | 0 | 0 | 597.4 | 1149.5 | 1149.5 | – | – | – |
| cold.miss.tools_list | 6 | 6 | 0 | 0 | 6.08 | 26.1 | 26.1 | – | – | – |
| cold.miss.first_js | 6 | 6 | 0 | 0 | 323.9 | 426.2 | 426.2 | 0.01 | 0.02 | 0.02 |
| cold.miss.total | 6 | 6 | 0 | 0 | 926.9 | 1601.8 | 1601.8 | – | – | – |
| cold.hit.initialize | 9 | 9 | 0 | 0 | 346.7 | 968.3 | 968.3 | – | – | – |
| cold.hit.tools_list | 9 | 9 | 0 | 0 | 1.63 | 6.42 | 6.42 | – | – | – |
| cold.hit.first_js | 9 | 9 | 0 | 0 | 227.7 | 1139.6 | 1139.6 | 0.01 | 0.01 | 0.01 |
| cold.hit.total | 9 | 9 | 0 | 0 | 575.7 | 1928.5 | 1928.5 | – | – | – |
| warm.noop | 90 | 90 | 0 | 0 | 3.48 | 18.8 | 107.0 | 0.00 | 0.01 | 0.04 |
| warm.getState | 90 | 90 | 0 | 0 | 18.7 | 172.5 | 243.6 | 14.7 | 150.8 | 227.1 |
| warm.listApps | 90 | 90 | 0 | 0 | 23.1 | 87.6 | 200.5 | 16.5 | 77.5 | 193.7 |
| setup.findWindow | 3 | 3 | 0 | 0 | 513.8 | 940.7 | 940.7 | 507.3 | 930.8 | 930.8 |
| bind.getApp | 3 | 3 | 0 | 0 | 954.1 | 2022.8 | 2022.8 | 945.6 | 2012.1 | 2012.1 |
| warm.getAXState | 90 | 90 | 0 | 0 | 1181.5 | 3488.6 | 4954.9 | 1171.7 | 3479.8 | 4906.1 |
| warm.getScreenshot | 90 | 90 | 0 | 0 | 1122.9 | 3261.9 | 4692.1 | 1115.5 | 3223.1 | 4633.0 |
| task.act | 30 | 30 | 0 | 0 | 18536.9 | 25578.2 | 26706.6 | 18483.9 | 25559.0 | 26661.8 |
| task.verify | 30 | 30 | 0 | 0 | 1842.3 | 6438.9 | 6734.4 | 1817.6 | 6382.5 | 6679.5 |
| task.clear | 30 | 30 | 0 | 0 | 2177.8 | 6921.1 | 8200.5 | 2170.5 | 6906.6 | 8165.1 |
| task.total | 30 | 30 | 0 | 0 | 24536.7 | 34869.4 | 41641.5 | 24485.5 | 34814.1 | 41506.5 |
| method.typeText | 3 | 3 | 0 | 0 | 1705.1 | 2720.5 | 2720.5 | 1699.5 | 2698.7 | 2698.7 |
| method.paste | 3 | 3 | 0 | 0 | 1532.8 | 2191.5 | 2191.5 | 1529.1 | 2180.7 | 2180.7 |
| method.paste.format | 3 | 3 | 0 | 0 | 5.95 | 12.1 | 12.1 | 0.13 | 0.16 | 0.16 |
| method.setValue | 3 | 3 | 0 | 0 | 4.37 | 8.39 | 8.39 | 0.24 | 0.39 | 0.39 |
| method.selectText | 3 | 3 | 0 | 0 | 6.20 | 20.8 | 20.8 | 0.09 | 0.10 | 0.10 |
| method.scroll.pages | 3 | 3 | 0 | 0 | 3.81 | 10.1 | 10.1 | 0.13 | 0.23 | 0.23 |
| end_task | 3 | 3 | 0 | 0 | 8.54 | 12.4 | 12.4 | – | – | – |
| setup.findTarget | 6 | 6 | 0 | 0 | 535.2 | 687.1 | 687.1 | 529.0 | 672.7 | 672.7 |

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
| warm.getState | apps 10 (10–10); browsers 0 (0–0) |
| warm.listApps | apps 10 (10–10); running 1 (1–1) |
| setup.findWindow | windowId 20971768 (20971768–20971768); app org.gnome.gedit; windows 3 (3–3) |
| bind.getApp | approvals 0 (0–0) |
| warm.getAXState | source at_spi; chars 11563 (11219–12023); lines 400 (400–402); elements 399 (399–401) |
| warm.getScreenshot | bytes 35665 (35657–35687); width 910 (910–910); height 756 (756–756); format jpeg; sha256 4f1819d6823f1b2b, 4ff501853e796335, edba372e50183c60 |
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
