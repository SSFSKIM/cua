# Native baseline comparison B: host only

| | Baseline | Candidate |
|---|---|---|
| REPL host | vendor | cua |
| Engine | cua (attested: cua 0.1.0, build 0c363f8f4512) | cua (attested: cua 0.1.0, build 0c363f8f4512) |
| Approved engine | 0c363f8f4512 (cua 0.1.0, /Users/new/Library/Application Support/cua/engine/cua Engine.app) | 0c363f8f4512 (cua 0.1.0, /Users/new/Library/Application Support/cua/engine/cua Engine.app) |
| initialize answered by | rmcp 1.5.0 | cua-repl-host 0.5.0 |
| Commit | 98f153b8e1fcad816dc61b70a35358d629b61969 | 98f153b8e1fcad816dc61b70a35358d629b61969 |
| device | mini | mini |
| release | 26.928.40906-darwin-arm64 | 26.928.40906-darwin-arm64 |
| hardware | Mac14,12, Apple M2 Pro, 16 GiB | Mac14,12, Apple M2 Pro, 16 GiB |
| os | macOS 27.0 (26A428) | macOS 27.0 (26A428) |
| display | 2560 x 1440 points at scale 2 (5120 x 2880 pixels) | 2560 x 1440 points at scale 2 (5120 x 2880 pixels) |
| service | computer surface, answered by cua (helper: approved engine) | computer surface, answered by cua (helper: approved engine) |
| sandbox | scoped (platform default) | scoped (platform default) |
| plan | 5 cold, 30 warm, 10 tasks | 5 cold, 30 warm, 10 tasks |
| Runs | run-1, run-2, run-3 | run-1, run-2, run-3 |
| ssh.roundtrip median | 657.9 | 671.3 |

