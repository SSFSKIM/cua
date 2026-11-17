# Native baseline summary

Runs: run-1 (2026-11-16T17:15:21.509Z to 2026-11-16T17:16:47.620Z); run-2 (2026-11-16T17:22:33.860Z to 2026-11-16T17:23:59.895Z); run-3 (2026-11-16T17:29:43.343Z to 2026-11-16T17:31:10.422Z).

| Attested | Value |
|---|---|
| Device | cua-171 |
| Host commit | fefe306c288956a48b6c086017f3cd1a58462a07 |
| REPL host | cua (initialize: cua-repl-host 0.5.0) |
| Engine | cua (answered: cua-engine installed in the run's home) |
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
| ssh.roundtrip | 15 | 15 | 0 | 0 | 292.8 | 337.9 | 337.9 | – | – | – |
| cold.miss.initialize | 6 | 6 | 0 | 0 | 666.3 | 720.7 | 720.7 | – | – | – |
| cold.miss.tools_list | 6 | 6 | 0 | 0 | 2.41 | 2.90 | 2.90 | – | – | – |
| cold.miss.first_js | 6 | 6 | 0 | 0 | 326.9 | 344.6 | 344.6 | 0.01 | 0.05 | 0.05 |
| cold.miss.total | 6 | 6 | 0 | 0 | 1003.7 | 1048.0 | 1048.0 | – | – | – |
| cold.hit.initialize | 9 | 9 | 0 | 0 | 523.1 | 599.0 | 599.0 | – | – | – |
| cold.hit.tools_list | 9 | 9 | 0 | 0 | 1.23 | 1.72 | 1.72 | – | – | – |
| cold.hit.first_js | 9 | 9 | 0 | 0 | 437.1 | 492.1 | 492.1 | 0.01 | 0.02 | 0.02 |
| cold.hit.total | 9 | 9 | 0 | 0 | 1007.1 | 1042.7 | 1042.7 | – | – | – |
| warm.noop | 90 | 90 | 0 | 0 | 14.3 | 22.3 | 29.9 | 0.01 | 0.03 | 0.08 |
| warm.getState | 90 | 90 | 0 | 0 | 16.3 | 19.7 | 24.1 | 3.28 | 4.35 | 6.97 |
| warm.listApps | 90 | 90 | 0 | 0 | 16.7 | 20.5 | 23.3 | 3.26 | 4.15 | 5.87 |
| setup.findWindow | 3 | 3 | 0 | 0 | 270.8 | 276.0 | 276.0 | 255.9 | 256.3 | 256.3 |
| bind.getApp | 3 | 3 | 0 | 0 | 116.8 | 147.8 | 147.8 | 98.8 | 121.2 | 121.2 |
| approval.elicitation | 3 | 3 | 0 | 0 | 23.3 | 31.9 | 31.9 | – | – | – |
| warm.getAXState | 90 | 90 | 0 | 0 | 89.9 | 112.6 | 156.6 | 76.6 | 99.6 | 134.9 |
| warm.getScreenshot | 90 | 90 | 0 | 0 | 109.5 | 137.5 | 163.3 | 96.7 | 120.0 | 149.6 |
| task.act | 30 | 30 | 0 | 0 | 4499.7 | 4524.2 | 4530.3 | 4487.1 | 4511.1 | 4518.9 |
| task.verify | 30 | 30 | 0 | 0 | 192.1 | 226.4 | 230.7 | 178.2 | 208.2 | 217.0 |
| task.clear | 30 | 30 | 0 | 0 | 314.5 | 343.7 | 353.5 | 302.0 | 330.4 | 340.2 |
| task.total | 30 | 30 | 0 | 0 | 5015.0 | 5059.7 | 5067.3 | 4974.6 | 5020.7 | 5028.7 |
| method.typeText | 3 | 3 | 0 | 0 | 65.9 | 66.6 | 66.6 | 53.4 | 54.8 | 54.8 |
| method.paste | 3 | 3 | 0 | 0 | 56.0 | 61.0 | 61.0 | 44.7 | 49.9 | 49.9 |
| method.paste.format | 3 | 3 | 0 | 0 | 11.7 | 13.8 | 13.8 | 0.07 | 0.14 | 0.14 |
| method.setValue | 3 | 3 | 0 | 0 | 13.4 | 14.0 | 14.0 | 0.18 | 0.21 | 0.21 |
| method.selectText | 3 | 3 | 0 | 0 | 18.7 | 20.5 | 20.5 | 0.10 | 0.22 | 0.22 |
| method.scroll.pages | 3 | 3 | 0 | 0 | 16.8 | 21.3 | 21.3 | 0.13 | 0.14 | 0.14 |
| end_task | 3 | 3 | 0 | 0 | 2.86 | 3.99 | 3.99 | – | – | – |
| setup.findTarget | 6 | 6 | 0 | 0 | 270.2 | 272.5 | 272.5 | 256.7 | 258.8 | 258.8 |

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
| warm.getAXState | source at_spi; chars 9220 (9104–9220); lines 384 (382–384); elements 383 (381–383) |
| warm.getScreenshot | bytes 35684 (35474–36064); width 910 (910–910); height 756 (756–756); format jpeg; sha256 6 distinct |
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
