# Native baseline summary

Runs: run-1 (2026-11-02T00:55:26.305Z to 2026-11-02T00:57:38.206Z); run-2 (2026-11-02T01:03:18.340Z to 2026-11-02T01:05:31.273Z); run-3 (2026-11-02T01:11:12.196Z to 2026-11-02T01:13:23.632Z).

| Attested | Value |
|---|---|
| Device | cua-171 |
| Host commit | 23d0b7c9bf29610165fde6e751df0471e57eadb9 |
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
| ssh.roundtrip | 15 | 15 | 0 | 0 | 298.0 | 334.5 | 334.5 | – | – | – |
| cold.miss.initialize | 6 | 6 | 0 | 0 | 649.4 | 682.0 | 682.0 | – | – | – |
| cold.miss.tools_list | 6 | 6 | 0 | 0 | 2.42 | 3.11 | 3.11 | – | – | – |
| cold.miss.first_js | 6 | 6 | 0 | 0 | 311.5 | 315.3 | 315.3 | 0.02 | 0.03 | 0.03 |
| cold.miss.total | 6 | 6 | 0 | 0 | 962.5 | 997.8 | 997.8 | – | – | – |
| cold.hit.initialize | 9 | 9 | 0 | 0 | 530.0 | 552.8 | 552.8 | – | – | – |
| cold.hit.tools_list | 9 | 9 | 0 | 0 | 1.13 | 1.70 | 1.70 | – | – | – |
| cold.hit.first_js | 9 | 9 | 0 | 0 | 423.9 | 499.7 | 499.7 | 0.01 | 0.02 | 0.02 |
| cold.hit.total | 9 | 9 | 0 | 0 | 952.1 | 1054.0 | 1054.0 | – | – | – |
| warm.noop | 90 | 90 | 0 | 0 | 13.9 | 19.4 | 22.1 | 0.01 | 0.02 | 0.03 |
| warm.getState | 90 | 90 | 0 | 0 | 16.8 | 24.1 | 27.9 | 4.28 | 6.55 | 10.3 |
| warm.listApps | 90 | 90 | 0 | 0 | 17.8 | 29.8 | 35.5 | 4.19 | 7.67 | 8.93 |
| setup.findWindow | 3 | 3 | 0 | 0 | 271.9 | 272.7 | 272.7 | 257.4 | 258.1 | 258.1 |
| bind.getApp | 3 | 3 | 0 | 0 | 123.6 | 128.0 | 128.0 | 109.5 | 114.3 | 114.3 |
| approval.elicitation | 3 | 3 | 0 | 0 | 20.9 | 24.3 | 24.3 | – | – | – |
| warm.getAXState | 90 | 90 | 0 | 0 | 95.3 | 121.0 | 132.2 | 82.4 | 100.3 | 120.7 |
| warm.getScreenshot | 90 | 90 | 0 | 0 | 113.4 | 142.0 | 146.8 | 100.2 | 128.4 | 133.6 |
| task.act | 30 | 30 | 0 | 0 | 8832.0 | 8890.4 | 8890.5 | 8819.7 | 8877.9 | 8878.3 |
| task.verify | 30 | 30 | 0 | 0 | 197.7 | 230.1 | 232.5 | 182.6 | 215.2 | 215.5 |
| task.clear | 30 | 30 | 0 | 0 | 518.2 | 558.7 | 560.8 | 504.2 | 547.2 | 548.0 |
| task.total | 30 | 30 | 0 | 0 | 9555.9 | 9611.7 | 9630.6 | 9516.1 | 9573.5 | 9594.4 |
| method.typeText | 3 | 3 | 0 | 0 | 166.6 | 169.9 | 169.9 | 153.1 | 156.8 | 156.8 |
| method.paste | 3 | 3 | 0 | 0 | 162.6 | 164.1 | 164.1 | 151.4 | 152.5 | 152.5 |
| method.paste.format | 3 | 3 | 0 | 0 | 15.1 | 19.3 | 19.3 | 0.14 | 0.32 | 0.32 |
| method.setValue | 3 | 3 | 0 | 0 | 13.3 | 13.5 | 13.5 | 0.13 | 0.15 | 0.15 |
| method.selectText | 3 | 3 | 0 | 0 | 17.5 | 21.0 | 21.0 | 0.10 | 0.12 | 0.12 |
| method.scroll.pages | 3 | 3 | 0 | 0 | 14.3 | 17.1 | 17.1 | 0.14 | 0.15 | 0.15 |
| end_task | 3 | 3 | 0 | 0 | 3.66 | 4.01 | 4.01 | – | – | – |
| setup.findTarget | 6 | 6 | 0 | 0 | 272.9 | 274.9 | 274.9 | 258.9 | 260.1 | 260.1 |

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
| setup.findWindow | windowId 20971620 (20971620–20971620); app org.gnome.gedit; windows 3 (3–3) |
| bind.getApp | approvals 1 (1–1) |
| approval.elicitation | app org.gnome.gedit; action accept |
| warm.getAXState | source at_spi; chars 9220 (9104–9220); lines 384 (382–384); elements 383 (381–383) |
| warm.getScreenshot | bytes 35736 (35573–35967); width 910 (910–910); height 756 (756–756); format jpeg; sha256 6 distinct |
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
| setup.findTarget | windowId 33554532 (33554532–33554532); app org.gnome.gedit; windows 4 (4–4); for method.paste, method.typeText |

## Invalidated samples

None.

## Errors

None.

## Problems

No problems: every run is complete and attests the same commit, REPL host, engine, approved engine, release, hardware, OS, display, service, sandbox and sample plan.
