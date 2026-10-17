# Native baseline summary

Runs: run-1 (2026-10-16T18:38:42.557Z to 2026-10-16T18:44:08.997Z); run-2 (2026-10-16T18:44:50.415Z to 2026-10-16T18:50:16.351Z); run-3 (2026-10-16T18:50:57.032Z to 2026-10-16T18:56:27.899Z).

| Attested | Value |
|---|---|
| Device | cua-bench |
| Host commit | b3cb6dbfde346a7e1e90bd2bc065052853aec056 |
| REPL host | vendor (initialize: rmcp 1.5.0) |
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
| ssh.roundtrip | 15 | 15 | 0 | 0 | 2149.5 | 2769.2 | 2769.2 | – | – | – |
| cold.miss.initialize | 6 | 6 | 0 | 0 | 2702.8 | 3006.5 | 3006.5 | – | – | – |
| cold.miss.tools_list | 6 | 6 | 0 | 0 | 187.4 | 351.4 | 351.4 | – | – | – |
| cold.miss.first_js | 6 | 6 | 0 | 0 | 640.0 | 785.4 | 785.4 | 0.01 | 0.01 | 0.01 |
| cold.miss.total | 6 | 6 | 0 | 0 | 3518.2 | 3979.9 | 3979.9 | – | – | – |
| cold.hit.initialize | 9 | 9 | 0 | 0 | 2561.2 | 2951.5 | 2951.5 | – | – | – |
| cold.hit.tools_list | 9 | 9 | 0 | 0 | 160.0 | 187.0 | 187.0 | – | – | – |
| cold.hit.first_js | 9 | 9 | 0 | 0 | 755.3 | 863.0 | 863.0 | 0.01 | 0.01 | 0.01 |
| cold.hit.total | 9 | 9 | 0 | 0 | 3478.8 | 3996.4 | 3996.4 | – | – | – |
| warm.noop | 90 | 90 | 0 | 0 | 176.0 | 338.4 | 519.9 | 0.01 | 0.03 | 0.06 |
| warm.getState | 90 | 90 | 0 | 0 | 174.2 | 222.6 | 753.3 | 2.50 | 3.98 | 28.7 |
| warm.listApps | 90 | 90 | 0 | 0 | 167.2 | 232.7 | 600.0 | 2.46 | 2.81 | 4.10 |
| setup.findWindow | 3 | 3 | 0 | 0 | 443.5 | 457.2 | 457.2 | 262.1 | 262.5 | 262.5 |
| bind.getApp | 3 | 3 | 0 | 0 | 521.3 | 534.5 | 534.5 | 351.4 | 362.2 | 362.2 |
| warm.getAXState | 90 | 90 | 0 | 0 | 497.8 | 534.5 | 638.3 | 328.1 | 343.2 | 348.7 |
| warm.getScreenshot | 90 | 90 | 0 | 0 | 617.0 | 720.5 | 855.4 | 446.8 | 457.2 | 462.2 |
| task.act | 30 | 30 | 0 | 0 | 16328.6 | 16608.0 | 16615.7 | 16152.1 | 16171.0 | 16172.5 |
| task.verify | 30 | 30 | 0 | 0 | 499.4 | 533.8 | 716.8 | 330.1 | 340.4 | 344.1 |
| task.clear | 30 | 30 | 0 | 0 | 1314.1 | 1440.4 | 1647.7 | 1133.6 | 1142.9 | 1144.5 |
| task.total | 30 | 30 | 0 | 0 | 18158.7 | 18500.4 | 18584.9 | 17617.1 | 17635.4 | 17637.7 |
| method.typeText | 3 | 3 | 0 | 0 | 1634.5 | 3014.3 | 3014.3 | 1474.9 | 2849.7 | 2849.7 |
| method.paste | 3 | 3 | 0 | 0 | 1637.8 | 1661.6 | 1661.6 | 1467.8 | 1468.8 | 1468.8 |
| method.paste.format | 3 | 3 | 0 | 0 | 164.8 | 166.3 | 166.3 | 0.08 | 0.11 | 0.11 |
| method.setValue | 3 | 3 | 0 | 0 | 179.3 | 202.4 | 202.4 | 0.17 | 0.18 | 0.18 |
| method.selectText | 3 | 3 | 0 | 0 | 159.4 | 175.1 | 175.1 | 0.14 | 0.21 | 0.21 |
| method.scroll.pages | 3 | 3 | 0 | 0 | 183.3 | 199.0 | 199.0 | 0.15 | 0.21 | 0.21 |
| end_task | 3 | 3 | 0 | 0 | 159.7 | 235.6 | 235.6 | – | – | – |
| setup.findTarget | 6 | 6 | 0 | 0 | 174.8 | 426.7 | 426.7 | 9.56 | 268.6 | 268.6 |

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
| warm.getState | apps 1 (1–1); browsers 0 (0–0) |
| warm.listApps | apps 1 (1–1); running 0 (0–0) |
| setup.findWindow | windowId 8388856 (8388856–8388856); app org.gnome.gedit; windows 2 (2–2) |
| bind.getApp | approvals 0 (0–0) |
| warm.getAXState | source at_spi; chars 9104 (9104–9220); lines 382 (382–384); elements 381 (381–383) |
| warm.getScreenshot | bytes 35666 (35461–35720); width 910 (910–910); height 756 (756–756); format jpeg; sha256 893c3de911c560f8, 90d51d683dc699c5, c85569edc602a442 |
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
| setup.findTarget | windowId 10486008 (10486008–10486008); app org.gnome.gedit; windows 3 (3–3); for method.paste, method.typeText |

## Invalidated samples

None.

## Errors

None.

## Problems

No problems: every run is complete and attests the same commit, REPL host, release, hardware, OS, display, service, sandbox and sample plan.
