# Native baseline comparison A: engine (Linux)

| | Baseline | Candidate |
|---|---|---|
| REPL host | cua | cua |
| Engine | vendor (answered: sky_linux_arm64 of the run's runtime) | cua (answered: cua-engine installed in the run's home) |
| Approved engine | – | – |
| initialize answered by | cua-repl-host 0.5.0 | cua-repl-host 0.5.0 |
| Commit | f6275fb600ae719f29cf32b206676e1a70a02e26 | f6275fb600ae719f29cf32b206676e1a70a02e26 |
| device | cua-171-arm64 | cua-171-arm64 |
| release | 26.928.40906-linux-arm64 | 26.928.40906-linux-arm64 |
| hardware | Google Compute Engine, arm64, 8 CPUs, 31 GiB | Google Compute Engine, arm64, 8 CPUs, 31 GiB |
| os | Ubuntu 24.04.5 LTS (7.0.0-1017-gcp) | Ubuntu 24.04.5 LTS (7.0.0-1017-gcp) |
| display | 1280 x 800 points at scale 1 (1280 x 800 pixels) | 1280 x 800 points at scale 1 (1280 x 800 pixels) |
| service | computer surface, answered by vendor | computer surface, answered by cua |
| sandbox | scoped (platform default) | scoped (platform default) |
| plan | 5 cold, 30 warm, 10 tasks | 5 cold, 30 warm, 10 tasks |
| Runs | run-1, run-2, run-3 | run-1, run-2, run-3 |
| ssh.roundtrip median | 186.4 | 185.9 |

