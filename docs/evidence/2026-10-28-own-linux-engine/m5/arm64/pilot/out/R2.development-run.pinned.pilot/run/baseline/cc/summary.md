# Native baseline summary

Runs: run-1 (2026-11-18T02:01:31.834Z to 2026-11-18T02:02:45.950Z); run-2 (2026-11-18T02:07:34.695Z to 2026-11-18T02:08:48.915Z); run-3 (2026-11-18T02:13:32.191Z to 2026-11-18T02:14:46.464Z).

| Attested | Value |
|---|---|
| Device | cua-171-arm64 |
| Host commit | da306cc6319e7e9da282812402308c074b872dee |
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
| ssh.roundtrip | 15 | 15 | 0 | 0 | 185.0 | 189.7 | 189.7 | – | – | – |
| cold.miss.initialize | 6 | 6 | 0 | 0 | 424.8 | 430.8 | 430.8 | – | – | – |
| cold.miss.tools_list | 6 | 6 | 0 | 0 | 1.59 | 1.85 | 1.85 | – | – | – |
| cold.miss.first_js | 6 | 6 | 0 | 0 | 189.5 | 191.6 | 191.6 | 0.01 | 0.01 | 0.01 |
| cold.miss.total | 6 | 6 | 0 | 0 | 615.3 | 624.2 | 624.2 | – | – | – |
| cold.hit.initialize | 9 | 9 | 0 | 0 | 348.7 | 354.3 | 354.3 | – | – | – |
| cold.hit.tools_list | 9 | 9 | 0 | 0 | 0.70 | 0.77 | 0.77 | – | – | – |
| cold.hit.first_js | 9 | 9 | 0 | 0 | 260.6 | 265.8 | 265.8 | 0.01 | 0.01 | 0.01 |
| cold.hit.total | 9 | 9 | 0 | 0 | 610.5 | 615.5 | 615.5 | – | – | – |
| warm.noop | 90 | 90 | 0 | 0 | 8.22 | 10.6 | 12.3 | 0.01 | 0.01 | 0.01 |
| warm.getState | 90 | 90 | 0 | 0 | 8.01 | 9.99 | 11.0 | 1.57 | 1.89 | 3.25 |
| warm.listApps | 90 | 90 | 0 | 0 | 7.85 | 8.40 | 9.97 | 1.50 | 1.73 | 3.39 |
| setup.findWindow | 3 | 3 | 0 | 0 | 261.7 | 261.8 | 261.8 | 253.3 | 253.3 | 253.3 |
| bind.getApp | 3 | 3 | 0 | 0 | 70.3 | 71.2 | 71.2 | 62.4 | 63.3 | 63.3 |
| approval.elicitation | 3 | 3 | 0 | 0 | 10.5 | 10.9 | 10.9 | – | – | – |
| warm.getAXState | 90 | 90 | 0 | 0 | 57.9 | 60.1 | 63.1 | 50.6 | 52.8 | 54.0 |
| warm.getScreenshot | 90 | 90 | 0 | 0 | 64.9 | 68.4 | 78.3 | 57.6 | 60.0 | 70.0 |
| task.act | 30 | 30 | 0 | 0 | 4342.1 | 4350.0 | 4352.5 | 4334.5 | 4342.3 | 4344.7 |
| task.verify | 30 | 30 | 0 | 0 | 152.6 | 155.1 | 155.5 | 145.0 | 147.0 | 147.2 |
| task.clear | 30 | 30 | 0 | 0 | 263.4 | 266.1 | 266.2 | 255.9 | 257.8 | 258.2 |
| task.total | 30 | 30 | 0 | 0 | 4757.4 | 4767.8 | 4769.6 | 4734.8 | 4743.7 | 4746.7 |
| method.typeText | 3 | 3 | 0 | 0 | 42.6 | 43.6 | 43.6 | 35.5 | 36.1 | 36.1 |
| method.paste | 3 | 3 | 0 | 0 | 41.4 | 42.0 | 42.0 | 34.5 | 34.7 | 34.7 |
| method.paste.format | 3 | 3 | 0 | 0 | 7.88 | 7.93 | 7.93 | 0.06 | 0.07 | 0.07 |
| method.setValue | 3 | 3 | 0 | 0 | 7.80 | 7.96 | 7.96 | 0.09 | 0.10 | 0.10 |
| method.selectText | 3 | 3 | 0 | 0 | 7.78 | 7.84 | 7.84 | 0.07 | 0.07 | 0.07 |
| method.scroll.pages | 3 | 3 | 0 | 0 | 7.83 | 7.85 | 7.85 | 0.09 | 0.10 | 0.10 |
| end_task | 3 | 3 | 0 | 0 | 2.02 | 2.04 | 2.04 | – | – | – |
| setup.findTarget | 6 | 6 | 0 | 0 | 262.0 | 263.9 | 263.9 | 254.2 | 255.8 | 255.8 |

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
| warm.getScreenshot | bytes 35913 (35701–39268); width 910 (910–910); height 756 (756–756); format jpeg; sha256 12 distinct |
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
