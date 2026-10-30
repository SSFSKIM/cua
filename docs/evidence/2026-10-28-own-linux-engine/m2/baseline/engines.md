# Native baseline comparison A: engine (Linux)

| | Baseline | Candidate |
|---|---|---|
| REPL host | cua | cua |
| Engine | vendor (answered: sky_linux_x64 of the run's runtime) | cua (answered: cua-engine named by --engine-bin /Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/native/linux-engine/target/release/cua-engine) |
| Approved engine | – | – |
| initialize answered by | cua-repl-host 0.5.0 | cua-repl-host 0.5.0 |
| Commit | e0168c63871cfa140ea81e2f97ec6a8f9d73adc1 | e0168c63871cfa140ea81e2f97ec6a8f9d73adc1 |
| device | cua-171 | cua-171 |
| release | 26.928.40906-linux-x64 | 26.928.40906-linux-x64 |
| hardware | vServer, x64, 8 CPUs, 15 GiB | vServer, x64, 8 CPUs, 15 GiB |
| os | Ubuntu 24.04.4 LTS (6.8.0-138-generic) | Ubuntu 24.04.4 LTS (6.8.0-138-generic) |
| display | 1280 x 800 points at scale 1 (1280 x 800 pixels) | 1280 x 800 points at scale 1 (1280 x 800 pixels) |
| service | computer surface, answered by vendor | computer surface, answered by vendor |
| sandbox | scoped (platform default) | scoped (platform default) |
| plan | 5 cold, 30 warm, 10 tasks | 5 cold, 30 warm, 10 tasks |
| Runs | run-1, run-2, run-3 | run-1, run-2, run-3 |
| ssh.roundtrip median | 287.7 | 285.2 |

Rule (#171 comparison A, engine (Linux)): the baseline runs `--host cua --engine vendor`, the candidate `--host cua --engine cua`; three complete, attested runs a side of one sitting covering the same plan, every attested field equal but engine (below). The engine is the one variable: the vendor engine against cua's, both driven by the vendor service in cua's own host, the only one Linux serves. Per operation (method cases included), the candidate's judged median must be at most the baseline's plus max(10%, 500 ms), or faster, and it must succeed in no smaller share of its valid samples; the cold-connection phases that open the ssh pipe are judged net of each side's ssh.roundtrip median. On an operation the engine answers (warm.getState, warm.listApps, bind.getApp, warm.getAXState, warm.getScreenshot, task.act, task.verify, task.clear, task.total, method.typeText, method.paste) the candidate's judged median must also be at most the baseline's (Acceptance 10), and every cua typeText and paste sample must return without an error, survive and read back its text (Plan of Work M2); the ordinary better-outcome rule accepts this improvement over the vendor engine's text failures, with no failure waived on cua. ssh, approval, guard and setup operations are reported, not judged. Milliseconds; "OK" is successes over valid samples; wall and in-cell columns are median / p95 / max of successful samples.

| Operation | Basis | Baseline OK | Candidate OK | Baseline judged | Candidate judged | Limit | Verdict | Baseline wall | Candidate wall | Baseline in-cell | Candidate in-cell |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ssh.roundtrip | – | 15/15 | 15/15 | 287.7 | 285.2 | – | not judged | 287.7 / 318.4 / 318.4 | 285.2 / 333.4 / 333.4 | – | – |
| cold.miss.initialize | wall median net of ssh.roundtrip median | 6/6 | 6/6 | 342.5 | 365.2 | 842.5 | pass | 630.2 / 678.5 / 678.5 | 650.4 / 688.4 / 688.4 | – | – |
| cold.miss.tools_list | wall median | 6/6 | 6/6 | 2.30 | 2.50 | 502.3 | pass | 2.31 / 3.50 / 3.50 | 2.52 / 2.76 / 2.76 | – | – |
| cold.miss.first_js | wall median | 6/6 | 6/6 | 363.9 | 379.6 | 863.9 | pass | 363.9 / 391.9 / 391.9 | 379.6 / 417.9 / 417.9 | 0.01 / 0.02 / 0.02 | 0.01 / 0.03 / 0.03 |
| cold.miss.total | wall median net of ssh.roundtrip median | 6/6 | 6/6 | 724.0 | 749.5 | 1224.0 | pass | 1011.7 / 1073.9 / 1073.9 | 1034.7 / 1108.9 / 1108.9 | – | – |
| cold.hit.initialize | wall median net of ssh.roundtrip median | 9/9 | 9/9 | 239.9 | 231.1 | 739.9 | pass | 527.6 / 572.4 / 572.4 | 516.3 / 564.8 / 564.8 | – | – |
| cold.hit.tools_list | wall median | 9/9 | 9/9 | 1.10 | 1.10 | 501.1 | pass | 1.10 / 1.28 / 1.28 | 1.10 / 1.41 / 1.41 | – | – |
| cold.hit.first_js | wall median | 9/9 | 9/9 | 503.4 | 473.4 | 1003.4 | pass | 503.4 / 534.4 / 534.4 | 473.4 / 535.3 / 535.3 | 0.01 / 0.04 / 0.04 | 0.01 / 0.06 / 0.06 |
| cold.hit.total | wall median net of ssh.roundtrip median | 9/9 | 9/9 | 746.3 | 709.8 | 1246.3 | pass | 1033.9 / 1088.2 / 1088.2 | 995.0 / 1066.4 / 1066.4 | – | – |
| warm.noop | wall median | 90/90 | 90/90 | 13.5 | 13.8 | 513.5 | pass | 13.5 / 20.1 / 21.5 | 13.8 / 22.5 / 24.1 | 0.01 / 0.03 / 0.10 | 0.01 / 0.03 / 0.03 |
| warm.getState | wall median | 90/90 | 90/90 | 22.8 | 18.2 | 522.8 | pass | 22.8 / 28.8 / 30.9 | 18.2 / 24.8 / 27.7 | 8.94 / 12.1 / 18.2 | 3.86 / 6.68 / 11.4 |
| warm.listApps | wall median | 90/90 | 90/90 | 20.9 | 18.2 | 520.9 | pass | 20.9 / 31.3 / 37.9 | 18.2 / 26.4 / 32.9 | 8.19 / 13.0 / 17.7 | 3.86 / 6.40 / 9.81 |
| setup.findWindow | – | 3/3 | 3/3 | 290.5 | 275.5 | – | not judged | 290.5 / 311.1 / 311.1 | 275.5 / 276.3 / 276.3 | 274.2 / 283.1 / 283.1 | 258.4 / 259.1 / 259.1 |
| bind.getApp | wall median | 3/3 | 3/3 | 627.8 | 152.2 | 1127.8 | pass | 627.8 / 665.5 / 665.5 | 152.2 / 153.8 / 153.8 | 613.8 / 641.0 / 641.0 | 133.0 / 138.3 / 138.3 |
| approval.elicitation | – | 3/3 | 3/3 | 45.6 | 25.4 | – | not judged | 45.6 / 66.0 / 66.0 | 25.4 / 28.7 / 28.7 | – | – |
| warm.getAXState | wall median | 90/90 | 90/90 | 538.2 | 97.5 | 1038.2 | pass | 538.2 / 722.8 / 825.5 | 97.5 / 123.2 / 148.0 | 522.2 / 706.5 / 803.1 | 83.3 / 107.3 / 122.3 |
| warm.getScreenshot | wall median | 90/90 | 90/90 | 634.8 | 118.4 | 1134.8 | pass | 634.8 / 782.1 / 922.8 | 118.4 / 148.5 / 177.7 | 618.2 / 767.6 / 902.2 | 103.1 / 131.8 / 151.4 |
| task.act | wall median | 30/30 | 30/30 | 16979.1 | 8830.7 | 18677.0 | pass | 16979.1 / 17163.8 / 17166.0 | 8830.7 / 8888.1 / 8892.5 | 16965.6 / 17143.2 / 17151.7 | 8818.1 / 8870.7 / 8879.0 |
| task.verify | wall median | 30/30 | 30/30 | 596.6 | 190.0 | 1096.6 | pass | 596.6 / 828.3 / 863.0 | 190.0 / 215.3 / 226.4 | 583.5 / 806.7 / 849.5 | 176.4 / 195.2 / 205.5 |
| task.clear | wall median | 30/30 | 30/30 | 1356.0 | 511.2 | 1856.0 | pass | 1356.0 / 1446.0 / 1505.5 | 511.2 / 552.3 / 565.0 | 1343.3 / 1430.3 / 1492.6 | 498.1 / 540.0 / 553.3 |
| task.total | wall median | 30/30 | 30/30 | 18975.3 | 9545.3 | 20872.8 | pass | 18975.3 / 19206.3 / 19309.2 | 9545.3 / 9627.9 / 9636.4 | 18934.2 / 19157.6 / 19253.8 | 9505.1 / 9590.0 / 9590.6 |
| end_task | wall median | 3/3 | 3/3 | 3.60 | 3.10 | 503.6 | pass | 3.64 / 4.24 / 4.24 | 3.11 / 3.18 / 3.18 | – | – |
| setup.findTarget | – | 6/6 | 6/6 | 312.6 | 271.5 | – | not judged | 312.6 / 320.9 / 320.9 | 271.5 / 280.2 / 280.2 | 299.2 / 306.5 / 306.5 | 258.3 / 260.6 / 260.6 |

## Method cases

Outcomes are counted per sample (`n x` the outcome); wall is median / p95 / max of the samples the harness ran, judged by the same rule.

| Method case | Baseline samples | Baseline outcomes | Candidate samples | Candidate outcomes | Baseline wall | Candidate wall | Limit | Verdict |
|---|---|---|---|---|---|---|---|---|
| method.typeText | 3 | 3x {"outcome":"threw","error":"editable Paste did not insert text","target":"survived","inserted":null} | 3 | 3x {"outcome":"returned","error":null,"target":"survived","inserted":true} | 10242.6 / 10250.1 / 10250.1 | 160.3 / 163.0 / 163.0 | 11266.9 | pass |
| method.paste | 3 | 3x {"outcome":"threw","error":"editable Paste did not insert text","target":"survived","inserted":null} | 3 | 3x {"outcome":"returned","error":null,"target":"survived","inserted":true} | 10244.9 / 10249.7 / 10249.7 | 164.0 / 176.4 / 176.4 | 11269.4 | pass |
| method.paste.format | 3 | 3x {"outcome":"threw","error":"Linux paste supports only text format.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"Linux paste supports only text format.","target":"survived","inserted":null} | 13.8 / 14.0 / 14.0 | 18.6 / 20.6 / 20.6 | 513.8 | pass |
| method.setValue | 3 | 3x {"outcome":"threw","error":"setValue is unavailable on Linux; use click, pressKey, and typeText.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"setValue is unavailable on Linux; use click, pressKey, and typeText.","target":"survived","inserted":null} | 15.9 / 21.3 / 21.3 | 15.8 / 21.7 / 21.7 | 515.9 | pass |
| method.selectText | 3 | 3x {"outcome":"threw","error":"selectText is unavailable on Linux.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"selectText is unavailable on Linux.","target":"survived","inserted":null} | 15.0 / 17.0 / 17.0 | 17.3 / 19.9 / 19.9 | 515.0 | pass |
| method.scroll.pages | 3 | 3x {"outcome":"threw","error":"Linux scroll accepts { pixels }, not pages.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"Linux scroll accepts { pixels }, not pages.","target":"survived","inserted":null} | 17.2 / 17.4 / 17.4 | 18.8 / 21.9 / 21.9 | 517.2 | pass |

## Where cua's median is above the vendor engine's

- cold.miss.initialize: cua 365.2 ms, vendor 342.5 ms (no engine answers it: judged by the tolerance alone)
- cold.miss.tools_list: cua 2.50 ms, vendor 2.30 ms (no engine answers it: judged by the tolerance alone)
- cold.miss.first_js: cua 379.6 ms, vendor 363.9 ms (no engine answers it: judged by the tolerance alone)
- cold.miss.total: cua 749.5 ms, vendor 724.0 ms (no engine answers it: judged by the tolerance alone)
- warm.noop: cua 13.8 ms, vendor 13.5 ms (no engine answers it: judged by the tolerance alone)
- method.paste.format: cua 18.6 ms, vendor 13.8 ms (no engine answers it: judged by the tolerance alone)
- method.selectText: cua 17.3 ms, vendor 15.0 ms (no engine answers it: judged by the tolerance alone)
- method.scroll.pages: cua 18.8 ms, vendor 17.2 ms (no engine answers it: judged by the tolerance alone)

## What differs, by design

- engine: vendor (answered: sky_linux_x64 of the run's runtime) -> cua (answered: cua-engine named by --engine-bin /Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/native/linux-engine/target/release/cua-engine)

## Failures and notes

- method.typeText (pass): better: the method returned, its window survived and its text was read back
- method.paste (pass): better: the method returned, its window survived and its text was read back

## Problems

None: both sides are complete, attested and comparable.

Verdict: **PASS**
