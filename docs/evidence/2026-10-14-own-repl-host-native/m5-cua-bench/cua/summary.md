# Native baseline summary

Runs: run-1 (2026-10-16T18:57:08.107Z to 2026-10-16T19:02:35.774Z); run-2 (2026-10-16T19:04:42.192Z to 2026-10-16T19:10:14.545Z); run-3 (2026-10-16T19:10:55.148Z to 2026-10-16T19:16:33.440Z).

| Attested | Value |
|---|---|
| Device | cua-bench |
| Host commit | b3cb6dbfde346a7e1e90bd2bc065052853aec056 |
| REPL host | cua (initialize: cua-repl-host 0.5.0) |
| Runtime release | 26.928.40906-linux-arm64 |
| Hardware | Google Compute Engine, arm64, 4 CPUs, 16 GiB |
| OS | Ubuntu 24.04.5 LTS (7.0.0-1014-gcp) |
| Display | 1440 x 900 points at scale 1 (1440 x 900 pixels) |
| Service | computer surface, answered by vendor (helper: pinned runtime) |
| Sandbox | disabled (platform default) |
| Sample plan | 5 cold, 30 warm, 10 tasks |

Milliseconds. Latency columns cover successful samples only (invalidated samples, whose target was not the scratch document, are counted apart); wall is the harness's time around the MCP call (it includes the ssh pipe), in-cell is `performance.now()` inside the cell on the device.

| Operation | Samples | OK | Invalid | Errors | Wall median | Wall p95 | Wall max | In-cell median | In-cell p95 | In-cell max |
|---|---|---|---|---|---|---|---|---|---|---|
| ssh.roundtrip | 15 | 15 | 0 | 0 | 2207.3 | 3606.0 | 3606.0 | – | – | – |
| cold.miss.initialize | 6 | 6 | 0 | 0 | 2699.2 | 2827.3 | 2827.3 | – | – | – |
| cold.miss.tools_list | 6 | 6 | 0 | 0 | 175.8 | 194.6 | 194.6 | – | – | – |
| cold.miss.first_js | 6 | 6 | 0 | 0 | 651.8 | 742.6 | 742.6 | 0.01 | 0.03 | 0.03 |
| cold.miss.total | 6 | 6 | 0 | 0 | 3566.4 | 3730.4 | 3730.4 | – | – | – |
| cold.hit.initialize | 9 | 9 | 0 | 0 | 2296.5 | 3183.8 | 3183.8 | – | – | – |
| cold.hit.tools_list | 9 | 9 | 0 | 0 | 172.2 | 195.5 | 195.5 | – | – | – |
| cold.hit.first_js | 9 | 9 | 0 | 0 | 769.1 | 1033.0 | 1033.0 | 0.01 | 0.03 | 0.03 |
| cold.hit.total | 9 | 9 | 0 | 0 | 3254.6 | 4397.1 | 4397.1 | – | – | – |
| warm.noop | 90 | 90 | 0 | 0 | 173.1 | 243.7 | 275.0 | 0.01 | 0.03 | 0.05 |
| warm.getState | 90 | 90 | 0 | 0 | 179.8 | 361.4 | 631.8 | 2.67 | 3.24 | 16.4 |
| warm.listApps | 90 | 90 | 0 | 0 | 167.9 | 233.9 | 300.7 | 2.61 | 2.92 | 3.02 |
| setup.findWindow | 3 | 3 | 0 | 0 | 211.2 | 420.9 | 420.9 | 8.66 | 262.3 | 262.3 |
| bind.getApp | 3 | 3 | 0 | 0 | 529.4 | 829.4 | 829.4 | 362.0 | 379.6 | 379.6 |
| warm.getAXState | 90 | 90 | 0 | 0 | 518.6 | 599.4 | 765.0 | 333.6 | 343.1 | 351.1 |
| warm.getScreenshot | 90 | 90 | 0 | 0 | 620.3 | 756.6 | 951.7 | 447.9 | 461.8 | 466.9 |
| task.act | 30 | 30 | 0 | 0 | 16318.5 | 16443.0 | 16471.6 | 16142.5 | 16174.5 | 16178.2 |
| task.verify | 30 | 30 | 0 | 0 | 512.1 | 710.3 | 905.0 | 336.0 | 352.6 | 353.6 |
| task.clear | 30 | 30 | 0 | 0 | 1318.1 | 1419.4 | 1439.4 | 1138.8 | 1152.7 | 1157.1 |
| task.total | 30 | 30 | 0 | 0 | 18159.3 | 18413.5 | 18796.0 | 17616.9 | 17644.0 | 17669.4 |
| method.typeText | 3 | 3 | 0 | 0 | 1636.2 | 1641.6 | 1641.6 | 1477.9 | 1484.9 | 1484.9 |
| method.paste | 3 | 3 | 0 | 0 | 1662.3 | 1674.5 | 1674.5 | 1471.8 | 1473.9 | 1473.9 |
| method.paste.format | 3 | 3 | 0 | 0 | 196.8 | 202.9 | 202.9 | 0.07 | 0.08 | 0.08 |
| method.setValue | 3 | 3 | 0 | 0 | 165.3 | 193.6 | 193.6 | 0.14 | 0.14 | 0.14 |
| method.selectText | 3 | 3 | 0 | 0 | 156.7 | 202.7 | 202.7 | 0.12 | 0.12 | 0.12 |
| method.scroll.pages | 3 | 3 | 0 | 0 | 159.7 | 204.6 | 204.6 | 0.12 | 0.15 | 0.15 |
| end_task | 3 | 3 | 0 | 0 | 189.6 | 233.0 | 233.0 | – | – | – |
| setup.findTarget | 6 | 6 | 0 | 0 | 182.9 | 517.9 | 517.9 | 9.88 | 270.2 | 270.2 |

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
| warm.getState | apps 1 (1–1); browsers 0 (0–0) |
| warm.listApps | apps 1 (1–1); running 0 (0–0) |
| setup.findWindow | windowId 8388856 (8388856–8388856); app org.gnome.gedit; windows 2 (2–2) |
| bind.getApp | approvals 0 (0–0) |
| warm.getAXState | source at_spi; chars 9104 (9104–9104); lines 382 (382–382); elements 381 (381–381) |
| warm.getScreenshot | bytes 35760 (35477–35878); width 910 (910–910); height 756 (756–756); format jpeg; sha256 350bb1eb1e008349, 38bcb6f34bda559b, 7b3b73fe1258441d |
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
| setup.findTarget | windowId 10486008 (10486008–10486008); app org.gnome.gedit; windows 3 (3–3); for method.paste, method.typeText |

## Invalidated samples

None.

## Errors

None.

## Problems

No problems: every run is complete and attests the same commit, REPL host, release, hardware, OS, display, service, sandbox and sample plan.
