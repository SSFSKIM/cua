# Native baseline comparison A: engine (Linux)

| | Baseline | Candidate |
|---|---|---|
| REPL host | cua | cua |
| Engine | vendor (answered: sky_linux_x64 of the run's runtime) | cua (answered: cua-engine installed in the run's home) |
| Approved engine | – | – |
| initialize answered by | cua-repl-host 0.5.0 | cua-repl-host 0.5.0 |
| Commit | fefe306c288956a48b6c086017f3cd1a58462a07 | fefe306c288956a48b6c086017f3cd1a58462a07 |
| device | cua-171 | cua-171 |
| release | 26.928.40906-linux-x64 | 26.928.40906-linux-x64 |
| hardware | vServer, x64, 8 CPUs, 15 GiB | vServer, x64, 8 CPUs, 15 GiB |
| os | Ubuntu 24.04.4 LTS (6.8.0-138-generic) | Ubuntu 24.04.4 LTS (6.8.0-138-generic) |
| display | 1280 x 800 points at scale 1 (1280 x 800 pixels) | 1280 x 800 points at scale 1 (1280 x 800 pixels) |
| service | computer surface, answered by vendor | computer surface, answered by cua |
| sandbox | scoped (platform default) | scoped (platform default) |
| plan | 5 cold, 30 warm, 10 tasks | 5 cold, 30 warm, 10 tasks |
| Runs | run-1, run-2, run-3 | run-1, run-2, run-3 |
| ssh.roundtrip median | 303.6 | 292.8 |

