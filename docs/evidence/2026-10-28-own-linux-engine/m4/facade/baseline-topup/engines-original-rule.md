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
| ssh.roundtrip median | 322.0 | 302.9 |

Rule (#171 comparison A, engine (Linux)): the baseline runs `--host cua --engine vendor`, the candidate `--host cua --engine cua`; three complete, attested runs a side of one sitting covering the same plan, every attested field equal but engine, service (below). The engine and its service are the variable: the vendor engine behind the vendor service against cua's engine behind cua's service, both in cua's own host, the only one Linux serves. Per operation (method cases included), the candidate's judged median must be at most the baseline's plus max(10%, 500 ms), or faster, and it must succeed in no smaller share of its valid samples; the cold-connection phases that open the ssh pipe are judged net of each side's ssh.roundtrip median. On an operation the engine answers (warm.getState, warm.listApps, bind.getApp, warm.getAXState, warm.getScreenshot, task.act, task.verify, task.clear, task.total, method.typeText, method.paste) the candidate's judged median must also be at most the baseline's (Acceptance 10), and every cua typeText and paste sample must return without an error, survive and read back its text (Plan of Work M2); the ordinary better-outcome rule accepts this improvement over the vendor engine's text failures, with no failure waived on cua. ssh, approval, guard and setup operations are reported, not judged. Milliseconds; "OK" is successes over valid samples; wall and in-cell columns are median / p95 / max of successful samples.

| Operation | Basis | Baseline OK | Candidate OK | Baseline judged | Candidate judged | Limit | Verdict | Baseline wall | Candidate wall | Baseline in-cell | Candidate in-cell |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ssh.roundtrip | – | 15/15 | 15/15 | 322.0 | 302.9 | – | not judged | 322.0 / 344.8 / 344.8 | 302.9 / 323.5 / 323.5 | – | – |
| cold.miss.initialize | wall median net of ssh.roundtrip median | 6/6 | 6/6 | 362.8 | 362.6 | 862.8 | pass | 684.8 / 706.3 / 706.3 | 665.4 / 696.9 / 696.9 | – | – |
| cold.miss.tools_list | wall median | 6/6 | 6/6 | 2.50 | 2.40 | 502.5 | pass | 2.51 / 3.49 / 3.49 | 2.44 / 2.93 / 2.93 | – | – |
| cold.miss.first_js | wall median | 6/6 | 6/6 | 372.7 | 319.6 | 872.7 | pass | 372.7 / 429.7 / 429.7 | 319.6 / 386.7 / 386.7 | 0.01 / 0.05 / 0.05 | 0.01 / 0.02 / 0.02 |
| cold.miss.total | wall median net of ssh.roundtrip median | 6/6 | 6/6 | 735.2 | 694.4 | 1235.2 | pass | 1057.3 / 1121.6 / 1121.6 | 997.3 / 1055.2 / 1055.2 | – | – |
| cold.hit.initialize | wall median net of ssh.roundtrip median | 9/9 | 9/9 | 205.9 | 232.0 | 705.9 | pass | 527.9 / 566.1 / 566.1 | 534.8 / 571.6 / 571.6 | – | – |
| cold.hit.tools_list | wall median | 9/9 | 9/9 | 1.20 | 1.10 | 501.2 | pass | 1.22 / 1.68 / 1.68 | 1.13 / 2.24 / 2.24 | – | – |
| cold.hit.first_js | wall median | 9/9 | 9/9 | 507.9 | 469.2 | 1007.9 | pass | 507.9 / 557.6 / 557.6 | 469.2 / 536.0 / 536.0 | 0.01 / 0.02 / 0.02 | 0.01 / 0.02 / 0.02 |
| cold.hit.total | wall median net of ssh.roundtrip median | 9/9 | 9/9 | 738.7 | 675.8 | 1238.7 | pass | 1060.7 / 1125.3 / 1125.3 | 978.7 / 1095.5 / 1095.5 | – | – |
| warm.noop | wall median | 90/90 | 90/90 | 16.2 | 14.2 | 516.2 | pass | 16.2 / 25.6 / 31.7 | 14.2 / 22.4 / 30.5 | 0.01 / 0.03 / 0.05 | 0.01 / 0.03 / 0.04 |
| warm.getState | wall median | 90/90 | 90/90 | 17.5 | 17.3 | 517.5 | pass | 17.5 / 31.7 / 46.2 | 17.3 / 24.0 / 31.7 | 4.25 / 8.82 / 17.9 | 3.71 / 6.33 / 7.14 |
| warm.listApps | wall median | 90/90 | 90/90 | 17.1 | 17.3 | 517.1 | fail | 17.1 / 22.0 / 31.4 | 17.3 / 28.2 / 31.8 | 3.92 / 6.11 / 7.14 | 3.54 / 5.21 / 10.1 |
| setup.findWindow | – | 3/3 | 3/3 | 287.7 | 272.4 | – | not judged | 287.6 / 299.2 / 299.2 | 272.4 / 272.7 / 272.7 | 269.1 / 271.5 / 271.5 | 255.6 / 257.0 / 257.0 |
| bind.getApp | wall median | 3/3 | 3/3 | 652.2 | 126.1 | 1152.2 | pass | 652.2 / 792.9 / 792.9 | 126.1 / 161.2 / 161.2 | 625.3 / 775.1 / 775.1 | 111.7 / 135.6 / 135.6 |
| approval.elicitation | – | 3/3 | 3/3 | 45.6 | 28.1 | – | not judged | 45.6 / 53.8 / 53.8 | 28.1 / 35.8 / 35.8 | – | – |
| warm.getAXState | wall median | 90/90 | 90/90 | 499.0 | 90.5 | 999.0 | pass | 499.0 / 742.4 / 852.3 | 90.5 / 113.6 / 127.3 | 483.8 / 730.2 / 831.5 | 77.8 / 99.8 / 113.4 |
| warm.getScreenshot | wall median | 90/90 | 90/90 | 658.2 | 111.8 | 1158.2 | pass | 658.2 / 882.4 / 1000.4 | 111.8 / 145.2 / 154.8 | 643.2 / 863.6 / 979.7 | 99.3 / 131.4 / 141.0 |
| task.act | wall median | 30/30 | 30/30 | 16739.2 | 4493.5 | 18413.1 | pass | 16739.2 / 16985.5 / 17119.7 | 4493.5 / 4530.5 / 4538.5 | 16725.1 / 16967.0 / 17106.5 | 4481.4 / 4517.1 / 4524.0 |
| task.verify | wall median | 30/30 | 30/30 | 578.7 | 188.4 | 1078.7 | pass | 578.7 / 824.9 / 856.3 | 188.4 / 213.1 / 217.4 | 566.3 / 804.8 / 835.2 | 173.7 / 198.1 / 200.8 |
| task.clear | wall median | 30/30 | 30/30 | 1316.1 | 313.5 | 1816.1 | pass | 1316.1 / 1429.7 / 1578.6 | 313.5 / 351.4 / 370.9 | 1304.4 / 1416.1 / 1566.8 | 301.6 / 334.0 / 350.7 |
| task.total | wall median | 30/30 | 30/30 | 18617.7 | 4992.7 | 20479.5 | pass | 18617.7 / 19054.6 / 19150.9 | 4992.7 / 5068.6 / 5101.8 | 18574.0 / 19007.7 / 19098.9 | 4955.1 / 5017.6 / 5044.4 |
| end_task | wall median | 3/3 | 3/3 | 3.30 | 2.90 | 503.3 | pass | 3.29 / 3.37 / 3.37 | 2.93 / 3.04 / 3.04 | – | – |
| setup.findTarget | – | 6/6 | 6/6 | 297.3 | 270.2 | – | not judged | 297.3 / 308.1 / 308.1 | 270.2 / 272.3 / 272.3 | 283.4 / 291.2 / 291.2 | 257.0 / 258.0 / 258.0 |

## Method cases

Outcomes are counted per sample (`n x` the outcome); wall is median / p95 / max of the samples the harness ran, judged by the same rule.

| Method case | Baseline samples | Baseline outcomes | Candidate samples | Candidate outcomes | Baseline wall | Candidate wall | Limit | Verdict |
|---|---|---|---|---|---|---|---|---|
| method.typeText | 3 | 3x {"outcome":"threw","error":"editable Paste did not insert text","target":"survived","inserted":null} | 3 | 3x {"outcome":"returned","error":null,"target":"survived","inserted":true} | 10233.6 / 10235.7 / 10235.7 | 57.4 / 60.3 / 60.3 | 11257.1 | pass |
| method.paste | 3 | 3x {"outcome":"threw","error":"editable Paste did not insert text","target":"survived","inserted":null} | 3 | 3x {"outcome":"returned","error":null,"target":"survived","inserted":true} | 10230.6 / 10232.4 / 10232.4 | 57.3 / 68.5 / 68.5 | 11253.7 | pass |
| method.paste.format | 3 | 3x {"outcome":"threw","error":"Linux paste supports only text format.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"Linux paste supports only text format.","target":"survived","inserted":null} | 11.3 / 13.1 / 13.1 | 13.9 / 20.5 / 20.5 | 511.3 | pass |
| method.setValue | 3 | 3x {"outcome":"threw","error":"setValue is unavailable on Linux; use click, pressKey, and typeText.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"setValue is unavailable on Linux; use click, pressKey, and typeText.","target":"survived","inserted":null} | 16.2 / 17.2 / 17.2 | 13.4 / 13.9 / 13.9 | 516.2 | pass |
| method.selectText | 3 | 3x {"outcome":"threw","error":"selectText is unavailable on Linux.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"selectText is unavailable on Linux.","target":"survived","inserted":null} | 16.2 / 18.2 / 18.2 | 13.5 / 19.3 / 19.3 | 516.2 | pass |
| method.scroll.pages | 3 | 3x {"outcome":"threw","error":"Linux scroll accepts { pixels }, not pages.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"Linux scroll accepts { pixels }, not pages.","target":"survived","inserted":null} | 16.8 / 19.8 / 19.8 | 13.6 / 15.3 / 15.3 | 516.8 | pass |

## Where cua's median is above the vendor engine's

- cold.hit.initialize: cua 232.0 ms, vendor 205.9 ms (no engine answers it: judged by the tolerance alone)
- warm.listApps: cua 17.3 ms, vendor 17.1 ms (an operation the engine answers: it fails)
- method.paste.format: cua 13.9 ms, vendor 11.3 ms (no engine answers it: judged by the tolerance alone)

## What differs, by design

- engine: vendor (answered: sky_linux_x64 of the run's runtime) -> cua (answered: cua-engine named by --engine-bin /Users/new/.local/share/cua-171/task74/w5/engine/8ab1cc758983/cua-engine)
- service: computer surface, answered by vendor -> computer surface, answered by cua

## Failures and notes

- warm.listApps (fail): cua's median 17.3 ms is above the vendor engine's 17.1 ms on an operation the engine answers (Acceptance 10)
- method.typeText (pass): better: the method returned, its window survived and its text was read back
- method.paste (pass): better: the method returned, its window survived and its text was read back

## Problems

None: both sides are complete, attested and comparable.

Verdict: **FAIL**
