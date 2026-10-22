# Native baseline comparison A: engine and service

| | Baseline | Candidate |
|---|---|---|
| REPL host | vendor | vendor |
| Engine | vendor (attested: vendor 26.924.1001281, build 26.928.40906-darwin-arm64) | cua (attested: cua 0.1.0, build 0c363f8f4512) |
| Approved engine | 0c363f8f4512 (cua 0.1.0, /Users/new/Library/Application Support/cua/engine/cua Engine.app) | 0c363f8f4512 (cua 0.1.0, /Users/new/Library/Application Support/cua/engine/cua Engine.app) |
| initialize answered by | rmcp 1.5.0 | rmcp 1.5.0 |
| Commit | 98f153b8e1fcad816dc61b70a35358d629b61969 | 98f153b8e1fcad816dc61b70a35358d629b61969 |
| device | mini | mini |
| release | 26.928.40906-darwin-arm64 | 26.928.40906-darwin-arm64 |
| hardware | Mac14,12, Apple M2 Pro, 16 GiB | Mac14,12, Apple M2 Pro, 16 GiB |
| os | macOS 27.0 (26A428) | macOS 27.0 (26A428) |
| display | 2560 x 1440 points at scale 2 (5120 x 2880 pixels) | 2560 x 1440 points at scale 2 (5120 x 2880 pixels) |
| service | computer surface, answered by vendor (helper: pinned runtime) | computer surface, answered by cua (helper: approved engine) |
| sandbox | scoped (platform default) | scoped (platform default) |
| plan | 5 cold, 30 warm, 10 tasks | 5 cold, 30 warm, 10 tasks |
| Runs | run-1, run-2, run-3 | run-1, run-2, run-3 |
| ssh.roundtrip median | 650.8 | 657.9 |

