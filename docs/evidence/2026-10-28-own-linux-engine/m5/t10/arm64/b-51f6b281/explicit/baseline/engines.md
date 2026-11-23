# Native baseline comparison A: engine (Linux)

| | Baseline | Candidate |
|---|---|---|
| REPL host | cua | cua |
| Engine | vendor (answered: sky_linux_arm64 of the run's runtime) | cua (answered: cua-engine installed in the run's home) |
| Approved engine | – | – |
| initialize answered by | cua-repl-host 0.5.0 | cua-repl-host 0.5.0 |
| Commit | 51f6b281692c47060a47399b72da363748aad7db | 51f6b281692c47060a47399b72da363748aad7db |
| device | cua-171-arm64 | cua-171-arm64 |
| release | 26.928.40906-linux-arm64 | 26.928.40906-linux-arm64 |
| hardware | Google Compute Engine, arm64, 8 CPUs, 31 GiB | Google Compute Engine, arm64, 8 CPUs, 31 GiB |
| os | Ubuntu 24.04.5 LTS (7.0.0-1017-gcp) | Ubuntu 24.04.5 LTS (7.0.0-1017-gcp) |
| display | 1280 x 800 points at scale 1 (1280 x 800 pixels) | 1280 x 800 points at scale 1 (1280 x 800 pixels) |
| service | computer surface, answered by vendor | computer surface, answered by cua |
| sandbox | scoped (platform default) | scoped (platform default) |
| plan | 5 cold, 30 warm, 10 tasks | 5 cold, 30 warm, 10 tasks |
| Runs | run-1, run-2, run-3 | run-1, run-2, run-3 |
| ssh.roundtrip median | 185.7 | 185.8 |

