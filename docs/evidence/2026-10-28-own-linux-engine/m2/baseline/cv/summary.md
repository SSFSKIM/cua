# Native baseline summary

Runs: run-1 (2026-10-30T09:39:40.669Z to 2026-10-30T09:44:19.736Z); run-2 (2026-10-30T09:47:37.516Z to 2026-10-30T09:52:16.559Z); run-3 (2026-10-30T09:55:32.972Z to 2026-10-30T10:00:11.328Z).

| Attested | Value |
|---|---|
| Device | cua-171 |
| Host commit | e0168c63871cfa140ea81e2f97ec6a8f9d73adc1 |
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
| ssh.roundtrip | 15 | 15 | 0 | 0 | 287.7 | 318.4 | 318.4 | – | – | – |
| cold.miss.initialize | 6 | 6 | 0 | 0 | 630.2 | 678.5 | 678.5 | – | – | – |
| cold.miss.tools_list | 6 | 6 | 0 | 0 | 2.31 | 3.50 | 3.50 | – | – | – |
| cold.miss.first_js | 6 | 6 | 0 | 0 | 363.9 | 391.9 | 391.9 | 0.01 | 0.02 | 0.02 |
| cold.miss.total | 6 | 6 | 0 | 0 | 1011.7 | 1073.9 | 1073.9 | – | – | – |
| cold.hit.initialize | 9 | 9 | 0 | 0 | 527.6 | 572.4 | 572.4 | – | – | – |
| cold.hit.tools_list | 9 | 9 | 0 | 0 | 1.10 | 1.28 | 1.28 | – | – | – |
| cold.hit.first_js | 9 | 9 | 0 | 0 | 503.4 | 534.4 | 534.4 | 0.01 | 0.04 | 0.04 |
| cold.hit.total | 9 | 9 | 0 | 0 | 1033.9 | 1088.2 | 1088.2 | – | – | – |
| warm.noop | 90 | 90 | 0 | 0 | 13.5 | 20.1 | 21.5 | 0.01 | 0.03 | 0.10 |
| warm.getState | 90 | 90 | 0 | 0 | 22.8 | 28.8 | 30.9 | 8.94 | 12.1 | 18.2 |
| warm.listApps | 90 | 90 | 0 | 0 | 20.9 | 31.3 | 37.9 | 8.19 | 13.0 | 17.7 |
| setup.findWindow | 3 | 3 | 0 | 0 | 290.5 | 311.1 | 311.1 | 274.2 | 283.1 | 283.1 |
| bind.getApp | 3 | 3 | 0 | 0 | 627.8 | 665.5 | 665.5 | 613.8 | 641.0 | 641.0 |
| approval.elicitation | 3 | 3 | 0 | 0 | 45.6 | 66.0 | 66.0 | – | – | – |
| warm.getAXState | 90 | 90 | 0 | 0 | 538.2 | 722.8 | 825.5 | 522.2 | 706.5 | 803.1 |
| warm.getScreenshot | 90 | 90 | 0 | 0 | 634.8 | 782.1 | 922.8 | 618.2 | 767.6 | 902.2 |
| task.act | 30 | 30 | 0 | 0 | 16979.1 | 17163.8 | 17166.0 | 16965.6 | 17143.2 | 17151.7 |
| task.verify | 30 | 30 | 0 | 0 | 596.6 | 828.3 | 863.0 | 583.5 | 806.7 | 849.5 |
| task.clear | 30 | 30 | 0 | 0 | 1356.0 | 1446.0 | 1505.5 | 1343.3 | 1430.3 | 1492.6 |
| task.total | 30 | 30 | 0 | 0 | 18975.3 | 19206.3 | 19309.2 | 18934.2 | 19157.6 | 19253.8 |
| method.typeText | 3 | 3 | 0 | 0 | 10242.6 | 10250.1 | 10250.1 | 10228.0 | 10231.6 | 10231.6 |
| method.paste | 3 | 3 | 0 | 0 | 10244.9 | 10249.7 | 10249.7 | 10231.8 | 10236.3 | 10236.3 |
| method.paste.format | 3 | 3 | 0 | 0 | 13.8 | 14.0 | 14.0 | 0.08 | 0.12 | 0.12 |
| method.setValue | 3 | 3 | 0 | 0 | 15.9 | 21.3 | 21.3 | 0.13 | 0.23 | 0.23 |
| method.selectText | 3 | 3 | 0 | 0 | 15.0 | 17.0 | 17.0 | 0.11 | 0.14 | 0.14 |
| method.scroll.pages | 3 | 3 | 0 | 0 | 17.2 | 17.4 | 17.4 | 0.13 | 0.17 | 0.17 |
| end_task | 3 | 3 | 0 | 0 | 3.64 | 4.24 | 4.24 | – | – | – |
| setup.findTarget | 6 | 6 | 0 | 0 | 312.6 | 320.9 | 320.9 | 299.2 | 306.5 | 306.5 |

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
| warm.getScreenshot | bytes 35656 (35535–35705); width 910 (910–910); height 756 (756–756); format jpeg; sha256 1d06d12dafbf2829, 42d77b617fae4d50, 670fd899d66726b3 |
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
