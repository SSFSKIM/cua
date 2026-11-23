# Native baseline summary

Runs: run-1 (2026-11-22T07:03:51.487Z to 2026-11-22T07:08:27.700Z); run-2 (2026-11-22T07:11:06.003Z to 2026-11-22T07:15:44.551Z); run-3 (2026-11-22T07:18:21.226Z to 2026-11-22T07:22:59.512Z).

| Attested | Value |
|---|---|
| Device | cua-171 |
| Host commit | 51f6b281692c47060a47399b72da363748aad7db |
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
| ssh.roundtrip | 15 | 15 | 0 | 0 | 324.4 | 348.0 | 348.0 | – | – | – |
| cold.miss.initialize | 6 | 6 | 0 | 0 | 662.8 | 717.4 | 717.4 | – | – | – |
| cold.miss.tools_list | 6 | 6 | 0 | 0 | 2.31 | 3.07 | 3.07 | – | – | – |
| cold.miss.first_js | 6 | 6 | 0 | 0 | 378.9 | 431.4 | 431.4 | 0.01 | 0.02 | 0.02 |
| cold.miss.total | 6 | 6 | 0 | 0 | 1066.7 | 1104.4 | 1104.4 | – | – | – |
| cold.hit.initialize | 9 | 9 | 0 | 0 | 572.4 | 591.3 | 591.3 | – | – | – |
| cold.hit.tools_list | 9 | 9 | 0 | 0 | 1.17 | 1.52 | 1.52 | – | – | – |
| cold.hit.first_js | 9 | 9 | 0 | 0 | 492.5 | 554.9 | 554.9 | 0.01 | 0.02 | 0.02 |
| cold.hit.total | 9 | 9 | 0 | 0 | 1058.3 | 1147.5 | 1147.5 | – | – | – |
| warm.noop | 90 | 90 | 0 | 0 | 15.1 | 22.4 | 33.7 | 0.01 | 0.03 | 0.05 |
| warm.getState | 90 | 90 | 0 | 0 | 19.2 | 27.4 | 34.7 | 4.64 | 6.66 | 23.5 |
| warm.listApps | 90 | 90 | 0 | 0 | 18.0 | 24.3 | 28.5 | 3.96 | 6.97 | 7.42 |
| setup.findWindow | 3 | 3 | 0 | 0 | 280.5 | 284.7 | 284.7 | 263.0 | 269.9 | 269.9 |
| bind.getApp | 3 | 3 | 0 | 0 | 504.6 | 962.5 | 962.5 | 487.5 | 939.9 | 939.9 |
| approval.elicitation | 3 | 3 | 0 | 0 | 36.0 | 52.9 | 52.9 | – | – | – |
| warm.getAXState | 90 | 90 | 0 | 0 | 546.9 | 710.9 | 779.3 | 531.0 | 695.6 | 764.8 |
| warm.getScreenshot | 90 | 90 | 0 | 0 | 663.7 | 850.5 | 1001.7 | 643.3 | 830.5 | 979.1 |
| task.act | 30 | 30 | 0 | 0 | 16779.3 | 16984.6 | 16991.1 | 16764.1 | 16963.4 | 16975.9 |
| task.verify | 30 | 30 | 0 | 0 | 590.0 | 814.8 | 867.3 | 574.8 | 792.6 | 848.1 |
| task.clear | 30 | 30 | 0 | 0 | 1337.6 | 1547.4 | 1604.8 | 1321.9 | 1533.2 | 1592.8 |
| task.total | 30 | 30 | 0 | 0 | 18726.0 | 19145.3 | 19251.3 | 18678.5 | 19093.7 | 19210.7 |
| method.typeText | 3 | 3 | 0 | 0 | 10234.8 | 10235.2 | 10235.2 | 10221.9 | 10222.3 | 10222.3 |
| method.paste | 3 | 3 | 0 | 0 | 10233.8 | 10240.1 | 10240.1 | 10221.1 | 10226.9 | 10226.9 |
| method.paste.format | 3 | 3 | 0 | 0 | 13.3 | 13.5 | 13.5 | 0.08 | 0.09 | 0.09 |
| method.setValue | 3 | 3 | 0 | 0 | 14.3 | 20.5 | 20.5 | 0.14 | 0.19 | 0.19 |
| method.selectText | 3 | 3 | 0 | 0 | 13.5 | 22.0 | 22.0 | 0.16 | 0.17 | 0.17 |
| method.scroll.pages | 3 | 3 | 0 | 0 | 17.0 | 21.6 | 21.6 | 0.20 | 0.29 | 0.29 |
| end_task | 3 | 3 | 0 | 0 | 2.77 | 3.44 | 3.44 | – | – | – |
| setup.findTarget | 6 | 6 | 0 | 0 | 287.8 | 297.8 | 297.8 | 274.1 | 283.9 | 283.9 |

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
| warm.getAXState | source at_spi; chars 9104 (9104–9220); lines 382 (382–384); elements 381 (381–383) |
| warm.getScreenshot | bytes 35681 (35676–36069); width 910 (910–910); height 756 (756–756); format jpeg; sha256 4bd210be793fc6d3, b5c0cb77199e5d38, d93da32cb00a6228 |
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
