# Native baseline comparison A: engine (Linux)

| | Baseline | Candidate |
|---|---|---|
| REPL host | cua | cua |
| Engine | vendor (answered: sky_linux_x64 of the run's runtime) | cua (answered: cua-engine installed in the run's home) |
| Approved engine | – | – |
| initialize answered by | cua-repl-host 0.5.0 | cua-repl-host 0.5.0 |
| Commit | 23d0b7c9bf29610165fde6e751df0471e57eadb9 | 23d0b7c9bf29610165fde6e751df0471e57eadb9 |
| device | cua-171 | cua-171 |
| release | 26.928.40906-linux-x64 | 26.928.40906-linux-x64 |
| hardware | vServer, x64, 8 CPUs, 15 GiB | vServer, x64, 8 CPUs, 15 GiB |
| os | Ubuntu 24.04.4 LTS (6.8.0-138-generic) | Ubuntu 24.04.4 LTS (6.8.0-138-generic) |
| display | 1280 x 800 points at scale 1 (1280 x 800 pixels) | 1280 x 800 points at scale 1 (1280 x 800 pixels) |
| service | computer surface, answered by vendor | computer surface, answered by cua |
| sandbox | scoped (platform default) | scoped (platform default) |
| plan | 5 cold, 30 warm, 10 tasks | 5 cold, 30 warm, 10 tasks |
| Runs | run-1, run-2, run-3 | run-1, run-2, run-3 |
| ssh.roundtrip median | 282.5 | 298.0 |