Rule (#117 comparison A, engine and service): the baseline runs `--host vendor --engine vendor`, the candidate `--host vendor --engine cua`; three complete, attested runs a side of one sitting covering the same plan, every attested field equal but engine, service (below). The engine is the one variable: cua's service loaded in the vendor trusted worker against the vendor's, on the vendor host. Per operation (method cases included), the candidate's judged median must be at most the baseline's plus max(10%, 500 ms), or faster, and it must succeed in no smaller share of its valid samples; the cold-connection phases that open the ssh pipe are judged net of each side's ssh.roundtrip median. ssh, approval, guard and setup operations are reported, not judged. Milliseconds; "OK" is successes over valid samples; wall and in-cell columns are median / p95 / max of successful samples.

| Operation | Basis | Baseline OK | Candidate OK | Baseline judged | Candidate judged | Limit | Verdict | Baseline wall | Candidate wall | Baseline in-cell | Candidate in-cell |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ssh.roundtrip | – | 15/15 | 15/15 | 650.8 | 657.9 | – | not judged | 650.8 / 1030.5 / 1030.5 | 657.9 / 1211.6 / 1211.6 | – | – |
| cold.miss.initialize | wall median net of ssh.roundtrip median | 6/6 | 6/6 | 398.3 | 253.5 | 898.3 | pass | 1049.1 / 1340.6 / 1340.6 | 911.4 / 997.8 / 997.8 | – | – |
| cold.miss.tools_list | wall median | 6/6 | 6/6 | 25.7 | 28.6 | 525.7 | pass | 25.7 / 132.1 / 132.1 | 28.6 / 70.6 / 70.6 | – | – |
| cold.miss.first_js | wall median | 6/6 | 6/6 | 426.3 | 318.1 | 926.3 | pass | 426.3 / 522.1 / 522.1 | 318.1 / 398.4 / 398.4 | 0.00 / 0.01 / 0.01 | 0.00 / 0.00 / 0.00 |
| cold.miss.total | wall median net of ssh.roundtrip median | 6/6 | 6/6 | 862.4 | 633.3 | 1362.4 | pass | 1513.2 / 1847.8 / 1847.8 | 1291.3 / 1346.0 / 1346.0 | – | – |
| cold.hit.initialize | wall median net of ssh.roundtrip median | 9/9 | 9/9 | 86.0 | 257.2 | 586.0 | pass | 736.8 / 1007.5 / 1007.5 | 915.1 / 993.5 / 993.5 | – | – |
| cold.hit.tools_list | wall median | 9/9 | 9/9 | 27.9 | 23.1 | 527.9 | pass | 27.9 / 107.1 / 107.1 | 23.1 / 69.4 / 69.4 | – | – |
| cold.hit.first_js | wall median | 9/9 | 9/9 | 579.9 | 523.8 | 1079.9 | pass | 579.9 / 733.6 / 733.6 | 523.8 / 826.4 / 826.4 | 0.00 / 0.00 / 0.00 | 0.00 / 0.01 / 0.01 |
| cold.hit.total | wall median net of ssh.roundtrip median | 9/9 | 9/9 | 682.3 | 811.5 | 1182.3 | pass | 1333.0 / 1769.9 / 1769.9 | 1469.4 / 1618.4 / 1618.4 | – | – |
| warm.noop | wall median | 90/90 | 90/90 | 35.4 | 40.3 | 535.4 | pass | 35.4 / 177.0 / 213.3 | 40.3 / 150.8 / 203.8 | 0.02 / 0.03 / 0.03 | 0.02 / 0.02 / 0.08 |
| warm.getState | wall median | 90/90 | 90/90 | 99.4 | 50.4 | 599.4 | pass | 99.4 / 214.3 / 925.2 | 50.4 / 184.8 / 573.2 | 32.4 / 38.5 / 868.7 | 3.87 / 20.2 / 515.8 |
| warm.listApps | wall median | 90/90 | 90/90 | 100.1 | 51.1 | 600.1 | pass | 100.1 / 192.7 / 209.5 | 51.1 / 166.8 / 177.4 | 32.2 / 37.7 / 42.8 | 3.68 / 4.53 / 5.10 |
| bind.getApp | wall median | 3/3 | 3/3 | 6803.7 | 6482.3 | 7484.1 | pass | 6803.7 / 6987.0 / 6987.0 | 6482.3 / 6545.3 / 6545.3 | 6637.7 / 6862.2 / 6862.2 | 6296.7 / 6404.6 / 6404.6 |
| approval.elicitation | – | 3/3 | 3/3 | 63.5 | 49.4 | – | not judged | 63.5 / 83.6 / 83.6 | 49.4 / 93.7 / 93.7 | – | – |
| warm.getAXState | wall median | 90/90 | 90/90 | 113.3 | 102.5 | 613.3 | pass | 113.3 / 212.0 / 267.1 | 102.5 / 206.0 / 274.7 | 55.7 / 88.2 / 93.4 | 50.5 / 67.2 / 77.1 |
| warm.getScreenshot | wall median | 90/90 | 90/90 | 110.9 | 103.6 | 610.9 | pass | 110.9 / 200.1 / 233.9 | 103.6 / 223.5 / 307.8 | 51.2 / 81.3 / 94.1 | 50.1 / 66.3 / 74.3 |
| task.act | wall median | 30/30 | 30/30 | 1119.8 | 859.0 | 1619.8 | pass | 1119.8 / 1312.5 / 1316.5 | 859.0 / 961.7 / 1148.1 | 968.7 / 1009.9 / 1049.7 | 735.3 / 845.0 / 850.3 |
| task.verify | wall median | 30/30 | 30/30 | 512.5 | 484.2 | 1012.5 | pass | 512.5 / 706.4 / 780.0 | 484.2 / 675.5 / 675.8 | 454.4 / 617.4 / 670.2 | 419.5 / 430.9 / 529.4 |
| task.close | wall median | 30/30 | 30/30 | 2664.4 | 1632.8 | 3164.4 | pass | 2664.4 / 2805.5 / 3148.5 | 1632.8 / 1928.6 / 1990.7 | 2595.0 / 2695.7 / 2988.3 | 1569.0 / 1733.0 / 1898.1 |
| task.total | wall median | 30/30 | 30/30 | 4263.0 | 3000.9 | 4763.0 | pass | 4263.0 / 4528.1 / 4663.4 | 3000.9 / 3523.1 / 3594.8 | 3992.0 / 4126.7 / 4351.5 | 2714.9 / 2886.9 / 3060.0 |
| end_task | wall median | 3/3 | 3/3 | 25.8 | 21.1 | 525.8 | pass | 25.8 / 41.0 / 41.0 | 21.1 / 21.7 / 21.7 | – | – |
| bind.getApp.retry | – | 3/3 | 3/3 | 1271.1 | 1107.3 | – | not judged | 1271.1 / 1351.9 / 1351.9 | 1107.3 / 1159.0 / 1159.0 | 1190.3 / 1320.8 / 1320.8 | 1041.5 / 1071.2 / 1071.2 |
| guard.scratch | – | 6/6 | 6/6 | 198.8 | 145.1 | – | not judged | 198.8 / 315.2 / 315.2 | 145.1 / 201.5 / 201.5 | 61.5 / 91.1 / 91.1 | 54.6 / 66.1 / 66.1 |
| setup.activate | – | 3/3 | 3/3 | 1512.7 | 1637.4 | – | not judged | 1512.7 / 1592.6 / 1592.6 | 1637.4 / 1739.5 / 1739.5 | – | – |
| setup.newDocument | – | 3/3 | 3/3 | 1709.9 | 909.7 | – | not judged | 1709.9 / 1954.4 / 1954.4 | 909.7 / 1017.5 / 1017.5 | 1586.7 / 1883.8 / 1883.8 | 840.7 / 875.2 / 875.2 |

## What differs, by design

- engine: vendor (attested: vendor 26.924.1001281, build 26.928.40906-darwin-arm64) -> cua (attested: cua 0.1.0, build 0c363f8f4512)
- service: computer surface, answered by vendor (helper: pinned runtime) -> computer surface, answered by cua (helper: approved engine)

## Failures and notes

- bind.getApp.retry (not judged): counted in bind.getApp, the first attempt plus the retry

## Problems

None: both sides are complete, attested and comparable.

Verdict: **PASS**
