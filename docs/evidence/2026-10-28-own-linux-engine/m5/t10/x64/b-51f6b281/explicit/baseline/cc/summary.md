# Native baseline summary

Runs: run-1 (2026-11-22T07:09:05.876Z to 2026-11-22T07:10:34.176Z); run-2 (2026-11-22T07:16:22.685Z to 2026-11-22T07:17:49.620Z); run-3 (2026-11-22T07:23:36.375Z to 2026-11-22T07:25:03.642Z).

| Attested | Value |
|---|---|
| Device | cua-171 |
| Host commit | 51f6b281692c47060a47399b72da363748aad7db |
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
| ssh.roundtrip | 15 | 15 | 0 | 0 | 304.6 | 339.3 | 339.3 | – | – | – |
| cold.miss.initialize | 6 | 6 | 0 | 0 | 678.1 | 692.4 | 692.4 | – | – | – |
| cold.miss.tools_list | 6 | 6 | 0 | 0 | 2.68 | 2.79 | 2.79 | – | – | – |
| cold.miss.first_js | 6 | 6 | 0 | 0 | 338.5 | 343.4 | 343.4 | 0.01 | 0.03 | 0.03 |
| cold.miss.total | 6 | 6 | 0 | 0 | 1011.8 | 1035.4 | 1035.4 | – | – | – |
| cold.hit.initialize | 9 | 9 | 0 | 0 | 549.2 | 610.3 | 610.3 | – | – | – |
| cold.hit.tools_list | 9 | 9 | 0 | 0 | 1.30 | 1.96 | 1.96 | – | – | – |
| cold.hit.first_js | 9 | 9 | 0 | 0 | 475.6 | 578.2 | 578.2 | 0.01 | 0.08 | 0.08 |
| cold.hit.total | 9 | 9 | 0 | 0 | 1019.4 | 1190.2 | 1190.2 | – | – | – |
| warm.noop | 90 | 90 | 0 | 0 | 14.7 | 23.5 | 35.5 | 0.01 | 0.03 | 0.05 |
| warm.getState | 90 | 90 | 0 | 0 | 17.5 | 21.4 | 26.3 | 3.64 | 5.53 | 7.64 |
| warm.listApps | 90 | 90 | 0 | 0 | 16.6 | 21.3 | 25.7 | 3.41 | 5.14 | 5.91 |
| setup.findWindow | 3 | 3 | 0 | 0 | 271.3 | 276.5 | 276.5 | 255.9 | 256.9 | 256.9 |
| bind.getApp | 3 | 3 | 0 | 0 | 123.8 | 167.5 | 167.5 | 110.2 | 145.3 | 145.3 |
| approval.elicitation | 3 | 3 | 0 | 0 | 22.9 | 29.7 | 29.7 | – | – | – |
| warm.getAXState | 90 | 90 | 0 | 0 | 89.4 | 116.1 | 134.0 | 76.3 | 100.5 | 117.4 |
| warm.getScreenshot | 90 | 90 | 0 | 0 | 117.3 | 140.6 | 170.6 | 104.9 | 125.5 | 153.8 |
| task.act | 30 | 30 | 0 | 0 | 4498.5 | 4530.1 | 4530.6 | 4485.0 | 4517.1 | 4518.3 |
| task.verify | 30 | 30 | 0 | 0 | 197.3 | 226.6 | 232.0 | 181.6 | 213.3 | 216.3 |
| task.clear | 30 | 30 | 0 | 0 | 311.1 | 351.0 | 354.6 | 299.0 | 331.0 | 338.5 |
| task.total | 30 | 30 | 0 | 0 | 5017.6 | 5066.5 | 5090.2 | 4977.6 | 5017.7 | 5049.7 |
| method.typeText | 3 | 3 | 0 | 0 | 60.4 | 65.5 | 65.5 | 49.3 | 54.5 | 54.5 |
| method.paste | 3 | 3 | 0 | 0 | 60.6 | 63.3 | 63.3 | 48.9 | 52.2 | 52.2 |
| method.paste.format | 3 | 3 | 0 | 0 | 16.9 | 20.0 | 20.0 | 0.08 | 0.15 | 0.15 |
| method.setValue | 3 | 3 | 0 | 0 | 14.3 | 21.8 | 21.8 | 0.17 | 0.23 | 0.23 |
| method.selectText | 3 | 3 | 0 | 0 | 13.9 | 20.4 | 20.4 | 0.11 | 0.11 | 0.11 |
| method.scroll.pages | 3 | 3 | 0 | 0 | 13.0 | 21.6 | 21.6 | 0.18 | 0.19 | 0.19 |
| end_task | 3 | 3 | 0 | 0 | 3.14 | 3.25 | 3.25 | – | – | – |
| setup.findTarget | 6 | 6 | 0 | 0 | 271.8 | 277.3 | 277.3 | 257.8 | 261.1 | 261.1 |

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
| warm.getState | apps 17 (17–17); browsers 0 (0–0) |
| warm.listApps | apps 17 (17–17); running 0 (0–0) |
| setup.findWindow | windowId 8388708 (8388708–8388708); app org.gnome.gedit; windows 2 (2–2) |
| bind.getApp | approvals 1 (1–1) |
| approval.elicitation | app org.gnome.gedit; action accept |
| warm.getAXState | source at_spi; chars 9220 (9104–9220); lines 384 (382–384); elements 383 (381–383) |
| warm.getScreenshot | bytes 35592 (35455–35759); width 910 (910–910); height 756 (756–756); format jpeg; sha256 6 distinct |
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
