# Native baseline summary

Runs: run-1 (2026-10-30T15:50:28.063Z to 2026-10-30T15:52:40.735Z); run-2 (2026-10-30T15:58:23.565Z to 2026-10-30T16:00:36.405Z); run-3 (2026-10-30T16:06:20.209Z to 2026-10-30T16:08:33.274Z).

| Attested | Value |
|---|---|
| Device | cua-171 |
| Host commit | 426e25f2cf3d44bef8d6db65ce6bba31f90781bd |
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
| ssh.roundtrip | 15 | 15 | 0 | 0 | 292.2 | 317.9 | 317.9 | – | – | – |
| cold.miss.initialize | 6 | 6 | 0 | 0 | 645.6 | 684.4 | 684.4 | – | – | – |
| cold.miss.tools_list | 6 | 6 | 0 | 0 | 2.43 | 3.13 | 3.13 | – | – | – |
| cold.miss.first_js | 6 | 6 | 0 | 0 | 369.1 | 407.9 | 407.9 | 0.01 | 0.02 | 0.02 |
| cold.miss.total | 6 | 6 | 0 | 0 | 1027.3 | 1050.1 | 1050.1 | – | – | – |
| cold.hit.initialize | 9 | 9 | 0 | 0 | 524.0 | 580.0 | 580.0 | – | – | – |
| cold.hit.tools_list | 9 | 9 | 0 | 0 | 1.15 | 1.59 | 1.59 | – | – | – |
| cold.hit.first_js | 9 | 9 | 0 | 0 | 501.9 | 549.7 | 549.7 | 0.01 | 0.04 | 0.04 |
| cold.hit.total | 9 | 9 | 0 | 0 | 1026.1 | 1100.7 | 1100.7 | – | – | – |
| warm.noop | 90 | 90 | 0 | 0 | 13.8 | 19.5 | 27.1 | 0.01 | 0.02 | 0.07 |
| warm.getState | 90 | 90 | 0 | 0 | 16.6 | 23.3 | 27.6 | 3.66 | 5.95 | 10.4 |
| warm.listApps | 90 | 90 | 0 | 0 | 15.9 | 20.1 | 24.1 | 3.54 | 4.11 | 7.47 |
| setup.findWindow | 3 | 3 | 0 | 0 | 275.9 | 282.6 | 282.6 | 258.6 | 259.7 | 259.7 |
| bind.getApp | 3 | 3 | 0 | 0 | 156.2 | 179.2 | 179.2 | 138.2 | 152.6 | 152.6 |
| approval.elicitation | 3 | 3 | 0 | 0 | 26.1 | 40.0 | 40.0 | – | – | – |
| warm.getAXState | 90 | 90 | 0 | 0 | 96.4 | 118.9 | 134.9 | 83.4 | 104.6 | 119.9 |
| warm.getScreenshot | 90 | 90 | 0 | 0 | 116.5 | 140.2 | 194.0 | 103.8 | 127.6 | 174.0 |
| task.act | 30 | 30 | 0 | 0 | 8841.7 | 8875.8 | 8906.4 | 8826.3 | 8862.9 | 8889.9 |
| task.verify | 30 | 30 | 0 | 0 | 189.3 | 227.5 | 230.1 | 174.2 | 213.8 | 216.2 |
| task.clear | 30 | 30 | 0 | 0 | 519.7 | 569.5 | 570.0 | 505.5 | 549.9 | 556.2 |
| task.total | 30 | 30 | 0 | 0 | 9554.0 | 9625.0 | 9642.7 | 9509.4 | 9573.8 | 9595.3 |
| method.typeText | 3 | 3 | 0 | 0 | 169.4 | 172.7 | 172.7 | 155.2 | 158.7 | 158.7 |
| method.paste | 3 | 3 | 0 | 0 | 163.8 | 174.3 | 174.3 | 151.4 | 155.1 | 155.1 |
| method.paste.format | 3 | 3 | 0 | 0 | 20.0 | 22.4 | 22.4 | 0.10 | 0.16 | 0.16 |
| method.setValue | 3 | 3 | 0 | 0 | 12.9 | 21.8 | 21.8 | 0.19 | 0.26 | 0.26 |
| method.selectText | 3 | 3 | 0 | 0 | 14.2 | 20.5 | 20.5 | 0.16 | 0.19 | 0.19 |
| method.scroll.pages | 3 | 3 | 0 | 0 | 13.4 | 17.2 | 17.2 | 0.12 | 0.15 | 0.15 |
| end_task | 3 | 3 | 0 | 0 | 3.00 | 3.02 | 3.02 | – | – | – |
| setup.findTarget | 6 | 6 | 0 | 0 | 272.3 | 284.1 | 284.1 | 259.8 | 262.4 | 262.4 |

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
| warm.getScreenshot | bytes 35616 (35525–35698); width 910 (910–910); height 756 (756–756); format jpeg; sha256 6 distinct |
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
| setup.findTarget | windowId 33554680 (33554680–33554680); app org.gnome.gedit; windows 4 (4–4); for method.paste, method.typeText |

## Invalidated samples

None.

## Errors

None.

## Problems

No problems: every run is complete and attests the same commit, REPL host, engine, approved engine, release, hardware, OS, display, service, sandbox and sample plan.
