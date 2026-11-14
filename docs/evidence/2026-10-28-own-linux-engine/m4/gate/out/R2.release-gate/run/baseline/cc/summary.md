# Native baseline summary

Runs: run-1 (2026-11-13T12:19:19.537Z to 2026-11-13T12:20:46.856Z); run-2 (2026-11-13T12:26:27.524Z to 2026-11-13T12:27:53.866Z); run-3 (2026-11-13T12:33:32.223Z to 2026-11-13T12:34:59.387Z).

| Attested | Value |
|---|---|
| Device | cua-171 |
| Host commit | 514f5c62dd6c74b1ed24c48f112ca9c35a70eece |
| REPL host | cua (initialize: cua-repl-host 0.5.0) |
| Engine | cua (answered: cua-engine named by --engine-bin /tmp/cua171-candidate-mZy2OH/cua-engine) |
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
| ssh.roundtrip | 15 | 15 | 0 | 0 | 287.0 | 309.0 | 309.0 | – | – | – |
| cold.miss.initialize | 6 | 6 | 0 | 0 | 666.2 | 707.9 | 707.9 | – | – | – |
| cold.miss.tools_list | 6 | 6 | 0 | 0 | 2.91 | 3.42 | 3.42 | – | – | – |
| cold.miss.first_js | 6 | 6 | 0 | 0 | 336.6 | 376.7 | 376.7 | 0.02 | 0.03 | 0.03 |
| cold.miss.total | 6 | 6 | 0 | 0 | 1017.3 | 1059.7 | 1059.7 | – | – | – |
| cold.hit.initialize | 9 | 9 | 0 | 0 | 543.1 | 581.8 | 581.8 | – | – | – |
| cold.hit.tools_list | 9 | 9 | 0 | 0 | 1.25 | 2.55 | 2.55 | – | – | – |
| cold.hit.first_js | 9 | 9 | 0 | 0 | 444.3 | 498.1 | 498.1 | 0.01 | 0.03 | 0.03 |
| cold.hit.total | 9 | 9 | 0 | 0 | 988.4 | 1058.8 | 1058.8 | – | – | – |
| warm.noop | 90 | 90 | 0 | 0 | 13.9 | 19.0 | 24.6 | 0.01 | 0.03 | 0.06 |
| warm.getState | 90 | 90 | 0 | 0 | 15.9 | 19.8 | 26.9 | 3.69 | 5.87 | 7.59 |
| warm.listApps | 90 | 90 | 0 | 0 | 15.6 | 20.7 | 23.1 | 3.42 | 5.41 | 6.01 |
| setup.findWindow | 3 | 3 | 0 | 0 | 270.1 | 270.2 | 270.2 | 255.0 | 255.6 | 255.6 |
| bind.getApp | 3 | 3 | 0 | 0 | 133.0 | 161.4 | 161.4 | 113.6 | 143.2 | 143.2 |
| approval.elicitation | 3 | 3 | 0 | 0 | 26.9 | 28.6 | 28.6 | – | – | – |
| warm.getAXState | 90 | 90 | 0 | 0 | 92.2 | 119.0 | 130.0 | 79.2 | 99.7 | 113.6 |
| warm.getScreenshot | 90 | 90 | 0 | 0 | 114.2 | 139.2 | 148.1 | 100.7 | 126.6 | 136.8 |
| task.act | 30 | 30 | 0 | 0 | 4505.3 | 4538.7 | 4555.3 | 4488.2 | 4524.5 | 4535.0 |
| task.verify | 30 | 30 | 0 | 0 | 192.4 | 220.8 | 226.8 | 178.7 | 206.5 | 207.4 |
| task.clear | 30 | 30 | 0 | 0 | 307.6 | 358.1 | 359.0 | 294.4 | 344.6 | 346.4 |
| task.total | 30 | 30 | 0 | 0 | 5006.1 | 5076.5 | 5091.2 | 4966.7 | 5036.5 | 5038.2 |
| method.typeText | 3 | 3 | 0 | 0 | 60.5 | 63.9 | 63.9 | 47.6 | 52.1 | 52.1 |
| method.paste | 3 | 3 | 0 | 0 | 59.9 | 60.1 | 60.1 | 46.2 | 47.8 | 47.8 |
| method.paste.format | 3 | 3 | 0 | 0 | 14.3 | 17.3 | 17.3 | 0.09 | 0.10 | 0.10 |
| method.setValue | 3 | 3 | 0 | 0 | 18.5 | 22.0 | 22.0 | 0.14 | 0.21 | 0.21 |
| method.selectText | 3 | 3 | 0 | 0 | 13.4 | 18.6 | 18.6 | 0.11 | 0.23 | 0.23 |
| method.scroll.pages | 3 | 3 | 0 | 0 | 15.1 | 18.1 | 18.1 | 0.13 | 0.20 | 0.20 |
| end_task | 3 | 3 | 0 | 0 | 3.55 | 3.61 | 3.61 | – | – | – |
| setup.findTarget | 6 | 6 | 0 | 0 | 270.7 | 282.6 | 282.6 | 257.1 | 261.4 | 261.4 |

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
| warm.getScreenshot | bytes 35742 (35592–36087); width 910 (910–910); height 756 (756–756); format jpeg; sha256 6 distinct |
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
