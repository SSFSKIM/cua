# Native baseline summary

Runs: run-1 (2026-11-13T12:14:07.951Z to 2026-11-13T12:18:46.486Z); run-2 (2026-11-13T12:21:19.682Z to 2026-11-13T12:25:54.535Z); run-3 (2026-11-13T12:28:26.311Z to 2026-11-13T12:32:59.226Z).

| Attested | Value |
|---|---|
| Device | cua-171 |
| Host commit | 514f5c62dd6c74b1ed24c48f112ca9c35a70eece |
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
| ssh.roundtrip | 15 | 15 | 0 | 0 | 295.6 | 347.3 | 347.3 | – | – | – |
| cold.miss.initialize | 6 | 6 | 0 | 0 | 662.8 | 693.1 | 693.1 | – | – | – |
| cold.miss.tools_list | 6 | 6 | 0 | 0 | 2.65 | 2.98 | 2.98 | – | – | – |
| cold.miss.first_js | 6 | 6 | 0 | 0 | 373.7 | 402.3 | 402.3 | 0.01 | 0.02 | 0.02 |
| cold.miss.total | 6 | 6 | 0 | 0 | 1040.9 | 1095.4 | 1095.4 | – | – | – |
| cold.hit.initialize | 9 | 9 | 0 | 0 | 527.6 | 551.3 | 551.3 | – | – | – |
| cold.hit.tools_list | 9 | 9 | 0 | 0 | 1.23 | 1.49 | 1.49 | – | – | – |
| cold.hit.first_js | 9 | 9 | 0 | 0 | 498.8 | 556.4 | 556.4 | 0.02 | 0.02 | 0.02 |
| cold.hit.total | 9 | 9 | 0 | 0 | 1030.6 | 1085.2 | 1085.2 | – | – | – |
| warm.noop | 90 | 90 | 0 | 0 | 14.5 | 19.8 | 27.0 | 0.01 | 0.04 | 0.06 |
| warm.getState | 90 | 90 | 0 | 0 | 17.6 | 23.3 | 28.1 | 4.42 | 7.04 | 14.1 |
| warm.listApps | 90 | 90 | 0 | 0 | 19.1 | 27.9 | 33.8 | 5.86 | 7.18 | 8.90 |
| setup.findWindow | 3 | 3 | 0 | 0 | 278.8 | 287.9 | 287.9 | 264.5 | 265.3 | 265.3 |
| bind.getApp | 3 | 3 | 0 | 0 | 597.8 | 700.0 | 700.0 | 580.0 | 685.8 | 685.8 |
| approval.elicitation | 3 | 3 | 0 | 0 | 36.4 | 40.5 | 40.5 | – | – | – |
| warm.getAXState | 90 | 90 | 0 | 0 | 502.1 | 678.3 | 753.8 | 489.0 | 662.2 | 741.5 |
| warm.getScreenshot | 90 | 90 | 0 | 0 | 650.9 | 802.9 | 874.4 | 635.8 | 786.9 | 854.6 |
| task.act | 30 | 30 | 0 | 0 | 16714.7 | 16891.4 | 16948.6 | 16701.0 | 16877.8 | 16937.4 |
| task.verify | 30 | 30 | 0 | 0 | 598.1 | 809.9 | 833.1 | 581.2 | 796.1 | 819.4 |
| task.clear | 30 | 30 | 0 | 0 | 1323.5 | 1543.0 | 1551.7 | 1310.8 | 1529.2 | 1538.2 |
| task.total | 30 | 30 | 0 | 0 | 18721.9 | 19042.1 | 19049.0 | 18675.3 | 19001.4 | 19003.7 |
| method.typeText | 3 | 3 | 0 | 0 | 10239.3 | 10248.8 | 10248.8 | 10225.5 | 10228.3 | 10228.3 |
| method.paste | 3 | 3 | 0 | 0 | 10233.9 | 10240.9 | 10240.9 | 10222.3 | 10223.1 | 10223.1 |
| method.paste.format | 3 | 3 | 0 | 0 | 17.5 | 26.3 | 26.3 | 0.07 | 0.17 | 0.17 |
| method.setValue | 3 | 3 | 0 | 0 | 17.3 | 19.3 | 19.3 | 0.13 | 0.31 | 0.31 |
| method.selectText | 3 | 3 | 0 | 0 | 16.7 | 19.8 | 19.8 | 0.12 | 0.16 | 0.16 |
| method.scroll.pages | 3 | 3 | 0 | 0 | 16.7 | 19.4 | 19.4 | 0.13 | 0.13 | 0.13 |
| end_task | 3 | 3 | 0 | 0 | 3.38 | 3.75 | 3.75 | – | – | – |
| setup.findTarget | 6 | 6 | 0 | 0 | 293.5 | 298.7 | 298.7 | 277.2 | 285.3 | 285.3 |

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
| warm.getState | apps 17 (17–17); browsers 0 (0–0) |
| warm.listApps | apps 17 (17–17); running 0 (0–0) |
| setup.findWindow | windowId 8388708 (8388708–8388708); app org.gnome.gedit; windows 2 (2–2) |
| bind.getApp | approvals 1 (1–1) |
| approval.elicitation | app org.gnome.gedit; action accept |
| warm.getAXState | source at_spi; chars 9104 (9104–9220); lines 382 (382–384); elements 381 (381–383) |
| warm.getScreenshot | bytes 35655 (35645–35750); width 910 (910–910); height 756 (756–756); format jpeg; sha256 595c231bfeab32bf, 65feed58d0d70210, b2a594ea7f2162a9 |
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
| setup.findTarget | windowId 12583012 (12583012–12583012); app org.gnome.gedit; windows 3 (3–3); for method.paste, method.typeText |

## Invalidated samples

None.

## Errors

None.

## Problems

No problems: every run is complete and attests the same commit, REPL host, engine, approved engine, release, hardware, OS, display, service, sandbox and sample plan.
