# Native baseline summary

Runs: run-1 (2026-11-13T07:03:23.990Z to 2026-11-13T07:07:58.392Z); run-2 (2026-11-13T07:10:29.303Z to 2026-11-13T07:15:03.891Z); run-3 (2026-11-13T07:17:35.130Z to 2026-11-13T07:22:09.310Z).

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
| ssh.roundtrip | 15 | 15 | 0 | 0 | 287.5 | 312.2 | 312.2 | – | – | – |
| cold.miss.initialize | 6 | 6 | 0 | 0 | 651.5 | 685.2 | 685.2 | – | – | – |
| cold.miss.tools_list | 6 | 6 | 0 | 0 | 2.54 | 3.19 | 3.19 | – | – | – |
| cold.miss.first_js | 6 | 6 | 0 | 0 | 390.8 | 438.7 | 438.7 | 0.02 | 0.05 | 0.05 |
| cold.miss.total | 6 | 6 | 0 | 0 | 1037.2 | 1127.0 | 1127.0 | – | – | – |
| cold.hit.initialize | 9 | 9 | 0 | 0 | 530.1 | 580.8 | 580.8 | – | – | – |
| cold.hit.tools_list | 9 | 9 | 0 | 0 | 1.16 | 1.56 | 1.56 | – | – | – |
| cold.hit.first_js | 9 | 9 | 0 | 0 | 482.1 | 534.9 | 534.9 | 0.02 | 0.03 | 0.03 |
| cold.hit.total | 9 | 9 | 0 | 0 | 1013.4 | 1115.3 | 1115.3 | – | – | – |
| warm.noop | 90 | 90 | 0 | 0 | 14.5 | 20.2 | 27.5 | 0.01 | 0.02 | 0.04 |
| warm.getState | 90 | 90 | 0 | 0 | 17.6 | 21.7 | 26.3 | 3.94 | 5.88 | 11.2 |
| warm.listApps | 90 | 90 | 0 | 0 | 16.8 | 20.4 | 22.1 | 3.88 | 4.71 | 5.71 |
| setup.findWindow | 3 | 3 | 0 | 0 | 278.2 | 285.7 | 285.7 | 263.7 | 270.4 | 270.4 |
| bind.getApp | 3 | 3 | 0 | 0 | 580.6 | 584.2 | 584.2 | 560.6 | 562.0 | 562.0 |
| approval.elicitation | 3 | 3 | 0 | 0 | 35.0 | 51.8 | 51.8 | – | – | – |
| warm.getAXState | 90 | 90 | 0 | 0 | 490.6 | 671.0 | 907.6 | 477.3 | 657.2 | 884.8 |
| warm.getScreenshot | 90 | 90 | 0 | 0 | 632.6 | 833.7 | 938.4 | 619.3 | 811.7 | 923.9 |
| task.act | 30 | 30 | 0 | 0 | 16743.6 | 16883.2 | 17012.1 | 16730.5 | 16869.9 | 16998.1 |
| task.verify | 30 | 30 | 0 | 0 | 585.6 | 877.0 | 913.0 | 571.0 | 853.3 | 899.7 |
| task.clear | 30 | 30 | 0 | 0 | 1320.1 | 1475.3 | 1575.2 | 1306.4 | 1461.4 | 1563.9 |
| task.total | 30 | 30 | 0 | 0 | 18700.0 | 19027.0 | 19172.4 | 18652.1 | 18973.3 | 19131.9 |
| method.typeText | 3 | 3 | 0 | 0 | 10247.9 | 10248.4 | 10248.4 | 10226.8 | 10227.8 | 10227.8 |
| method.paste | 3 | 3 | 0 | 0 | 10231.4 | 10237.3 | 10237.3 | 10217.8 | 10225.5 | 10225.5 |
| method.paste.format | 3 | 3 | 0 | 0 | 17.5 | 17.6 | 17.6 | 0.09 | 0.14 | 0.14 |
| method.setValue | 3 | 3 | 0 | 0 | 16.5 | 17.3 | 17.3 | 0.12 | 0.21 | 0.21 |
| method.selectText | 3 | 3 | 0 | 0 | 15.8 | 20.2 | 20.2 | 0.11 | 0.14 | 0.14 |
| method.scroll.pages | 3 | 3 | 0 | 0 | 17.6 | 21.6 | 21.6 | 0.22 | 0.24 | 0.24 |
| end_task | 3 | 3 | 0 | 0 | 3.12 | 3.52 | 3.52 | – | – | – |
| setup.findTarget | 6 | 6 | 0 | 0 | 290.1 | 299.5 | 299.5 | 275.0 | 287.1 | 287.1 |

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
| warm.getScreenshot | bytes 35768 (35627–36079); width 910 (910–910); height 756 (756–756); format jpeg; sha256 44617d6c8f7c232e, c1a3044c4cf96ce5, e3352761e8d6ddd2 |
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
