# Native baseline comparison A: engine (Linux)

| | Baseline | Candidate |
|---|---|---|
| REPL host | cua | cua |
| Engine | vendor (answered: sky_linux_x64 of the run's runtime) | cua (answered: cua-engine installed in the run's home) |
| Approved engine | – | – |
| initialize answered by | cua-repl-host 0.5.0 | cua-repl-host 0.5.0 |
| Commit | 01ff0648f3afc4a234669cd381395c91543ce3f7 | 01ff0648f3afc4a234669cd381395c91543ce3f7 |
| device | cua-171 | cua-171 |
| release | 26.928.40906-linux-x64 | 26.928.40906-linux-x64 |
| hardware | vServer, x64, 8 CPUs, 15 GiB | vServer, x64, 8 CPUs, 15 GiB |
| os | Ubuntu 24.04.4 LTS (6.8.0-138-generic) | Ubuntu 24.04.4 LTS (6.8.0-138-generic) |
| display | 1280 x 800 points at scale 1 (1280 x 800 pixels) | 1280 x 800 points at scale 1 (1280 x 800 pixels) |
| service | computer surface, answered by vendor | computer surface, answered by cua |
| sandbox | scoped (platform default) | scoped (platform default) |
| plan | 5 cold, 30 warm, 10 tasks | 5 cold, 30 warm, 10 tasks |
| Runs | run-1, run-2, run-3 | run-1, run-2, run-3 |
| ssh.roundtrip median | 287.6 | 285.9 |

