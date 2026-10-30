# Native baseline comparison A: engine (Linux)

| | Baseline | Candidate |
|---|---|---|
| REPL host | cua | cua |
| Engine | vendor (answered: sky_linux_x64 of the run's runtime) | cua (answered: cua-engine named by --engine-bin /Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/native/linux-engine/target/release/cua-engine) |
| Approved engine | – | – |
| initialize answered by | cua-repl-host 0.5.0 | cua-repl-host 0.5.0 |
| Commit | 426e25f2cf3d44bef8d6db65ce6bba31f90781bd | 426e25f2cf3d44bef8d6db65ce6bba31f90781bd |
| device | cua-171 | cua-171 |
| release | 26.928.40906-linux-x64 | 26.928.40906-linux-x64 |
| hardware | vServer, x64, 8 CPUs, 15 GiB | vServer, x64, 8 CPUs, 15 GiB |
| os | Ubuntu 24.04.4 LTS (6.8.0-138-generic) | Ubuntu 24.04.4 LTS (6.8.0-138-generic) |
| display | 1280 x 800 points at scale 1 (1280 x 800 pixels) | 1280 x 800 points at scale 1 (1280 x 800 pixels) |
| service | computer surface, answered by vendor | computer surface, answered by vendor |
| sandbox | scoped (platform default) | scoped (platform default) |
| plan | 5 cold, 30 warm, 10 tasks | 5 cold, 30 warm, 10 tasks |
| Runs | run-1, run-2, run-3 | run-1, run-2, run-3 |
| ssh.roundtrip median | 288.8 | 292.2 |

Rule (#171 comparison A, engine (Linux)): the baseline runs `--host cua --engine vendor`, the candidate `--host cua --engine cua`; three complete, attested runs a side of one sitting covering the same plan, every attested field equal but engine (below). The engine is the one variable: the vendor engine against cua's, both driven by the vendor service in cua's own host, the only one Linux serves. Per operation (method cases included), the candidate's judged median must be at most the baseline's plus max(10%, 500 ms), or faster, and it must succeed in no smaller share of its valid samples; the cold-connection phases that open the ssh pipe are judged net of each side's ssh.roundtrip median. On an operation the engine answers (warm.getState, warm.listApps, bind.getApp, warm.getAXState, warm.getScreenshot, task.act, task.verify, task.clear, task.total, method.typeText, method.paste) the candidate's judged median must also be at most the baseline's (Acceptance 10), and every cua typeText and paste sample must return without an error, survive and read back its text (Plan of Work M2); the ordinary better-outcome rule accepts this improvement over the vendor engine's text failures, with no failure waived on cua. ssh, approval, guard and setup operations are reported, not judged. Milliseconds; "OK" is successes over valid samples; wall and in-cell columns are median / p95 / max of successful samples.

| Operation | Basis | Baseline OK | Candidate OK | Baseline judged | Candidate judged | Limit | Verdict | Baseline wall | Candidate wall | Baseline in-cell | Candidate in-cell |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ssh.roundtrip | – | 15/15 | 15/15 | 288.8 | 292.2 | – | not judged | 288.8 / 338.6 / 338.6 | 292.2 / 317.9 / 317.9 | – | – |
| cold.miss.initialize | wall median net of ssh.roundtrip median | 6/6 | 6/6 | 380.9 | 353.3 | 880.9 | pass | 669.7 / 692.0 / 692.0 | 645.6 / 684.4 / 684.4 | – | – |
| cold.miss.tools_list | wall median | 6/6 | 6/6 | 2.20 | 2.40 | 502.2 | pass | 2.21 / 3.65 / 3.65 | 2.43 / 3.13 / 3.13 | – | – |
| cold.miss.first_js | wall median | 6/6 | 6/6 | 370.5 | 369.1 | 870.5 | pass | 370.5 / 411.8 / 411.8 | 369.1 / 407.9 / 407.9 | 0.01 / 0.03 / 0.03 | 0.01 / 0.02 / 0.02 |
| cold.miss.total | wall median net of ssh.roundtrip median | 6/6 | 6/6 | 761.6 | 735.0 | 1261.6 | pass | 1050.3 / 1086.6 / 1086.6 | 1027.3 / 1050.1 / 1050.1 | – | – |
| cold.hit.initialize | wall median net of ssh.roundtrip median | 9/9 | 9/9 | 238.7 | 231.8 | 738.7 | pass | 527.4 / 561.0 / 561.0 | 524.0 / 580.0 / 580.0 | – | – |
| cold.hit.tools_list | wall median | 9/9 | 9/9 | 1.10 | 1.10 | 501.1 | pass | 1.10 / 1.59 / 1.59 | 1.15 / 1.59 / 1.59 | – | – |
| cold.hit.first_js | wall median | 9/9 | 9/9 | 511.4 | 501.9 | 1011.4 | pass | 511.4 / 572.9 / 572.9 | 501.9 / 549.7 / 549.7 | 0.01 / 0.08 / 0.08 | 0.01 / 0.04 / 0.04 |
| cold.hit.total | wall median net of ssh.roundtrip median | 9/9 | 9/9 | 734.1 | 733.9 | 1234.1 | pass | 1022.8 / 1130.1 / 1130.1 | 1026.1 / 1100.7 / 1100.7 | – | – |
| warm.noop | wall median | 90/90 | 90/90 | 14.1 | 13.8 | 514.1 | pass | 14.1 / 22.4 / 27.5 | 13.8 / 19.5 / 27.1 | 0.01 / 0.02 / 0.04 | 0.01 / 0.02 / 0.07 |
| warm.getState | wall median | 90/90 | 90/90 | 24.0 | 16.6 | 524.0 | pass | 24.0 / 31.8 / 55.5 | 16.6 / 23.3 / 27.6 | 9.32 / 15.5 / 27.0 | 3.66 / 5.95 / 10.4 |
| warm.listApps | wall median | 90/90 | 90/90 | 23.4 | 15.9 | 523.4 | pass | 23.4 / 35.8 / 41.1 | 15.9 / 20.1 / 24.1 | 9.47 / 16.1 / 22.0 | 3.54 / 4.11 / 7.47 |
| setup.findWindow | – | 3/3 | 3/3 | 285.9 | 275.9 | – | not judged | 285.9 / 303.4 / 303.4 | 275.9 / 282.6 / 282.6 | 273.2 / 289.5 / 289.5 | 258.6 / 259.7 / 259.7 |
| bind.getApp | wall median | 3/3 | 3/3 | 764.3 | 156.2 | 1264.3 | pass | 764.3 / 832.0 / 832.0 | 156.2 / 179.2 / 179.2 | 742.9 / 815.2 / 815.2 | 138.2 / 152.6 / 152.6 |
| approval.elicitation | – | 3/3 | 3/3 | 41.9 | 26.1 | – | not judged | 41.9 / 70.1 / 70.1 | 26.1 / 40.0 / 40.0 | – | – |
| warm.getAXState | wall median | 90/90 | 90/90 | 519.4 | 96.4 | 1019.4 | pass | 519.4 / 674.0 / 840.7 | 96.4 / 118.9 / 134.9 | 504.3 / 661.7 / 820.1 | 83.4 / 104.6 / 119.9 |
| warm.getScreenshot | wall median | 90/90 | 90/90 | 638.0 | 116.5 | 1138.0 | pass | 638.0 / 859.4 / 982.6 | 116.5 / 140.2 / 194.0 | 621.9 / 836.7 / 962.5 | 103.8 / 127.6 / 174.0 |
| task.act | wall median | 30/30 | 30/30 | 16953.5 | 8841.7 | 18648.9 | pass | 16953.5 / 17099.1 / 17110.2 | 8841.7 / 8875.8 / 8906.4 | 16940.8 / 17075.9 / 17098.1 | 8826.3 / 8862.9 / 8889.9 |
| task.verify | wall median | 30/30 | 30/30 | 583.2 | 189.3 | 1083.2 | pass | 583.2 / 712.3 / 811.7 | 189.3 / 227.5 / 230.1 | 571.6 / 693.7 / 797.6 | 174.2 / 213.8 / 216.2 |
| task.clear | wall median | 30/30 | 30/30 | 1315.0 | 519.7 | 1815.0 | pass | 1315.0 / 1440.6 / 1444.1 | 519.7 / 569.5 / 570.0 | 1302.6 / 1420.3 / 1431.1 | 505.5 / 549.9 / 556.2 |
| task.total | wall median | 30/30 | 30/30 | 18889.2 | 9554.0 | 20778.1 | pass | 18889.2 / 19094.9 / 19141.9 | 9554.0 / 9625.0 / 9642.7 | 18851.5 / 19047.1 / 19102.4 | 9509.4 / 9573.8 / 9595.3 |
| end_task | wall median | 3/3 | 3/3 | 2.90 | 3.00 | 502.9 | pass | 2.92 / 3.32 / 3.32 | 3.00 / 3.02 / 3.02 | – | – |
| setup.findTarget | – | 6/6 | 6/6 | 303.0 | 272.3 | – | not judged | 303.0 / 319.3 / 319.3 | 272.3 / 284.1 / 284.1 | 288.8 / 302.8 / 302.8 | 259.8 / 262.4 / 262.4 |

## Method cases

Outcomes are counted per sample (`n x` the outcome); wall is median / p95 / max of the samples the harness ran, judged by the same rule.

| Method case | Baseline samples | Baseline outcomes | Candidate samples | Candidate outcomes | Baseline wall | Candidate wall | Limit | Verdict |
|---|---|---|---|---|---|---|---|---|
| method.typeText | 3 | 3x {"outcome":"threw","error":"editable Paste did not insert text","target":"survived","inserted":null} | 3 | 3x {"outcome":"returned","error":null,"target":"survived","inserted":true} | 10236.0 / 10237.6 / 10237.6 | 169.4 / 172.7 / 172.7 | 11259.6 | pass |
| method.paste | 3 | 3x {"outcome":"threw","error":"editable Paste did not insert text","target":"survived","inserted":null} | 3 | 3x {"outcome":"returned","error":null,"target":"survived","inserted":true} | 10241.2 / 10246.6 / 10246.6 | 163.8 / 174.3 / 174.3 | 11265.3 | pass |
| method.paste.format | 3 | 3x {"outcome":"threw","error":"Linux paste supports only text format.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"Linux paste supports only text format.","target":"survived","inserted":null} | 14.8 / 16.8 / 16.8 | 20.0 / 22.4 / 22.4 | 514.8 | pass |
| method.setValue | 3 | 3x {"outcome":"threw","error":"setValue is unavailable on Linux; use click, pressKey, and typeText.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"setValue is unavailable on Linux; use click, pressKey, and typeText.","target":"survived","inserted":null} | 13.4 / 20.1 / 20.1 | 12.9 / 21.8 / 21.8 | 513.4 | pass |
| method.selectText | 3 | 3x {"outcome":"threw","error":"selectText is unavailable on Linux.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"selectText is unavailable on Linux.","target":"survived","inserted":null} | 17.9 / 19.9 / 19.9 | 14.2 / 20.5 / 20.5 | 517.9 | pass |
| method.scroll.pages | 3 | 3x {"outcome":"threw","error":"Linux scroll accepts { pixels }, not pages.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"Linux scroll accepts { pixels }, not pages.","target":"survived","inserted":null} | 13.3 / 20.2 / 20.2 | 13.4 / 17.2 / 17.2 | 513.3 | pass |

## Where cua's median is above the vendor engine's

- cold.miss.tools_list: cua 2.40 ms, vendor 2.20 ms (no engine answers it: judged by the tolerance alone)
- method.paste.format: cua 20.0 ms, vendor 14.8 ms (no engine answers it: judged by the tolerance alone)
- method.scroll.pages: cua 13.4 ms, vendor 13.3 ms (no engine answers it: judged by the tolerance alone)
- end_task: cua 3.00 ms, vendor 2.90 ms (no engine answers it: judged by the tolerance alone)

## What differs, by design

- engine: vendor (answered: sky_linux_x64 of the run's runtime) -> cua (answered: cua-engine named by --engine-bin /Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/native/linux-engine/target/release/cua-engine)

## Failures and notes

- method.typeText (pass): better: the method returned, its window survived and its text was read back
- method.paste (pass): better: the method returned, its window survived and its text was read back

## Problems

None: both sides are complete, attested and comparable.

Verdict: **PASS**
