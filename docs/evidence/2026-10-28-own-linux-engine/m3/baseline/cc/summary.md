# Native baseline summary

Runs: run-1 (2026-10-31T22:58:00.218Z to 2026-10-31T23:00:12.225Z); run-2 (2026-10-31T23:05:55.368Z to 2026-10-31T23:08:07.176Z); run-3 (2026-10-31T23:13:49.158Z to 2026-10-31T23:16:01.458Z).

| Attested | Value |
|---|---|
| Device | cua-171 |
| Host commit | 5e4393248fb4fe863c4bf954872e48704acabe8d |
| REPL host | cua (initialize: cua-repl-host 0.5.0) |
| Engine | cua (answered: cua-engine named by --engine-bin /Users/new/.local/share/cua-171/task19/engine/cua-engine) |
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
| ssh.roundtrip | 15 | 15 | 0 | 0 | 300.5 | 345.4 | 345.4 | – | – | – |
| cold.miss.initialize | 6 | 6 | 0 | 0 | 677.8 | 722.4 | 722.4 | – | – | – |
| cold.miss.tools_list | 6 | 6 | 0 | 0 | 2.56 | 2.87 | 2.87 | – | – | – |
| cold.miss.first_js | 6 | 6 | 0 | 0 | 348.4 | 381.6 | 381.6 | 0.02 | 0.03 | 0.03 |
| cold.miss.total | 6 | 6 | 0 | 0 | 1028.8 | 1106.8 | 1106.8 | – | – | – |
| cold.hit.initialize | 9 | 9 | 0 | 0 | 524.0 | 536.8 | 536.8 | – | – | – |
| cold.hit.tools_list | 9 | 9 | 0 | 0 | 1.11 | 1.62 | 1.62 | – | – | – |
| cold.hit.first_js | 9 | 9 | 0 | 0 | 430.8 | 454.5 | 454.5 | 0.01 | 0.06 | 0.06 |
| cold.hit.total | 9 | 9 | 0 | 0 | 952.8 | 987.8 | 987.8 | – | – | – |
| warm.noop | 90 | 90 | 0 | 0 | 14.2 | 21.3 | 24.3 | 0.01 | 0.03 | 0.07 |
| warm.getState | 90 | 90 | 0 | 0 | 17.4 | 20.7 | 22.5 | 3.78 | 5.20 | 7.10 |
| warm.listApps | 90 | 90 | 0 | 0 | 17.2 | 19.5 | 21.2 | 3.82 | 4.71 | 5.42 |
| setup.findWindow | 3 | 3 | 0 | 0 | 272.8 | 277.2 | 277.2 | 258.3 | 258.6 | 258.6 |
| bind.getApp | 3 | 3 | 0 | 0 | 147.0 | 158.4 | 158.4 | 127.2 | 140.1 | 140.1 |
| approval.elicitation | 3 | 3 | 0 | 0 | 29.9 | 30.2 | 30.2 | – | – | – |
| warm.getAXState | 90 | 90 | 0 | 0 | 92.2 | 112.2 | 138.5 | 78.7 | 96.6 | 115.3 |
| warm.getScreenshot | 90 | 90 | 0 | 0 | 113.2 | 140.1 | 154.6 | 101.6 | 124.3 | 138.7 |
| task.act | 30 | 30 | 0 | 0 | 8829.9 | 8869.0 | 8871.9 | 8817.0 | 8850.4 | 8851.1 |
| task.verify | 30 | 30 | 0 | 0 | 186.3 | 221.0 | 224.4 | 173.4 | 203.5 | 207.4 |
| task.clear | 30 | 30 | 0 | 0 | 517.4 | 545.4 | 566.4 | 505.5 | 532.7 | 552.9 |
| task.total | 30 | 30 | 0 | 0 | 9540.6 | 9603.3 | 9609.5 | 9498.7 | 9557.2 | 9563.0 |
| method.typeText | 3 | 3 | 0 | 0 | 168.2 | 177.0 | 177.0 | 156.8 | 163.8 | 163.8 |
| method.paste | 3 | 3 | 0 | 0 | 165.8 | 169.7 | 169.7 | 152.3 | 156.0 | 156.0 |
| method.paste.format | 3 | 3 | 0 | 0 | 13.9 | 17.8 | 17.8 | 0.09 | 0.10 | 0.10 |
| method.setValue | 3 | 3 | 0 | 0 | 13.4 | 15.6 | 15.6 | 0.13 | 0.16 | 0.16 |
| method.selectText | 3 | 3 | 0 | 0 | 13.4 | 21.0 | 21.0 | 0.16 | 0.17 | 0.17 |
| method.scroll.pages | 3 | 3 | 0 | 0 | 19.0 | 21.1 | 21.1 | 0.18 | 0.27 | 0.27 |
| end_task | 3 | 3 | 0 | 0 | 4.74 | 4.77 | 4.77 | – | – | – |
| setup.findTarget | 6 | 6 | 0 | 0 | 271.9 | 274.3 | 274.3 | 258.3 | 259.7 | 259.7 |

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
| warm.getScreenshot | bytes 35560 (35538–35925); width 910 (910–910); height 756 (756–756); format jpeg; sha256 6 distinct |
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
