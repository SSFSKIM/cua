# Native baseline comparison A: engine (Linux)

| | Baseline | Candidate |
|---|---|---|
| REPL host | cua | cua |
| Engine | vendor (answered: sky_linux_x64 of the run's runtime) | cua (answered: cua-engine installed in the run's home) |
| Approved engine | – | – |
| initialize answered by | cua-repl-host 0.5.0 | cua-repl-host 0.5.0 |
| Commit | 51f6b281692c47060a47399b72da363748aad7db | 51f6b281692c47060a47399b72da363748aad7db |
| device | cua-171 | cua-171 |
| release | 26.928.40906-linux-x64 | 26.928.40906-linux-x64 |
| hardware | vServer, x64, 8 CPUs, 15 GiB | vServer, x64, 8 CPUs, 15 GiB |
| os | Ubuntu 24.04.4 LTS (6.8.0-138-generic) | Ubuntu 24.04.4 LTS (6.8.0-138-generic) |
| display | 1280 x 800 points at scale 1 (1280 x 800 pixels) | 1280 x 800 points at scale 1 (1280 x 800 pixels) |
| service | computer surface, answered by vendor | computer surface, answered by cua |
| sandbox | scoped (platform default) | scoped (platform default) |
| plan | 5 cold, 30 warm, 10 tasks | 5 cold, 30 warm, 10 tasks |
| Runs | run-1, run-2, run-3 | run-1, run-2, run-3 |
| ssh.roundtrip median | 324.4 | 304.6 |

