# Native baseline summary

Runs: run-1 (2026-11-18T14:24:12.835Z to 2026-11-18T14:25:27.898Z); run-2 (2026-11-18T14:30:22.308Z to 2026-11-18T14:31:37.245Z); run-3 (2026-11-18T14:36:32.266Z to 2026-11-18T14:37:46.864Z).

| Attested | Value |
|---|---|
| Device | cua-171-arm64 |
| Host commit | f6275fb600ae719f29cf32b206676e1a70a02e26 |
| REPL host | cua (initialize: cua-repl-host 0.5.0) |
| Engine | cua (answered: cua-engine installed in the run's home) |
| Approved engine | – |
| Runtime release | 26.928.40906-linux-arm64 |
| Hardware | Google Compute Engine, arm64, 8 CPUs, 31 GiB |
| OS | Ubuntu 24.04.5 LTS (7.0.0-1017-gcp) |
| Display | 1280 x 800 points at scale 1 (1280 x 800 pixels) |
| Service | computer surface, answered by cua |
| Sandbox | scoped (platform default) |
| Sample plan | 5 cold, 30 warm, 10 tasks |

Milliseconds. Latency columns cover successful samples only (invalidated samples, whose target was not the scratch document, are counted apart); wall is the harness's time around the MCP call (it includes the ssh pipe), in-cell is `performance.now()` inside the cell on the device.

| Operation | Samples | OK | Invalid | Errors | Wall median | Wall p95 | Wall max | In-cell median | In-cell p95 | In-cell max |
|---|---|---|---|---|---|---|---|---|---|---|
| ssh.roundtrip | 15 | 15 | 0 | 0 | 185.9 | 190.8 | 190.8 | – | – | – |
| cold.miss.initialize | 6 | 6 | 0 | 0 | 432.9 | 438.3 | 438.3 | – | – | – |
| cold.miss.tools_list | 6 | 6 | 0 | 0 | 1.56 | 1.79 | 1.79 | – | – | – |
| cold.miss.first_js | 6 | 6 | 0 | 0 | 194.3 | 201.6 | 201.6 | 0.01 | 0.01 | 0.01 |
| cold.miss.total | 6 | 6 | 0 | 0 | 630.9 | 637.5 | 637.5 | – | – | – |
| cold.hit.initialize | 9 | 9 | 0 | 0 | 353.6 | 359.2 | 359.2 | – | – | – |
| cold.hit.tools_list | 9 | 9 | 0 | 0 | 0.73 | 0.81 | 0.81 | – | – | – |
| cold.hit.first_js | 9 | 9 | 0 | 0 | 268.0 | 273.9 | 273.9 | 0.01 | 0.01 | 0.01 |
| cold.hit.total | 9 | 9 | 0 | 0 | 621.7 | 633.8 | 633.8 | – | – | – |
| warm.noop | 90 | 90 | 0 | 0 | 8.73 | 11.5 | 13.8 | 0.01 | 0.01 | 0.02 |
| warm.getState | 90 | 90 | 0 | 0 | 8.59 | 10.8 | 12.1 | 1.69 | 2.14 | 3.25 |
| warm.listApps | 90 | 90 | 0 | 0 | 8.61 | 10.8 | 13.7 | 1.67 | 1.89 | 6.60 |
| setup.findWindow | 3 | 3 | 0 | 0 | 264.5 | 264.5 | 264.5 | 253.3 | 254.3 | 254.3 |
| bind.getApp | 3 | 3 | 0 | 0 | 72.5 | 72.9 | 72.9 | 62.9 | 63.2 | 63.2 |
| approval.elicitation | 3 | 3 | 0 | 0 | 12.7 | 12.9 | 12.9 | – | – | – |
| warm.getAXState | 90 | 90 | 0 | 0 | 58.7 | 61.6 | 63.4 | 51.1 | 52.8 | 53.7 |
| warm.getScreenshot | 90 | 90 | 0 | 0 | 65.5 | 67.4 | 81.4 | 57.9 | 59.6 | 71.3 |
| task.act | 30 | 30 | 0 | 0 | 4384.1 | 4389.9 | 4390.2 | 4376.6 | 4382.3 | 4382.3 |
| task.verify | 30 | 30 | 0 | 0 | 153.6 | 155.1 | 155.2 | 145.7 | 146.4 | 147.2 |
| task.clear | 30 | 30 | 0 | 0 | 265.4 | 267.3 | 267.6 | 257.8 | 259.5 | 259.5 |
| task.total | 30 | 30 | 0 | 0 | 4802.1 | 4809.8 | 4812.2 | 4779.0 | 4786.3 | 4787.8 |
| method.typeText | 3 | 3 | 0 | 0 | 44.9 | 45.5 | 45.5 | 37.2 | 38.2 | 38.2 |
| method.paste | 3 | 3 | 0 | 0 | 42.1 | 42.3 | 42.3 | 34.8 | 34.8 | 34.8 |
| method.paste.format | 3 | 3 | 0 | 0 | 7.94 | 8.03 | 8.03 | 0.05 | 0.05 | 0.05 |
| method.setValue | 3 | 3 | 0 | 0 | 7.93 | 8.16 | 8.16 | 0.09 | 0.11 | 0.11 |
| method.selectText | 3 | 3 | 0 | 0 | 9.61 | 9.71 | 9.71 | 0.07 | 0.08 | 0.08 |
| method.scroll.pages | 3 | 3 | 0 | 0 | 9.86 | 10.6 | 10.6 | 0.08 | 0.10 | 0.10 |
| end_task | 3 | 3 | 0 | 0 | 2.09 | 2.10 | 2.10 | – | – | – |
| setup.findTarget | 6 | 6 | 0 | 0 | 262.4 | 262.6 | 262.6 | 254.2 | 254.4 | 254.4 |

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
| warm.getState | apps 18 (18–18); browsers 0 (0–0) |
| warm.listApps | apps 18 (18–18); running 0 (0–0) |
| setup.findWindow | windowId 8388708 (8388708–8388708); app org.gnome.gedit; windows 2 (2–2) |
| bind.getApp | approvals 1 (1–1) |
| approval.elicitation | app org.gnome.gedit; action accept |
| warm.getAXState | source at_spi; chars 9220 (9220–9220); lines 384 (384–384); elements 383 (383–383) |
| warm.getScreenshot | bytes 35886 (35714–39327); width 910 (910–910); height 756 (756–756); format jpeg; sha256 12 distinct |
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
