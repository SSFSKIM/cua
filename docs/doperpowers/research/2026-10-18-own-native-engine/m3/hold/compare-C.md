# Native baseline comparison C: end to end

| | Baseline | Candidate |
|---|---|---|
| REPL host | vendor | cua |
| Engine | vendor (attested: vendor 26.924.1001281, build 26.928.40906-darwin-arm64) | cua (attested: cua 0.1.0, build 0c363f8f4512) |
| Approved engine | 0c363f8f4512 (cua 0.1.0, /Users/new/Library/Application Support/cua/engine/cua Engine.app) | 0c363f8f4512 (cua 0.1.0, /Users/new/Library/Application Support/cua/engine/cua Engine.app) |
| initialize answered by | rmcp 1.5.0 | cua-repl-host 0.5.0 |
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
| ssh.roundtrip median | 650.8 | 671.3 |

Rule (#117 comparison C, end to end): the baseline runs `--host vendor --engine vendor`, the candidate `--host cua --engine cua`; three complete, attested runs a side of one sitting covering the same plan, every attested field equal but host, sandbox, engine, service (below). The product verdict: host and engine are two variables at once, so a regression here is located by A and B, not by C. Per operation (method cases included), the candidate's judged median must be at most the baseline's plus max(10%, 500 ms), or faster, and it must succeed in no smaller share of its valid samples; the cold-connection phases that open the ssh pipe are judged net of each side's ssh.roundtrip median. ssh, approval, guard and setup operations are reported, not judged. Milliseconds; "OK" is successes over valid samples; wall and in-cell columns are median / p95 / max of successful samples.

| Operation | Basis | Baseline OK | Candidate OK | Baseline judged | Candidate judged | Limit | Verdict | Baseline wall | Candidate wall | Baseline in-cell | Candidate in-cell |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ssh.roundtrip | – | 15/15 | 15/15 | 650.8 | 671.3 | – | not judged | 650.8 / 1030.5 / 1030.5 | 671.3 / 818.7 / 818.7 | – | – |
| cold.miss.initialize | wall median net of ssh.roundtrip median | 6/6 | 6/6 | 398.3 | 299.6 | 898.3 | pass | 1049.1 / 1340.6 / 1340.6 | 970.9 / 1153.3 / 1153.3 | – | – |
| cold.miss.tools_list | wall median | 6/6 | 6/6 | 25.7 | 34.5 | 525.7 | pass | 25.7 / 132.1 / 132.1 | 34.5 / 135.8 / 135.8 | – | – |
| cold.miss.first_js | wall median | 6/6 | 6/6 | 426.3 | 300.2 | 926.3 | pass | 426.3 / 522.1 / 522.1 | 300.2 / 315.1 / 315.1 | 0.00 / 0.01 / 0.01 | 0.00 / 0.01 / 0.01 |
| cold.miss.total | wall median net of ssh.roundtrip median | 6/6 | 6/6 | 862.4 | 670.8 | 1362.4 | pass | 1513.2 / 1847.8 / 1847.8 | 1342.1 / 1531.9 / 1531.9 | – | – |
| cold.hit.initialize | wall median net of ssh.roundtrip median | 9/9 | 9/9 | 86.0 | 206.0 | 586.0 | pass | 736.8 / 1007.5 / 1007.5 | 877.3 / 936.3 / 936.3 | – | – |
| cold.hit.tools_list | wall median | 9/9 | 9/9 | 27.9 | 33.0 | 527.9 | pass | 27.9 / 107.1 / 107.1 | 33.0 / 73.6 / 73.6 | – | – |
| cold.hit.first_js | wall median | 9/9 | 9/9 | 579.9 | 344.2 | 1079.9 | pass | 579.9 / 733.6 / 733.6 | 344.2 / 512.4 / 512.4 | 0.00 / 0.00 / 0.00 | 0.00 / 0.01 / 0.01 |
| cold.hit.total | wall median net of ssh.roundtrip median | 9/9 | 9/9 | 682.3 | 602.2 | 1182.3 | pass | 1333.0 / 1769.9 / 1769.9 | 1273.5 / 1434.3 / 1434.3 | – | – |
| warm.noop | wall median | 90/90 | 90/90 | 35.4 | 57.5 | 535.4 | pass | 35.4 / 177.0 / 213.3 | 57.5 / 161.3 / 187.9 | 0.02 / 0.03 / 0.03 | 0.01 / 0.02 / 0.04 |
| warm.getState | wall median | 90/90 | 90/90 | 99.4 | 65.9 | 599.4 | pass | 99.4 / 214.3 / 925.2 | 65.9 / 175.6 / 578.4 | 32.4 / 38.5 / 868.7 | 3.47 / 19.6 / 501.9 |
| warm.listApps | wall median | 90/90 | 90/90 | 100.1 | 65.9 | 600.1 | pass | 100.1 / 192.7 / 209.5 | 65.9 / 167.0 / 409.9 | 32.2 / 37.7 / 42.8 | 3.43 / 4.85 / 5.64 |
| bind.getApp | wall median | 3/3 | 3/3 | 6803.7 | 6357.9 | 7484.1 | pass | 6803.7 / 6987.0 / 6987.0 | 6357.9 / 6462.6 / 6462.6 | 6637.7 / 6862.2 / 6862.2 | 6228.5 / 6330.0 / 6330.0 |
| approval.elicitation | – | 3/3 | 3/3 | 63.5 | 83.0 | – | not judged | 63.5 / 83.6 / 83.6 | 83.0 / 146.1 / 146.1 | – | – |
| warm.getAXState | wall median | 90/90 | 90/90 | 113.3 | 107.6 | 613.3 | pass | 113.3 / 212.0 / 267.1 | 107.6 / 213.8 / 296.4 | 55.7 / 88.2 / 93.4 | 50.5 / 71.5 / 80.3 |
| warm.getScreenshot | wall median | 90/90 | 90/90 | 110.9 | 107.9 | 610.9 | pass | 110.9 / 200.1 / 233.9 | 107.9 / 206.6 / 281.3 | 51.2 / 81.3 / 94.1 | 51.6 / 68.7 / 74.4 |
| task.act | wall median | 30/30 | 30/30 | 1119.8 | 868.7 | 1619.8 | pass | 1119.8 / 1312.5 / 1316.5 | 868.7 / 970.0 / 976.6 | 968.7 / 1009.9 / 1049.7 | 734.7 / 758.8 / 796.2 |
| task.verify | wall median | 30/30 | 30/30 | 512.5 | 460.4 | 1012.5 | pass | 512.5 / 706.4 / 780.0 | 460.4 / 521.0 / 525.6 | 454.4 / 617.4 / 670.2 | 418.4 / 431.1 / 432.5 |
| task.close | wall median | 30/30 | 30/30 | 2664.4 | 1638.0 | 3164.4 | pass | 2664.4 / 2805.5 / 3148.5 | 1638.0 / 1816.8 / 1856.5 | 2595.0 / 2695.7 / 2988.3 | 1574.6 / 1702.4 / 1744.8 |
| task.total | wall median | 30/30 | 30/30 | 4263.0 | 2982.6 | 4763.0 | pass | 4263.0 / 4528.1 / 4663.4 | 2982.6 / 3178.5 / 3209.9 | 3992.0 / 4126.7 / 4351.5 | 2711.2 / 2838.8 / 2966.1 |
| end_task | wall median | 3/3 | 3/3 | 25.8 | 25.1 | 525.8 | pass | 25.8 / 41.0 / 41.0 | 25.1 / 102.2 / 102.2 | – | – |
| bind.getApp.retry | – | 3/3 | 3/3 | 1271.1 | 1073.5 | – | not judged | 1271.1 / 1351.9 / 1351.9 | 1073.5 / 1117.7 / 1117.7 | 1190.3 / 1320.8 / 1320.8 | 1031.1 / 1032.2 / 1032.2 |
| guard.scratch | – | 6/6 | 6/6 | 198.8 | 98.0 | – | not judged | 198.8 / 315.2 / 315.2 | 98.0 / 133.5 / 133.5 | 61.5 / 91.1 / 91.1 | 46.5 / 58.0 / 58.0 |
| setup.activate | – | 3/3 | 3/3 | 1512.7 | 1518.4 | – | not judged | 1512.7 / 1592.6 / 1592.6 | 1518.4 / 1640.8 / 1640.8 | – | – |
| setup.newDocument | – | 3/3 | 3/3 | 1709.9 | 918.2 | – | not judged | 1709.9 / 1954.4 / 1954.4 | 918.2 / 928.0 / 928.0 | 1586.7 / 1883.8 / 1883.8 | 840.1 / 849.3 / 849.3 |

## What differs, by design

- host: vendor (initialize: rmcp 1.5.0) -> cua (initialize: cua-repl-host 0.5.0)
- sandbox: scoped (platform default), launcher cua-compat, TMPDIR session -> scoped (platform default), launcher cua, TMPDIR session
- engine: vendor (attested: vendor 26.924.1001281, build 26.928.40906-darwin-arm64) -> cua (attested: cua 0.1.0, build 0c363f8f4512)
- service: computer surface, answered by vendor (helper: pinned runtime) -> computer surface, answered by cua (helper: approved engine)

## Failures and notes

- bind.getApp.retry (not judged): counted in bind.getApp, the first attempt plus the retry

## Problems

None: both sides are complete, attested and comparable.

Verdict: **PASS**
