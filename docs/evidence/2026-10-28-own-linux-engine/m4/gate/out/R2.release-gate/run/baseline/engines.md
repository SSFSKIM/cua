# Native baseline comparison A: engine (Linux)

| | Baseline | Candidate |
|---|---|---|
| REPL host | cua | cua |
| Engine | vendor (answered: sky_linux_x64 of the run's runtime) | cua (answered: cua-engine named by --engine-bin /tmp/cua171-candidate-mZy2OH/cua-engine) |
| Approved engine | – | – |
| initialize answered by | cua-repl-host 0.5.0 | cua-repl-host 0.5.0 |
| Commit | 514f5c62dd6c74b1ed24c48f112ca9c35a70eece | 514f5c62dd6c74b1ed24c48f112ca9c35a70eece |
| device | cua-171 | cua-171 |
| release | 26.928.40906-linux-x64 | 26.928.40906-linux-x64 |
| hardware | vServer, x64, 8 CPUs, 15 GiB | vServer, x64, 8 CPUs, 15 GiB |
| os | Ubuntu 24.04.4 LTS (6.8.0-138-generic) | Ubuntu 24.04.4 LTS (6.8.0-138-generic) |
| display | 1280 x 800 points at scale 1 (1280 x 800 pixels) | 1280 x 800 points at scale 1 (1280 x 800 pixels) |
| service | computer surface, answered by vendor | computer surface, answered by cua |
| sandbox | scoped (platform default) | scoped (platform default) |
| plan | 5 cold, 30 warm, 10 tasks | 5 cold, 30 warm, 10 tasks |
| Runs | run-1, run-2, run-3 | run-1, run-2, run-3 |
| ssh.roundtrip median | 295.6 | 287.0 |

Rule (#171 comparison A, engine (Linux)): the baseline runs `--host cua --engine vendor`, the candidate `--host cua --engine cua`; three complete, attested runs a side of one sitting covering the same plan, every attested field equal but engine, service (below). The engine and its service are the variable: the vendor engine behind the vendor service against cua's engine behind cua's service, both in cua's own host, the only one Linux serves. Per operation (method cases included), the candidate's judged median must be at most the baseline's plus max(10%, 500 ms), or faster, and it must succeed in no smaller share of its valid samples; the cold-connection phases that open the ssh pipe are judged net of each side's ssh.roundtrip median. On an operation the engine answers (warm.getState, warm.listApps, bind.getApp, warm.getAXState, warm.getScreenshot, task.act, task.verify, task.clear, task.total, method.typeText, method.paste) the candidate's speed is also judged by Acceptance 3's rule (Acceptance 10): with at least 20 samples a side, the upper end of the bootstrap 95% interval of its median minus the baseline's must be within max(5% of the baseline's median, 1 ms); with fewer, its judged median must be at most the baseline's, and every cua typeText and paste sample must return without an error, survive and read back its text (Plan of Work M2); the ordinary better-outcome rule accepts this improvement over the vendor engine's text failures, with no failure waived on cua. ssh, approval, guard and setup operations are reported, not judged. Milliseconds; "OK" is successes over valid samples; wall and in-cell columns are median / p95 / max of successful samples.

| Operation | Basis | Baseline OK | Candidate OK | Baseline judged | Candidate judged | Limit | Verdict | Baseline wall | Candidate wall | Baseline in-cell | Candidate in-cell |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ssh.roundtrip | – | 15/15 | 15/15 | 295.6 | 287.0 | – | not judged | 295.6 / 347.3 / 347.3 | 287.0 / 309.0 / 309.0 | – | – |
| cold.miss.initialize | wall median net of ssh.roundtrip median | 6/6 | 6/6 | 367.3 | 379.2 | 867.3 | pass | 662.8 / 693.1 / 693.1 | 666.2 / 707.9 / 707.9 | – | – |
| cold.miss.tools_list | wall median | 6/6 | 6/6 | 2.60 | 2.90 | 502.6 | pass | 2.65 / 2.98 / 2.98 | 2.91 / 3.42 / 3.42 | – | – |
| cold.miss.first_js | wall median | 6/6 | 6/6 | 373.7 | 336.6 | 873.7 | pass | 373.7 / 402.3 / 402.3 | 336.6 / 376.7 / 376.7 | 0.01 / 0.02 / 0.02 | 0.02 / 0.03 / 0.03 |
| cold.miss.total | wall median net of ssh.roundtrip median | 6/6 | 6/6 | 745.3 | 730.4 | 1245.3 | pass | 1040.9 / 1095.4 / 1095.4 | 1017.3 / 1059.7 / 1059.7 | – | – |
| cold.hit.initialize | wall median net of ssh.roundtrip median | 9/9 | 9/9 | 232.0 | 256.2 | 732.0 | pass | 527.6 / 551.3 / 551.3 | 543.1 / 581.8 / 581.8 | – | – |
| cold.hit.tools_list | wall median | 9/9 | 9/9 | 1.20 | 1.20 | 501.2 | pass | 1.23 / 1.49 / 1.49 | 1.25 / 2.55 / 2.55 | – | – |
| cold.hit.first_js | wall median | 9/9 | 9/9 | 498.8 | 444.3 | 998.8 | pass | 498.8 / 556.4 / 556.4 | 444.3 / 498.1 / 498.1 | 0.02 / 0.02 / 0.02 | 0.01 / 0.03 / 0.03 |
| cold.hit.total | wall median net of ssh.roundtrip median | 9/9 | 9/9 | 735.1 | 701.5 | 1235.1 | pass | 1030.6 / 1085.2 / 1085.2 | 988.4 / 1058.8 / 1058.8 | – | – |
| warm.noop | wall median | 90/90 | 90/90 | 14.5 | 13.9 | 514.5 | pass | 14.5 / 19.8 / 27.0 | 13.9 / 19.0 / 24.6 | 0.01 / 0.04 / 0.06 | 0.01 / 0.03 / 0.06 |
| warm.getState | wall median | 90/90 | 90/90 | 17.6 | 15.9 | 517.6 | pass | 17.6 / 23.3 / 28.1 | 15.9 / 19.8 / 26.9 | 4.42 / 7.04 / 14.1 | 3.69 / 5.87 / 7.59 |
| warm.listApps | wall median | 90/90 | 90/90 | 19.1 | 15.6 | 519.1 | pass | 19.1 / 27.9 / 33.8 | 15.6 / 20.7 / 23.1 | 5.86 / 7.18 / 8.90 | 3.42 / 5.41 / 6.01 |
| setup.findWindow | – | 3/3 | 3/3 | 278.8 | 270.1 | – | not judged | 278.8 / 287.9 / 287.9 | 270.1 / 270.2 / 270.2 | 264.5 / 265.3 / 265.3 | 255.0 / 255.6 / 255.6 |
| bind.getApp | wall median | 3/3 | 3/3 | 597.8 | 133.0 | 1097.8 | pass | 597.8 / 700.0 / 700.0 | 133.0 / 161.4 / 161.4 | 580.0 / 685.8 / 685.8 | 113.6 / 143.2 / 143.2 |
| approval.elicitation | – | 3/3 | 3/3 | 36.4 | 26.9 | – | not judged | 36.4 / 40.5 / 40.5 | 26.9 / 28.6 / 28.6 | – | – |
| warm.getAXState | wall median | 90/90 | 90/90 | 502.1 | 92.2 | 1002.1 | pass | 502.1 / 678.3 / 753.8 | 92.2 / 119.0 / 130.0 | 489.0 / 662.2 / 741.5 | 79.2 / 99.7 / 113.6 |
| warm.getScreenshot | wall median | 90/90 | 90/90 | 650.9 | 114.2 | 1150.9 | pass | 650.9 / 802.9 / 874.4 | 114.2 / 139.2 / 148.1 | 635.8 / 786.9 / 854.6 | 100.7 / 126.6 / 136.8 |
| task.act | wall median | 30/30 | 30/30 | 16714.7 | 4505.3 | 18386.2 | pass | 16714.7 / 16891.4 / 16948.6 | 4505.3 / 4538.7 / 4555.3 | 16701.0 / 16877.8 / 16937.4 | 4488.2 / 4524.5 / 4535.0 |
| task.verify | wall median | 30/30 | 30/30 | 598.1 | 192.4 | 1098.1 | pass | 598.1 / 809.9 / 833.1 | 192.4 / 220.8 / 226.8 | 581.2 / 796.1 / 819.4 | 178.7 / 206.5 / 207.4 |
| task.clear | wall median | 30/30 | 30/30 | 1323.5 | 307.6 | 1823.5 | pass | 1323.5 / 1543.0 / 1551.7 | 307.6 / 358.1 / 359.0 | 1310.8 / 1529.2 / 1538.2 | 294.4 / 344.6 / 346.4 |
| task.total | wall median | 30/30 | 30/30 | 18721.9 | 5006.1 | 20594.1 | pass | 18721.9 / 19042.1 / 19049.0 | 5006.1 / 5076.5 / 5091.2 | 18675.3 / 19001.4 / 19003.7 | 4966.7 / 5036.5 / 5038.2 |
| end_task | wall median | 3/3 | 3/3 | 3.40 | 3.60 | 503.4 | pass | 3.38 / 3.75 / 3.75 | 3.55 / 3.61 / 3.61 | – | – |
| setup.findTarget | – | 6/6 | 6/6 | 293.5 | 270.7 | – | not judged | 293.5 / 298.7 / 298.7 | 270.7 / 282.6 / 282.6 | 277.2 / 285.3 / 285.3 | 257.1 / 261.4 / 261.4 |

## Method cases

Outcomes are counted per sample (`n x` the outcome); wall is median / p95 / max of the samples the harness ran, judged by the same rule.

| Method case | Baseline samples | Baseline outcomes | Candidate samples | Candidate outcomes | Baseline wall | Candidate wall | Limit | Verdict |
|---|---|---|---|---|---|---|---|---|
| method.typeText | 3 | 3x {"outcome":"threw","error":"editable Paste did not insert text","target":"survived","inserted":null} | 3 | 3x {"outcome":"returned","error":null,"target":"survived","inserted":true} | 10239.3 / 10248.8 / 10248.8 | 60.5 / 63.9 / 63.9 | 11263.2 | pass |
| method.paste | 3 | 3x {"outcome":"threw","error":"editable Paste did not insert text","target":"survived","inserted":null} | 3 | 3x {"outcome":"returned","error":null,"target":"survived","inserted":true} | 10233.9 / 10240.9 / 10240.9 | 59.9 / 60.1 / 60.1 | 11257.3 | pass |
| method.paste.format | 3 | 3x {"outcome":"threw","error":"Linux paste supports only text format.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"Linux paste supports only text format.","target":"survived","inserted":null} | 17.5 / 26.3 / 26.3 | 14.3 / 17.3 / 17.3 | 517.5 | pass |
| method.setValue | 3 | 3x {"outcome":"threw","error":"setValue is unavailable on Linux; use click, pressKey, and typeText.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"setValue is unavailable on Linux; use click, pressKey, and typeText.","target":"survived","inserted":null} | 17.3 / 19.3 / 19.3 | 18.5 / 22.0 / 22.0 | 517.3 | pass |
| method.selectText | 3 | 3x {"outcome":"threw","error":"selectText is unavailable on Linux.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"selectText is unavailable on Linux.","target":"survived","inserted":null} | 16.7 / 19.8 / 19.8 | 13.4 / 18.6 / 18.6 | 516.7 | pass |
| method.scroll.pages | 3 | 3x {"outcome":"threw","error":"Linux scroll accepts { pixels }, not pages.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"Linux scroll accepts { pixels }, not pages.","target":"survived","inserted":null} | 16.7 / 19.4 / 19.4 | 15.1 / 18.1 / 18.1 | 516.7 | pass |

## Speed of the operations the engine answers (Acceptance 3's rule)

With at least 20 successful samples a side, the bootstrap 95% interval of cua's median minus the vendor engine's passes when its upper end is within the bound, max(5% of the vendor's median, 1 ms); with fewer, cua's judged median must be at most the vendor's (the median rule).

| Operation | Samples (vendor / cua) | Vendor judged | cua judged | Interval of cua minus vendor, ms | Bound, ms | Label | Verdict |
|---|---|---|---|---|---|---|---|
| warm.getState | 90 / 90 | 17.6 | 15.9 | [-2.599, -0.931] | 1 | faster | pass |
| warm.listApps | 90 / 90 | 19.1 | 15.6 | [-4.907, -1.969] | 1 | faster | pass |
| bind.getApp | 3 / 3 | 597.8 | 133.0 | – | – | median rule | pass |
| warm.getAXState | 90 / 90 | 502.1 | 92.2 | [-443.197, -381.985] | 25.1 | faster | pass |
| warm.getScreenshot | 90 / 90 | 650.9 | 114.2 | [-548.649, -516.007] | 32.55 | faster | pass |
| task.act | 30 / 30 | 16714.7 | 4505.3 | [-12265.082, -12169.876] | 835.73 | faster | pass |
| task.verify | 30 / 30 | 598.1 | 192.4 | [-454.194, -372.716] | 29.91 | faster | pass |
| task.clear | 30 / 30 | 1323.5 | 307.6 | [-1046.847, -1001.153] | 66.17 | faster | pass |
| task.total | 30 / 30 | 18721.9 | 5006.1 | [-13769.979, -13596.972] | 936.09 | faster | pass |
| method.typeText | 3 / 3 | 10239.3 | 60.5 | – | – | median rule | pass |
| method.paste | 3 / 3 | 10233.9 | 59.9 | – | – | median rule | pass |

## Where cua's median is above the vendor engine's

- cold.miss.initialize: cua 379.2 ms, vendor 367.3 ms (no engine answers it: judged by the tolerance alone)
- cold.miss.tools_list: cua 2.90 ms, vendor 2.60 ms (no engine answers it: judged by the tolerance alone)
- cold.hit.initialize: cua 256.2 ms, vendor 232.0 ms (no engine answers it: judged by the tolerance alone)
- method.setValue: cua 18.5 ms, vendor 17.3 ms (no engine answers it: judged by the tolerance alone)
- end_task: cua 3.60 ms, vendor 3.40 ms (no engine answers it: judged by the tolerance alone)

## What differs, by design

- engine: vendor (answered: sky_linux_x64 of the run's runtime) -> cua (answered: cua-engine named by --engine-bin /tmp/cua171-candidate-mZy2OH/cua-engine)
- service: computer surface, answered by vendor -> computer surface, answered by cua

## Failures and notes

- method.typeText (pass): better: the method returned, its window survived and its text was read back
- method.paste (pass): better: the method returned, its window survived and its text was read back

## Problems

None: both sides are complete, attested and comparable.

Verdict: **PASS**
