# Native baseline summary

Runs: run-1 (2026-11-22T06:43:29.458Z to 2026-11-22T06:44:44.355Z); run-2 (2026-11-22T06:49:23.347Z to 2026-11-22T06:50:38.356Z); run-3 (2026-11-22T06:55:21.904Z to 2026-11-22T06:56:36.748Z).

| Attested | Value |
|---|---|
| Device | cua-171-arm64 |
| Host commit | 51f6b281692c47060a47399b72da363748aad7db |
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
| ssh.roundtrip | 15 | 15 | 0 | 0 | 185.8 | 192.0 | 192.0 | – | – | – |
| cold.miss.initialize | 6 | 6 | 0 | 0 | 441.3 | 444.1 | 444.1 | – | – | – |
| cold.miss.tools_list | 6 | 6 | 0 | 0 | 1.63 | 1.73 | 1.73 | – | – | – |
| cold.miss.first_js | 6 | 6 | 0 | 0 | 198.5 | 202.7 | 202.7 | 0.01 | 0.01 | 0.01 |
| cold.miss.total | 6 | 6 | 0 | 0 | 640.1 | 646.4 | 646.4 | – | – | – |
| cold.hit.initialize | 9 | 9 | 0 | 0 | 365.6 | 370.3 | 370.3 | – | – | – |
| cold.hit.tools_list | 9 | 9 | 0 | 0 | 0.74 | 0.81 | 0.81 | – | – | – |
| cold.hit.first_js | 9 | 9 | 0 | 0 | 273.6 | 280.6 | 280.6 | 0.01 | 0.01 | 0.01 |
| cold.hit.total | 9 | 9 | 0 | 0 | 641.3 | 645.1 | 645.1 | – | – | – |
| warm.noop | 90 | 90 | 0 | 0 | 8.68 | 11.5 | 13.6 | 0.01 | 0.01 | 0.03 |
| warm.getState | 90 | 90 | 0 | 0 | 9.65 | 11.9 | 12.7 | 1.67 | 3.22 | 4.53 |
| warm.listApps | 90 | 90 | 0 | 0 | 8.34 | 11.2 | 14.3 | 1.58 | 1.96 | 5.99 |
| setup.findWindow | 3 | 3 | 0 | 0 | 263.6 | 263.8 | 263.8 | 253.4 | 253.5 | 253.5 |
| bind.getApp | 3 | 3 | 0 | 0 | 73.2 | 74.1 | 74.1 | 63.1 | 65.7 | 65.7 |
| approval.elicitation | 3 | 3 | 0 | 0 | 11.8 | 13.0 | 13.0 | – | – | – |
| warm.getAXState | 90 | 90 | 0 | 0 | 60.4 | 62.5 | 65.2 | 52.6 | 54.4 | 55.4 |
| warm.getScreenshot | 90 | 90 | 0 | 0 | 67.3 | 69.3 | 81.3 | 59.3 | 61.2 | 72.6 |
| task.act | 30 | 30 | 0 | 0 | 4364.8 | 4370.9 | 4372.5 | 4357.0 | 4362.8 | 4364.5 |
| task.verify | 30 | 30 | 0 | 0 | 154.6 | 156.9 | 157.0 | 146.6 | 148.2 | 148.9 |
| task.clear | 30 | 30 | 0 | 0 | 266.2 | 268.6 | 268.7 | 258.3 | 260.6 | 260.7 |
| task.total | 30 | 30 | 0 | 0 | 4786.0 | 4794.3 | 4794.7 | 4762.0 | 4770.6 | 4770.7 |
| method.typeText | 3 | 3 | 0 | 0 | 43.6 | 45.9 | 45.9 | 35.9 | 38.4 | 38.4 |
| method.paste | 3 | 3 | 0 | 0 | 42.7 | 42.8 | 42.8 | 35.3 | 35.3 | 35.3 |
| method.paste.format | 3 | 3 | 0 | 0 | 8.31 | 8.34 | 8.34 | 0.06 | 0.07 | 0.07 |
| method.setValue | 3 | 3 | 0 | 0 | 8.12 | 8.20 | 8.20 | 0.11 | 0.12 | 0.12 |
| method.selectText | 3 | 3 | 0 | 0 | 7.96 | 7.98 | 7.98 | 0.07 | 0.10 | 0.10 |
| method.scroll.pages | 3 | 3 | 0 | 0 | 9.58 | 9.70 | 9.70 | 0.08 | 0.12 | 0.12 |
| end_task | 3 | 3 | 0 | 0 | 2.07 | 2.17 | 2.17 | – | – | – |
| setup.findTarget | 6 | 6 | 0 | 0 | 262.5 | 263.2 | 263.2 | 254.2 | 254.4 | 254.4 |

| Operation | Observed (median, range) |
|---|---|
| cold.miss.initialize | planned miss |
| cold.miss.tools_list | planned miss |
| cold.miss.first_js | planned miss; documentChars 24726 (24726–24726) |
| cold.miss.total | planned miss |
| cold.hit.initialize | planned hit |
| cold.hit.tools_list | planned hit |
| cold.hit.first_js | planned hit; documentChars 24726 (24726–24726) |
| cold.hit.total | planned hit |
| warm.getState | apps 18 (18–18); browsers 0 (0–0) |
| warm.listApps | apps 18 (18–18); running 0 (0–0) |
| setup.findWindow | windowId 8388708 (8388708–8388708); app org.gnome.gedit; windows 2 (2–2) |
| bind.getApp | approvals 1 (1–1) |
| approval.elicitation | app org.gnome.gedit; action accept |
| warm.getAXState | source at_spi; chars 9220 (9220–9220); lines 384 (384–384); elements 383 (383–383) |
| warm.getScreenshot | bytes 36088 (35757–39237); width 910 (910–910); height 756 (756–756); format jpeg; sha256 12 distinct |
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
