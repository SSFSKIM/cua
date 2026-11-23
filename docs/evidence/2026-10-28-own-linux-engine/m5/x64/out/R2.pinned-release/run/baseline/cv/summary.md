# Native baseline summary

Runs: run-1 (2026-11-16T17:10:00.179Z to 2026-11-16T17:14:36.971Z); run-2 (2026-11-16T17:17:19.654Z to 2026-11-16T17:21:54.941Z); run-3 (2026-11-16T17:24:31.990Z to 2026-11-16T17:29:05.775Z).

| Attested | Value |
|---|---|
| Device | cua-171 |
| Host commit | fefe306c288956a48b6c086017f3cd1a58462a07 |
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
| ssh.roundtrip | 15 | 15 | 0 | 0 | 303.6 | 320.7 | 320.7 | – | – | – |
| cold.miss.initialize | 6 | 6 | 0 | 0 | 630.8 | 668.6 | 668.6 | – | – | – |
| cold.miss.tools_list | 6 | 6 | 0 | 0 | 2.75 | 3.00 | 3.00 | – | – | – |
| cold.miss.first_js | 6 | 6 | 0 | 0 | 365.2 | 408.4 | 408.4 | 0.01 | 0.03 | 0.03 |
| cold.miss.total | 6 | 6 | 0 | 0 | 1018.3 | 1039.7 | 1039.7 | – | – | – |
| cold.hit.initialize | 9 | 9 | 0 | 0 | 514.5 | 588.0 | 588.0 | – | – | – |
| cold.hit.tools_list | 9 | 9 | 0 | 0 | 1.23 | 2.43 | 2.43 | – | – | – |
| cold.hit.first_js | 9 | 9 | 0 | 0 | 495.1 | 557.2 | 557.2 | 0.01 | 0.03 | 0.03 |
| cold.hit.total | 9 | 9 | 0 | 0 | 1023.2 | 1120.5 | 1120.5 | – | – | – |
| warm.noop | 90 | 90 | 0 | 0 | 14.2 | 18.4 | 27.6 | 0.01 | 0.03 | 0.05 |
| warm.getState | 90 | 90 | 0 | 0 | 17.2 | 21.8 | 27.0 | 3.99 | 5.70 | 12.0 |
| warm.listApps | 90 | 90 | 0 | 0 | 16.7 | 22.2 | 28.6 | 4.15 | 5.61 | 6.53 |
| setup.findWindow | 3 | 3 | 0 | 0 | 276.3 | 285.1 | 285.1 | 263.0 | 269.7 | 269.7 |
| bind.getApp | 3 | 3 | 0 | 0 | 547.5 | 630.8 | 630.8 | 533.0 | 605.8 | 605.8 |
| approval.elicitation | 3 | 3 | 0 | 0 | 32.1 | 57.1 | 57.1 | – | – | – |
| warm.getAXState | 90 | 90 | 0 | 0 | 496.9 | 654.3 | 804.2 | 484.6 | 642.6 | 785.8 |
| warm.getScreenshot | 90 | 90 | 0 | 0 | 653.1 | 779.0 | 920.6 | 637.0 | 757.6 | 898.8 |
| task.act | 30 | 30 | 0 | 0 | 16757.2 | 16924.7 | 17056.6 | 16743.7 | 16912.3 | 17036.5 |
| task.verify | 30 | 30 | 0 | 0 | 618.8 | 823.3 | 841.6 | 604.6 | 802.7 | 821.2 |
| task.clear | 30 | 30 | 0 | 0 | 1336.9 | 1572.2 | 1586.3 | 1321.1 | 1559.8 | 1566.1 |
| task.total | 30 | 30 | 0 | 0 | 18699.5 | 19186.7 | 19231.4 | 18661.5 | 19141.1 | 19186.2 |
| method.typeText | 3 | 3 | 0 | 0 | 10234.0 | 10234.8 | 10234.8 | 10220.7 | 10220.9 | 10220.9 |
| method.paste | 3 | 3 | 0 | 0 | 10241.6 | 10247.2 | 10247.2 | 10227.1 | 10227.4 | 10227.4 |
| method.paste.format | 3 | 3 | 0 | 0 | 13.0 | 22.8 | 22.8 | 0.07 | 0.13 | 0.13 |
| method.setValue | 3 | 3 | 0 | 0 | 17.0 | 20.7 | 20.7 | 0.15 | 0.18 | 0.18 |
| method.selectText | 3 | 3 | 0 | 0 | 20.8 | 29.6 | 29.6 | 0.15 | 0.24 | 0.24 |
| method.scroll.pages | 3 | 3 | 0 | 0 | 12.3 | 21.1 | 21.1 | 0.16 | 0.23 | 0.23 |
| end_task | 3 | 3 | 0 | 0 | 3.46 | 3.82 | 3.82 | – | – | – |
| setup.findTarget | 6 | 6 | 0 | 0 | 291.2 | 298.3 | 298.3 | 276.1 | 279.6 | 279.6 |

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
| warm.getState | apps 17 (17–17); browsers 0 (0–0) |
| warm.listApps | apps 17 (17–17); running 0 (0–0) |
| setup.findWindow | windowId 8388708 (8388708–8388708); app org.gnome.gedit; windows 2 (2–2) |
| bind.getApp | approvals 1 (1–1) |
| approval.elicitation | app org.gnome.gedit; action accept |
| warm.getAXState | source at_spi; chars 9104 (9104–9220); lines 382 (382–384); elements 381 (381–383) |
| warm.getScreenshot | bytes 35773 (35675–36052); width 910 (910–910); height 756 (756–756); format jpeg; sha256 67142c1759cd85f7, 8e71d63f3772601f, f4e942e90fcfabde |
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
