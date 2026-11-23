# Native baseline summary

Runs: run-1 (2026-11-15T06:21:58.011Z to 2026-11-15T06:26:32.358Z); run-2 (2026-11-15T06:29:09.483Z to 2026-11-15T06:33:48.220Z); run-3 (2026-11-15T06:36:24.874Z to 2026-11-15T06:40:59.473Z).

| Attested | Value |
|---|---|
| Device | cua-171 |
| Host commit | 01ff0648f3afc4a234669cd381395c91543ce3f7 |
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
| ssh.roundtrip | 15 | 15 | 0 | 0 | 287.6 | 310.0 | 310.0 | – | – | – |
| cold.miss.initialize | 6 | 6 | 0 | 0 | 645.6 | 677.3 | 677.3 | – | – | – |
| cold.miss.tools_list | 6 | 6 | 0 | 0 | 2.39 | 4.06 | 4.06 | – | – | – |
| cold.miss.first_js | 6 | 6 | 0 | 0 | 373.5 | 387.7 | 387.7 | 0.01 | 0.02 | 0.02 |
| cold.miss.total | 6 | 6 | 0 | 0 | 1016.9 | 1069.0 | 1069.0 | – | – | – |
| cold.hit.initialize | 9 | 9 | 0 | 0 | 519.6 | 609.8 | 609.8 | – | – | – |
| cold.hit.tools_list | 9 | 9 | 0 | 0 | 1.25 | 1.39 | 1.39 | – | – | – |
| cold.hit.first_js | 9 | 9 | 0 | 0 | 490.4 | 537.5 | 537.5 | 0.01 | 0.03 | 0.03 |
| cold.hit.total | 9 | 9 | 0 | 0 | 1027.6 | 1148.7 | 1148.7 | – | – | – |
| warm.noop | 90 | 90 | 0 | 0 | 14.6 | 19.8 | 24.2 | 0.01 | 0.02 | 0.03 |
| warm.getState | 90 | 90 | 0 | 0 | 18.5 | 29.0 | 31.3 | 4.28 | 7.15 | 11.8 |
| warm.listApps | 90 | 90 | 0 | 0 | 17.0 | 22.1 | 30.3 | 4.30 | 5.60 | 8.00 |
| setup.findWindow | 3 | 3 | 0 | 0 | 282.7 | 283.5 | 283.5 | 264.3 | 267.2 | 267.2 |
| bind.getApp | 3 | 3 | 0 | 0 | 554.2 | 570.5 | 570.5 | 536.8 | 545.3 | 545.3 |
| approval.elicitation | 3 | 3 | 0 | 0 | 45.3 | 50.2 | 50.2 | – | – | – |
| warm.getAXState | 90 | 90 | 0 | 0 | 508.0 | 645.9 | 777.6 | 493.8 | 631.6 | 748.3 |
| warm.getScreenshot | 90 | 90 | 0 | 0 | 643.8 | 853.7 | 933.8 | 627.6 | 835.8 | 906.0 |
| task.act | 30 | 30 | 0 | 0 | 16729.7 | 17017.2 | 17116.9 | 16715.3 | 17005.4 | 17096.0 |
| task.verify | 30 | 30 | 0 | 0 | 578.6 | 897.1 | 923.8 | 565.2 | 877.6 | 902.8 |
| task.clear | 30 | 30 | 0 | 0 | 1365.8 | 1506.7 | 1511.0 | 1353.4 | 1493.9 | 1497.8 |
| task.total | 30 | 30 | 0 | 0 | 18698.3 | 19140.6 | 19306.0 | 18650.8 | 19094.4 | 19259.0 |
| method.typeText | 3 | 3 | 0 | 0 | 10237.5 | 10243.8 | 10243.8 | 10220.4 | 10225.6 | 10225.6 |
| method.paste | 3 | 3 | 0 | 0 | 10236.5 | 10240.4 | 10240.4 | 10219.5 | 10219.7 | 10219.7 |
| method.paste.format | 3 | 3 | 0 | 0 | 16.5 | 17.4 | 17.4 | 0.10 | 0.10 | 0.10 |
| method.setValue | 3 | 3 | 0 | 0 | 17.0 | 18.9 | 18.9 | 0.12 | 0.34 | 0.34 |
| method.selectText | 3 | 3 | 0 | 0 | 18.5 | 28.3 | 28.3 | 0.14 | 0.19 | 0.19 |
| method.scroll.pages | 3 | 3 | 0 | 0 | 16.5 | 24.8 | 24.8 | 0.12 | 0.13 | 0.13 |
| end_task | 3 | 3 | 0 | 0 | 2.93 | 3.89 | 3.89 | – | – | – |
| setup.findTarget | 6 | 6 | 0 | 0 | 290.9 | 297.6 | 297.6 | 273.9 | 283.5 | 283.5 |

| Operation | Observed (median, range) |
|---|---|
| cold.miss.initialize | planned miss |
| cold.miss.tools_list | planned miss |
| cold.miss.first_js | planned miss; documentChars 22409 (22409–22409) |
| cold.miss.total | planned miss |
| cold.hit.initialize | planned hit |
| cold.hit.tools_list | planned hit |
| cold.hit.first_js | planned hit; documentChars 22409 (22409–22409) |
| cold.hit.total | planned hit |
| warm.getState | apps 17 (17–17); browsers 0 (0–0) |
| warm.listApps | apps 17 (17–17); running 0 (0–0) |
| setup.findWindow | windowId 8388708 (8388708–8388708); app org.gnome.gedit; windows 2 (2–2) |
| bind.getApp | approvals 1 (1–1) |
| approval.elicitation | app org.gnome.gedit; action accept |
| warm.getAXState | source at_spi; chars 9104 (9104–9220); lines 382 (382–384); elements 381 (381–383) |
| warm.getScreenshot | bytes 35791 (35743–35797); width 910 (910–910); height 756 (756–756); format jpeg; sha256 6bd01b20fd3ecd94, 794b79196be9a2fb, c7a02fe11cec33b0 |
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
| setup.findTarget | windowId 12583012 (12583012–12583012); app org.gnome.gedit; windows 3 (3–3); for method.paste, method.typeText |

## Invalidated samples

None.

## Errors

None.

## Problems

No problems: every run is complete and attests the same commit, REPL host, engine, approved engine, release, hardware, OS, display, service, sandbox and sample plan.