Rule (#171 comparison A, engine (Linux)): the baseline runs `--host cua --engine vendor`, the candidate `--host cua --engine cua`; three complete, attested runs a side of one sitting covering the same plan, every attested field equal but engine, service (below). The engine and its service are the variable: the vendor engine behind the vendor service against cua's engine behind cua's service, both in cua's own host, the only one Linux serves. Per operation (method cases included), the candidate's judged median must be at most the baseline's plus max(10%, 500 ms), or faster, and it must succeed in no smaller share of its valid samples; the cold-connection phases that open the ssh pipe are judged net of each side's ssh.roundtrip median. On an operation the engine answers (warm.getState, warm.listApps, bind.getApp, warm.getAXState, warm.getScreenshot, task.act, task.verify, task.clear, task.total, method.typeText, method.paste) the candidate is judged by the in-cell time (#370), the cell's own call through the service to the engine, what the engines change; the wall time, which adds the MCP transport and the REPL host both lanes share, is reported beside it and judged only by a gross wall backstop: the candidate's wall median above the baseline's plus max(10%, 500 ms) fails the operation (ruling 706), and the backstop never passes anything. Its speed is also judged by Acceptance 3's rule (Acceptance 10): with at least 20 samples a side, the upper end of the bootstrap 95% interval of its in-cell median minus the baseline's must be within max(5% of the baseline's median, 1 ms); with fewer, its in-cell median must be at most the baseline's, and every cua typeText and paste sample must return without an error, survive and read back its text (Plan of Work M2); the ordinary better-outcome rule accepts this improvement over the vendor engine's text failures, with no failure waived on cua. ssh, approval, guard and setup operations are reported, not judged. Milliseconds; "OK" is successes over valid samples; wall and in-cell columns are median / p95 / max of successful samples.

| Operation | Basis | Baseline OK | Candidate OK | Baseline judged | Candidate judged | Limit | Verdict | Baseline wall | Candidate wall | Baseline in-cell | Candidate in-cell |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ssh.roundtrip | – | 15/15 | 15/15 | 185.7 | 185.8 | – | not judged | 185.7 / 188.7 / 188.7 | 185.8 / 192.0 / 192.0 | – | – |
| cold.miss.initialize | wall median net of ssh.roundtrip median | 6/6 | 6/6 | 254.9 | 255.5 | 754.9 | pass | 440.7 / 444.7 / 444.7 | 441.3 / 444.1 / 444.1 | – | – |
| cold.miss.tools_list | wall median | 6/6 | 6/6 | 1.60 | 1.60 | 501.6 | pass | 1.63 / 1.71 / 1.71 | 1.63 / 1.73 / 1.73 | – | – |
| cold.miss.first_js | wall median | 6/6 | 6/6 | 234.8 | 198.5 | 734.8 | pass | 234.8 / 236.9 / 236.9 | 198.5 / 202.7 / 202.7 | 0.01 / 0.01 / 0.01 | 0.01 / 0.01 / 0.01 |
| cold.miss.total | wall median net of ssh.roundtrip median | 6/6 | 6/6 | 490.7 | 454.3 | 990.7 | pass | 676.4 / 681.9 / 681.9 | 640.1 / 646.4 / 646.4 | – | – |
| cold.hit.initialize | wall median net of ssh.roundtrip median | 9/9 | 9/9 | 177.0 | 179.8 | 677.0 | pass | 362.7 / 365.9 / 365.9 | 365.6 / 370.3 / 370.3 | – | – |
| cold.hit.tools_list | wall median | 9/9 | 9/9 | 0.80 | 0.70 | 500.8 | pass | 0.76 / 0.82 / 0.82 | 0.74 / 0.81 / 0.81 | – | – |
| cold.hit.first_js | wall median | 9/9 | 9/9 | 308.5 | 273.6 | 808.5 | pass | 308.5 / 314.3 / 314.3 | 273.6 / 280.6 / 280.6 | 0.01 / 0.01 / 0.01 | 0.01 / 0.01 / 0.01 |
| cold.hit.total | wall median net of ssh.roundtrip median | 9/9 | 9/9 | 486.8 | 455.5 | 986.8 | pass | 672.5 / 679.1 / 679.1 | 641.3 / 645.1 / 645.1 | – | – |
| warm.noop | wall median | 90/90 | 90/90 | 8.40 | 8.70 | 508.4 | pass | 8.44 / 11.6 / 12.0 | 8.68 / 11.5 / 13.6 | 0.01 / 0.01 / 0.03 | 0.01 / 0.01 / 0.03 |
| warm.getState | in-cell median | 90/90 | 90/90 | 1.70 | 1.70 | 501.7 | pass | 8.56 / 11.4 / 15.1 | 9.65 / 11.9 / 12.7 | 1.74 / 3.02 / 6.45 | 1.67 / 3.22 / 4.53 |
| warm.listApps | in-cell median | 90/90 | 90/90 | 1.80 | 1.60 | 501.8 | pass | 8.65 / 12.4 / 14.9 | 8.34 / 11.2 / 14.3 | 1.79 / 3.09 / 7.69 | 1.58 / 1.96 / 5.99 |
| setup.findWindow | – | 3/3 | 3/3 | 265.5 | 263.6 | – | not judged | 265.5 / 265.8 / 265.8 | 263.6 / 263.8 / 263.8 | 255.3 / 255.7 / 255.7 | 253.4 / 253.5 / 253.5 |
| bind.getApp | in-cell median | 3/3 | 3/3 | 203.1 | 63.1 | 703.1 | pass | 213.2 / 218.3 / 218.3 | 73.2 / 74.1 / 74.1 | 203.1 / 209.9 / 209.9 | 63.1 / 65.7 / 65.7 |
| approval.elicitation | – | 3/3 | 3/3 | 15.6 | 11.8 | – | not judged | 15.6 / 16.4 / 16.4 | 11.8 / 13.0 / 13.0 | – | – |
| warm.getAXState | in-cell median | 90/90 | 90/90 | 179.1 | 52.6 | 679.1 | pass | 187.5 / 194.3 / 195.5 | 60.4 / 62.5 / 65.2 | 179.1 / 185.5 / 187.7 | 52.6 / 54.4 / 55.4 |
| warm.getScreenshot | in-cell median | 90/90 | 90/90 | 288.1 | 59.3 | 788.1 | pass | 296.5 / 301.8 / 306.4 | 67.3 / 69.3 / 81.3 | 288.1 / 294.1 / 298.5 | 59.3 / 61.2 / 72.6 |
| task.act | in-cell median | 30/30 | 30/30 | 16045.9 | 4357.0 | 17650.5 | pass | 16053.7 / 16063.8 / 16067.8 | 4364.8 / 4370.9 / 4372.5 | 16045.9 / 16055.6 / 16059.7 | 4357.0 / 4362.8 / 4364.5 |
| task.verify | in-cell median | 30/30 | 30/30 | 274.4 | 146.6 | 774.4 | pass | 282.5 / 285.7 / 287.7 | 154.6 / 156.9 / 157.0 | 274.4 / 277.7 / 279.9 | 146.6 / 148.2 / 148.9 |
| task.clear | in-cell median | 30/30 | 30/30 | 990.4 | 258.3 | 1490.4 | pass | 998.5 / 1001.7 / 1003.1 | 266.2 / 268.6 / 268.7 | 990.4 / 993.1 / 995.3 | 258.3 / 260.6 / 260.7 |
| task.total | in-cell median | 30/30 | 30/30 | 17309.3 | 4762.0 | 19040.2 | pass | 17332.6 / 17344.6 / 17348.3 | 4786.0 / 4794.3 / 4794.7 | 17309.3 / 17320.0 / 17324.1 | 4762.0 / 4770.6 / 4770.7 |
| end_task | wall median | 3/3 | 3/3 | 2.00 | 2.10 | 502.0 | pass | 2.01 / 2.14 / 2.14 | 2.07 / 2.17 / 2.17 | – | – |
| setup.findTarget | – | 6/6 | 6/6 | 267.1 | 262.5 | – | not judged | 267.1 / 267.8 / 267.8 | 262.5 / 263.2 / 263.2 | 258.8 / 259.7 / 259.7 | 254.2 / 254.4 / 254.4 |

## Method cases

Outcomes are counted per sample (`n x` the outcome); wall and in-cell are median / p95 / max of the samples the harness ran, judged by the same rule on the basis shown.

| Method case | Baseline samples | Baseline outcomes | Candidate samples | Candidate outcomes | Baseline wall | Candidate wall | Baseline in-cell | Candidate in-cell | Basis | Limit | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|
| method.typeText | 3 | 1x {"outcome":"threw","error":"D-Bus org.freedesktop.DBus.Properties.Get failed: org.freedesktop.DBus.Error.ServiceUnknown: The name :1.195 was not provided by any .service files","target":"exited","inserted":null}<br>1x {"outcome":"threw","error":"D-Bus org.freedesktop.DBus.Properties.Get failed: org.freedesktop.DBus.Error.ServiceUnknown: The name :1.297 was not provided by any .service files","target":"exited","inserted":null}<br>1x {"outcome":"threw","error":"D-Bus org.freedesktop.DBus.Properties.Get failed: org.freedesktop.DBus.Error.ServiceUnknown: The name :1.93 was not provided by any .service files","target":"exited","inserted":null} | 3 | 3x {"outcome":"returned","error":null,"target":"survived","inserted":true} | – | 43.6 / 45.9 / 45.9 | – | 35.9 / 38.4 / 38.4 | in-cell median | – | pass |
| method.paste | 3 | 1x {"outcome":"threw","error":"D-Bus org.freedesktop.DBus.Properties.Get failed: org.freedesktop.DBus.Error.ServiceUnknown: The name :1.198 was not provided by any .service files","target":"exited","inserted":null}<br>1x {"outcome":"threw","error":"D-Bus org.freedesktop.DBus.Properties.Get failed: org.freedesktop.DBus.Error.ServiceUnknown: The name :1.300 was not provided by any .service files","target":"exited","inserted":null}<br>1x {"outcome":"threw","error":"D-Bus org.freedesktop.DBus.Properties.Get failed: org.freedesktop.DBus.Error.ServiceUnknown: The name :1.96 was not provided by any .service files","target":"exited","inserted":null} | 3 | 3x {"outcome":"returned","error":null,"target":"survived","inserted":true} | – | 42.7 / 42.8 / 42.8 | – | 35.3 / 35.3 / 35.3 | in-cell median | – | pass |
| method.paste.format | 3 | 3x {"outcome":"threw","error":"Linux paste supports only text format.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"Linux paste supports only text format.","target":"survived","inserted":null} | 8.05 / 9.95 / 9.95 | 8.31 / 8.34 / 8.34 | 0.05 / 0.05 / 0.05 | 0.06 / 0.07 / 0.07 | wall median | 508.0 | pass |
| method.setValue | 3 | 3x {"outcome":"threw","error":"setValue is unavailable on Linux; use click, pressKey, and typeText.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"setValue is unavailable on Linux; use click, pressKey, and typeText.","target":"survived","inserted":null} | 9.54 / 9.65 / 9.65 | 8.12 / 8.20 / 8.20 | 0.08 / 0.08 / 0.08 | 0.11 / 0.12 / 0.12 | wall median | 509.5 | pass |
| method.selectText | 3 | 3x {"outcome":"threw","error":"selectText is unavailable on Linux.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"selectText is unavailable on Linux.","target":"survived","inserted":null} | 9.82 / 9.83 / 9.83 | 7.96 / 7.98 / 7.98 | 0.07 / 0.07 / 0.07 | 0.07 / 0.10 / 0.10 | wall median | 509.8 | pass |
| method.scroll.pages | 3 | 3x {"outcome":"threw","error":"Linux scroll accepts { pixels }, not pages.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"Linux scroll accepts { pixels }, not pages.","target":"survived","inserted":null} | 9.54 / 11.8 / 11.8 | 9.58 / 9.70 / 9.70 | 0.08 / 0.08 / 0.08 | 0.08 / 0.12 / 0.12 | wall median | 509.5 | pass |

## Vendor samples that ended their target (never a speed bar)

A vendor engine sample whose target its method ended (`target: exited`) sets no timing: its outcome is counted as recorded, its times are left out (the pre-flight T4 row: a vendor lane's ended target is never scored against cua). A method none of whose vendor samples is left has its speed not judged; its outcomes and cua's text obligations still judge it.

| Method case | Vendor samples that ended their target | Speed |
|---|---|---|
| method.typeText | 3 | not judged: the vendor never completed it |
| method.paste | 3 | not judged: the vendor never completed it |

## Speed of the operations the engine answers (Acceptance 3's rule)

Judged by the in-cell time (#370). With at least 20 successful samples a side, the bootstrap 95% interval of cua's in-cell median minus the vendor engine's passes when its upper end is within the bound, max(5% of the vendor's median, 1 ms); with fewer, cua's in-cell median must be at most the vendor's (the median rule). The wall time is reported beside it by the same calls; its interval and label judge nothing, and only the wall backstop, cua's wall median at most the vendor's plus max(10%, 500 ms), can fail the operation on it (ruling 706).

| Operation | Samples (vendor / cua) | Vendor in-cell | cua in-cell | Interval of cua minus vendor, ms | Bound, ms | Label | Verdict | Vendor wall | cua wall | Wall interval, ms (unjudged) | Wall label (unjudged) | Wall backstop, ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| warm.getState | 90 / 90 | 1.74 | 1.67 | [-0.119, 0.001] | 1 | same (within noise) | pass | 8.56 | 9.65 | [0.182, 1.449] | loss | 508.6, pass |
| warm.listApps | 90 / 90 | 1.79 | 1.58 | [-0.27, -0.148] | 1 | faster | pass | 8.65 | 8.34 | [-0.588, -0.085] | faster | 508.6, pass |
| bind.getApp | 3 / 3 | 203.1 | 63.1 | – | – | median rule | pass | 213.2 | 73.2 | – | – | 713.2, pass |
| warm.getAXState | 90 / 90 | 179.1 | 52.6 | [-127.537, -125.842] | 8.96 | faster | pass | 187.5 | 60.4 | [-127.863, -126.148] | faster | 687.5, pass |
| warm.getScreenshot | 90 / 90 | 288.1 | 59.3 | [-229.286, -227.759] | 14.41 | faster | pass | 296.5 | 67.3 | [-229.941, -228.195] | faster | 796.5, pass |
| task.act | 30 / 30 | 16045.9 | 4357.0 | [-11691.855, -11684.823] | 802.3 | faster | pass | 16053.7 | 4364.8 | [-11692.309, -11684.796] | faster | 17659.1, pass |
| task.verify | 30 / 30 | 274.4 | 146.6 | [-128.807, -127.005] | 13.72 | faster | pass | 282.5 | 154.6 | [-128.717, -126.892] | faster | 782.5, pass |
| task.clear | 30 / 30 | 990.4 | 258.3 | [-732.894, -731.216] | 49.52 | faster | pass | 998.5 | 266.2 | [-733.054, -731.218] | faster | 1498.5, pass |
| task.total | 30 / 30 | 17309.3 | 4762.0 | [-12550.89, -12544.317] | 865.47 | faster | pass | 17332.6 | 4786.0 | [-12551.768, -12544.461] | faster | 19065.9, pass |

## Unproved: declared gaps, not passes

None: no series was left undetermined under a declared gap.

## Where cua's median is above the vendor engine's

The judged median: in-cell where the engine answers the operation (#370), else the wall time.

- cold.miss.initialize: cua 255.5 ms, vendor 254.9 ms (no engine answers it: judged by the tolerance alone)
- cold.hit.initialize: cua 179.8 ms, vendor 177.0 ms (no engine answers it: judged by the tolerance alone)
- warm.noop: cua 8.70 ms, vendor 8.40 ms (no engine answers it: judged by the tolerance alone)
- method.paste.format: cua 8.30 ms, vendor 8.00 ms (no engine answers it: judged by the tolerance alone)
- method.scroll.pages: cua 9.60 ms, vendor 9.50 ms (no engine answers it: judged by the tolerance alone)
- end_task: cua 2.10 ms, vendor 2.00 ms (no engine answers it: judged by the tolerance alone)

## What differs, by design

- engine: vendor (answered: sky_linux_arm64 of the run's runtime) -> cua (answered: cua-engine installed in the run's home)
- service: computer surface, answered by vendor -> computer surface, answered by cua

## Failures and notes

- method.typeText (pass): better: the method returned, its window survived and its text was read back
- method.paste (pass): better: the method returned, its window survived and its text was read back

## Problems

None: both sides are complete, attested and comparable.

Verdict: **PASS**
