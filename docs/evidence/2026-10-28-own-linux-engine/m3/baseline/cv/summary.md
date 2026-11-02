# Native baseline summary

Runs: run-1 (2026-10-31T22:52:51.650Z to 2026-10-31T22:57:27.810Z); run-2 (2026-10-31T23:00:44.183Z to 2026-10-31T23:05:23.439Z); run-3 (2026-10-31T23:08:39.029Z to 2026-10-31T23:13:16.869Z).

| Attested | Value |
|---|---|
| Device | cua-171 |
| Host commit | 5e4393248fb4fe863c4bf954872e48704acabe8d |
| REPL host | cua (initialize: cua-repl-host 0.5.0) |
| Engine | vendor (answered: sky_linux_x64 of the run's runtime) |
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
| ssh.roundtrip | 15 | 15 | 0 | 0 | 285.0 | 316.0 | 316.0 | – | – | – |
| cold.miss.initialize | 6 | 6 | 0 | 0 | 637.7 | 671.9 | 671.9 | – | – | – |
| cold.miss.tools_list | 6 | 6 | 0 | 0 | 2.53 | 2.99 | 2.99 | – | – | – |
| cold.miss.first_js | 6 | 6 | 0 | 0 | 360.6 | 396.4 | 396.4 | 0.01 | 0.02 | 0.02 |
| cold.miss.total | 6 | 6 | 0 | 0 | 1002.2 | 1040.7 | 1040.7 | – | – | – |
| cold.hit.initialize | 9 | 9 | 0 | 0 | 527.8 | 558.5 | 558.5 | – | – | – |
| cold.hit.tools_list | 9 | 9 | 0 | 0 | 1.24 | 1.94 | 1.94 | – | – | – |
| cold.hit.first_js | 9 | 9 | 0 | 0 | 495.9 | 550.2 | 550.2 | 0.01 | 0.03 | 0.03 |
| cold.hit.total | 9 | 9 | 0 | 0 | 1041.2 | 1083.2 | 1083.2 | – | – | – |
| warm.noop | 90 | 90 | 0 | 0 | 13.9 | 19.9 | 24.0 | 0.01 | 0.02 | 0.03 |
| warm.getState | 90 | 90 | 0 | 0 | 22.0 | 27.5 | 34.1 | 8.84 | 12.9 | 18.1 |
| warm.listApps | 90 | 90 | 0 | 0 | 21.4 | 31.0 | 38.6 | 8.36 | 14.9 | 19.8 |
| setup.findWindow | 3 | 3 | 0 | 0 | 287.9 | 303.1 | 303.1 | 274.9 | 285.7 | 285.7 |
| bind.getApp | 3 | 3 | 0 | 0 | 563.5 | 662.2 | 662.2 | 545.2 | 634.3 | 634.3 |
| approval.elicitation | 3 | 3 | 0 | 0 | 58.4 | 75.0 | 75.0 | – | – | – |
| warm.getAXState | 90 | 90 | 0 | 0 | 510.9 | 617.3 | 645.7 | 497.3 | 602.4 | 629.8 |
| warm.getScreenshot | 90 | 90 | 0 | 0 | 648.9 | 873.4 | 1000.8 | 631.9 | 849.3 | 978.8 |
| task.act | 30 | 30 | 0 | 0 | 16981.5 | 17114.5 | 17140.0 | 16968.1 | 17094.2 | 17123.7 |
| task.verify | 30 | 30 | 0 | 0 | 590.1 | 833.1 | 913.3 | 573.2 | 819.3 | 891.0 |
| task.clear | 30 | 30 | 0 | 0 | 1343.6 | 1469.7 | 1595.9 | 1329.3 | 1458.3 | 1581.0 |
| task.total | 30 | 30 | 0 | 0 | 18921.6 | 19226.9 | 19271.0 | 18881.6 | 19180.6 | 19213.8 |
| method.typeText | 3 | 3 | 0 | 0 | 10237.7 | 10252.5 | 10252.5 | 10223.6 | 10234.4 | 10234.4 |
| method.paste | 3 | 3 | 0 | 0 | 10235.5 | 10237.6 | 10237.6 | 10222.0 | 10225.1 | 10225.1 |
| method.paste.format | 3 | 3 | 0 | 0 | 13.4 | 13.7 | 13.7 | 0.08 | 0.10 | 0.10 |
| method.setValue | 3 | 3 | 0 | 0 | 14.0 | 14.4 | 14.4 | 0.12 | 0.15 | 0.15 |
| method.selectText | 3 | 3 | 0 | 0 | 12.2 | 13.8 | 13.8 | 0.11 | 0.12 | 0.12 |
| method.scroll.pages | 3 | 3 | 0 | 0 | 14.6 | 16.6 | 16.6 | 0.25 | 0.35 | 0.35 |
| end_task | 3 | 3 | 0 | 0 | 2.88 | 3.24 | 3.24 | – | – | – |
| setup.findTarget | 6 | 6 | 0 | 0 | 296.5 | 319.8 | 319.8 | 282.9 | 307.3 | 307.3 |

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
| warm.getAXState | source at_spi; chars 9104 (9104–9220); lines 382 (382–384); elements 381 (381–383) |
| warm.getScreenshot | bytes 35572 (35553–35685); width 910 (910–910); height 756 (756–756); format jpeg; sha256 377d327340b692a1, da5615c0c918c0d6, fdb151ed7089824d |
| task.act | actions 43 (43–43); observations 1 (1–1) |
| task.verify | observations 1 (1–1) |
| task.clear | actions 2 (2–2); observations 1 (1–1) |
| task.total | cells 3 (3–3); actions 45 (45–45); observations 3 (3–3); outcome typed with pressKey, verified, cleared |
| method.typeText | outcome threw; methodError editable Paste did not insert text; target survived |
| method.paste | outcome threw; methodError editable Paste did not insert text; target survived |
| method.paste.format | outcome threw; methodError Linux paste supports only text format.; target survived |
| method.setValue | outcome threw; methodError setValue is unavailable on Linux; use click, pressKey, and typeText.; target survived |
| method.selectText | outcome threw; methodError selectText is unavailable on Linux.; target survived |
| method.scroll.pages | outcome threw; methodError Linux scroll accepts { pixels }, not pages.; target survived |
| setup.findTarget | windowId 23068772 (23068772–23068772); app org.gnome.gedit; windows 4 (4–4); for method.paste, method.typeText |

## Invalidated samples

None.

## Errors

None.

## Problems

No problems: every run is complete and attests the same commit, REPL host, engine, approved engine, release, hardware, OS, display, service, sandbox and sample plan.
