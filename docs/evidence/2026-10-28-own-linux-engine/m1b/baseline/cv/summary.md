# Native baseline summary

Runs: run-1 (2026-10-29T20:45:59.628Z to 2026-10-29T20:50:40.122Z); run-2 (2026-10-29T20:53:56.689Z to 2026-10-29T20:58:34.012Z); run-3 (2026-10-29T21:01:53.549Z to 2026-10-29T21:06:34.036Z).

| Attested | Value |
|---|---|
| Device | cua-171 |
| Host commit | 41db78a2aa35b18655782d3aa28311518298ad44 |
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
| ssh.roundtrip | 15 | 15 | 0 | 0 | 295.0 | 339.9 | 339.9 | – | – | – |
| cold.miss.initialize | 6 | 6 | 0 | 0 | 668.3 | 678.2 | 678.2 | – | – | – |
| cold.miss.tools_list | 6 | 6 | 0 | 0 | 2.59 | 3.33 | 3.33 | – | – | – |
| cold.miss.first_js | 6 | 6 | 0 | 0 | 366.4 | 430.3 | 430.3 | 0.01 | 0.02 | 0.02 |
| cold.miss.total | 6 | 6 | 0 | 0 | 1036.7 | 1097.6 | 1097.6 | – | – | – |
| cold.hit.initialize | 9 | 9 | 0 | 0 | 514.4 | 564.7 | 564.7 | – | – | – |
| cold.hit.tools_list | 9 | 9 | 0 | 0 | 1.15 | 1.43 | 1.43 | – | – | – |
| cold.hit.first_js | 9 | 9 | 0 | 0 | 481.7 | 545.1 | 545.1 | 0.02 | 0.02 | 0.02 |
| cold.hit.total | 9 | 9 | 0 | 0 | 997.3 | 1062.7 | 1062.7 | – | – | – |
| warm.noop | 90 | 90 | 0 | 0 | 13.8 | 17.8 | 20.8 | 0.01 | 0.02 | 0.04 |
| warm.getState | 90 | 90 | 0 | 0 | 23.8 | 33.5 | 48.4 | 9.96 | 13.5 | 22.4 |
| warm.listApps | 90 | 90 | 0 | 0 | 20.9 | 30.9 | 38.0 | 8.69 | 14.2 | 20.3 |
| setup.findWindow | 3 | 3 | 0 | 0 | 292.5 | 300.0 | 300.0 | 277.8 | 286.6 | 286.6 |
| bind.getApp | 3 | 3 | 0 | 0 | 538.8 | 551.3 | 551.3 | 519.7 | 537.4 | 537.4 |
| approval.elicitation | 3 | 3 | 0 | 0 | 40.2 | 64.5 | 64.5 | – | – | – |
| warm.getAXState | 90 | 90 | 0 | 0 | 522.9 | 646.4 | 805.5 | 509.1 | 633.0 | 786.5 |
| warm.getScreenshot | 90 | 90 | 0 | 0 | 654.8 | 855.1 | 906.3 | 639.6 | 840.2 | 895.3 |
| task.act | 30 | 30 | 0 | 0 | 16994.9 | 17209.0 | 17425.7 | 16976.7 | 17189.9 | 17405.6 |
| task.verify | 30 | 30 | 0 | 0 | 611.5 | 822.3 | 848.0 | 597.7 | 801.0 | 832.4 |
| task.clear | 30 | 30 | 0 | 0 | 1334.4 | 1554.0 | 1646.1 | 1322.1 | 1538.7 | 1623.9 |
| task.total | 30 | 30 | 0 | 0 | 19003.2 | 19295.7 | 19630.9 | 18965.4 | 19251.3 | 19582.2 |
| method.typeText | 3 | 3 | 0 | 0 | 10238.8 | 10248.4 | 10248.4 | 10225.3 | 10232.4 | 10232.4 |
| method.paste | 3 | 3 | 0 | 0 | 10244.5 | 10256.6 | 10256.6 | 10231.0 | 10236.6 | 10236.6 |
| method.paste.format | 3 | 3 | 0 | 0 | 13.3 | 13.4 | 13.4 | 0.08 | 0.11 | 0.11 |
| method.setValue | 3 | 3 | 0 | 0 | 13.2 | 15.1 | 15.1 | 0.13 | 0.32 | 0.32 |
| method.selectText | 3 | 3 | 0 | 0 | 13.5 | 14.2 | 14.2 | 0.10 | 0.23 | 0.23 |
| method.scroll.pages | 3 | 3 | 0 | 0 | 11.8 | 14.4 | 14.4 | 0.15 | 0.20 | 0.20 |
| end_task | 3 | 3 | 0 | 0 | 2.89 | 2.92 | 2.92 | – | – | – |
| setup.findTarget | 6 | 6 | 0 | 0 | 306.8 | 314.6 | 314.6 | 292.5 | 298.4 | 298.4 |

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
| warm.getScreenshot | bytes 35547 (35480–35717); width 910 (910–910); height 756 (756–756); format jpeg; sha256 729b5c7cb15129a9, 7fd9c76e5b2a5f89, bf5f4b30ea3346bc |
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
