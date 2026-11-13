# Native baseline comparison A: engine (Linux)

| | Baseline | Candidate |
|---|---|---|
| REPL host | cua | cua |
| Engine | vendor (answered: sky_linux_x64 of the run's runtime) | cua (answered: cua-engine named by --engine-bin /Users/new/.local/share/cua-171/task74/w5/engine/8ab1cc758983/cua-engine) |
| Approved engine | – | – |
| initialize answered by | cua-repl-host 0.5.0 | cua-repl-host 0.5.0 |
| Commit | 8ab1cc758983e7774cbff74a1cc2fd2d745120bb | 8ab1cc758983e7774cbff74a1cc2fd2d745120bb |
| device | cua-171 | cua-171 |
| release | 26.928.40906-linux-x64 | 26.928.40906-linux-x64 |
| hardware | vServer, x64, 8 CPUs, 15 GiB | vServer, x64, 8 CPUs, 15 GiB |
| os | Ubuntu 24.04.4 LTS (6.8.0-138-generic) | Ubuntu 24.04.4 LTS (6.8.0-138-generic) |
| display | 1280 x 800 points at scale 1 (1280 x 800 pixels) | 1280 x 800 points at scale 1 (1280 x 800 pixels) |
| service | computer surface, answered by vendor | computer surface, answered by cua |
| sandbox | scoped (platform default) | scoped (platform default) |
| plan | 5 cold, 30 warm, 10 tasks | 5 cold, 30 warm, 10 tasks |
| Runs | run-1, run-2, run-3 | run-1, run-2, run-3 |
| ssh.roundtrip median | 287.5 | 284.9 |

Rule (#171 comparison A, engine (Linux)): the baseline runs `--host cua --engine vendor`, the candidate `--host cua --engine cua`; three complete, attested runs a side of one sitting covering the same plan, every attested field equal but engine, service (below). The engine and its service are the variable: the vendor engine behind the vendor service against cua's engine behind cua's service, both in cua's own host, the only one Linux serves. Per operation (method cases included), the candidate's judged median must be at most the baseline's plus max(10%, 500 ms), or faster, and it must succeed in no smaller share of its valid samples; the cold-connection phases that open the ssh pipe are judged net of each side's ssh.roundtrip median. On an operation the engine answers (warm.getState, warm.listApps, bind.getApp, warm.getAXState, warm.getScreenshot, task.act, task.verify, task.clear, task.total, method.typeText, method.paste) the candidate's speed is also judged by Acceptance 3's rule (Acceptance 10): with at least 20 samples a side, the upper end of the bootstrap 95% interval of its median minus the baseline's must be within max(5% of the baseline's median, 1 ms); with fewer, its judged median must be at most the baseline's, and every cua typeText and paste sample must return without an error, survive and read back its text (Plan of Work M2); the ordinary better-outcome rule accepts this improvement over the vendor engine's text failures, with no failure waived on cua. ssh, approval, guard and setup operations are reported, not judged. Milliseconds; "OK" is successes over valid samples; wall and in-cell columns are median / p95 / max of successful samples.

| Operation | Basis | Baseline OK | Candidate OK | Baseline judged | Candidate judged | Limit | Verdict | Baseline wall | Candidate wall | Baseline in-cell | Candidate in-cell |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ssh.roundtrip | – | 15/15 | 15/15 | 287.5 | 284.9 | – | not judged | 287.5 / 312.2 / 312.2 | 284.9 / 337.4 / 337.4 | – | – |
| cold.miss.initialize | wall median net of ssh.roundtrip median | 6/6 | 6/6 | 364.0 | 387.7 | 864.0 | pass | 651.5 / 685.2 / 685.2 | 672.6 / 703.3 / 703.3 | – | – |
| cold.miss.tools_list | wall median | 6/6 | 6/6 | 2.50 | 2.60 | 502.5 | pass | 2.54 / 3.19 / 3.19 | 2.63 / 2.78 / 2.78 | – | – |
| cold.miss.first_js | wall median | 6/6 | 6/6 | 390.8 | 319.5 | 890.8 | pass | 390.8 / 438.7 / 438.7 | 319.5 / 360.0 / 360.0 | 0.02 / 0.05 / 0.05 | 0.01 / 0.02 / 0.02 |
| cold.miss.total | wall median net of ssh.roundtrip median | 6/6 | 6/6 | 749.7 | 720.3 | 1249.7 | pass | 1037.2 / 1127.0 / 1127.0 | 1005.2 / 1064.7 / 1064.7 | – | – |
| cold.hit.initialize | wall median net of ssh.roundtrip median | 9/9 | 9/9 | 242.6 | 248.0 | 742.6 | pass | 530.1 / 580.8 / 580.8 | 532.9 / 574.2 / 574.2 | – | – |
| cold.hit.tools_list | wall median | 9/9 | 9/9 | 1.20 | 1.30 | 501.2 | pass | 1.16 / 1.56 / 1.56 | 1.30 / 1.64 / 1.64 | – | – |
| cold.hit.first_js | wall median | 9/9 | 9/9 | 482.1 | 449.3 | 982.1 | pass | 482.1 / 534.9 / 534.9 | 449.3 / 510.7 / 510.7 | 0.02 / 0.03 / 0.03 | 0.01 / 0.06 / 0.06 |
| cold.hit.total | wall median net of ssh.roundtrip median | 9/9 | 9/9 | 726.0 | 699.0 | 1226.0 | pass | 1013.4 / 1115.3 / 1115.3 | 983.9 / 1081.0 / 1081.0 | – | – |
| warm.noop | wall median | 90/90 | 90/90 | 14.5 | 14.2 | 514.5 | pass | 14.5 / 20.2 / 27.5 | 14.2 / 19.7 / 23.9 | 0.01 / 0.02 / 0.04 | 0.01 / 0.02 / 0.08 |
| warm.getState | wall median | 90/90 | 90/90 | 17.6 | 17.9 | 517.6 | pass | 17.6 / 21.7 / 26.3 | 17.9 / 20.5 / 21.4 | 3.94 / 5.88 / 11.2 | 3.60 / 5.21 / 6.47 |
| warm.listApps | wall median | 90/90 | 90/90 | 16.8 | 17.2 | 516.8 | fail | 16.8 / 20.4 / 22.1 | 17.2 / 22.2 / 25.3 | 3.88 / 4.71 / 5.71 | 3.43 / 4.09 / 10.0 |
| setup.findWindow | – | 3/3 | 3/3 | 278.2 | 271.2 | – | not judged | 278.2 / 285.7 / 285.7 | 271.2 / 274.3 / 274.3 | 263.7 / 270.4 / 270.4 | 255.8 / 256.1 / 256.1 |
| bind.getApp | wall median | 3/3 | 3/3 | 580.6 | 123.3 | 1080.6 | pass | 580.6 / 584.2 / 584.2 | 123.3 / 126.8 / 126.8 | 560.6 / 562.0 / 562.0 | 105.7 / 109.5 / 109.5 |
| approval.elicitation | – | 3/3 | 3/3 | 35.0 | 24.4 | – | not judged | 35.0 / 51.8 / 51.8 | 24.4 / 28.8 / 28.8 | – | – |
| warm.getAXState | wall median | 90/90 | 90/90 | 490.6 | 94.8 | 990.6 | pass | 490.6 / 671.0 / 907.6 | 94.8 / 121.7 / 151.9 | 477.3 / 657.2 / 884.8 | 80.4 / 103.5 / 125.8 |
| warm.getScreenshot | wall median | 90/90 | 90/90 | 632.6 | 117.7 | 1132.6 | pass | 632.6 / 833.7 / 938.4 | 117.7 / 140.9 / 153.9 | 619.3 / 811.7 / 923.9 | 104.5 / 124.7 / 137.3 |
| task.act | wall median | 30/30 | 30/30 | 16743.6 | 4501.6 | 18418.0 | pass | 16743.6 / 16883.2 / 17012.1 | 4501.6 / 4538.2 / 4552.2 | 16730.5 / 16869.9 / 16998.1 | 4488.1 / 4521.4 / 4530.3 |
| task.verify | wall median | 30/30 | 30/30 | 585.6 | 192.3 | 1085.6 | pass | 585.6 / 877.0 / 913.0 | 192.3 / 222.3 / 237.4 | 571.0 / 853.3 / 899.7 | 175.3 / 203.0 / 214.2 |
| task.clear | wall median | 30/30 | 30/30 | 1320.1 | 308.1 | 1820.1 | pass | 1320.1 / 1475.3 / 1575.2 | 308.1 / 343.5 / 351.7 | 1306.4 / 1461.4 / 1563.9 | 295.6 / 328.5 / 339.1 |
| task.total | wall median | 30/30 | 30/30 | 18700.0 | 5003.1 | 20570.0 | pass | 18700.0 / 19027.0 / 19172.4 | 5003.1 / 5063.9 / 5101.3 | 18652.1 / 18973.3 / 19131.9 | 4959.7 / 5014.7 / 5044.6 |
| end_task | wall median | 3/3 | 3/3 | 3.10 | 3.40 | 503.1 | pass | 3.12 / 3.52 / 3.52 | 3.39 / 3.45 / 3.45 | – | – |
| setup.findTarget | – | 6/6 | 6/6 | 290.1 | 270.7 | – | not judged | 290.1 / 299.5 / 299.5 | 270.7 / 285.2 / 285.2 | 275.0 / 287.1 / 287.1 | 257.9 / 259.0 / 259.0 |

## Method cases

Outcomes are counted per sample (`n x` the outcome); wall is median / p95 / max of the samples the harness ran, judged by the same rule.

| Method case | Baseline samples | Baseline outcomes | Candidate samples | Candidate outcomes | Baseline wall | Candidate wall | Limit | Verdict |
|---|---|---|---|---|---|---|---|---|
| method.typeText | 3 | 3x {"outcome":"threw","error":"editable Paste did not insert text","target":"survived","inserted":null} | 3 | 3x {"outcome":"returned","error":null,"target":"survived","inserted":true} | 10247.9 / 10248.4 / 10248.4 | 60.7 / 71.0 / 71.0 | 11272.7 | pass |
| method.paste | 3 | 3x {"outcome":"threw","error":"editable Paste did not insert text","target":"survived","inserted":null} | 3 | 3x {"outcome":"returned","error":null,"target":"survived","inserted":true} | 10231.4 / 10237.3 / 10237.3 | 59.9 / 68.7 / 68.7 | 11254.5 | pass |
| method.paste.format | 3 | 3x {"outcome":"threw","error":"Linux paste supports only text format.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"Linux paste supports only text format.","target":"survived","inserted":null} | 17.5 / 17.6 / 17.6 | 14.6 / 16.3 / 16.3 | 517.5 | pass |
| method.setValue | 3 | 3x {"outcome":"threw","error":"setValue is unavailable on Linux; use click, pressKey, and typeText.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"setValue is unavailable on Linux; use click, pressKey, and typeText.","target":"survived","inserted":null} | 16.5 / 17.3 / 17.3 | 13.1 / 18.5 / 18.5 | 516.5 | pass |
| method.selectText | 3 | 3x {"outcome":"threw","error":"selectText is unavailable on Linux.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"selectText is unavailable on Linux.","target":"survived","inserted":null} | 15.8 / 20.2 / 20.2 | 17.1 / 17.4 / 17.4 | 515.8 | pass |
| method.scroll.pages | 3 | 3x {"outcome":"threw","error":"Linux scroll accepts { pixels }, not pages.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"Linux scroll accepts { pixels }, not pages.","target":"survived","inserted":null} | 17.6 / 21.6 / 21.6 | 17.0 / 17.3 / 17.3 | 517.6 | pass |

## Speed of the operations the engine answers (Acceptance 3's rule)

With at least 20 successful samples a side, the bootstrap 95% interval of cua's median minus the vendor engine's passes when its upper end is within the bound, max(5% of the vendor's median, 1 ms); with fewer, cua's judged median must be at most the vendor's (the median rule).

| Operation | Samples (vendor / cua) | Vendor judged | cua judged | Interval of cua minus vendor, ms | Bound, ms | Label | Verdict |
|---|---|---|---|---|---|---|---|
| warm.getState | 90 / 90 | 17.6 | 17.9 | [-0.122, 0.834] | 1 | same (within noise) | pass |
| warm.listApps | 90 / 90 | 16.8 | 17.2 | [-0.227, 1.124] | 1 | undetermined | fail |
| bind.getApp | 3 / 3 | 580.6 | 123.3 | – | – | median rule | pass |
| warm.getAXState | 90 / 90 | 490.6 | 94.8 | [-409.197, -382.225] | 24.53 | faster | pass |
| warm.getScreenshot | 90 / 90 | 632.6 | 117.7 | [-531.118, -491.918] | 31.63 | faster | pass |
| task.act | 30 / 30 | 16743.6 | 4501.6 | [-12292.949, -12210.384] | 837.18 | faster | pass |
| task.verify | 30 / 30 | 585.6 | 192.3 | [-449.001, -380.708] | 29.28 | faster | pass |
| task.clear | 30 / 30 | 1320.1 | 308.1 | [-1032.288, -987.975] | 66.01 | faster | pass |
| task.total | 30 / 30 | 18700.0 | 5003.1 | [-13818.763, -13633.258] | 935 | faster | pass |
| method.typeText | 3 / 3 | 10247.9 | 60.7 | – | – | median rule | pass |
| method.paste | 3 / 3 | 10231.4 | 59.9 | – | – | median rule | pass |

## Where cua's median is above the vendor engine's

- cold.miss.initialize: cua 387.7 ms, vendor 364.0 ms (no engine answers it: judged by the tolerance alone)
- cold.miss.tools_list: cua 2.60 ms, vendor 2.50 ms (no engine answers it: judged by the tolerance alone)
- cold.hit.initialize: cua 248.0 ms, vendor 242.6 ms (no engine answers it: judged by the tolerance alone)
- cold.hit.tools_list: cua 1.30 ms, vendor 1.20 ms (no engine answers it: judged by the tolerance alone)
- warm.getState: cua 17.9 ms, vendor 17.6 ms (an operation the engine answers: judged by Acceptance 3's interval rule, pass)
- warm.listApps: cua 17.2 ms, vendor 16.8 ms (an operation the engine answers: judged by Acceptance 3's interval rule, fail)
- method.selectText: cua 17.1 ms, vendor 15.8 ms (no engine answers it: judged by the tolerance alone)
- end_task: cua 3.40 ms, vendor 3.10 ms (no engine answers it: judged by the tolerance alone)

## What differs, by design

- engine: vendor (answered: sky_linux_x64 of the run's runtime) -> cua (answered: cua-engine named by --engine-bin /Users/new/.local/share/cua-171/task74/w5/engine/8ab1cc758983/cua-engine)
- service: computer surface, answered by vendor -> computer surface, answered by cua

## Failures and notes

- warm.listApps (fail): the bootstrap 95% interval [-0.227, 1.124] ms of cua's median minus the vendor engine's (cua 17.2 ms, vendor 16.83 ms, 90 / 90 samples) reaches past the bound 1 ms, max(5% of the vendor's median, 1 ms), on an operation the engine answers: undetermined at 90 samples a side, which Acceptance 3 fails once a series has 20, as a comparison cannot top it up (Acceptance 3's speed rule, Acceptance 10)
- method.typeText (pass): better: the method returned, its window survived and its text was read back
- method.paste (pass): better: the method returned, its window survived and its text was read back

## Problems

None: both sides are complete, attested and comparable.

Verdict: **FAIL**
