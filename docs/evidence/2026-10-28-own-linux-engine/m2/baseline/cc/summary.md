# Native baseline summary

Runs: run-1 (2026-10-30T09:44:52.101Z to 2026-10-30T09:47:05.329Z); run-2 (2026-10-30T09:52:48.351Z to 2026-10-30T09:55:01.006Z); run-3 (2026-10-30T10:00:43.412Z to 2026-10-30T10:02:56.155Z).

| Attested | Value |
|---|---|
| Device | cua-171 |
| Host commit | e0168c63871cfa140ea81e2f97ec6a8f9d73adc1 |
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
| ssh.roundtrip | 15 | 15 | 0 | 0 | 285.2 | 333.4 | 333.4 | – | – | – |
| cold.miss.initialize | 6 | 6 | 0 | 0 | 650.4 | 688.4 | 688.4 | – | – | – |
| cold.miss.tools_list | 6 | 6 | 0 | 0 | 2.52 | 2.76 | 2.76 | – | – | – |
| cold.miss.first_js | 6 | 6 | 0 | 0 | 379.6 | 417.9 | 417.9 | 0.01 | 0.03 | 0.03 |
| cold.miss.total | 6 | 6 | 0 | 0 | 1034.7 | 1108.9 | 1108.9 | – | – | – |
| cold.hit.initialize | 9 | 9 | 0 | 0 | 516.3 | 564.8 | 564.8 | – | – | – |
| cold.hit.tools_list | 9 | 9 | 0 | 0 | 1.10 | 1.41 | 1.41 | – | – | – |
| cold.hit.first_js | 9 | 9 | 0 | 0 | 473.4 | 535.3 | 535.3 | 0.01 | 0.06 | 0.06 |
| cold.hit.total | 9 | 9 | 0 | 0 | 995.0 | 1066.4 | 1066.4 | – | – | – |
| warm.noop | 90 | 90 | 0 | 0 | 13.8 | 22.5 | 24.1 | 0.01 | 0.03 | 0.03 |
| warm.getState | 90 | 90 | 0 | 0 | 18.2 | 24.8 | 27.7 | 3.86 | 6.68 | 11.4 |
| warm.listApps | 90 | 90 | 0 | 0 | 18.2 | 26.4 | 32.9 | 3.86 | 6.40 | 9.81 |
| setup.findWindow | 3 | 3 | 0 | 0 | 275.5 | 276.3 | 276.3 | 258.4 | 259.1 | 259.1 |
| bind.getApp | 3 | 3 | 0 | 0 | 152.2 | 153.8 | 153.8 | 133.0 | 138.3 | 138.3 |
| approval.elicitation | 3 | 3 | 0 | 0 | 25.4 | 28.7 | 28.7 | – | – | – |
| warm.getAXState | 90 | 90 | 0 | 0 | 97.5 | 123.2 | 148.0 | 83.3 | 107.3 | 122.3 |
| warm.getScreenshot | 90 | 90 | 0 | 0 | 118.4 | 148.5 | 177.7 | 103.1 | 131.8 | 151.4 |
| task.act | 30 | 30 | 0 | 0 | 8830.7 | 8888.1 | 8892.5 | 8818.1 | 8870.7 | 8879.0 |
| task.verify | 30 | 30 | 0 | 0 | 190.0 | 215.3 | 226.4 | 176.4 | 195.2 | 205.5 |
| task.clear | 30 | 30 | 0 | 0 | 511.2 | 552.3 | 565.0 | 498.1 | 540.0 | 553.3 |
| task.total | 30 | 30 | 0 | 0 | 9545.3 | 9627.9 | 9636.4 | 9505.1 | 9590.0 | 9590.6 |
| method.typeText | 3 | 3 | 0 | 0 | 160.3 | 163.0 | 163.0 | 147.1 | 148.3 | 148.3 |
| method.paste | 3 | 3 | 0 | 0 | 164.0 | 176.4 | 176.4 | 150.8 | 160.0 | 160.0 |
| method.paste.format | 3 | 3 | 0 | 0 | 18.6 | 20.6 | 20.6 | 0.12 | 0.15 | 0.15 |
| method.setValue | 3 | 3 | 0 | 0 | 15.8 | 21.7 | 21.7 | 0.17 | 0.24 | 0.24 |
| method.selectText | 3 | 3 | 0 | 0 | 17.3 | 19.9 | 19.9 | 0.10 | 0.17 | 0.17 |
| method.scroll.pages | 3 | 3 | 0 | 0 | 18.8 | 21.9 | 21.9 | 0.17 | 0.20 | 0.20 |
| end_task | 3 | 3 | 0 | 0 | 3.11 | 3.18 | 3.18 | – | – | – |
| setup.findTarget | 6 | 6 | 0 | 0 | 271.5 | 280.2 | 280.2 | 258.3 | 260.6 | 260.6 |

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
| warm.getScreenshot | bytes 35619 (35604–35931); width 910 (910–910); height 756 (756–756); format jpeg; sha256 6 distinct |
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
