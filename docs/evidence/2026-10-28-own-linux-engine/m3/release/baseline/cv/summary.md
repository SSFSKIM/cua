# Native baseline summary

Runs: run-1 (2026-11-02T00:50:20.179Z to 2026-11-02T00:54:53.811Z); run-2 (2026-11-02T00:58:10.231Z to 2026-11-02T01:02:46.532Z); run-3 (2026-11-02T01:06:03.175Z to 2026-11-02T01:10:39.864Z).

| Attested | Value |
|---|---|
| Device | cua-171 |
| Host commit | 23d0b7c9bf29610165fde6e751df0471e57eadb9 |
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
| ssh.roundtrip | 15 | 15 | 0 | 0 | 282.5 | 317.3 | 317.3 | – | – | – |
| cold.miss.initialize | 6 | 6 | 0 | 0 | 653.3 | 691.2 | 691.2 | – | – | – |
| cold.miss.tools_list | 6 | 6 | 0 | 0 | 2.70 | 3.05 | 3.05 | – | – | – |
| cold.miss.first_js | 6 | 6 | 0 | 0 | 361.0 | 384.9 | 384.9 | 0.01 | 0.02 | 0.02 |
| cold.miss.total | 6 | 6 | 0 | 0 | 1024.8 | 1054.7 | 1054.7 | – | – | – |
| cold.hit.initialize | 9 | 9 | 0 | 0 | 539.5 | 592.8 | 592.8 | – | – | – |
| cold.hit.tools_list | 9 | 9 | 0 | 0 | 1.28 | 2.01 | 2.01 | – | – | – |
| cold.hit.first_js | 9 | 9 | 0 | 0 | 506.1 | 539.7 | 539.7 | 0.01 | 0.02 | 0.02 |
| cold.hit.total | 9 | 9 | 0 | 0 | 1058.1 | 1121.0 | 1121.0 | – | – | – |
| warm.noop | 90 | 90 | 0 | 0 | 13.4 | 23.0 | 29.8 | 0.01 | 0.02 | 0.11 |
| warm.getState | 90 | 90 | 0 | 0 | 24.3 | 41.0 | 42.5 | 9.50 | 15.7 | 18.0 |
| warm.listApps | 90 | 90 | 0 | 0 | 23.8 | 35.8 | 39.9 | 9.68 | 14.7 | 18.1 |
| setup.findWindow | 3 | 3 | 0 | 0 | 292.8 | 293.2 | 293.2 | 275.0 | 278.0 | 278.0 |
| bind.getApp | 3 | 3 | 0 | 0 | 566.1 | 666.2 | 666.2 | 549.0 | 648.6 | 648.6 |
| approval.elicitation | 3 | 3 | 0 | 0 | 42.8 | 55.3 | 55.3 | – | – | – |
| warm.getAXState | 90 | 90 | 0 | 0 | 488.0 | 616.1 | 783.7 | 474.2 | 601.4 | 762.9 |
| warm.getScreenshot | 90 | 90 | 0 | 0 | 611.5 | 747.3 | 861.2 | 597.7 | 721.3 | 845.5 |
| task.act | 30 | 30 | 0 | 0 | 16965.8 | 17096.0 | 17099.8 | 16949.8 | 17082.8 | 17087.5 |
| task.verify | 30 | 30 | 0 | 0 | 576.1 | 827.6 | 871.5 | 559.0 | 815.5 | 857.4 |
| task.clear | 30 | 30 | 0 | 0 | 1343.7 | 1548.9 | 1553.5 | 1331.7 | 1529.3 | 1532.4 |
| task.total | 30 | 30 | 0 | 0 | 18891.3 | 19417.6 | 19424.0 | 18849.5 | 19373.1 | 19375.7 |
| method.typeText | 3 | 3 | 0 | 0 | 10238.1 | 10239.1 | 10239.1 | 10225.0 | 10225.5 | 10225.5 |
| method.paste | 3 | 3 | 0 | 0 | 10234.6 | 10236.8 | 10236.8 | 10221.7 | 10223.5 | 10223.5 |
| method.paste.format | 3 | 3 | 0 | 0 | 13.6 | 13.8 | 13.8 | 0.07 | 0.07 | 0.07 |
| method.setValue | 3 | 3 | 0 | 0 | 14.0 | 17.2 | 17.2 | 0.13 | 0.14 | 0.14 |
| method.selectText | 3 | 3 | 0 | 0 | 14.4 | 14.4 | 14.4 | 0.14 | 0.16 | 0.16 |
| method.scroll.pages | 3 | 3 | 0 | 0 | 16.8 | 18.4 | 18.4 | 0.16 | 0.18 | 0.18 |
| end_task | 3 | 3 | 0 | 0 | 3.12 | 3.24 | 3.24 | – | – | – |
| setup.findTarget | 6 | 6 | 0 | 0 | 296.1 | 302.6 | 302.6 | 283.1 | 288.3 | 288.3 |

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
| warm.getScreenshot | bytes 35612 (35579–35689); width 910 (910–910); height 756 (756–756); format jpeg; sha256 33978d6f1db066a1, 6489dec5d8664ad7, e8b7c9aca021786f |
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
