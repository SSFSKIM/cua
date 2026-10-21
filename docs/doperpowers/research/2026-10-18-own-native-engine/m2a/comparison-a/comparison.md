# Native baseline comparison A: engine and service

| | Baseline | Candidate |
|---|---|---|
| REPL host | vendor | vendor |
| Engine | vendor (attested: vendor 26.924.1001281, build 26.928.40906-darwin-arm64) | cua (attested: cua 0.1.0, build 1ec58faab897) |
| Approved engine | 1ec58faab897 (cua 0.1.0, /Users/new/Library/Application Support/cua/engine/cua Engine.app) | 1ec58faab897 (cua 0.1.0, /Users/new/Library/Application Support/cua/engine/cua Engine.app) |
| initialize answered by | rmcp 1.5.0 | rmcp 1.5.0 |
| Commit | e57aa75cfa9f5b8ad2a5b1252e9d27ce096dcfb7 | e57aa75cfa9f5b8ad2a5b1252e9d27ce096dcfb7 |
| device | mini | mini |
| release | 26.928.40906-darwin-arm64 | 26.928.40906-darwin-arm64 |
| hardware | Mac14,12, Apple M2 Pro, 16 GiB | Mac14,12, Apple M2 Pro, 16 GiB |
| os | macOS 27.0 (26A428) | macOS 27.0 (26A428) |
| display | 2560 x 1440 points at scale 2 (5120 x 2880 pixels) | 2560 x 1440 points at scale 2 (5120 x 2880 pixels) |
| service | computer surface, answered by vendor (helper: pinned runtime) | computer surface, answered by cua (helper: approved engine) |
| sandbox | scoped (platform default) | scoped (platform default) |
| plan | 5 cold, 30 warm, 10 tasks | 5 cold, 30 warm, 10 tasks |
| Runs | run-1, run-2, run-3 | run-1, run-2, run-3 |
| ssh.roundtrip median | 723.3 | 818.9 |

