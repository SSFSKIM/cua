# Native baseline summary

Runs: run-1 (2026-11-15T06:27:10.384Z to 2026-11-15T06:28:38.066Z); run-2 (2026-11-15T06:34:26.460Z to 2026-11-15T06:35:52.951Z); run-3 (2026-11-15T06:41:36.875Z to 2026-11-15T06:43:04.543Z).

| Attested | Value |
|---|---|
| Device | cua-171 |
| Host commit | 01ff0648f3afc4a234669cd381395c91543ce3f7 |
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
| ssh.roundtrip | 15 | 15 | 0 | 0 | 285.9 | 351.5 | 351.5 | – | – | – |
| cold.miss.initialize | 6 | 6 | 0 | 0 | 647.6 | 664.4 | 664.4 | – | – | – |
| cold.miss.tools_list | 6 | 6 | 0 | 0 | 2.62 | 2.66 | 2.66 | – | – | – |
| cold.miss.first_js | 6 | 6 | 0 | 0 | 322.1 | 359.2 | 359.2 | 0.01 | 0.04 | 0.04 |
| cold.miss.total | 6 | 6 | 0 | 0 | 971.7 | 1025.8 | 1025.8 | – | – | – |
| cold.hit.initialize | 9 | 9 | 0 | 0 | 538.7 | 585.3 | 585.3 | – | – | – |
| cold.hit.tools_list | 9 | 9 | 0 | 0 | 1.23 | 2.29 | 2.29 | – | – | – |
| cold.hit.first_js | 9 | 9 | 0 | 0 | 446.8 | 469.2 | 469.2 | 0.01 | 0.04 | 0.04 |
| cold.hit.total | 9 | 9 | 0 | 0 | 986.7 | 1056.7 | 1056.7 | – | – | – |
| warm.noop | 90 | 90 | 0 | 0 | 14.5 | 21.6 | 23.9 | 0.01 | 0.03 | 0.05 |
| warm.getState | 90 | 90 | 0 | 0 | 17.8 | 21.8 | 24.1 | 3.84 | 6.40 | 8.79 |
| warm.listApps | 90 | 90 | 0 | 0 | 15.8 | 19.8 | 21.8 | 3.42 | 4.96 | 5.80 |
| setup.findWindow | 3 | 3 | 0 | 0 | 269.4 | 270.1 | 270.1 | 255.4 | 255.7 | 255.7 |
| bind.getApp | 3 | 3 | 0 | 0 | 136.5 | 167.0 | 167.0 | 119.1 | 150.0 | 150.0 |
| approval.elicitation | 3 | 3 | 0 | 0 | 21.2 | 27.1 | 27.1 | – | – | – |
| warm.getAXState | 90 | 90 | 0 | 0 | 96.3 | 127.2 | 137.1 | 83.7 | 110.2 | 124.9 |
| warm.getScreenshot | 90 | 90 | 0 | 0 | 112.8 | 145.6 | 157.8 | 100.7 | 129.3 | 141.6 |
| task.act | 30 | 30 | 0 | 0 | 4507.8 | 4541.7 | 4543.0 | 4495.8 | 4529.1 | 4531.4 |
| task.verify | 30 | 30 | 0 | 0 | 197.3 | 236.3 | 239.0 | 179.2 | 214.7 | 220.9 |
| task.clear | 30 | 30 | 0 | 0 | 315.5 | 349.4 | 352.3 | 303.1 | 333.7 | 338.1 |
| task.total | 30 | 30 | 0 | 0 | 5024.8 | 5085.6 | 5102.5 | 4981.1 | 5036.5 | 5056.0 |
| method.typeText | 3 | 3 | 0 | 0 | 71.6 | 82.0 | 82.0 | 52.8 | 64.9 | 64.9 |
| method.paste | 3 | 3 | 0 | 0 | 64.7 | 78.1 | 78.1 | 49.6 | 59.0 | 59.0 |
| method.paste.format | 3 | 3 | 0 | 0 | 16.8 | 23.3 | 23.3 | 0.10 | 0.14 | 0.14 |
| method.setValue | 3 | 3 | 0 | 0 | 15.6 | 20.0 | 20.0 | 0.18 | 0.19 | 0.19 |
| method.selectText | 3 | 3 | 0 | 0 | 12.7 | 26.6 | 26.6 | 0.19 | 0.20 | 0.20 |
| method.scroll.pages | 3 | 3 | 0 | 0 | 15.0 | 22.1 | 22.1 | 0.18 | 0.19 | 0.19 |
| end_task | 3 | 3 | 0 | 0 | 3.10 | 3.11 | 3.11 | – | – | – |
| setup.findTarget | 6 | 6 | 0 | 0 | 270.8 | 273.3 | 273.3 | 257.7 | 259.1 | 259.1 |

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
| warm.getScreenshot | bytes 35647 (35461–36027); width 910 (910–910); height 756 (756–756); format jpeg; sha256 6 distinct |
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