Rule (#171 comparison A, engine (Linux)): the baseline runs `--host cua --engine vendor`, the candidate `--host cua --engine cua`; three complete, attested runs a side of one sitting covering the same plan, every attested field equal but engine, service (below). The engine and its service are the variable: the vendor engine behind the vendor service against cua's engine behind cua's service, both in cua's own host, the only one Linux serves. Per operation (method cases included), the candidate's judged median must be at most the baseline's plus max(10%, 500 ms), or faster, and it must succeed in no smaller share of its valid samples; the cold-connection phases that open the ssh pipe are judged net of each side's ssh.roundtrip median. On an operation the engine answers (warm.getState, warm.listApps, bind.getApp, warm.getAXState, warm.getScreenshot, task.act, task.verify, task.clear, task.total, method.typeText, method.paste) the candidate is judged by the in-cell time (#370), the cell's own call through the service to the engine, what the engines change; the wall time, which adds the MCP transport and the REPL host both lanes share, is reported beside it and judged only by a gross wall backstop: the candidate's wall median above the baseline's plus max(10%, 500 ms) fails the operation (ruling 706), and the backstop never passes anything. Its speed is also judged by Acceptance 3's rule (Acceptance 10): with at least 20 samples a side, the upper end of the bootstrap 95% interval of its in-cell median minus the baseline's must be within max(5% of the baseline's median, 1 ms); with fewer, its in-cell median must be at most the baseline's, and every cua typeText and paste sample must return without an error, survive and read back its text (Plan of Work M2); the ordinary better-outcome rule accepts this improvement over the vendor engine's text failures, with no failure waived on cua. ssh, approval, guard and setup operations are reported, not judged. Milliseconds; "OK" is successes over valid samples; wall and in-cell columns are median / p95 / max of successful samples.

| Operation | Basis | Baseline OK | Candidate OK | Baseline judged | Candidate judged | Limit | Verdict | Baseline wall | Candidate wall | Baseline in-cell | Candidate in-cell |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ssh.roundtrip | – | 15/15 | 15/15 | 303.6 | 292.8 | – | not judged | 303.6 / 320.7 / 320.7 | 292.8 / 337.9 / 337.9 | – | – |
| cold.miss.initialize | wall median net of ssh.roundtrip median | 6/6 | 6/6 | 327.2 | 373.5 | 827.2 | pass | 630.8 / 668.6 / 668.6 | 666.3 / 720.7 / 720.7 | – | – |
| cold.miss.tools_list | wall median | 6/6 | 6/6 | 2.80 | 2.40 | 502.8 | pass | 2.75 / 3.00 / 3.00 | 2.41 / 2.90 / 2.90 | – | – |
| cold.miss.first_js | wall median | 6/6 | 6/6 | 365.2 | 326.9 | 865.2 | pass | 365.2 / 408.4 / 408.4 | 326.9 / 344.6 / 344.6 | 0.01 / 0.03 / 0.03 | 0.01 / 0.05 / 0.05 |
| cold.miss.total | wall median net of ssh.roundtrip median | 6/6 | 6/6 | 714.7 | 711.0 | 1214.7 | pass | 1018.3 / 1039.7 / 1039.7 | 1003.7 / 1048.0 / 1048.0 | – | – |
| cold.hit.initialize | wall median net of ssh.roundtrip median | 9/9 | 9/9 | 210.9 | 230.4 | 710.9 | pass | 514.5 / 588.0 / 588.0 | 523.1 / 599.0 / 599.0 | – | – |
| cold.hit.tools_list | wall median | 9/9 | 9/9 | 1.20 | 1.20 | 501.2 | pass | 1.23 / 2.43 / 2.43 | 1.23 / 1.72 / 1.72 | – | – |
| cold.hit.first_js | wall median | 9/9 | 9/9 | 495.1 | 437.1 | 995.1 | pass | 495.1 / 557.2 / 557.2 | 437.1 / 492.1 / 492.1 | 0.01 / 0.03 / 0.03 | 0.01 / 0.02 / 0.02 |
| cold.hit.total | wall median net of ssh.roundtrip median | 9/9 | 9/9 | 719.6 | 714.4 | 1219.6 | pass | 1023.2 / 1120.5 / 1120.5 | 1007.1 / 1042.7 / 1042.7 | – | – |
| warm.noop | wall median | 90/90 | 90/90 | 14.2 | 14.3 | 514.2 | pass | 14.2 / 18.4 / 27.6 | 14.3 / 22.3 / 29.9 | 0.01 / 0.03 / 0.05 | 0.01 / 0.03 / 0.08 |
| warm.getState | in-cell median | 90/90 | 90/90 | 4.00 | 3.30 | 504.0 | pass | 17.2 / 21.8 / 27.0 | 16.3 / 19.7 / 24.1 | 3.99 / 5.70 / 12.0 | 3.28 / 4.35 / 6.97 |
| warm.listApps | in-cell median | 90/90 | 90/90 | 4.20 | 3.30 | 504.2 | pass | 16.7 / 22.2 / 28.6 | 16.7 / 20.5 / 23.3 | 4.15 / 5.61 / 6.53 | 3.26 / 4.15 / 5.87 |
| setup.findWindow | – | 3/3 | 3/3 | 276.3 | 270.8 | – | not judged | 276.3 / 285.1 / 285.1 | 270.8 / 276.0 / 276.0 | 263.0 / 269.7 / 269.7 | 255.9 / 256.3 / 256.3 |
| bind.getApp | in-cell median | 3/3 | 3/3 | 533.0 | 98.8 | 1033.0 | pass | 547.5 / 630.8 / 630.8 | 116.8 / 147.8 / 147.8 | 533.0 / 605.8 / 605.8 | 98.8 / 121.2 / 121.2 |
| approval.elicitation | – | 3/3 | 3/3 | 32.1 | 23.3 | – | not judged | 32.1 / 57.1 / 57.1 | 23.3 / 31.9 / 31.9 | – | – |
| warm.getAXState | in-cell median | 90/90 | 90/90 | 484.6 | 76.6 | 984.6 | pass | 496.9 / 654.3 / 804.2 | 89.9 / 112.6 / 156.6 | 484.6 / 642.6 / 785.8 | 76.6 / 99.6 / 134.9 |
| warm.getScreenshot | in-cell median | 90/90 | 90/90 | 637.0 | 96.7 | 1137.0 | pass | 653.1 / 779.0 / 920.6 | 109.5 / 137.5 / 163.3 | 637.0 / 757.6 / 898.8 | 96.7 / 120.0 / 149.6 |
| task.act | in-cell median | 30/30 | 30/30 | 16743.7 | 4487.1 | 18418.1 | pass | 16757.2 / 16924.7 / 17056.6 | 4499.7 / 4524.2 / 4530.3 | 16743.7 / 16912.3 / 17036.5 | 4487.1 / 4511.1 / 4518.9 |
| task.verify | in-cell median | 30/30 | 30/30 | 604.6 | 178.2 | 1104.6 | pass | 618.8 / 823.3 / 841.6 | 192.1 / 226.4 / 230.7 | 604.6 / 802.7 / 821.2 | 178.2 / 208.2 / 217.0 |
| task.clear | in-cell median | 30/30 | 30/30 | 1321.1 | 302.0 | 1821.1 | pass | 1336.9 / 1572.2 / 1586.3 | 314.5 / 343.7 / 353.5 | 1321.1 / 1559.8 / 1566.1 | 302.0 / 330.4 / 340.2 |
| task.total | in-cell median | 30/30 | 30/30 | 18661.5 | 4974.6 | 20527.7 | pass | 18699.5 / 19186.7 / 19231.4 | 5015.0 / 5059.7 / 5067.3 | 18661.5 / 19141.1 / 19186.2 | 4974.6 / 5020.7 / 5028.7 |
| end_task | wall median | 3/3 | 3/3 | 3.50 | 2.90 | 503.5 | pass | 3.46 / 3.82 / 3.82 | 2.86 / 3.99 / 3.99 | – | – |
| setup.findTarget | – | 6/6 | 6/6 | 291.2 | 270.2 | – | not judged | 291.2 / 298.3 / 298.3 | 270.2 / 272.5 / 272.5 | 276.1 / 279.6 / 279.6 | 256.7 / 258.8 / 258.8 |

## Method cases

Outcomes are counted per sample (`n x` the outcome); wall and in-cell are median / p95 / max of the samples the harness ran, judged by the same rule on the basis shown.

| Method case | Baseline samples | Baseline outcomes | Candidate samples | Candidate outcomes | Baseline wall | Candidate wall | Baseline in-cell | Candidate in-cell | Basis | Limit | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|
| method.typeText | 3 | 3x {"outcome":"threw","error":"editable Paste did not insert text","target":"survived","inserted":null} | 3 | 3x {"outcome":"returned","error":null,"target":"survived","inserted":true} | 10234.0 / 10234.8 / 10234.8 | 65.9 / 66.6 / 66.6 | 10220.7 / 10220.9 / 10220.9 | 53.4 / 54.8 / 54.8 | in-cell median | 11242.8 | pass |
| method.paste | 3 | 3x {"outcome":"threw","error":"editable Paste did not insert text","target":"survived","inserted":null} | 3 | 3x {"outcome":"returned","error":null,"target":"survived","inserted":true} | 10241.6 / 10247.2 / 10247.2 | 56.0 / 61.0 / 61.0 | 10227.1 / 10227.4 / 10227.4 | 44.7 / 49.9 / 49.9 | in-cell median | 11249.8 | pass |
| method.paste.format | 3 | 3x {"outcome":"threw","error":"Linux paste supports only text format.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"Linux paste supports only text format.","target":"survived","inserted":null} | 13.0 / 22.8 / 22.8 | 11.7 / 13.8 / 13.8 | 0.07 / 0.13 / 0.13 | 0.07 / 0.14 / 0.14 | wall median | 513.0 | pass |
| method.setValue | 3 | 3x {"outcome":"threw","error":"setValue is unavailable on Linux; use click, pressKey, and typeText.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"setValue is unavailable on Linux; use click, pressKey, and typeText.","target":"survived","inserted":null} | 17.0 / 20.7 / 20.7 | 13.4 / 14.0 / 14.0 | 0.15 / 0.18 / 0.18 | 0.18 / 0.21 / 0.21 | wall median | 517.0 | pass |
| method.selectText | 3 | 3x {"outcome":"threw","error":"selectText is unavailable on Linux.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"selectText is unavailable on Linux.","target":"survived","inserted":null} | 20.8 / 29.6 / 29.6 | 18.7 / 20.5 / 20.5 | 0.15 / 0.24 / 0.24 | 0.10 / 0.22 / 0.22 | wall median | 520.8 | pass |
| method.scroll.pages | 3 | 3x {"outcome":"threw","error":"Linux scroll accepts { pixels }, not pages.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"Linux scroll accepts { pixels }, not pages.","target":"survived","inserted":null} | 12.3 / 21.1 / 21.1 | 16.8 / 21.3 / 21.3 | 0.16 / 0.23 / 0.23 | 0.13 / 0.14 / 0.14 | wall median | 512.3 | pass |

## Speed of the operations the engine answers (Acceptance 3's rule)

Judged by the in-cell time (#370). With at least 20 successful samples a side, the bootstrap 95% interval of cua's in-cell median minus the vendor engine's passes when its upper end is within the bound, max(5% of the vendor's median, 1 ms); with fewer, cua's in-cell median must be at most the vendor's (the median rule). The wall time is reported beside it by the same calls; its interval and label judge nothing, and only the wall backstop, cua's wall median at most the vendor's plus max(10%, 500 ms), can fail the operation on it (ruling 706).

| Operation | Samples (vendor / cua) | Vendor in-cell | cua in-cell | Interval of cua minus vendor, ms | Bound, ms | Label | Verdict | Vendor wall | cua wall | Wall interval, ms (unjudged) | Wall label (unjudged) | Wall backstop, ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| warm.getState | 90 / 90 | 3.99 | 3.28 | [-0.87, -0.589] | 1 | faster | pass | 17.2 | 16.3 | [-1.232, -0.445] | faster | 517.2, pass |
| warm.listApps | 90 / 90 | 4.15 | 3.26 | [-1.122, -0.725] | 1 | faster | pass | 16.7 | 16.7 | [-1.126, 1.015] | undetermined | 516.7, pass |
| bind.getApp | 3 / 3 | 533.0 | 98.8 | – | – | median rule | pass | 547.5 | 116.8 | – | – | 1047.5, pass |
| warm.getAXState | 90 / 90 | 484.6 | 76.6 | [-423.848, -387.025] | 24.23 | faster | pass | 496.9 | 89.9 | [-423.821, -388.363] | faster | 996.9, pass |
| warm.getScreenshot | 90 / 90 | 637.0 | 96.7 | [-552.236, -522.519] | 31.85 | faster | pass | 653.1 | 109.5 | [-556.05, -525.843] | faster | 1153.1, pass |
| task.act | 30 / 30 | 16743.7 | 4487.1 | [-12278.31, -12213.146] | 837.19 | faster | pass | 16757.2 | 4499.7 | [-12278.302, -12212.85] | faster | 18432.9, pass |
| task.verify | 30 / 30 | 604.6 | 178.2 | [-445.993, -393.027] | 30.23 | faster | pass | 618.8 | 192.1 | [-451.376, -392.23] | faster | 1118.8, pass |
| task.clear | 30 / 30 | 1321.1 | 302.0 | [-1050.751, -1000.954] | 66.06 | faster | pass | 1336.8 | 314.5 | [-1051.948, -1002.415] | faster | 1836.9, pass |
| task.total | 30 / 30 | 18661.5 | 4974.6 | [-13763.708, -13640.887] | 933.08 | faster | pass | 18699.5 | 5015.0 | [-13767.11, -13641.643] | faster | 20569.5, pass |
| method.typeText | 3 / 3 | 10220.7 | 53.4 | – | – | median rule | pass | 10234.0 | 65.9 | – | – | 11257.4, pass |
| method.paste | 3 / 3 | 10227.1 | 44.7 | – | – | median rule | pass | 10241.6 | 56.0 | – | – | 11265.8, pass |

## Unproved: declared gaps, not passes

None: no series was left undetermined under a declared gap.

## Where cua's median is above the vendor engine's

The judged median: in-cell where the engine answers the operation (#370), else the wall time.

- cold.miss.initialize: cua 373.5 ms, vendor 327.2 ms (no engine answers it: judged by the tolerance alone)
- cold.hit.initialize: cua 230.4 ms, vendor 210.9 ms (no engine answers it: judged by the tolerance alone)
- warm.noop: cua 14.3 ms, vendor 14.2 ms (no engine answers it: judged by the tolerance alone)
- method.scroll.pages: cua 16.8 ms, vendor 12.3 ms (no engine answers it: judged by the tolerance alone)

## What differs, by design

- engine: vendor (answered: sky_linux_x64 of the run's runtime) -> cua (answered: cua-engine installed in the run's home)
- service: computer surface, answered by vendor -> computer surface, answered by cua

## Failures and notes

- method.typeText (pass): better: the method returned, its window survived and its text was read back
- method.paste (pass): better: the method returned, its window survived and its text was read back

## Problems

None: both sides are complete, attested and comparable.

Verdict: **PASS**