Rule (#171 comparison A, engine (Linux)): the baseline runs `--host cua --engine vendor`, the candidate `--host cua --engine cua`; three complete, attested runs a side of one sitting covering the same plan, every attested field equal but engine, service (below). The engine and its service are the variable: the vendor engine behind the vendor service against cua's engine behind cua's service, both in cua's own host, the only one Linux serves. Per operation (method cases included), the candidate's judged median must be at most the baseline's plus max(10%, 500 ms), or faster, and it must succeed in no smaller share of its valid samples; the cold-connection phases that open the ssh pipe are judged net of each side's ssh.roundtrip median. On an operation the engine answers (warm.getState, warm.listApps, bind.getApp, warm.getAXState, warm.getScreenshot, task.act, task.verify, task.clear, task.total, method.typeText, method.paste) the candidate is judged by the in-cell time (#370), the cell's own call through the service to the engine, what the engines change; the wall time, which adds the MCP transport and the REPL host both lanes share, is reported beside it and judged only by a gross wall backstop: the candidate's wall median above the baseline's plus max(10%, 500 ms) fails the operation (ruling 706), and the backstop never passes anything. Its speed is also judged by Acceptance 3's rule (Acceptance 10): with at least 20 samples a side, the upper end of the bootstrap 95% interval of its in-cell median minus the baseline's must be within max(5% of the baseline's median, 1 ms); with fewer, its in-cell median must be at most the baseline's, and every cua typeText and paste sample must return without an error, survive and read back its text (Plan of Work M2); the ordinary better-outcome rule accepts this improvement over the vendor engine's text failures, with no failure waived on cua. ssh, approval, guard and setup operations are reported, not judged. Milliseconds; "OK" is successes over valid samples; wall and in-cell columns are median / p95 / max of successful samples.

| Operation | Basis | Baseline OK | Candidate OK | Baseline judged | Candidate judged | Limit | Verdict | Baseline wall | Candidate wall | Baseline in-cell | Candidate in-cell |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ssh.roundtrip | – | 15/15 | 15/15 | 324.4 | 304.6 | – | not judged | 324.4 / 348.0 / 348.0 | 304.6 / 339.3 / 339.3 | – | – |
| cold.miss.initialize | wall median net of ssh.roundtrip median | 6/6 | 6/6 | 338.4 | 373.5 | 838.4 | pass | 662.8 / 717.4 / 717.4 | 678.1 / 692.4 / 692.4 | – | – |
| cold.miss.tools_list | wall median | 6/6 | 6/6 | 2.30 | 2.70 | 502.3 | pass | 2.31 / 3.07 / 3.07 | 2.68 / 2.79 / 2.79 | – | – |
| cold.miss.first_js | wall median | 6/6 | 6/6 | 378.9 | 338.5 | 878.9 | pass | 378.9 / 431.4 / 431.4 | 338.5 / 343.4 / 343.4 | 0.01 / 0.02 / 0.02 | 0.01 / 0.03 / 0.03 |
| cold.miss.total | wall median net of ssh.roundtrip median | 6/6 | 6/6 | 742.4 | 707.2 | 1242.4 | pass | 1066.7 / 1104.4 / 1104.4 | 1011.8 / 1035.4 / 1035.4 | – | – |
| cold.hit.initialize | wall median net of ssh.roundtrip median | 9/9 | 9/9 | 248.1 | 244.6 | 748.1 | pass | 572.4 / 591.3 / 591.3 | 549.2 / 610.3 / 610.3 | – | – |
| cold.hit.tools_list | wall median | 9/9 | 9/9 | 1.20 | 1.30 | 501.2 | pass | 1.17 / 1.52 / 1.52 | 1.30 / 1.96 / 1.96 | – | – |
| cold.hit.first_js | wall median | 9/9 | 9/9 | 492.5 | 475.6 | 992.5 | pass | 492.5 / 554.9 / 554.9 | 475.6 / 578.2 / 578.2 | 0.01 / 0.02 / 0.02 | 0.01 / 0.08 / 0.08 |
| cold.hit.total | wall median net of ssh.roundtrip median | 9/9 | 9/9 | 733.9 | 714.8 | 1233.9 | pass | 1058.3 / 1147.5 / 1147.5 | 1019.4 / 1190.2 / 1190.2 | – | – |
| warm.noop | wall median | 90/90 | 90/90 | 15.1 | 14.7 | 515.1 | pass | 15.1 / 22.4 / 33.7 | 14.7 / 23.5 / 35.5 | 0.01 / 0.03 / 0.05 | 0.01 / 0.03 / 0.05 |
| warm.getState | in-cell median | 90/90 | 90/90 | 4.60 | 3.60 | 504.6 | pass | 19.2 / 27.4 / 34.7 | 17.5 / 21.4 / 26.3 | 4.64 / 6.66 / 23.5 | 3.64 / 5.53 / 7.64 |
| warm.listApps | in-cell median | 90/90 | 90/90 | 4.00 | 3.40 | 504.0 | pass | 18.0 / 24.3 / 28.5 | 16.6 / 21.3 / 25.7 | 3.96 / 6.97 / 7.42 | 3.41 / 5.14 / 5.91 |
| setup.findWindow | – | 3/3 | 3/3 | 280.5 | 271.3 | – | not judged | 280.5 / 284.7 / 284.7 | 271.3 / 276.5 / 276.5 | 263.0 / 269.9 / 269.9 | 255.9 / 256.9 / 256.9 |
| bind.getApp | in-cell median | 3/3 | 3/3 | 487.5 | 110.2 | 987.5 | pass | 504.6 / 962.5 / 962.5 | 123.8 / 167.5 / 167.5 | 487.5 / 939.9 / 939.9 | 110.2 / 145.3 / 145.3 |
| approval.elicitation | – | 3/3 | 3/3 | 36.0 | 22.9 | – | not judged | 36.0 / 52.9 / 52.9 | 22.9 / 29.7 / 29.7 | – | – |
| warm.getAXState | in-cell median | 90/90 | 90/90 | 531.0 | 76.3 | 1031.0 | pass | 546.9 / 710.9 / 779.3 | 89.4 / 116.1 / 134.0 | 531.0 / 695.6 / 764.8 | 76.3 / 100.5 / 117.4 |
| warm.getScreenshot | in-cell median | 90/90 | 90/90 | 643.3 | 104.9 | 1143.3 | pass | 663.7 / 850.5 / 1001.7 | 117.3 / 140.6 / 170.6 | 643.3 / 830.5 / 979.1 | 104.9 / 125.5 / 153.8 |
| task.act | in-cell median | 30/30 | 30/30 | 16764.1 | 4485.0 | 18440.5 | pass | 16779.3 / 16984.6 / 16991.1 | 4498.5 / 4530.1 / 4530.6 | 16764.1 / 16963.4 / 16975.9 | 4485.0 / 4517.1 / 4518.3 |
| task.verify | in-cell median | 30/30 | 30/30 | 574.8 | 181.6 | 1074.8 | pass | 590.0 / 814.8 / 867.3 | 197.3 / 226.6 / 232.0 | 574.8 / 792.6 / 848.1 | 181.6 / 213.3 / 216.3 |
| task.clear | in-cell median | 30/30 | 30/30 | 1321.9 | 299.0 | 1821.9 | pass | 1337.6 / 1547.4 / 1604.8 | 311.1 / 351.0 / 354.6 | 1321.9 / 1533.2 / 1592.8 | 299.0 / 331.0 / 338.5 |
| task.total | in-cell median | 30/30 | 30/30 | 18678.5 | 4977.6 | 20546.4 | pass | 18726.0 / 19145.3 / 19251.3 | 5017.6 / 5066.5 / 5090.2 | 18678.5 / 19093.7 / 19210.7 | 4977.6 / 5017.7 / 5049.7 |
| end_task | wall median | 3/3 | 3/3 | 2.80 | 3.10 | 502.8 | pass | 2.77 / 3.44 / 3.44 | 3.14 / 3.25 / 3.25 | – | – |
| setup.findTarget | – | 6/6 | 6/6 | 287.8 | 271.8 | – | not judged | 287.8 / 297.8 / 297.8 | 271.8 / 277.3 / 277.3 | 274.1 / 283.9 / 283.9 | 257.8 / 261.1 / 261.1 |

## Method cases

Outcomes are counted per sample (`n x` the outcome); wall and in-cell are median / p95 / max of the samples the harness ran, judged by the same rule on the basis shown.

| Method case | Baseline samples | Baseline outcomes | Candidate samples | Candidate outcomes | Baseline wall | Candidate wall | Baseline in-cell | Candidate in-cell | Basis | Limit | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|
| method.typeText | 3 | 3x {"outcome":"threw","error":"editable Paste did not insert text","target":"survived","inserted":null} | 3 | 3x {"outcome":"returned","error":null,"target":"survived","inserted":true} | 10234.8 / 10235.2 / 10235.2 | 60.4 / 65.5 / 65.5 | 10221.9 / 10222.3 / 10222.3 | 49.3 / 54.5 / 54.5 | in-cell median | 11244.1 | pass |
| method.paste | 3 | 3x {"outcome":"threw","error":"editable Paste did not insert text","target":"survived","inserted":null} | 3 | 3x {"outcome":"returned","error":null,"target":"survived","inserted":true} | 10233.8 / 10240.1 / 10240.1 | 60.6 / 63.3 / 63.3 | 10221.1 / 10226.9 / 10226.9 | 48.9 / 52.2 / 52.2 | in-cell median | 11243.2 | pass |
| method.paste.format | 3 | 3x {"outcome":"threw","error":"Linux paste supports only text format.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"Linux paste supports only text format.","target":"survived","inserted":null} | 13.3 / 13.5 / 13.5 | 16.9 / 20.0 / 20.0 | 0.08 / 0.09 / 0.09 | 0.08 / 0.15 / 0.15 | wall median | 513.3 | pass |
| method.setValue | 3 | 3x {"outcome":"threw","error":"setValue is unavailable on Linux; use click, pressKey, and typeText.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"setValue is unavailable on Linux; use click, pressKey, and typeText.","target":"survived","inserted":null} | 14.3 / 20.5 / 20.5 | 14.3 / 21.8 / 21.8 | 0.14 / 0.19 / 0.19 | 0.17 / 0.23 / 0.23 | wall median | 514.3 | pass |
| method.selectText | 3 | 3x {"outcome":"threw","error":"selectText is unavailable on Linux.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"selectText is unavailable on Linux.","target":"survived","inserted":null} | 13.5 / 22.0 / 22.0 | 13.9 / 20.4 / 20.4 | 0.16 / 0.17 / 0.17 | 0.11 / 0.11 / 0.11 | wall median | 513.5 | pass |
| method.scroll.pages | 3 | 3x {"outcome":"threw","error":"Linux scroll accepts { pixels }, not pages.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"Linux scroll accepts { pixels }, not pages.","target":"survived","inserted":null} | 17.0 / 21.6 / 21.6 | 13.0 / 21.6 / 21.6 | 0.20 / 0.29 / 0.29 | 0.18 / 0.19 / 0.19 | wall median | 517.0 | pass |

## Speed of the operations the engine answers (Acceptance 3's rule)

Judged by the in-cell time (#370). With at least 20 successful samples a side, the bootstrap 95% interval of cua's in-cell median minus the vendor engine's passes when its upper end is within the bound, max(5% of the vendor's median, 1 ms); with fewer, cua's in-cell median must be at most the vendor's (the median rule). The wall time is reported beside it by the same calls; its interval and label judge nothing, and only the wall backstop, cua's wall median at most the vendor's plus max(10%, 500 ms), can fail the operation on it (ruling 706).

| Operation | Samples (vendor / cua) | Vendor in-cell | cua in-cell | Interval of cua minus vendor, ms | Bound, ms | Label | Verdict | Vendor wall | cua wall | Wall interval, ms (unjudged) | Wall label (unjudged) | Wall backstop, ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| warm.getState | 90 / 90 | 4.64 | 3.64 | [-1.31, -0.732] | 1 | faster | pass | 19.2 | 17.5 | [-2.417, -0.961] | faster | 519.2, pass |
| warm.listApps | 90 / 90 | 3.96 | 3.41 | [-0.89, -0.372] | 1 | faster | pass | 18.0 | 16.6 | [-2.373, -0.468] | faster | 518.0, pass |
| bind.getApp | 3 / 3 | 487.5 | 110.2 | – | – | median rule | pass | 504.6 | 123.8 | – | – | 1004.6, pass |
| warm.getAXState | 90 / 90 | 531.0 | 76.3 | [-470.643, -431.995] | 26.55 | faster | pass | 546.9 | 89.4 | [-472.262, -432.639] | faster | 1046.9, pass |
| warm.getScreenshot | 90 / 90 | 643.3 | 104.9 | [-559.598, -517.663] | 32.17 | faster | pass | 663.7 | 117.3 | [-563.705, -521.304] | faster | 1163.7, pass |
| task.act | 30 / 30 | 16764.1 | 4485.0 | [-12302.606, -12228.957] | 838.21 | faster | pass | 16779.3 | 4498.5 | [-12305.838, -12229.686] | faster | 18457.3, pass |
| task.verify | 30 / 30 | 574.8 | 181.6 | [-434.246, -372.661] | 28.74 | faster | pass | 590.0 | 197.3 | [-435.934, -372.489] | faster | 1090.0, pass |
| task.clear | 30 / 30 | 1321.9 | 299.0 | [-1056.171, -989.057] | 66.09 | faster | pass | 1337.6 | 311.1 | [-1061.062, -991.809] | faster | 1837.6, pass |
| task.total | 30 / 30 | 18678.5 | 4977.6 | [-13783.195, -13635.148] | 933.93 | faster | pass | 18726.0 | 5017.6 | [-13787.631, -13640.595] | faster | 20598.6, pass |
| method.typeText | 3 / 3 | 10221.9 | 49.3 | – | – | median rule | pass | 10234.8 | 60.4 | – | – | 11258.3, pass |
| method.paste | 3 / 3 | 10221.1 | 48.9 | – | – | median rule | pass | 10233.9 | 60.6 | – | – | 11257.2, pass |

## Unproved: declared gaps, not passes

None: no series was left undetermined under a declared gap.

## Where cua's median is above the vendor engine's

The judged median: in-cell where the engine answers the operation (#370), else the wall time.

- cold.miss.initialize: cua 373.5 ms, vendor 338.4 ms (no engine answers it: judged by the tolerance alone)
- cold.miss.tools_list: cua 2.70 ms, vendor 2.30 ms (no engine answers it: judged by the tolerance alone)
- cold.hit.tools_list: cua 1.30 ms, vendor 1.20 ms (no engine answers it: judged by the tolerance alone)
- method.paste.format: cua 16.9 ms, vendor 13.3 ms (no engine answers it: judged by the tolerance alone)
- method.selectText: cua 13.9 ms, vendor 13.5 ms (no engine answers it: judged by the tolerance alone)
- end_task: cua 3.10 ms, vendor 2.80 ms (no engine answers it: judged by the tolerance alone)

## What differs, by design

- engine: vendor (answered: sky_linux_x64 of the run's runtime) -> cua (answered: cua-engine installed in the run's home)
- service: computer surface, answered by vendor -> computer surface, answered by cua

## Failures and notes

- method.typeText (pass): better: the method returned, its window survived and its text was read back
- method.paste (pass): better: the method returned, its window survived and its text was read back

## Problems

None: both sides are complete, attested and comparable.

Verdict: **PASS**
