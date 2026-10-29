# Native baseline summary

Runs: run-1 (2026-10-29T20:51:12.757Z to 2026-10-29T20:53:25.107Z); run-2 (2026-10-29T20:59:07.330Z to 2026-10-29T21:01:20.853Z); run-3 (2026-10-29T21:07:06.369Z to 2026-10-29T21:09:18.218Z).

| Attested | Value |
|---|---|
| Device | cua-171 |
| Host commit | 41db78a2aa35b18655782d3aa28311518298ad44 |
| REPL host | cua (initialize: cua-repl-host 0.5.0) |
| Engine | cua (answered: cua-engine named by --engine-bin /Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/native/linux-engine/target/release/cua-engine) |
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
| ssh.roundtrip | 15 | 15 | 0 | 0 | 286.8 | 326.7 | 326.7 | – | – | – |
| cold.miss.initialize | 6 | 6 | 0 | 0 | 667.5 | 701.5 | 701.5 | – | – | – |
| cold.miss.tools_list | 6 | 6 | 0 | 0 | 2.62 | 3.13 | 3.13 | – | – | – |
| cold.miss.first_js | 6 | 6 | 0 | 0 | 367.7 | 417.0 | 417.0 | 0.01 | 0.02 | 0.02 |
| cold.miss.total | 6 | 6 | 0 | 0 | 1029.4 | 1100.5 | 1100.5 | – | – | – |
| cold.hit.initialize | 9 | 9 | 0 | 0 | 525.4 | 576.7 | 576.7 | – | – | – |
| cold.hit.tools_list | 9 | 9 | 0 | 0 | 1.16 | 2.01 | 2.01 | – | – | – |
| cold.hit.first_js | 9 | 9 | 0 | 0 | 493.8 | 522.9 | 522.9 | 0.01 | 0.02 | 0.02 |
| cold.hit.total | 9 | 9 | 0 | 0 | 1004.6 | 1100.6 | 1100.6 | – | – | – |
| warm.noop | 90 | 90 | 0 | 0 | 13.7 | 22.2 | 31.4 | 0.01 | 0.03 | 0.04 |
| warm.getState | 90 | 90 | 0 | 0 | 17.7 | 24.1 | 27.2 | 3.87 | 8.26 | 10.1 |
| warm.listApps | 90 | 90 | 0 | 0 | 17.7 | 27.7 | 30.9 | 3.72 | 7.16 | 16.2 |
| setup.findWindow | 3 | 3 | 0 | 0 | 273.7 | 280.6 | 280.6 | 258.1 | 259.4 | 259.4 |
| bind.getApp | 3 | 3 | 0 | 0 | 128.8 | 174.3 | 174.3 | 115.2 | 155.3 | 155.3 |
| approval.elicitation | 3 | 3 | 0 | 0 | 23.0 | 27.7 | 27.7 | – | – | – |
| warm.getAXState | 90 | 90 | 0 | 0 | 97.2 | 131.1 | 169.2 | 83.7 | 108.5 | 151.8 |
| warm.getScreenshot | 90 | 90 | 0 | 0 | 117.1 | 141.8 | 161.1 | 103.5 | 128.0 | 144.9 |
| task.act | 30 | 30 | 0 | 0 | 8836.3 | 8879.4 | 8899.5 | 8824.2 | 8858.3 | 8879.1 |
| task.verify | 30 | 30 | 0 | 0 | 186.3 | 236.4 | 238.8 | 172.7 | 214.8 | 225.9 |
| task.clear | 30 | 30 | 0 | 0 | 515.2 | 557.2 | 567.7 | 501.7 | 544.1 | 555.3 |
| task.total | 30 | 30 | 0 | 0 | 9538.1 | 9617.9 | 9659.3 | 9499.3 | 9569.2 | 9608.8 |
| method.typeText | 3 | 3 | 0 | 0 | 17.8 | 18.5 | 18.5 | 5.43 | 6.98 | 6.98 |
| method.paste | 3 | 3 | 0 | 0 | 16.8 | 18.9 | 18.9 | 4.49 | 4.84 | 4.84 |
| method.paste.format | 3 | 3 | 0 | 0 | 12.1 | 20.4 | 20.4 | 0.07 | 0.09 | 0.09 |
| method.setValue | 3 | 3 | 0 | 0 | 17.1 | 17.9 | 17.9 | 0.13 | 0.17 | 0.17 |
| method.selectText | 3 | 3 | 0 | 0 | 16.8 | 23.3 | 23.3 | 0.15 | 0.15 | 0.15 |
| method.scroll.pages | 3 | 3 | 0 | 0 | 14.6 | 18.2 | 18.2 | 0.20 | 0.43 | 0.43 |
| end_task | 3 | 3 | 0 | 0 | 3.01 | 3.24 | 3.24 | – | – | – |
| setup.findTarget | 6 | 6 | 0 | 0 | 273.8 | 275.2 | 275.2 | 259.6 | 261.4 | 261.4 |

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
| warm.getAXState | source at_spi; chars 9220 (9104–9220); lines 384 (382–384); elements 383 (381–383) |
| warm.getScreenshot | bytes 35665 (35513–35873); width 910 (910–910); height 756 (756–756); format jpeg; sha256 6 distinct |
| task.act | actions 43 (43–43); observations 1 (1–1) |
| task.verify | observations 1 (1–1) |
| task.clear | actions 2 (2–2); observations 1 (1–1) |
| task.total | cells 3 (3–3); actions 45 (45–45); observations 3 (3–3); outcome typed with pressKey, verified, cleared |
| method.typeText | outcome threw; methodError type_text is not available in this engine build; target survived |
| method.paste | outcome threw; methodError type_text is not available in this engine build; target survived |
| method.paste.format | outcome threw; methodError Linux paste supports only text format.; target survived |
| method.setValue | outcome threw; methodError setValue is unavailable on Linux; use click, pressKey, and typeText.; target survived |
| method.selectText | outcome threw; methodError selectText is unavailable on Linux.; target survived |
| method.scroll.pages | outcome threw; methodError Linux scroll accepts { pixels }, not pages.; target survived |
| setup.findTarget | windowId 33554680 (33554680–33554680); app org.gnome.gedit; windows 4 (4–4); for method.paste, method.typeText |

## Invalidated samples

None.

## Errors

None.

## Problems

No problems: every run is complete and attests the same commit, REPL host, engine, approved engine, release, hardware, OS, display, service, sandbox and sample plan.
