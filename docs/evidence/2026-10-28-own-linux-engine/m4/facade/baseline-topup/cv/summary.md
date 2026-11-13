# Native baseline summary

Runs: run-1 (2026-11-13T07:58:56.295Z to 2026-11-13T08:03:32.472Z); run-2 (2026-11-13T08:06:01.999Z to 2026-11-13T08:10:35.641Z); run-3 (2026-11-13T08:13:06.608Z to 2026-11-13T08:17:44.152Z).

| Attested | Value |
|---|---|
| Device | cua-171 |
| Host commit | 8ab1cc758983e7774cbff74a1cc2fd2d745120bb |
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
| ssh.roundtrip | 15 | 15 | 0 | 0 | 322.0 | 344.8 | 344.8 | – | – | – |
| cold.miss.initialize | 6 | 6 | 0 | 0 | 684.8 | 706.3 | 706.3 | – | – | – |
| cold.miss.tools_list | 6 | 6 | 0 | 0 | 2.51 | 3.49 | 3.49 | – | – | – |
| cold.miss.first_js | 6 | 6 | 0 | 0 | 372.7 | 429.7 | 429.7 | 0.01 | 0.05 | 0.05 |
| cold.miss.total | 6 | 6 | 0 | 0 | 1057.3 | 1121.6 | 1121.6 | – | – | – |
| cold.hit.initialize | 9 | 9 | 0 | 0 | 527.9 | 566.1 | 566.1 | – | – | – |
| cold.hit.tools_list | 9 | 9 | 0 | 0 | 1.22 | 1.68 | 1.68 | – | – | – |
| cold.hit.first_js | 9 | 9 | 0 | 0 | 507.9 | 557.6 | 557.6 | 0.01 | 0.02 | 0.02 |
| cold.hit.total | 9 | 9 | 0 | 0 | 1060.7 | 1125.3 | 1125.3 | – | – | – |
| warm.noop | 90 | 90 | 0 | 0 | 16.2 | 25.6 | 31.7 | 0.01 | 0.03 | 0.05 |
| warm.getState | 90 | 90 | 0 | 0 | 17.5 | 31.7 | 46.2 | 4.25 | 8.82 | 17.9 |
| warm.listApps | 90 | 90 | 0 | 0 | 17.1 | 22.0 | 31.4 | 3.92 | 6.11 | 7.14 |
| setup.findWindow | 3 | 3 | 0 | 0 | 287.6 | 299.2 | 299.2 | 269.1 | 271.5 | 271.5 |
| bind.getApp | 3 | 3 | 0 | 0 | 652.2 | 792.9 | 792.9 | 625.3 | 775.1 | 775.1 |
| approval.elicitation | 3 | 3 | 0 | 0 | 45.6 | 53.8 | 53.8 | – | – | – |
| warm.getAXState | 90 | 90 | 0 | 0 | 499.0 | 742.4 | 852.3 | 483.8 | 730.2 | 831.5 |
| warm.getScreenshot | 90 | 90 | 0 | 0 | 658.2 | 882.4 | 1000.4 | 643.2 | 863.6 | 979.7 |
| task.act | 30 | 30 | 0 | 0 | 16739.2 | 16985.5 | 17119.7 | 16725.1 | 16967.0 | 17106.5 |
| task.verify | 30 | 30 | 0 | 0 | 578.7 | 824.9 | 856.3 | 566.3 | 804.8 | 835.2 |
| task.clear | 30 | 30 | 0 | 0 | 1316.1 | 1429.7 | 1578.6 | 1304.4 | 1416.1 | 1566.8 |
| task.total | 30 | 30 | 0 | 0 | 18617.7 | 19054.6 | 19150.9 | 18574.0 | 19007.7 | 19098.9 |
| method.typeText | 3 | 3 | 0 | 0 | 10233.6 | 10235.7 | 10235.7 | 10220.4 | 10222.4 | 10222.4 |
| method.paste | 3 | 3 | 0 | 0 | 10230.6 | 10232.4 | 10232.4 | 10217.3 | 10219.2 | 10219.2 |
| method.paste.format | 3 | 3 | 0 | 0 | 11.3 | 13.1 | 13.1 | 0.08 | 0.10 | 0.10 |
| method.setValue | 3 | 3 | 0 | 0 | 16.2 | 17.2 | 17.2 | 0.13 | 0.16 | 0.16 |
| method.selectText | 3 | 3 | 0 | 0 | 16.2 | 18.2 | 18.2 | 0.12 | 0.12 | 0.12 |
| method.scroll.pages | 3 | 3 | 0 | 0 | 16.8 | 19.8 | 19.8 | 0.16 | 0.18 | 0.18 |
| end_task | 3 | 3 | 0 | 0 | 3.29 | 3.37 | 3.37 | – | – | – |
| setup.findTarget | 6 | 6 | 0 | 0 | 297.3 | 308.1 | 308.1 | 283.4 | 291.2 | 291.2 |

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
| warm.getScreenshot | bytes 35835 (35447–36040); width 910 (910–910); height 756 (756–756); format jpeg; sha256 7d63301a834efb21, 97a55ca9ad846205, 9edb3ed525673dd5 |
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