Rule (#171 comparison A, engine (Linux)): the baseline runs `--host cua --engine vendor`, the candidate `--host cua --engine cua`; three complete, attested runs a side of one sitting covering the same plan, every attested field equal but engine, service (below). The engine and its service are the variable: the vendor engine behind the vendor service against cua's engine behind cua's service, both in cua's own host, the only one Linux serves. Per operation (method cases included), the candidate's judged median must be at most the baseline's plus max(10%, 500 ms), or faster, and it must succeed in no smaller share of its valid samples; the cold-connection phases that open the ssh pipe are judged net of each side's ssh.roundtrip median. On an operation the engine answers (warm.getState, warm.listApps, bind.getApp, warm.getAXState, warm.getScreenshot, task.act, task.verify, task.clear, task.total, method.typeText, method.paste) the candidate's judged median must also be at most the baseline's (Acceptance 10), and every cua typeText and paste sample must return without an error, survive and read back its text (Plan of Work M2); the ordinary better-outcome rule accepts this improvement over the vendor engine's text failures, with no failure waived on cua. ssh, approval, guard and setup operations are reported, not judged. Milliseconds; "OK" is successes over valid samples; wall and in-cell columns are median / p95 / max of successful samples.

| Operation | Basis | Baseline OK | Candidate OK | Baseline judged | Candidate judged | Limit | Verdict | Baseline wall | Candidate wall | Baseline in-cell | Candidate in-cell |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ssh.roundtrip | – | 15/15 | 15/15 | 282.5 | 298.0 | – | not judged | 282.5 / 317.3 / 317.3 | 298.0 / 334.5 / 334.5 | – | – |
| cold.miss.initialize | wall median net of ssh.roundtrip median | 6/6 | 6/6 | 370.9 | 351.4 | 870.9 | pass | 653.3 / 691.2 / 691.2 | 649.4 / 682.0 / 682.0 | – | – |
| cold.miss.tools_list | wall median | 6/6 | 6/6 | 2.70 | 2.40 | 502.7 | pass | 2.70 / 3.05 / 3.05 | 2.42 / 3.11 / 3.11 | – | – |
| cold.miss.first_js | wall median | 6/6 | 6/6 | 361.0 | 311.5 | 861.0 | pass | 361.0 / 384.9 / 384.9 | 311.5 / 315.3 / 315.3 | 0.01 / 0.02 / 0.02 | 0.02 / 0.03 / 0.03 |
| cold.miss.total | wall median net of ssh.roundtrip median | 6/6 | 6/6 | 742.4 | 664.6 | 1242.4 | pass | 1024.8 / 1054.7 / 1054.7 | 962.5 / 997.8 / 997.8 | – | – |
| cold.hit.initialize | wall median net of ssh.roundtrip median | 9/9 | 9/9 | 257.0 | 232.1 | 757.0 | pass | 539.5 / 592.8 / 592.8 | 530.0 / 552.8 / 552.8 | – | – |
| cold.hit.tools_list | wall median | 9/9 | 9/9 | 1.30 | 1.10 | 501.3 | pass | 1.28 / 2.01 / 2.01 | 1.13 / 1.70 / 1.70 | – | – |
| cold.hit.first_js | wall median | 9/9 | 9/9 | 506.1 | 423.9 | 1006.1 | pass | 506.1 / 539.7 / 539.7 | 423.9 / 499.7 / 499.7 | 0.01 / 0.02 / 0.02 | 0.01 / 0.02 / 0.02 |
| cold.hit.total | wall median net of ssh.roundtrip median | 9/9 | 9/9 | 775.6 | 654.2 | 1275.6 | pass | 1058.1 / 1121.0 / 1121.0 | 952.1 / 1054.0 / 1054.0 | – | – |
| warm.noop | wall median | 90/90 | 90/90 | 13.4 | 13.9 | 513.4 | pass | 13.4 / 23.0 / 29.8 | 13.9 / 19.4 / 22.1 | 0.01 / 0.02 / 0.11 | 0.01 / 0.02 / 0.03 |
| warm.getState | wall median | 90/90 | 90/90 | 24.3 | 16.8 | 524.3 | pass | 24.3 / 41.0 / 42.5 | 16.8 / 24.1 / 27.9 | 9.50 / 15.7 / 18.0 | 4.28 / 6.55 / 10.3 |
| warm.listApps | wall median | 90/90 | 90/90 | 23.8 | 17.8 | 523.8 | pass | 23.8 / 35.8 / 39.9 | 17.8 / 29.8 / 35.5 | 9.68 / 14.7 / 18.1 | 4.19 / 7.67 / 8.93 |
| setup.findWindow | – | 3/3 | 3/3 | 292.8 | 271.9 | – | not judged | 292.8 / 293.2 / 293.2 | 271.9 / 272.7 / 272.7 | 275.0 / 278.0 / 278.0 | 257.4 / 258.1 / 258.1 |
| bind.getApp | wall median | 3/3 | 3/3 | 566.1 | 123.6 | 1066.1 | pass | 566.1 / 666.2 / 666.2 | 123.6 / 128.0 / 128.0 | 549.0 / 648.6 / 648.6 | 109.5 / 114.3 / 114.3 |
| approval.elicitation | – | 3/3 | 3/3 | 42.8 | 20.9 | – | not judged | 42.8 / 55.3 / 55.3 | 20.9 / 24.3 / 24.3 | – | – |
| warm.getAXState | wall median | 90/90 | 90/90 | 488.0 | 95.3 | 988.0 | pass | 488.0 / 616.1 / 783.7 | 95.3 / 121.0 / 132.2 | 474.2 / 601.4 / 762.9 | 82.4 / 100.3 / 120.7 |
| warm.getScreenshot | wall median | 90/90 | 90/90 | 611.5 | 113.4 | 1111.5 | pass | 611.5 / 747.3 / 861.2 | 113.4 / 142.0 / 146.8 | 597.7 / 721.3 / 845.5 | 100.2 / 128.4 / 133.6 |
| task.act | wall median | 30/30 | 30/30 | 16965.8 | 8832.0 | 18662.4 | pass | 16965.8 / 17096.0 / 17099.8 | 8832.0 / 8890.4 / 8890.5 | 16949.8 / 17082.8 / 17087.5 | 8819.7 / 8877.9 / 8878.3 |
| task.verify | wall median | 30/30 | 30/30 | 576.1 | 197.7 | 1076.1 | pass | 576.1 / 827.6 / 871.5 | 197.7 / 230.1 / 232.5 | 559.0 / 815.5 / 857.4 | 182.6 / 215.2 / 215.5 |
| task.clear | wall median | 30/30 | 30/30 | 1343.7 | 518.2 | 1843.7 | pass | 1343.7 / 1548.9 / 1553.5 | 518.2 / 558.7 / 560.8 | 1331.7 / 1529.3 / 1532.4 | 504.2 / 547.2 / 548.0 |
| task.total | wall median | 30/30 | 30/30 | 18891.3 | 9555.9 | 20780.4 | pass | 18891.3 / 19417.6 / 19424.0 | 9555.9 / 9611.7 / 9630.6 | 18849.5 / 19373.1 / 19375.7 | 9516.1 / 9573.5 / 9594.4 |
| end_task | wall median | 3/3 | 3/3 | 3.10 | 3.70 | 503.1 | pass | 3.12 / 3.24 / 3.24 | 3.66 / 4.01 / 4.01 | – | – |
| setup.findTarget | – | 6/6 | 6/6 | 296.1 | 272.9 | – | not judged | 296.1 / 302.6 / 302.6 | 272.9 / 274.9 / 274.9 | 283.1 / 288.3 / 288.3 | 258.9 / 260.1 / 260.1 |

## Method cases

Outcomes are counted per sample (`n x` the outcome); wall is median / p95 / max of the samples the harness ran, judged by the same rule.

| Method case | Baseline samples | Baseline outcomes | Candidate samples | Candidate outcomes | Baseline wall | Candidate wall | Limit | Verdict |
|---|---|---|---|---|---|---|---|---|
| method.typeText | 3 | 3x {"outcome":"threw","error":"editable Paste did not insert text","target":"survived","inserted":null} | 3 | 3x {"outcome":"returned","error":null,"target":"survived","inserted":true} | 10238.1 / 10239.1 / 10239.1 | 166.6 / 169.9 / 169.9 | 11261.9 | pass |
| method.paste | 3 | 3x {"outcome":"threw","error":"editable Paste did not insert text","target":"survived","inserted":null} | 3 | 3x {"outcome":"returned","error":null,"target":"survived","inserted":true} | 10234.6 / 10236.8 / 10236.8 | 162.6 / 164.1 / 164.1 | 11258.1 | pass |
| method.paste.format | 3 | 3x {"outcome":"threw","error":"Linux paste supports only text format.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"Linux paste supports only text format.","target":"survived","inserted":null} | 13.6 / 13.8 / 13.8 | 15.1 / 19.3 / 19.3 | 513.6 | pass |
| method.setValue | 3 | 3x {"outcome":"threw","error":"setValue is unavailable on Linux; use click, pressKey, and typeText.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"setValue is unavailable on Linux; use click, pressKey, and typeText.","target":"survived","inserted":null} | 14.0 / 17.2 / 17.2 | 13.3 / 13.5 / 13.5 | 514.0 | pass |
| method.selectText | 3 | 3x {"outcome":"threw","error":"selectText is unavailable on Linux.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"selectText is unavailable on Linux.","target":"survived","inserted":null} | 14.4 / 14.4 / 14.4 | 17.5 / 21.0 / 21.0 | 514.4 | pass |
| method.scroll.pages | 3 | 3x {"outcome":"threw","error":"Linux scroll accepts { pixels }, not pages.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"Linux scroll accepts { pixels }, not pages.","target":"survived","inserted":null} | 16.8 / 18.4 / 18.4 | 14.3 / 17.1 / 17.1 | 516.8 | pass |

## Where cua's median is above the vendor engine's

- warm.noop: cua 13.9 ms, vendor 13.4 ms (no engine answers it: judged by the tolerance alone)
- method.paste.format: cua 15.1 ms, vendor 13.6 ms (no engine answers it: judged by the tolerance alone)
- method.selectText: cua 17.5 ms, vendor 14.4 ms (no engine answers it: judged by the tolerance alone)
- end_task: cua 3.70 ms, vendor 3.10 ms (no engine answers it: judged by the tolerance alone)

## What differs, by design

- engine: vendor (answered: sky_linux_x64 of the run's runtime) -> cua (answered: cua-engine installed in the run's home)
- service: computer surface, answered by vendor -> computer surface, answered by cua

## Failures and notes

- method.typeText (pass): better: the method returned, its window survived and its text was read back
- method.paste (pass): better: the method returned, its window survived and its text was read back

## Problems

None: both sides are complete, attested and comparable.

Verdict: **PASS**
