# Native baseline comparison A: engine (Linux)

| | Baseline | Candidate |
|---|---|---|
| REPL host | cua | cua |
| Engine | vendor (answered: sky_linux_x64 of the run's runtime) | cua (answered: cua-engine named by --engine-bin /Users/new/.local/share/cua-171/task19/engine/cua-engine) |
| Approved engine | – | – |
| initialize answered by | cua-repl-host 0.5.0 | cua-repl-host 0.5.0 |
| Commit | 5e4393248fb4fe863c4bf954872e48704acabe8d | 5e4393248fb4fe863c4bf954872e48704acabe8d |
| device | cua-171 | cua-171 |
| release | 26.928.40906-linux-x64 | 26.928.40906-linux-x64 |
| hardware | vServer, x64, 8 CPUs, 15 GiB | vServer, x64, 8 CPUs, 15 GiB |
| os | Ubuntu 24.04.4 LTS (6.8.0-138-generic) | Ubuntu 24.04.4 LTS (6.8.0-138-generic) |
| display | 1280 x 800 points at scale 1 (1280 x 800 pixels) | 1280 x 800 points at scale 1 (1280 x 800 pixels) |
| service | computer surface, answered by vendor | computer surface, answered by cua |
| sandbox | scoped (platform default) | scoped (platform default) |
| plan | 5 cold, 30 warm, 10 tasks | 5 cold, 30 warm, 10 tasks |
| Runs | run-1, run-2, run-3 | run-1, run-2, run-3 |
| ssh.roundtrip median | 285.0 | 300.5 |

Rule (#171 comparison A, engine (Linux)): the baseline runs `--host cua --engine vendor`, the candidate `--host cua --engine cua`; three complete, attested runs a side of one sitting covering the same plan, every attested field equal but engine, service (below). The engine and its service are the variable: the vendor engine behind the vendor service against cua's engine behind cua's service, both in cua's own host, the only one Linux serves. Per operation (method cases included), the candidate's judged median must be at most the baseline's plus max(10%, 500 ms), or faster, and it must succeed in no smaller share of its valid samples; the cold-connection phases that open the ssh pipe are judged net of each side's ssh.roundtrip median. On an operation the engine answers (warm.getState, warm.listApps, bind.getApp, warm.getAXState, warm.getScreenshot, task.act, task.verify, task.clear, task.total, method.typeText, method.paste) the candidate's judged median must also be at most the baseline's (Acceptance 10), and every cua typeText and paste sample must return without an error, survive and read back its text (Plan of Work M2); the ordinary better-outcome rule accepts this improvement over the vendor engine's text failures, with no failure waived on cua. ssh, approval, guard and setup operations are reported, not judged. Milliseconds; "OK" is successes over valid samples; wall and in-cell columns are median / p95 / max of successful samples.

| Operation | Basis | Baseline OK | Candidate OK | Baseline judged | Candidate judged | Limit | Verdict | Baseline wall | Candidate wall | Baseline in-cell | Candidate in-cell |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ssh.roundtrip | – | 15/15 | 15/15 | 285.0 | 300.5 | – | not judged | 285.0 / 316.0 / 316.0 | 300.5 / 345.4 / 345.4 | – | – |
| cold.miss.initialize | wall median net of ssh.roundtrip median | 6/6 | 6/6 | 352.7 | 377.3 | 852.7 | pass | 637.7 / 671.9 / 671.9 | 677.8 / 722.4 / 722.4 | – | – |
| cold.miss.tools_list | wall median | 6/6 | 6/6 | 2.50 | 2.60 | 502.5 | pass | 2.53 / 2.99 / 2.99 | 2.56 / 2.87 / 2.87 | – | – |
| cold.miss.first_js | wall median | 6/6 | 6/6 | 360.6 | 348.4 | 860.6 | pass | 360.6 / 396.4 / 396.4 | 348.4 / 381.6 / 381.6 | 0.01 / 0.02 / 0.02 | 0.02 / 0.03 / 0.03 |
| cold.miss.total | wall median net of ssh.roundtrip median | 6/6 | 6/6 | 717.2 | 728.4 | 1217.2 | pass | 1002.2 / 1040.7 / 1040.7 | 1028.8 / 1106.8 / 1106.8 | – | – |
| cold.hit.initialize | wall median net of ssh.roundtrip median | 9/9 | 9/9 | 242.8 | 223.5 | 742.8 | pass | 527.8 / 558.5 / 558.5 | 524.0 / 536.8 / 536.8 | – | – |
| cold.hit.tools_list | wall median | 9/9 | 9/9 | 1.20 | 1.10 | 501.2 | pass | 1.24 / 1.94 / 1.94 | 1.11 / 1.62 / 1.62 | – | – |
| cold.hit.first_js | wall median | 9/9 | 9/9 | 495.9 | 430.8 | 995.9 | pass | 495.9 / 550.2 / 550.2 | 430.8 / 454.5 / 454.5 | 0.01 / 0.03 / 0.03 | 0.01 / 0.06 / 0.06 |
| cold.hit.total | wall median net of ssh.roundtrip median | 9/9 | 9/9 | 756.2 | 652.4 | 1256.2 | pass | 1041.2 / 1083.2 / 1083.2 | 952.8 / 987.8 / 987.8 | – | – |
| warm.noop | wall median | 90/90 | 90/90 | 13.9 | 14.2 | 513.9 | pass | 13.9 / 19.9 / 24.0 | 14.2 / 21.3 / 24.3 | 0.01 / 0.02 / 0.03 | 0.01 / 0.03 / 0.07 |
| warm.getState | wall median | 90/90 | 90/90 | 22.0 | 17.4 | 522.0 | pass | 22.0 / 27.5 / 34.1 | 17.4 / 20.7 / 22.5 | 8.84 / 12.9 / 18.1 | 3.78 / 5.20 / 7.10 |
| warm.listApps | wall median | 90/90 | 90/90 | 21.4 | 17.2 | 521.4 | pass | 21.4 / 31.0 / 38.6 | 17.2 / 19.5 / 21.2 | 8.36 / 14.9 / 19.8 | 3.82 / 4.71 / 5.42 |
| setup.findWindow | – | 3/3 | 3/3 | 287.9 | 272.8 | – | not judged | 287.9 / 303.1 / 303.1 | 272.8 / 277.2 / 277.2 | 274.9 / 285.7 / 285.7 | 258.3 / 258.6 / 258.6 |
| bind.getApp | wall median | 3/3 | 3/3 | 563.5 | 147.0 | 1063.5 | pass | 563.5 / 662.2 / 662.2 | 147.0 / 158.4 / 158.4 | 545.2 / 634.3 / 634.3 | 127.2 / 140.1 / 140.1 |
| approval.elicitation | – | 3/3 | 3/3 | 58.4 | 29.9 | – | not judged | 58.4 / 75.0 / 75.0 | 29.9 / 30.2 / 30.2 | – | – |
| warm.getAXState | wall median | 90/90 | 90/90 | 510.9 | 92.2 | 1010.9 | pass | 510.9 / 617.3 / 645.7 | 92.2 / 112.2 / 138.5 | 497.3 / 602.4 / 629.8 | 78.7 / 96.6 / 115.3 |
| warm.getScreenshot | wall median | 90/90 | 90/90 | 648.9 | 113.2 | 1148.9 | pass | 648.9 / 873.4 / 1000.8 | 113.2 / 140.1 / 154.6 | 631.9 / 849.3 / 978.8 | 101.6 / 124.3 / 138.7 |
| task.act | wall median | 30/30 | 30/30 | 16981.5 | 8829.9 | 18679.7 | pass | 16981.5 / 17114.5 / 17140.0 | 8829.9 / 8869.0 / 8871.9 | 16968.1 / 17094.2 / 17123.7 | 8817.0 / 8850.4 / 8851.1 |
| task.verify | wall median | 30/30 | 30/30 | 590.1 | 186.3 | 1090.1 | pass | 590.1 / 833.1 / 913.3 | 186.3 / 221.0 / 224.4 | 573.2 / 819.3 / 891.0 | 173.4 / 203.5 / 207.4 |
| task.clear | wall median | 30/30 | 30/30 | 1343.6 | 517.4 | 1843.6 | pass | 1343.6 / 1469.7 / 1595.9 | 517.4 / 545.4 / 566.4 | 1329.3 / 1458.3 / 1581.0 | 505.5 / 532.7 / 552.9 |
| task.total | wall median | 30/30 | 30/30 | 18921.6 | 9540.6 | 20813.8 | pass | 18921.6 / 19226.9 / 19271.0 | 9540.6 / 9603.3 / 9609.5 | 18881.6 / 19180.6 / 19213.8 | 9498.7 / 9557.2 / 9563.0 |
| end_task | wall median | 3/3 | 3/3 | 2.90 | 4.70 | 502.9 | pass | 2.88 / 3.24 / 3.24 | 4.74 / 4.77 / 4.77 | – | – |
| setup.findTarget | – | 6/6 | 6/6 | 296.5 | 271.9 | – | not judged | 296.5 / 319.8 / 319.8 | 271.9 / 274.3 / 274.3 | 282.9 / 307.3 / 307.3 | 258.3 / 259.7 / 259.7 |

## Method cases

Outcomes are counted per sample (`n x` the outcome); wall is median / p95 / max of the samples the harness ran, judged by the same rule.

| Method case | Baseline samples | Baseline outcomes | Candidate samples | Candidate outcomes | Baseline wall | Candidate wall | Limit | Verdict |
|---|---|---|---|---|---|---|---|---|
| method.typeText | 3 | 3x {"outcome":"threw","error":"editable Paste did not insert text","target":"survived","inserted":null} | 3 | 3x {"outcome":"returned","error":null,"target":"survived","inserted":true} | 10237.7 / 10252.5 / 10252.5 | 168.2 / 177.0 / 177.0 | 11261.5 | pass |
| method.paste | 3 | 3x {"outcome":"threw","error":"editable Paste did not insert text","target":"survived","inserted":null} | 3 | 3x {"outcome":"returned","error":null,"target":"survived","inserted":true} | 10235.5 / 10237.6 / 10237.6 | 165.8 / 169.7 / 169.7 | 11259.1 | pass |
| method.paste.format | 3 | 3x {"outcome":"threw","error":"Linux paste supports only text format.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"Linux paste supports only text format.","target":"survived","inserted":null} | 13.4 / 13.7 / 13.7 | 13.9 / 17.8 / 17.8 | 513.4 | pass |
| method.setValue | 3 | 3x {"outcome":"threw","error":"setValue is unavailable on Linux; use click, pressKey, and typeText.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"setValue is unavailable on Linux; use click, pressKey, and typeText.","target":"survived","inserted":null} | 14.0 / 14.4 / 14.4 | 13.4 / 15.6 / 15.6 | 514.0 | pass |
| method.selectText | 3 | 3x {"outcome":"threw","error":"selectText is unavailable on Linux.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"selectText is unavailable on Linux.","target":"survived","inserted":null} | 12.2 / 13.8 / 13.8 | 13.4 / 21.0 / 21.0 | 512.2 | pass |
| method.scroll.pages | 3 | 3x {"outcome":"threw","error":"Linux scroll accepts { pixels }, not pages.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"Linux scroll accepts { pixels }, not pages.","target":"survived","inserted":null} | 14.6 / 16.6 / 16.6 | 19.0 / 21.1 / 21.1 | 514.6 | pass |

## Where cua's median is above the vendor engine's

- cold.miss.initialize: cua 377.3 ms, vendor 352.7 ms (no engine answers it: judged by the tolerance alone)
- cold.miss.tools_list: cua 2.60 ms, vendor 2.50 ms (no engine answers it: judged by the tolerance alone)
- cold.miss.total: cua 728.4 ms, vendor 717.2 ms (no engine answers it: judged by the tolerance alone)
- warm.noop: cua 14.2 ms, vendor 13.9 ms (no engine answers it: judged by the tolerance alone)
- method.paste.format: cua 13.9 ms, vendor 13.4 ms (no engine answers it: judged by the tolerance alone)
- method.selectText: cua 13.5 ms, vendor 12.2 ms (no engine answers it: judged by the tolerance alone)
- method.scroll.pages: cua 19.0 ms, vendor 14.6 ms (no engine answers it: judged by the tolerance alone)
- end_task: cua 4.70 ms, vendor 2.90 ms (no engine answers it: judged by the tolerance alone)

## What differs, by design

- engine: vendor (answered: sky_linux_x64 of the run's runtime) -> cua (answered: cua-engine named by --engine-bin /Users/new/.local/share/cua-171/task19/engine/cua-engine)
- service: computer surface, answered by vendor -> computer surface, answered by cua

## Failures and notes

- method.typeText (pass): better: the method returned, its window survived and its text was read back
- method.paste (pass): better: the method returned, its window survived and its text was read back

## Problems

None: both sides are complete, attested and comparable.

Verdict: **PASS**