Rule (#117 comparison A, engine and service): the baseline runs `--host vendor --engine vendor`, the candidate `--host vendor --engine cua`; three complete, attested runs a side of one sitting covering the same plan, every attested field equal but engine, service (below). The engine is the one variable: cua's service loaded in the vendor trusted worker against the vendor's, on the vendor host. Per operation (method cases included), the candidate's judged median must be at most the baseline's plus max(10%, 500 ms), or faster, and it must succeed in no smaller share of its valid samples; the cold-connection phases that open the ssh pipe are judged net of each side's ssh.roundtrip median. ssh, approval, guard and setup operations are reported, not judged. Milliseconds; "OK" is successes over valid samples; wall and in-cell columns are median / p95 / max of successful samples.

| Operation | Basis | Baseline OK | Candidate OK | Baseline judged | Candidate judged | Limit | Verdict | Baseline wall | Candidate wall | Baseline in-cell | Candidate in-cell |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ssh.roundtrip | – | 15/15 | 15/15 | 723.3 | 818.9 | – | not judged | 723.3 / 990.8 / 990.8 | 818.9 / 987.0 / 987.0 | – | – |
| cold.miss.initialize | wall median net of ssh.roundtrip median | 6/6 | 6/6 | 373.9 | 430.8 | 873.9 | pass | 1097.2 / 1400.1 / 1400.1 | 1249.7 / 1505.9 / 1505.9 | – | – |
| cold.miss.tools_list | wall median | 6/6 | 6/6 | 78.2 | 24.9 | 578.2 | pass | 78.2 / 110.9 / 110.9 | 24.9 / 96.1 / 96.1 | – | – |
| cold.miss.first_js | wall median | 6/6 | 6/6 | 346.9 | 353.8 | 846.9 | pass | 346.9 / 460.4 / 460.4 | 353.8 / 437.8 / 437.8 | 0.00 / 0.00 / 0.00 | 0.00 / 0.00 / 0.00 |
| cold.miss.total | wall median net of ssh.roundtrip median | 6/6 | 6/6 | 851.8 | 848.7 | 1351.8 | pass | 1575.0 / 1788.4 / 1788.4 | 1667.6 / 2039.9 / 2039.9 | – | – |
| cold.hit.initialize | wall median net of ssh.roundtrip median | 9/9 | 9/9 | 180.3 | 120.9 | 680.3 | pass | 903.6 / 1203.6 / 1203.6 | 939.8 / 1019.0 / 1019.0 | – | – |
| cold.hit.tools_list | wall median | 9/9 | 9/9 | 48.0 | 55.0 | 548.0 | pass | 48.0 / 93.8 / 93.8 | 55.0 / 169.5 / 169.5 | – | – |
| cold.hit.first_js | wall median | 9/9 | 9/9 | 527.7 | 532.4 | 1027.7 | pass | 527.7 / 641.3 / 641.3 | 532.4 / 818.9 / 818.9 | 0.00 / 0.01 / 0.01 | 0.00 / 0.00 / 0.00 |
| cold.hit.total | wall median net of ssh.roundtrip median | 9/9 | 9/9 | 799.6 | 739.4 | 1299.6 | pass | 1522.9 / 1819.9 / 1819.9 | 1558.3 / 1737.2 / 1737.2 | – | – |
| warm.noop | wall median | 90/90 | 90/90 | 63.7 | 62.2 | 563.7 | pass | 63.7 / 177.1 / 229.6 | 62.2 / 195.9 / 283.5 | 0.01 / 0.03 / 0.09 | 0.02 / 0.04 / 0.07 |
| warm.getState | wall median | 90/90 | 90/90 | 105.8 | 68.4 | 605.8 | pass | 105.8 / 214.2 / 1241.0 | 68.4 / 195.8 / 725.9 | 34.4 / 56.4 / 1199.7 | 3.21 / 21.7 / 609.2 |
| warm.listApps | wall median | 90/90 | 90/90 | 107.1 | 78.5 | 607.1 | pass | 107.1 / 216.0 / 267.1 | 78.5 / 189.2 / 291.4 | 33.6 / 43.7 / 52.2 | 3.16 / 5.57 / 58.2 |
| bind.getApp | wall median | 3/3 | 3/3 | 6885.5 | 6619.4 | 7574.1 | pass | 6885.5 / 7206.4 / 7206.4 | 6619.4 / 6717.9 / 6717.9 | 6722.1 / 7148.2 / 7148.2 | 6439.1 / 6501.3 / 6501.3 |
| approval.elicitation | – | 3/3 | 3/3 | 87.0 | 70.9 | – | not judged | 87.0 / 95.2 / 95.2 | 70.9 / 87.5 / 87.5 | – | – |
| warm.getAXState | wall median | 90/90 | 90/90 | 158.9 | 142.9 | 658.9 | pass | 158.9 / 231.6 / 303.5 | 142.9 / 224.9 / 293.4 | 70.1 / 94.3 / 129.5 | 56.5 / 75.7 / 100.5 |
| warm.getScreenshot | wall median | 90/90 | 90/90 | 152.8 | 134.0 | 652.8 | pass | 152.8 / 242.6 / 319.2 | 134.0 / 233.1 / 317.1 | 66.1 / 100.0 / 124.4 | 54.5 / 74.1 / 107.6 |
| task.act | wall median | 30/30 | 30/30 | 1160.2 | 926.3 | 1660.2 | pass | 1160.2 / 1287.6 / 1342.6 | 926.3 / 1037.9 / 1038.3 | 982.0 / 1087.9 / 1109.3 | 747.6 / 828.4 / 878.9 |
| task.verify | wall median | 30/30 | 30/30 | 523.2 | 504.8 | 1023.2 | pass | 523.2 / 658.3 / 687.3 | 504.8 / 645.5 / 650.8 | 463.2 / 489.3 / 515.3 | 412.5 / 430.3 / 437.2 |
| task.close | wall median | 30/30 | 30/30 | 2704.5 | 1634.9 | 3204.5 | pass | 2704.5 / 2941.1 / 2977.8 | 1634.9 / 1841.1 / 1884.2 | 2626.0 / 2747.9 / 2920.9 | 1570.1 / 1622.4 / 1769.2 |
| task.total | wall median | 30/30 | 30/30 | 4384.0 | 3126.0 | 4884.0 | pass | 4384.0 / 4642.0 / 4684.3 | 3126.0 / 3285.8 / 3330.6 | 4057.1 / 4244.9 / 4328.1 | 2734.3 / 2879.4 / 2899.6 |
| end_task | wall median | 3/3 | 3/3 | 30.2 | 144.5 | 530.2 | pass | 30.2 / 68.2 / 68.2 | 144.5 / 175.8 / 175.8 | – | – |
| bind.getApp.retry | – | 3/3 | 3/3 | 1505.0 | 1311.9 | – | not judged | 1505.0 / 1668.4 / 1668.4 | 1311.9 / 1409.7 / 1409.7 | 1470.2 / 1644.5 / 1644.5 | 1185.0 / 1241.1 / 1241.1 |
| guard.scratch | – | 6/6 | 6/6 | 143.9 | 143.2 | – | not judged | 143.9 / 251.7 / 251.7 | 143.2 / 195.9 / 195.9 | 61.6 / 94.0 / 94.0 | 56.7 / 75.0 / 75.0 |
| setup.activate | – | 3/3 | 3/3 | 1737.4 | 1773.3 | – | not judged | 1737.4 / 1873.0 / 1873.0 | 1773.3 / 1787.8 / 1787.8 | – | – |
| setup.newDocument | – | 3/3 | 3/3 | 1744.1 | 1039.5 | – | not judged | 1744.1 / 2079.8 / 2079.8 | 1039.5 / 1047.7 / 1047.7 | 1658.8 / 2012.8 / 2012.8 | 921.6 / 932.5 / 932.5 |

## What differs, by design

- engine: vendor (attested: vendor 26.924.1001281, build 26.928.40906-darwin-arm64) -> cua (attested: cua 0.1.0, build 1ec58faab897)
- service: computer surface, answered by vendor (helper: pinned runtime) -> computer surface, answered by cua (helper: approved engine)

## Failures and notes

- bind.getApp.retry (not judged): counted in bind.getApp, the first attempt plus the retry

## Problems

None: both sides are complete, attested and comparable.

Verdict: **PASS**
