# Native baseline summary

Runs: run-1 (2026-10-17T08:32:00.440Z to 2026-10-17T08:38:21.254Z); run-2 (2026-10-17T08:39:02.154Z to 2026-10-17T08:45:22.020Z); run-3 (2026-10-17T08:46:02.678Z to 2026-10-17T08:52:22.102Z).

| Attested | Value |
|---|---|
| Device | cua-gce |
| Host commit | aacc6755b46b1898b6b102d32a2a15b6e50e9cd0 |
| REPL host | cua (initialize: cua-repl-host 0.5.0) |
| Runtime release | 26.928.40906-linux-arm64 |
| Hardware | Google Compute Engine, arm64, 4 CPUs, 16 GiB |
| OS | Ubuntu 24.04.5 LTS (7.0.0-1014-gcp) |
| Display | 1280 x 800 points at scale 1 (1280 x 800 pixels) |
| Service | computer surface, answered by vendor (helper: pinned runtime) |
| Sandbox | disabled (platform default) |
| Sample plan | 5 cold, 30 warm, 10 tasks |

Milliseconds. Latency columns cover successful samples only (invalidated samples, whose target was not the scratch document, are counted apart); wall is the harness's time around the MCP call (it includes the ssh pipe), in-cell is `performance.now()` inside the cell on the device.

| Operation | Samples | OK | Invalid | Errors | Wall median | Wall p95 | Wall max | In-cell median | In-cell p95 | In-cell max |
|---|---|---|---|---|---|---|---|---|---|---|
| ssh.roundtrip | 15 | 15 | 0 | 0 | 2624.4 | 3011.6 | 3011.6 | – | – | – |
| cold.miss.initialize | 6 | 6 | 0 | 0 | 2899.8 | 3238.5 | 3238.5 | – | – | – |
| cold.miss.tools_list | 6 | 6 | 0 | 0 | 287.0 | 686.0 | 686.0 | – | – | – |
| cold.miss.first_js | 6 | 6 | 0 | 0 | 666.5 | 689.3 | 689.3 | 0.01 | 0.02 | 0.02 |
| cold.miss.total | 6 | 6 | 0 | 0 | 3930.5 | 4290.4 | 4290.4 | – | – | – |
| cold.hit.initialize | 9 | 9 | 0 | 0 | 2772.8 | 3119.5 | 3119.5 | – | – | – |
| cold.hit.tools_list | 9 | 9 | 0 | 0 | 397.8 | 627.1 | 627.1 | – | – | – |
| cold.hit.first_js | 9 | 9 | 0 | 0 | 773.6 | 992.4 | 992.4 | 0.01 | 0.02 | 0.02 |
| cold.hit.total | 9 | 9 | 0 | 0 | 3995.2 | 4380.5 | 4380.5 | – | – | – |
| warm.noop | 90 | 90 | 0 | 0 | 175.4 | 302.0 | 349.3 | 0.01 | 0.03 | 0.06 |
| warm.getState | 90 | 90 | 0 | 0 | 400.0 | 578.3 | 653.3 | 5.67 | 7.68 | 19.2 |
| warm.listApps | 90 | 90 | 0 | 0 | 429.8 | 544.9 | 602.5 | 5.65 | 5.87 | 6.34 |
| setup.findWindow | 3 | 3 | 0 | 0 | 456.4 | 662.4 | 662.4 | 8.57 | 8.80 | 8.80 |
| bind.getApp | 3 | 3 | 0 | 0 | 739.0 | 795.6 | 795.6 | 364.8 | 366.4 | 366.4 |
| warm.getAXState | 90 | 90 | 0 | 0 | 698.1 | 842.7 | 1051.9 | 330.6 | 339.3 | 341.5 |
| warm.getScreenshot | 90 | 90 | 0 | 0 | 806.0 | 963.0 | 1035.2 | 446.9 | 459.8 | 472.8 |
| task.act | 30 | 30 | 0 | 0 | 16514.1 | 16733.3 | 16746.8 | 16153.8 | 16168.7 | 16171.4 |
| task.verify | 30 | 30 | 0 | 0 | 674.2 | 778.4 | 840.9 | 332.1 | 343.8 | 345.8 |
| task.clear | 30 | 30 | 0 | 0 | 1494.4 | 1626.1 | 1681.8 | 1138.9 | 1148.5 | 1150.3 |
| task.total | 30 | 30 | 0 | 0 | 18685.1 | 19020.8 | 19082.2 | 17629.8 | 17654.0 | 17657.8 |
| method.typeText | 3 | 3 | 0 | 0 | 2028.4 | 3242.4 | 3242.4 | 1478.3 | 2876.4 | 2876.4 |
| method.paste | 3 | 3 | 0 | 0 | 1869.9 | 1879.7 | 1879.7 | 1471.6 | 1473.9 | 1473.9 |
| method.paste.format | 3 | 3 | 0 | 0 | 322.4 | 493.0 | 493.0 | 0.07 | 0.09 | 0.09 |
| method.setValue | 3 | 3 | 0 | 0 | 437.4 | 470.4 | 470.4 | 0.13 | 0.16 | 0.16 |
| method.selectText | 3 | 3 | 0 | 0 | 385.9 | 540.7 | 540.7 | 0.13 | 0.14 | 0.14 |
| method.scroll.pages | 3 | 3 | 0 | 0 | 467.6 | 514.0 | 514.0 | 0.13 | 0.19 | 0.19 |
| end_task | 3 | 3 | 0 | 0 | 209.5 | 250.1 | 250.1 | – | – | – |
| setup.findTarget | 6 | 6 | 0 | 0 | 334.3 | 465.9 | 465.9 | 11.5 | 11.8 | 11.8 |

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
| warm.getAXState | source at_spi; chars 9102 (9102–9102); lines 382 (382–382); elements 381 (381–381) |
| warm.getScreenshot | bytes 35633 (35593–35837); width 910 (910–910); height 756 (756–756); format jpeg; sha256 0d6130694731916d, 57628ab4c756b101, e1a1702b4328601e |
| task.act | actions 43 (43–43); observations 1 (1–1) |
| task.verify | observations 1 (1–1) |
| task.clear | actions 2 (2–2); observations 1 (1–1) |
| task.total | cells 3 (3–3); actions 45 (45–45); observations 3 (3–3); outcome typed with pressKey, verified, cleared |
| method.typeText | outcome threw; methodError D-Bus org.freedesktop.DBus.Properties.Get failed: org.freedesktop.DBus.Error.NoReply: Message recipient disconnected from message bus without replying, Resource temporarily unavailable (os error 11); target exited |
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