Rule (#171 comparison A, engine (Linux)): the baseline runs `--host cua --engine vendor`, the candidate `--host cua --engine cua`; three complete, attested runs a side of one sitting covering the same plan, every attested field equal but engine, service (below). The engine and its service are the variable: the vendor engine behind the vendor service against cua's engine behind cua's service, both in cua's own host, the only one Linux serves. Per operation (method cases included), the candidate's judged median must be at most the baseline's plus max(10%, 500 ms), or faster, and it must succeed in no smaller share of its valid samples; the cold-connection phases that open the ssh pipe are judged net of each side's ssh.roundtrip median. On an operation the engine answers (warm.getState, warm.listApps, bind.getApp, warm.getAXState, warm.getScreenshot, task.act, task.verify, task.clear, task.total, method.typeText, method.paste) the candidate is judged by the in-cell time (#370), the cell's own call through the service to the engine, what the engines change; the wall time, which adds the MCP transport and the REPL host both lanes share, is reported beside it and judged only by a gross wall backstop: the candidate's wall median above the baseline's plus max(10%, 500 ms) fails the operation (ruling 706), and the backstop never passes anything. Its speed is also judged by Acceptance 3's rule (Acceptance 10): with at least 20 samples a side, the upper end of the bootstrap 95% interval of its in-cell median minus the baseline's must be within max(5% of the baseline's median, 1 ms); with fewer, its in-cell median must be at most the baseline's, and every cua typeText and paste sample must return without an error, survive and read back its text (Plan of Work M2); the ordinary better-outcome rule accepts this improvement over the vendor engine's text failures, with no failure waived on cua. ssh, approval, guard and setup operations are reported, not judged. Milliseconds; "OK" is successes over valid samples; wall and in-cell columns are median / p95 / max of successful samples.

| Operation | Basis | Baseline OK | Candidate OK | Baseline judged | Candidate judged | Limit | Verdict | Baseline wall | Candidate wall | Baseline in-cell | Candidate in-cell |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ssh.roundtrip | – | 15/15 | 15/15 | 186.4 | 185.9 | – | not judged | 186.4 / 374.9 / 374.9 | 185.9 / 190.8 / 190.8 | – | – |
| cold.miss.initialize | wall median net of ssh.roundtrip median | 6/6 | 6/6 | 244.3 | 247.1 | 744.3 | pass | 430.7 / 436.5 / 436.5 | 432.9 / 438.3 / 438.3 | – | – |
| cold.miss.tools_list | wall median | 6/6 | 6/6 | 1.60 | 1.60 | 501.6 | pass | 1.64 / 1.72 / 1.72 | 1.56 / 1.79 / 1.79 | – | – |
| cold.miss.first_js | wall median | 6/6 | 6/6 | 233.6 | 194.3 | 733.6 | pass | 233.6 / 237.2 / 237.2 | 194.3 / 201.6 / 201.6 | 0.01 / 0.01 / 0.01 | 0.01 / 0.01 / 0.01 |
| cold.miss.total | wall median net of ssh.roundtrip median | 6/6 | 6/6 | 480.1 | 445.1 | 980.1 | pass | 666.5 / 673.7 / 673.7 | 630.9 / 637.5 / 637.5 | – | – |
| cold.hit.initialize | wall median net of ssh.roundtrip median | 9/9 | 9/9 | 170.2 | 167.7 | 670.2 | pass | 356.6 / 366.0 / 366.0 | 353.6 / 359.2 / 359.2 | – | – |
| cold.hit.tools_list | wall median | 9/9 | 9/9 | 0.70 | 0.70 | 500.7 | pass | 0.71 / 0.84 / 0.84 | 0.73 / 0.81 / 0.81 | – | – |
| cold.hit.first_js | wall median | 9/9 | 9/9 | 305.0 | 268.0 | 805.0 | pass | 305.0 / 308.0 / 308.0 | 268.0 / 273.9 / 273.9 | 0.01 / 0.01 / 0.01 | 0.01 / 0.01 / 0.01 |
| cold.hit.total | wall median net of ssh.roundtrip median | 9/9 | 9/9 | 474.8 | 435.9 | 974.8 | pass | 661.2 / 666.1 / 666.1 | 621.7 / 633.8 / 633.8 | – | – |
| warm.noop | wall median | 90/90 | 90/90 | 8.70 | 8.70 | 508.7 | pass | 8.67 / 11.3 / 13.2 | 8.73 / 11.5 / 13.8 | 0.01 / 0.01 / 0.02 | 0.01 / 0.01 / 0.02 |
| warm.getState | in-cell median | 90/90 | 90/90 | 1.70 | 1.70 | 501.7 | pass | 8.48 / 11.0 / 13.8 | 8.59 / 10.8 / 12.1 | 1.74 / 2.02 / 6.34 | 1.69 / 2.14 / 3.25 |
| warm.listApps | in-cell median | 90/90 | 90/90 | 1.70 | 1.70 | 501.7 | pass | 8.57 / 9.24 / 10.3 | 8.61 / 10.8 / 13.7 | 1.70 / 2.08 / 3.90 | 1.67 / 1.89 / 6.60 |
| setup.findWindow | – | 3/3 | 3/3 | 263.8 | 264.5 | – | not judged | 263.8 / 264.4 / 264.4 | 264.5 / 264.5 / 264.5 | 255.2 / 255.7 / 255.7 | 253.3 / 254.3 / 254.3 |
| bind.getApp | in-cell median | 3/3 | 3/3 | 181.6 | 62.9 | 681.6 | pass | 189.8 / 190.4 / 190.4 | 72.5 / 72.9 / 72.9 | 181.6 / 182.1 / 182.1 | 62.9 / 63.2 / 63.2 |
| approval.elicitation | – | 3/3 | 3/3 | 13.8 | 12.7 | – | not judged | 13.8 / 14.9 / 14.9 | 12.7 / 12.9 / 12.9 | – | – |
| warm.getAXState | in-cell median | 90/90 | 90/90 | 161.7 | 51.1 | 661.7 | pass | 169.3 / 173.3 / 177.2 | 58.7 / 61.6 / 63.4 | 161.7 / 165.3 / 167.7 | 51.1 / 52.8 / 53.7 |
| warm.getScreenshot | in-cell median | 90/90 | 90/90 | 271.5 | 57.9 | 771.5 | pass | 279.3 / 285.3 / 298.8 | 65.5 / 67.4 / 81.4 | 271.5 / 277.4 / 290.9 | 57.9 / 59.6 / 71.3 |
| task.act | in-cell median | 30/30 | 30/30 | 16044.0 | 4376.6 | 17648.4 | pass | 16051.8 / 16064.8 / 16074.4 | 4384.1 / 4389.9 / 4390.2 | 16044.0 / 16056.8 / 16066.3 | 4376.6 / 4382.3 / 4382.3 |
| task.verify | in-cell median | 30/30 | 30/30 | 257.5 | 145.7 | 757.5 | pass | 265.7 / 269.4 / 271.8 | 153.6 / 155.1 / 155.2 | 257.5 / 260.7 / 264.0 | 145.7 / 146.4 / 147.2 |
| task.clear | in-cell median | 30/30 | 30/30 | 973.6 | 257.8 | 1473.6 | pass | 981.5 / 985.5 / 988.0 | 265.4 / 267.3 / 267.6 | 973.6 / 977.9 / 979.9 | 257.8 / 259.5 / 259.5 |
| task.total | in-cell median | 30/30 | 30/30 | 17277.1 | 4779.0 | 19004.8 | pass | 17300.0 / 17322.3 / 17324.9 | 4802.1 / 4809.8 / 4812.2 | 17277.1 / 17297.4 / 17301.0 | 4779.0 / 4786.3 / 4787.8 |
| end_task | wall median | 3/3 | 3/3 | 1.90 | 2.10 | 501.9 | pass | 1.92 / 1.97 / 1.97 | 2.09 / 2.10 / 2.10 | – | – |
| setup.findTarget | – | 6/6 | 6/6 | 266.8 | 262.4 | – | not judged | 266.8 / 267.5 / 267.5 | 262.4 / 262.6 / 262.6 | 258.4 / 258.9 / 258.9 | 254.2 / 254.4 / 254.4 |

## Method cases

Outcomes are counted per sample (`n x` the outcome); wall and in-cell are median / p95 / max of the samples the harness ran, judged by the same rule on the basis shown.

| Method case | Baseline samples | Baseline outcomes | Candidate samples | Candidate outcomes | Baseline wall | Candidate wall | Baseline in-cell | Candidate in-cell | Basis | Limit | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|
| method.typeText | 3 | 1x {"outcome":"threw","error":"D-Bus org.freedesktop.DBus.Properties.Get failed: org.freedesktop.DBus.Error.ServiceUnknown: The name :1.195 was not provided by any .service files","target":"exited","inserted":null}<br>1x {"outcome":"threw","error":"D-Bus org.freedesktop.DBus.Properties.Get failed: org.freedesktop.DBus.Error.ServiceUnknown: The name :1.297 was not provided by any .service files","target":"exited","inserted":null}<br>1x {"outcome":"threw","error":"D-Bus org.freedesktop.DBus.Properties.Get failed: org.freedesktop.DBus.Error.ServiceUnknown: The name :1.93 was not provided by any .service files","target":"exited","inserted":null} | 3 | 3x {"outcome":"returned","error":null,"target":"survived","inserted":true} | – | 44.9 / 45.5 / 45.5 | – | 37.2 / 38.2 / 38.2 | in-cell median | – | pass |
| method.paste | 3 | 1x {"outcome":"threw","error":"D-Bus org.freedesktop.DBus.Properties.Get failed: org.freedesktop.DBus.Error.ServiceUnknown: The name :1.198 was not provided by any .service files","target":"exited","inserted":null}<br>1x {"outcome":"threw","error":"D-Bus org.freedesktop.DBus.Properties.Get failed: org.freedesktop.DBus.Error.ServiceUnknown: The name :1.300 was not provided by any .service files","target":"exited","inserted":null}<br>1x {"outcome":"threw","error":"D-Bus org.freedesktop.DBus.Properties.Get failed: org.freedesktop.DBus.Error.ServiceUnknown: The name :1.96 was not provided by any .service files","target":"exited","inserted":null} | 3 | 3x {"outcome":"returned","error":null,"target":"survived","inserted":true} | – | 42.1 / 42.3 / 42.3 | – | 34.8 / 34.8 / 34.8 | in-cell median | – | pass |
| method.paste.format | 3 | 3x {"outcome":"threw","error":"Linux paste supports only text format.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"Linux paste supports only text format.","target":"survived","inserted":null} | 7.95 / 8.05 / 8.05 | 7.94 / 8.03 / 8.03 | 0.05 / 0.06 / 0.06 | 0.05 / 0.05 / 0.05 | wall median | 507.9 | pass |
| method.setValue | 3 | 3x {"outcome":"threw","error":"setValue is unavailable on Linux; use click, pressKey, and typeText.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"setValue is unavailable on Linux; use click, pressKey, and typeText.","target":"survived","inserted":null} | 8.00 / 8.04 / 8.04 | 7.93 / 8.16 / 8.16 | 0.10 / 0.10 / 0.10 | 0.09 / 0.11 / 0.11 | wall median | 508.0 | pass |
| method.selectText | 3 | 3x {"outcome":"threw","error":"selectText is unavailable on Linux.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"selectText is unavailable on Linux.","target":"survived","inserted":null} | 8.10 / 8.11 / 8.11 | 9.61 / 9.71 / 9.71 | 0.07 / 0.14 / 0.14 | 0.07 / 0.08 / 0.08 | wall median | 508.1 | pass |
| method.scroll.pages | 3 | 3x {"outcome":"threw","error":"Linux scroll accepts { pixels }, not pages.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"Linux scroll accepts { pixels }, not pages.","target":"survived","inserted":null} | 8.23 / 9.02 / 9.02 | 9.86 / 10.6 / 10.6 | 0.08 / 0.14 / 0.14 | 0.08 / 0.10 / 0.10 | wall median | 508.2 | pass |

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
| warm.getState | 90 / 90 | 1.74 | 1.69 | [-0.101, 0.027] | 1 | same (within noise) | pass | 8.48 | 8.59 | [-0.159, 0.398] | same (within noise) | 508.5, pass |
| warm.listApps | 90 / 90 | 1.70 | 1.67 | [-0.085, 0.024] | 1 | same (within noise) | pass | 8.57 | 8.61 | [-0.114, 0.251] | same (within noise) | 508.6, pass |
| bind.getApp | 3 / 3 | 181.6 | 62.9 | – | – | median rule | pass | 189.8 | 72.5 | – | – | 689.8, pass |
| warm.getAXState | 90 / 90 | 161.7 | 51.1 | [-111.167, -109.946] | 8.08 | faster | pass | 169.3 | 58.8 | [-111.083, -109.958] | faster | 669.3, pass |
| warm.getScreenshot | 90 / 90 | 271.5 | 57.9 | [-214.146, -212.751] | 13.58 | faster | pass | 279.3 | 65.5 | [-214.425, -212.836] | faster | 779.3, pass |
| task.act | 30 / 30 | 16044.0 | 4376.6 | [-11670.635, -11664.617] | 802.2 | faster | pass | 16051.8 | 4384.1 | [-11670.662, -11664.53] | faster | 17656.9, pass |
| task.verify | 30 / 30 | 257.5 | 145.7 | [-113.485, -110.912] | 12.87 | faster | pass | 265.7 | 153.6 | [-113.347, -111.009] | faster | 765.7, pass |
| task.clear | 30 / 30 | 973.6 | 257.8 | [-718.403, -714.878] | 48.68 | faster | pass | 981.5 | 265.4 | [-718.357, -715.073] | faster | 1481.5, pass |
| task.total | 30 / 30 | 17277.1 | 4779.0 | [-12502.944, -12492.564] | 863.86 | faster | pass | 17300.0 | 4802.1 | [-12502.616, -12492.819] | faster | 19030.0, pass |

## Unproved: declared gaps, not passes

None: no series was left undetermined under a declared gap.

## Where cua's median is above the vendor engine's

The judged median: in-cell where the engine answers the operation (#370), else the wall time.

- cold.miss.initialize: cua 247.1 ms, vendor 244.3 ms (no engine answers it: judged by the tolerance alone)
- method.selectText: cua 9.60 ms, vendor 8.10 ms (no engine answers it: judged by the tolerance alone)
- method.scroll.pages: cua 9.90 ms, vendor 8.20 ms (no engine answers it: judged by the tolerance alone)
- end_task: cua 2.10 ms, vendor 1.90 ms (no engine answers it: judged by the tolerance alone)

## What differs, by design

- engine: vendor (answered: sky_linux_arm64 of the run's runtime) -> cua (answered: cua-engine installed in the run's home)
- service: computer surface, answered by vendor -> computer surface, answered by cua

## Failures and notes

- method.typeText (pass): better: the method returned, its window survived and its text was read back
- method.paste (pass): better: the method returned, its window survived and its text was read back

## Problems

None: both sides are complete, attested and comparable.

Verdict: **PASS**
