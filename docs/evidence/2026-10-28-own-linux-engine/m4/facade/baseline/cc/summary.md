# Native baseline summary

Runs: run-1 (2026-11-13T07:08:30.597Z to 2026-11-13T07:09:57.808Z); run-2 (2026-11-13T07:15:36.206Z to 2026-11-13T07:17:02.892Z); run-3 (2026-11-13T07:22:41.429Z to 2026-11-13T07:24:07.958Z).

| Attested | Value |
|---|---|
| Device | cua-171 |
| Host commit | 8ab1cc758983e7774cbff74a1cc2fd2d745120bb |
| REPL host | cua (initialize: cua-repl-host 0.5.0) |
| Engine | cua (answered: cua-engine named by --engine-bin /Users/new/.local/share/cua-171/task74/w5/engine/8ab1cc758983/cua-engine) |
| Approved engine | – |
| Runtime release | 26.928.40906-linux-x64 |
| Hardware | vServer, x64, 8 CPUs, 15 GiB |
| OS | Ubuntu 24.04.4 LTS (6.8.0-138-generic) |
| Display | 1280 x 800 points at scale 1 (1280 x 800 pixels) |
| Service | computer surface, answered by cua |
| Sandbox | scoped (platform default) |
| Sample plan | 5 cold, 30 warm, 10 tasks |

Milliseconds. Latency columns cover successful samples only (invalidated samples, whose target was not the scratch document, are counted apart); wall is the harness's time around the MCP call (it includes the ssh pipe), in-cell is `performance.now()` inside the cell on the device.

| Operation | Samples | OK | Invalid | Errors | Wall median | Wall p95 | Wall max | In-cell median | In-cell p95 | In-cell max |
|---|---|---|---|---|---|---|---|---|---|---|
| ssh.roundtrip | 15 | 15 | 0 | 0 | 284.9 | 337.4 | 337.4 | – | – | – |
| cold.miss.initialize | 6 | 6 | 0 | 0 | 672.6 | 703.3 | 703.3 | – | – | – |
| cold.miss.tools_list | 6 | 6 | 0 | 0 | 2.63 | 2.78 | 2.78 | – | – | – |
| cold.miss.first_js | 6 | 6 | 0 | 0 | 319.5 | 360.0 | 360.0 | 0.01 | 0.02 | 0.02 |
| cold.miss.total | 6 | 6 | 0 | 0 | 1005.2 | 1064.7 | 1064.7 | – | – | – |
| cold.hit.initialize | 9 | 9 | 0 | 0 | 532.9 | 574.2 | 574.2 | – | – | – |
| cold.hit.tools_list | 9 | 9 | 0 | 0 | 1.30 | 1.64 | 1.64 | – | – | – |
| cold.hit.first_js | 9 | 9 | 0 | 0 | 449.3 | 510.7 | 510.7 | 0.01 | 0.06 | 0.06 |
| cold.hit.total | 9 | 9 | 0 | 0 | 983.9 | 1081.0 | 1081.0 | – | – | – |
| warm.noop | 90 | 90 | 0 | 0 | 14.2 | 19.7 | 23.9 | 0.01 | 0.02 | 0.08 |
| warm.getState | 90 | 90 | 0 | 0 | 17.9 | 20.5 | 21.4 | 3.60 | 5.21 | 6.47 |
| warm.listApps | 90 | 90 | 0 | 0 | 17.2 | 22.2 | 25.3 | 3.43 | 4.09 | 10.0 |
| setup.findWindow | 3 | 3 | 0 | 0 | 271.2 | 274.3 | 274.3 | 255.8 | 256.1 | 256.1 |
| bind.getApp | 3 | 3 | 0 | 0 | 123.3 | 126.8 | 126.8 | 105.7 | 109.5 | 109.5 |
| approval.elicitation | 3 | 3 | 0 | 0 | 24.4 | 28.8 | 28.8 | – | – | – |
| warm.getAXState | 90 | 90 | 0 | 0 | 94.8 | 121.7 | 151.9 | 80.4 | 103.5 | 125.8 |
| warm.getScreenshot | 90 | 90 | 0 | 0 | 117.7 | 140.9 | 153.9 | 104.5 | 124.7 | 137.3 |
| task.act | 30 | 30 | 0 | 0 | 4501.6 | 4538.2 | 4552.2 | 4488.1 | 4521.4 | 4530.3 |
| task.verify | 30 | 30 | 0 | 0 | 192.3 | 222.3 | 237.4 | 175.3 | 203.0 | 214.2 |
| task.clear | 30 | 30 | 0 | 0 | 308.1 | 343.5 | 351.7 | 295.6 | 328.5 | 339.1 |
| task.total | 30 | 30 | 0 | 0 | 5003.1 | 5063.9 | 5101.3 | 4959.7 | 5014.7 | 5044.6 |
| method.typeText | 3 | 3 | 0 | 0 | 60.7 | 71.0 | 71.0 | 49.1 | 56.2 | 56.2 |
| method.paste | 3 | 3 | 0 | 0 | 59.9 | 68.7 | 68.7 | 46.5 | 51.8 | 51.8 |
| method.paste.format | 3 | 3 | 0 | 0 | 14.6 | 16.3 | 16.3 | 0.08 | 0.10 | 0.10 |
| method.setValue | 3 | 3 | 0 | 0 | 13.1 | 18.5 | 18.5 | 0.13 | 0.19 | 0.19 |
| method.selectText | 3 | 3 | 0 | 0 | 17.1 | 17.4 | 17.4 | 0.11 | 0.13 | 0.13 |
| method.scroll.pages | 3 | 3 | 0 | 0 | 17.0 | 17.3 | 17.3 | 0.16 | 0.17 | 0.17 |
| end_task | 3 | 3 | 0 | 0 | 3.39 | 3.45 | 3.45 | – | – | – |
| setup.findTarget | 6 | 6 | 0 | 0 | 270.7 | 285.2 | 285.2 | 257.9 | 259.0 | 259.0 |

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
| warm.getAXState | source at_spi; chars 9220 (9104–9220); lines 384 (382–384); elements 383 (381–383) |
| warm.getScreenshot | bytes 35526 (35469–35673); width 910 (910–910); height 756 (756–756); format jpeg; sha256 6 distinct |
| task.act | actions 43 (43–43); observations 1 (1–1) |
| task.verify | observations 1 (1–1) |
| task.clear | actions 2 (2–2); observations 1 (1–1) |
| task.total | cells 3 (3–3); actions 45 (45–45); observations 3 (3–3); outcome typed with pressKey, verified, cleared |
| method.typeText | outcome returned; target survived |
| method.paste | outcome returned; target survived |
| method.paste.format | outcome threw; methodError Linux paste supports only text format.; target survived |
| method.setValue | outcome threw; methodError setValue is unavailable on Linux; use click, pressKey, and typeText.; target survived |
| method.selectText | outcome threw; methodError selectText is unavailable on Linux.; target survived |
| method.scroll.pages | outcome threw; methodError Linux scroll accepts { pixels }, not pages.; target survived |
| setup.findTarget | windowId 14680164 (14680164–14680164); app org.gnome.gedit; windows 3 (3–3); for method.paste, method.typeText |

## Invalidated samples

None.

## Errors

None.

## Problems

No problems: every run is complete and attests the same commit, REPL host, engine, approved engine, release, hardware, OS, display, service, sandbox and sample plan.