Rule (#171 comparison A, engine (Linux)): the baseline runs `--host cua --engine vendor`, the candidate `--host cua --engine cua`; three complete, attested runs a side of one sitting covering the same plan, every attested field equal but engine, service (below). The engine and its service are the variable: the vendor engine behind the vendor service against cua's engine behind cua's service, both in cua's own host, the only one Linux serves. Per operation (method cases included), the candidate's judged median must be at most the baseline's plus max(10%, 500 ms), or faster, and it must succeed in no smaller share of its valid samples; the cold-connection phases that open the ssh pipe are judged net of each side's ssh.roundtrip median. On an operation the engine answers (warm.getState, warm.listApps, bind.getApp, warm.getAXState, warm.getScreenshot, task.act, task.verify, task.clear, task.total, method.typeText, method.paste) the candidate is judged by the in-cell time (#370), the cell's own call through the service to the engine, what the engines change; the wall time, which adds the MCP transport and the REPL host both lanes share, is reported beside it and judged only by a gross wall backstop: the candidate's wall median above the baseline's plus max(10%, 500 ms) fails the operation (ruling 706), and the backstop never passes anything. Its speed is also judged by Acceptance 3's rule (Acceptance 10): with at least 20 samples a side, the upper end of the bootstrap 95% interval of its in-cell median minus the baseline's must be within max(5% of the baseline's median, 1 ms); with fewer, its in-cell median must be at most the baseline's, and every cua typeText and paste sample must return without an error, survive and read back its text (Plan of Work M2); the ordinary better-outcome rule accepts this improvement over the vendor engine's text failures, with no failure waived on cua. ssh, approval, guard and setup operations are reported, not judged. Milliseconds; "OK" is successes over valid samples; wall and in-cell columns are median / p95 / max of successful samples.

| Operation | Basis | Baseline OK | Candidate OK | Baseline judged | Candidate judged | Limit | Verdict | Baseline wall | Candidate wall | Baseline in-cell | Candidate in-cell |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ssh.roundtrip | – | 15/15 | 15/15 | 287.6 | 285.9 | – | not judged | 287.6 / 310.0 / 310.0 | 285.9 / 351.5 / 351.5 | – | – |
| cold.miss.initialize | wall median net of ssh.roundtrip median | 6/6 | 6/6 | 358.0 | 361.8 | 858.0 | pass | 645.6 / 677.3 / 677.3 | 647.6 / 664.4 / 664.4 | – | – |
| cold.miss.tools_list | wall median | 6/6 | 6/6 | 2.40 | 2.60 | 502.4 | pass | 2.39 / 4.06 / 4.06 | 2.62 / 2.66 / 2.66 | – | – |
| cold.miss.first_js | wall median | 6/6 | 6/6 | 373.5 | 322.1 | 873.5 | pass | 373.5 / 387.7 / 387.7 | 322.1 / 359.2 / 359.2 | 0.01 / 0.02 / 0.02 | 0.01 / 0.04 / 0.04 |
| cold.miss.total | wall median net of ssh.roundtrip median | 6/6 | 6/6 | 729.2 | 685.8 | 1229.2 | pass | 1016.9 / 1069.0 / 1069.0 | 971.7 / 1025.8 / 1025.8 | – | – |
| cold.hit.initialize | wall median net of ssh.roundtrip median | 9/9 | 9/9 | 232.0 | 252.8 | 732.0 | pass | 519.6 / 609.8 / 609.8 | 538.7 / 585.3 / 585.3 | – | – |
| cold.hit.tools_list | wall median | 9/9 | 9/9 | 1.20 | 1.20 | 501.2 | pass | 1.25 / 1.39 / 1.39 | 1.23 / 2.29 / 2.29 | – | – |
| cold.hit.first_js | wall median | 9/9 | 9/9 | 490.5 | 446.8 | 990.5 | pass | 490.4 / 537.5 / 537.5 | 446.8 / 469.2 / 469.2 | 0.01 / 0.03 / 0.03 | 0.01 / 0.04 / 0.04 |
| cold.hit.total | wall median net of ssh.roundtrip median | 9/9 | 9/9 | 740.0 | 700.9 | 1240.0 | pass | 1027.6 / 1148.7 / 1148.7 | 986.7 / 1056.7 / 1056.7 | – | – |
| warm.noop | wall median | 90/90 | 90/90 | 14.6 | 14.5 | 514.6 | pass | 14.6 / 19.8 / 24.2 | 14.5 / 21.6 / 23.9 | 0.01 / 0.02 / 0.03 | 0.01 / 0.03 / 0.05 |
| warm.getState | in-cell median | 90/90 | 90/90 | 4.30 | 3.80 | 504.3 | pass | 18.5 / 29.0 / 31.3 | 17.8 / 21.8 / 24.1 | 4.28 / 7.15 / 11.8 | 3.84 / 6.40 / 8.79 |
| warm.listApps | in-cell median | 90/90 | 90/90 | 4.30 | 3.40 | 504.3 | pass | 17.0 / 22.1 / 30.3 | 15.8 / 19.8 / 21.8 | 4.30 / 5.60 / 8.00 | 3.42 / 4.96 / 5.80 |
| setup.findWindow | – | 3/3 | 3/3 | 282.7 | 269.4 | – | not judged | 282.7 / 283.5 / 283.5 | 269.4 / 270.1 / 270.1 | 264.3 / 267.2 / 267.2 | 255.4 / 255.7 / 255.7 |
| bind.getApp | in-cell median | 3/3 | 3/3 | 536.8 | 119.1 | 1036.8 | pass | 554.2 / 570.5 / 570.5 | 136.5 / 167.0 / 167.0 | 536.8 / 545.3 / 545.3 | 119.1 / 150.0 / 150.0 |
| approval.elicitation | – | 3/3 | 3/3 | 45.3 | 21.2 | – | not judged | 45.3 / 50.2 / 50.2 | 21.2 / 27.1 / 27.1 | – | – |
| warm.getAXState | in-cell median | 90/90 | 90/90 | 493.8 | 83.7 | 993.8 | pass | 508.0 / 645.9 / 777.6 | 96.3 / 127.2 / 137.1 | 493.8 / 631.6 / 748.3 | 83.7 / 110.2 / 124.9 |
| warm.getScreenshot | in-cell median | 90/90 | 90/90 | 627.6 | 100.7 | 1127.6 | pass | 643.8 / 853.7 / 933.8 | 112.8 / 145.6 / 157.8 | 627.6 / 835.8 / 906.0 | 100.7 / 129.3 / 141.6 |
| task.act | in-cell median | 30/30 | 30/30 | 16715.3 | 4495.8 | 18386.8 | pass | 16729.7 / 17017.2 / 17116.9 | 4507.8 / 4541.7 / 4543.0 | 16715.3 / 17005.4 / 17096.0 | 4495.8 / 4529.1 / 4531.4 |
| task.verify | in-cell median | 30/30 | 30/30 | 565.2 | 179.2 | 1065.2 | pass | 578.6 / 897.1 / 923.8 | 197.3 / 236.3 / 239.0 | 565.2 / 877.6 / 902.8 | 179.2 / 214.7 / 220.9 |
| task.clear | in-cell median | 30/30 | 30/30 | 1353.4 | 303.1 | 1853.4 | pass | 1365.8 / 1506.7 / 1511.0 | 315.5 / 349.4 / 352.3 | 1353.4 / 1493.9 / 1497.8 | 303.1 / 333.7 / 338.1 |
| task.total | in-cell median | 30/30 | 30/30 | 18650.8 | 4981.1 | 20515.9 | pass | 18698.3 / 19140.6 / 19306.0 | 5024.8 / 5085.6 / 5102.5 | 18650.8 / 19094.4 / 19259.0 | 4981.1 / 5036.5 / 5056.0 |
| end_task | wall median | 3/3 | 3/3 | 2.90 | 3.10 | 502.9 | pass | 2.93 / 3.89 / 3.89 | 3.10 / 3.11 / 3.11 | – | – |
| setup.findTarget | – | 6/6 | 6/6 | 290.9 | 270.8 | – | not judged | 290.9 / 297.6 / 297.6 | 270.8 / 273.3 / 273.3 | 273.9 / 283.5 / 283.5 | 257.7 / 259.1 / 259.1 |

## Method cases

Outcomes are counted per sample (`n x` the outcome); wall and in-cell are median / p95 / max of the samples the harness ran, judged by the same rule on the basis shown.

| Method case | Baseline samples | Baseline outcomes | Candidate samples | Candidate outcomes | Baseline wall | Candidate wall | Baseline in-cell | Candidate in-cell | Basis | Limit | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|
| method.typeText | 3 | 3x {"outcome":"threw","error":"editable Paste did not insert text","target":"survived","inserted":null} | 3 | 3x {"outcome":"returned","error":null,"target":"survived","inserted":true} | 10237.5 / 10243.8 / 10243.8 | 71.6 / 82.0 / 82.0 | 10220.4 / 10225.6 / 10225.6 | 52.8 / 64.9 / 64.9 | in-cell median | 11242.4 | pass |
| method.paste | 3 | 3x {"outcome":"threw","error":"editable Paste did not insert text","target":"survived","inserted":null} | 3 | 3x {"outcome":"returned","error":null,"target":"survived","inserted":true} | 10236.5 / 10240.4 / 10240.4 | 64.7 / 78.1 / 78.1 | 10219.5 / 10219.7 / 10219.7 | 49.6 / 59.0 / 59.0 | in-cell median | 11241.5 | pass |
| method.paste.format | 3 | 3x {"outcome":"threw","error":"Linux paste supports only text format.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"Linux paste supports only text format.","target":"survived","inserted":null} | 16.5 / 17.4 / 17.4 | 16.8 / 23.3 / 23.3 | 0.10 / 0.10 / 0.10 | 0.10 / 0.14 / 0.14 | wall median | 516.5 | pass |
| method.setValue | 3 | 3x {"outcome":"threw","error":"setValue is unavailable on Linux; use click, pressKey, and typeText.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"setValue is unavailable on Linux; use click, pressKey, and typeText.","target":"survived","inserted":null} | 17.0 / 18.9 / 18.9 | 15.6 / 20.0 / 20.0 | 0.12 / 0.34 / 0.34 | 0.18 / 0.19 / 0.19 | wall median | 517.0 | pass |
| method.selectText | 3 | 3x {"outcome":"threw","error":"selectText is unavailable on Linux.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"selectText is unavailable on Linux.","target":"survived","inserted":null} | 18.5 / 28.3 / 28.3 | 12.7 / 26.6 / 26.6 | 0.14 / 0.19 / 0.19 | 0.19 / 0.20 / 0.20 | wall median | 518.5 | pass |
| method.scroll.pages | 3 | 3x {"outcome":"threw","error":"Linux scroll accepts { pixels }, not pages.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"Linux scroll accepts { pixels }, not pages.","target":"survived","inserted":null} | 16.5 / 24.8 / 24.8 | 15.0 / 22.1 / 22.1 | 0.12 / 0.13 / 0.13 | 0.18 / 0.19 / 0.19 | wall median | 516.5 | pass |

## Speed of the operations the engine answers (Acceptance 3's rule)

Judged by the in-cell time (#370). With at least 20 successful samples a side, the bootstrap 95% interval of cua's in-cell median minus the vendor engine's passes when its upper end is within the bound, max(5% of the vendor's median, 1 ms); with fewer, cua's in-cell median must be at most the vendor's (the median rule). The wall time is reported beside it by the same calls; its interval and label judge nothing, and only the wall backstop, cua's wall median at most the vendor's plus max(10%, 500 ms), can fail the operation on it (ruling 706).

| Operation | Samples (vendor / cua) | Vendor in-cell | cua in-cell | Interval of cua minus vendor, ms | Bound, ms | Label | Verdict | Vendor wall | cua wall | Wall interval, ms (unjudged) | Wall label (unjudged) | Wall backstop, ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| warm.getState | 90 / 90 | 4.28 | 3.84 | [-0.604, -0.189] | 1 | faster | pass | 18.6 | 17.9 | [-1.4, -0.168] | faster | 518.5, pass |
| warm.listApps | 90 / 90 | 4.30 | 3.42 | [-1.166, -0.647] | 1 | faster | pass | 17.0 | 15.8 | [-2.062, -0.258] | faster | 517.0, pass |
| bind.getApp | 3 / 3 | 536.8 | 119.1 | – | – | median rule | pass | 554.3 | 136.5 | – | – | 1054.2, pass |
| warm.getAXState | 90 / 90 | 493.8 | 83.7 | [-425.166, -399.715] | 24.69 | faster | pass | 508.0 | 96.3 | [-430.289, -401.641] | faster | 1008.0, pass |
| warm.getScreenshot | 90 / 90 | 627.6 | 100.7 | [-550.925, -508.045] | 31.38 | faster | pass | 643.8 | 112.8 | [-556.875, -512.151] | faster | 1143.8, pass |
| task.act | 30 / 30 | 16715.3 | 4495.8 | [-12265.744, -12190.445] | 835.77 | faster | pass | 16729.7 | 4507.8 | [-12269.245, -12195.161] | faster | 18402.6, pass |
| task.verify | 30 / 30 | 565.2 | 179.2 | [-422.966, -370.893] | 28.26 | faster | pass | 578.6 | 197.3 | [-422.59, -371.861] | faster | 1078.6, pass |
| task.clear | 30 / 30 | 1353.4 | 303.1 | [-1080.983, -1005.373] | 67.67 | faster | pass | 1365.8 | 315.5 | [-1084.388, -1004.202] | faster | 1865.8, pass |
| task.total | 30 / 30 | 18650.8 | 4981.1 | [-13752.426, -13612.577] | 932.54 | faster | pass | 18698.3 | 5024.8 | [-13756.589, -13619.898] | faster | 20568.1, pass |
| method.typeText | 3 / 3 | 10220.4 | 52.8 | – | – | median rule | pass | 10237.5 | 71.6 | – | – | 11261.3, pass |
| method.paste | 3 / 3 | 10219.5 | 49.6 | – | – | median rule | pass | 10236.5 | 64.7 | – | – | 11260.1, pass |

## Unproved: declared gaps, not passes

None: no series was left undetermined under a declared gap.

## Where cua's median is above the vendor engine's

The judged median: in-cell where the engine answers the operation (#370), else the wall time.

- cold.miss.initialize: cua 361.8 ms, vendor 358.0 ms (no engine answers it: judged by the tolerance alone)
- cold.miss.tools_list: cua 2.60 ms, vendor 2.40 ms (no engine answers it: judged by the tolerance alone)
- cold.hit.initialize: cua 252.8 ms, vendor 232.0 ms (no engine answers it: judged by the tolerance alone)
- method.paste.format: cua 16.8 ms, vendor 16.5 ms (no engine answers it: judged by the tolerance alone)
- end_task: cua 3.10 ms, vendor 2.90 ms (no engine answers it: judged by the tolerance alone)

## What differs, by design

- engine: vendor (answered: sky_linux_x64 of the run's runtime) -> cua (answered: cua-engine installed in the run's home)
- service: computer surface, answered by vendor -> computer surface, answered by cua

## Failures and notes

- method.typeText (pass): better: the method returned, its window survived and its text was read back
- method.paste (pass): better: the method returned, its window survived and its text was read back

## Problems

None: both sides are complete, attested and comparable.

Verdict: **PASS**
