# Native baseline summary

Runs: run-1 (2026-11-13T08:04:04.877Z to 2026-11-13T08:05:30.432Z); run-2 (2026-11-13T08:11:07.542Z to 2026-11-13T08:12:34.607Z); run-3 (2026-11-13T08:18:16.194Z to 2026-11-13T08:19:43.639Z).

| Attested | Value |
|---|---|
| Device | cua-171 |
| Host commit | 8ab1cc758983e7774cbff74a1cc2fd2d745120bb |
| REPL host | cua (initialize: cua-repl-host 0.5.0) |
| Engine | cua (answered: cua-engine named by --engine-bin /Users/new/.local/share/cua-171/task74/w5/engine/8ab1cc758983/cua-engine) |
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
| ssh.roundtrip | 15 | 15 | 0 | 0 | 302.9 | 323.5 | 323.5 | – | – | – |
| cold.miss.initialize | 6 | 6 | 0 | 0 | 665.4 | 696.9 | 696.9 | – | – | – |
| cold.miss.tools_list | 6 | 6 | 0 | 0 | 2.44 | 2.93 | 2.93 | – | – | – |
| cold.miss.first_js | 6 | 6 | 0 | 0 | 319.6 | 386.7 | 386.7 | 0.01 | 0.02 | 0.02 |
| cold.miss.total | 6 | 6 | 0 | 0 | 997.3 | 1055.2 | 1055.2 | – | – | – |
| cold.hit.initialize | 9 | 9 | 0 | 0 | 534.8 | 571.6 | 571.6 | – | – | – |
| cold.hit.tools_list | 9 | 9 | 0 | 0 | 1.13 | 2.24 | 2.24 | – | – | – |
| cold.hit.first_js | 9 | 9 | 0 | 0 | 469.2 | 536.0 | 536.0 | 0.01 | 0.02 | 0.02 |
| cold.hit.total | 9 | 9 | 0 | 0 | 978.7 | 1095.5 | 1095.5 | – | – | – |
| warm.noop | 90 | 90 | 0 | 0 | 14.2 | 22.4 | 30.5 | 0.01 | 0.03 | 0.04 |
| warm.getState | 90 | 90 | 0 | 0 | 17.3 | 24.0 | 31.7 | 3.71 | 6.33 | 7.14 |
| warm.listApps | 90 | 90 | 0 | 0 | 17.3 | 28.2 | 31.8 | 3.54 | 5.21 | 10.1 |
| setup.findWindow | 3 | 3 | 0 | 0 | 272.4 | 272.7 | 272.7 | 255.6 | 257.0 | 257.0 |
| bind.getApp | 3 | 3 | 0 | 0 | 126.1 | 161.2 | 161.2 | 111.7 | 135.6 | 135.6 |
| approval.elicitation | 3 | 3 | 0 | 0 | 28.1 | 35.8 | 35.8 | – | – | – |
| warm.getAXState | 90 | 90 | 0 | 0 | 90.5 | 113.6 | 127.3 | 77.8 | 99.8 | 113.4 |
| warm.getScreenshot | 90 | 90 | 0 | 0 | 111.8 | 145.2 | 154.8 | 99.3 | 131.4 | 141.0 |
| task.act | 30 | 30 | 0 | 0 | 4493.5 | 4530.5 | 4538.5 | 4481.4 | 4517.1 | 4524.0 |
| task.verify | 30 | 30 | 0 | 0 | 188.4 | 213.1 | 217.4 | 173.7 | 198.1 | 200.8 |
| task.clear | 30 | 30 | 0 | 0 | 313.5 | 351.4 | 370.9 | 301.6 | 334.0 | 350.7 |
| task.total | 30 | 30 | 0 | 0 | 4992.7 | 5068.6 | 5101.8 | 4955.1 | 5017.6 | 5044.4 |
| method.typeText | 3 | 3 | 0 | 0 | 57.4 | 60.3 | 60.3 | 46.4 | 48.9 | 48.9 |
| method.paste | 3 | 3 | 0 | 0 | 57.3 | 68.5 | 68.5 | 45.4 | 54.2 | 54.2 |
| method.paste.format | 3 | 3 | 0 | 0 | 13.9 | 20.5 | 20.5 | 0.10 | 0.11 | 0.11 |
| method.setValue | 3 | 3 | 0 | 0 | 13.4 | 13.9 | 13.9 | 0.15 | 0.16 | 0.16 |
| method.selectText | 3 | 3 | 0 | 0 | 13.5 | 19.3 | 19.3 | 0.11 | 0.14 | 0.14 |
| method.scroll.pages | 3 | 3 | 0 | 0 | 13.6 | 15.3 | 15.3 | 0.12 | 0.17 | 0.17 |
| end_task | 3 | 3 | 0 | 0 | 2.93 | 3.04 | 3.04 | – | – | – |
| setup.findTarget | 6 | 6 | 0 | 0 | 270.2 | 272.3 | 272.3 | 257.0 | 258.0 | 258.0 |

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
| warm.getState | apps 17 (17–17); browsers 0 (0–0) |
| warm.listApps | apps 17 (17–17); running 0 (0–0) |
| setup.findWindow | windowId 8388708 (8388708–8388708); app org.gnome.gedit; windows 2 (2–2) |
| bind.getApp | approvals 1 (1–1) |
| approval.elicitation | app org.gnome.gedit; action accept |
| warm.getAXState | source at_spi; chars 9220 (9104–9220); lines 384 (382–384); elements 383 (381–383) |
| warm.getScreenshot | bytes 35579 (35489–35722); width 910 (910–910); height 756 (756–756); format jpeg; sha256 6 distinct |
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