Rule (#117 comparison B, host only): the baseline runs `--host vendor --engine cua`, the candidate `--host cua --engine cua`; three complete, attested runs a side of one sitting covering the same plan, every attested field equal but host, sandbox (below). The host is the one variable: cua's engine under the vendor host against it under cua's own host, with the sandbox launch each host makes. Per operation (method cases included), the candidate's judged median must be at most the baseline's plus max(10%, 500 ms), or faster, and it must succeed in no smaller share of its valid samples; the cold-connection phases that open the ssh pipe are judged net of each side's ssh.roundtrip median. ssh, approval, guard and setup operations are reported, not judged. Milliseconds; "OK" is successes over valid samples; wall and in-cell columns are median / p95 / max of successful samples.

| Operation | Basis | Baseline OK | Candidate OK | Baseline judged | Candidate judged | Limit | Verdict | Baseline wall | Candidate wall | Baseline in-cell | Candidate in-cell |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ssh.roundtrip | – | 15/15 | 15/15 | 657.9 | 671.3 | – | not judged | 657.9 / 1211.6 / 1211.6 | 671.3 / 818.7 / 818.7 | – | – |
| cold.miss.initialize | wall median net of ssh.roundtrip median | 6/6 | 6/6 | 253.5 | 299.6 | 753.5 | pass | 911.4 / 997.8 / 997.8 | 970.9 / 1153.3 / 1153.3 | – | – |
| cold.miss.tools_list | wall median | 6/6 | 6/6 | 28.6 | 34.5 | 528.6 | pass | 28.6 / 70.6 / 70.6 | 34.5 / 135.8 / 135.8 | – | – |
| cold.miss.first_js | wall median | 6/6 | 6/6 | 318.1 | 300.2 | 818.1 | pass | 318.1 / 398.4 / 398.4 | 300.2 / 315.1 / 315.1 | 0.00 / 0.00 / 0.00 | 0.00 / 0.01 / 0.01 |
| cold.miss.total | wall median net of ssh.roundtrip median | 6/6 | 6/6 | 633.3 | 670.8 | 1133.3 | pass | 1291.3 / 1346.0 / 1346.0 | 1342.1 / 1531.9 / 1531.9 | – | – |
| cold.hit.initialize | wall median net of ssh.roundtrip median | 9/9 | 9/9 | 257.2 | 206.0 | 757.2 | pass | 915.1 / 993.5 / 993.5 | 877.3 / 936.3 / 936.3 | – | – |
| cold.hit.tools_list | wall median | 9/9 | 9/9 | 23.1 | 33.0 | 523.1 | pass | 23.1 / 69.4 / 69.4 | 33.0 / 73.6 / 73.6 | – | – |
| cold.hit.first_js | wall median | 9/9 | 9/9 | 523.8 | 344.2 | 1023.8 | pass | 523.8 / 826.4 / 826.4 | 344.2 / 512.4 / 512.4 | 0.00 / 0.01 / 0.01 | 0.00 / 0.01 / 0.01 |
| cold.hit.total | wall median net of ssh.roundtrip median | 9/9 | 9/9 | 811.5 | 602.2 | 1311.5 | pass | 1469.4 / 1618.4 / 1618.4 | 1273.5 / 1434.3 / 1434.3 | – | – |
| warm.noop | wall median | 90/90 | 90/90 | 40.3 | 57.5 | 540.3 | pass | 40.3 / 150.8 / 203.8 | 57.5 / 161.3 / 187.9 | 0.02 / 0.02 / 0.08 | 0.01 / 0.02 / 0.04 |
| warm.getState | wall median | 90/90 | 90/90 | 50.4 | 65.9 | 550.4 | pass | 50.4 / 184.8 / 573.2 | 65.9 / 175.6 / 578.4 | 3.87 / 20.2 / 515.8 | 3.47 / 19.6 / 501.9 |
| warm.listApps | wall median | 90/90 | 90/90 | 51.1 | 65.9 | 551.1 | pass | 51.1 / 166.8 / 177.4 | 65.9 / 167.0 / 409.9 | 3.68 / 4.53 / 5.10 | 3.43 / 4.85 / 5.64 |
| bind.getApp | wall median | 3/3 | 3/3 | 6482.3 | 6357.9 | 7130.5 | pass | 6482.3 / 6545.3 / 6545.3 | 6357.9 / 6462.6 / 6462.6 | 6296.7 / 6404.6 / 6404.6 | 6228.5 / 6330.0 / 6330.0 |
| approval.elicitation | – | 3/3 | 3/3 | 49.4 | 83.0 | – | not judged | 49.4 / 93.7 / 93.7 | 83.0 / 146.1 / 146.1 | – | – |
| warm.getAXState | wall median | 90/90 | 90/90 | 102.5 | 107.6 | 602.5 | pass | 102.5 / 206.0 / 274.7 | 107.6 / 213.8 / 296.4 | 50.5 / 67.2 / 77.1 | 50.5 / 71.5 / 80.3 |
| warm.getScreenshot | wall median | 90/90 | 90/90 | 103.6 | 107.9 | 603.6 | pass | 103.6 / 223.5 / 307.8 | 107.9 / 206.6 / 281.3 | 50.1 / 66.3 / 74.3 | 51.6 / 68.7 / 74.4 |
| task.act | wall median | 30/30 | 30/30 | 859.0 | 868.7 | 1359.0 | pass | 859.0 / 961.7 / 1148.1 | 868.7 / 970.0 / 976.6 | 735.3 / 845.0 / 850.3 | 734.7 / 758.8 / 796.2 |
| task.verify | wall median | 30/30 | 30/30 | 484.2 | 460.4 | 984.2 | pass | 484.2 / 675.5 / 675.8 | 460.4 / 521.0 / 525.6 | 419.5 / 430.9 / 529.4 | 418.4 / 431.1 / 432.5 |
| task.close | wall median | 30/30 | 30/30 | 1632.8 | 1638.0 | 2132.8 | pass | 1632.8 / 1928.6 / 1990.7 | 1638.0 / 1816.8 / 1856.5 | 1569.0 / 1733.0 / 1898.1 | 1574.6 / 1702.4 / 1744.8 |
| task.total | wall median | 30/30 | 30/30 | 3000.9 | 2982.6 | 3500.9 | pass | 3000.9 / 3523.1 / 3594.8 | 2982.6 / 3178.5 / 3209.9 | 2714.9 / 2886.9 / 3060.0 | 2711.2 / 2838.8 / 2966.1 |
| end_task | wall median | 3/3 | 3/3 | 21.1 | 25.1 | 521.1 | pass | 21.1 / 21.7 / 21.7 | 25.1 / 102.2 / 102.2 | – | – |
| bind.getApp.retry | – | 3/3 | 3/3 | 1107.3 | 1073.5 | – | not judged | 1107.3 / 1159.0 / 1159.0 | 1073.5 / 1117.7 / 1117.7 | 1041.5 / 1071.2 / 1071.2 | 1031.1 / 1032.2 / 1032.2 |
| guard.scratch | – | 6/6 | 6/6 | 145.1 | 98.0 | – | not judged | 145.1 / 201.5 / 201.5 | 98.0 / 133.5 / 133.5 | 54.6 / 66.1 / 66.1 | 46.5 / 58.0 / 58.0 |
| setup.activate | – | 3/3 | 3/3 | 1637.4 | 1518.4 | – | not judged | 1637.4 / 1739.5 / 1739.5 | 1518.4 / 1640.8 / 1640.8 | – | – |
| setup.newDocument | – | 3/3 | 3/3 | 909.7 | 918.2 | – | not judged | 909.7 / 1017.5 / 1017.5 | 918.2 / 928.0 / 928.0 | 840.7 / 875.2 / 875.2 | 840.1 / 849.3 / 849.3 |

## What differs, by design

- host: vendor (initialize: rmcp 1.5.0) -> cua (initialize: cua-repl-host 0.5.0)
- sandbox: scoped (platform default), launcher cua-compat, TMPDIR session -> scoped (platform default), launcher cua, TMPDIR session

## Failures and notes

- bind.getApp.retry (not judged): counted in bind.getApp, the first attempt plus the retry

## Problems

None: both sides are complete, attested and comparable.

Verdict: **PASS**
