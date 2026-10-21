# Native baseline comparison A: engine and service

| | Baseline | Candidate |
|---|---|---|
| REPL host | vendor | vendor |
| Engine | vendor (attested: vendor 26.924.1001281, build 26.928.40906-darwin-arm64) | cua (attested: cua 0.1.0, build faecf7d9f4b0) |
| Approved engine | faecf7d9f4b0 (cua 0.1.0, /Users/new/Library/Application Support/cua/engine/cua Engine.app) | faecf7d9f4b0 (cua 0.1.0, /Users/new/Library/Application Support/cua/engine/cua Engine.app) |
| initialize answered by | rmcp 1.5.0 | rmcp 1.5.0 |
| Commit | 049c6812bec7b55719a827b4b804dba1d933d513 | 049c6812bec7b55719a827b4b804dba1d933d513 |
| device | mini | mini |
| release | 26.928.40906-darwin-arm64 | 26.928.40906-darwin-arm64 |
| hardware | Mac14,12, Apple M2 Pro, 16 GiB | Mac14,12, Apple M2 Pro, 16 GiB |
| os | macOS 27.0 (26A428) | macOS 27.0 (26A428) |
| display | 2560 x 1440 points at scale 2 (5120 x 2880 pixels) | 2560 x 1440 points at scale 2 (5120 x 2880 pixels) |
| service | computer surface, answered by vendor (helper: pinned runtime) | computer surface, answered by cua (helper: approved engine) |
| sandbox | scoped (platform default) | scoped (platform default) |
| plan | 5 cold, 30 warm, 10 tasks | 5 cold, 30 warm, 10 tasks |
| Runs | run-1, run-2, run-3 | run-1, run-2, run-3 |
| ssh.roundtrip median | 928.3 | 768.8 |

Rule (#117 comparison A, engine and service): the baseline runs `--host vendor --engine vendor`, the candidate `--host vendor --engine cua`; three complete, attested runs a side of one sitting covering the same plan, every attested field equal but engine, service (below). The engine is the one variable: cua's service loaded in the vendor trusted worker against the vendor's, on the vendor host. Per operation (method cases included), the candidate's judged median must be at most the baseline's plus max(10%, 500 ms), or faster, and it must succeed in no smaller share of its valid samples; the cold-connection phases that open the ssh pipe are judged net of each side's ssh.roundtrip median. ssh, approval, guard and setup operations are reported, not judged. Milliseconds; "OK" is successes over valid samples; wall and in-cell columns are median / p95 / max of successful samples.

| Operation | Basis | Baseline OK | Candidate OK | Baseline judged | Candidate judged | Limit | Verdict | Baseline wall | Candidate wall | Baseline in-cell | Candidate in-cell |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ssh.roundtrip | – | 15/15 | 15/15 | 928.3 | 768.8 | – | not judged | 928.3 / 9823.1 / 9823.1 | 768.8 / 1822.7 / 1822.7 | – | – |
| cold.miss.initialize | wall median net of ssh.roundtrip median | 6/6 | 6/6 | 159.1 | 369.0 | 659.1 | pass | 1087.4 / 1489.0 / 1489.0 | 1137.7 / 1182.1 / 1182.1 | – | – |
| cold.miss.tools_list | wall median | 6/6 | 6/6 | 74.1 | 59.9 | 574.1 | pass | 74.1 / 209.9 / 209.9 | 59.9 / 212.6 / 212.6 | – | – |
| cold.miss.first_js | wall median | 6/6 | 6/6 | 323.4 | 311.5 | 823.4 | pass | 323.4 / 530.8 / 530.8 | 311.5 / 344.7 / 344.7 | 0.00 / 0.00 / 0.00 | 0.00 / 0.01 / 0.01 |
| cold.miss.total | wall median net of ssh.roundtrip median | 6/6 | 6/6 | 610.7 | 715.3 | 1110.7 | pass | 1539.1 / 1896.4 / 1896.4 | 1484.0 / 1666.8 / 1666.8 | – | – |
| cold.hit.initialize | wall median net of ssh.roundtrip median | 9/9 | 9/9 | 27.5 | 165.9 | 527.5 | pass | 955.9 / 5934.1 / 5934.1 | 934.7 / 1247.1 / 1247.1 | – | – |
| cold.hit.tools_list | wall median | 9/9 | 9/9 | 57.4 | 87.3 | 557.4 | pass | 57.4 / 132.9 / 132.9 | 87.3 / 183.0 / 183.0 | – | – |
| cold.hit.first_js | wall median | 9/9 | 9/9 | 513.9 | 516.2 | 1013.9 | pass | 513.9 / 696.5 / 696.5 | 516.2 / 606.7 / 606.7 | 0.00 / 0.00 / 0.00 | 0.00 / 0.01 / 0.01 |
| cold.hit.total | wall median net of ssh.roundtrip median | 9/9 | 9/9 | 643.5 | 776.1 | 1143.5 | pass | 1571.8 / 6688.0 / 6688.0 | 1544.9 / 1941.2 / 1941.2 | – | – |
| warm.noop | wall median | 90/90 | 90/90 | 76.6 | 30.6 | 576.6 | pass | 76.6 / 196.5 / 9840.5 | 30.6 / 184.5 / 206.7 | 0.02 / 0.03 / 0.18 | 0.02 / 0.03 / 0.04 |
| warm.getState | wall median | 90/90 | 90/90 | 83.4 | 72.5 | 583.4 | pass | 83.4 / 203.5 / 1198.0 | 72.5 / 212.0 / 573.6 | 27.8 / 36.0 / 1021.2 | 3.18 / 19.1 / 505.7 |
| warm.listApps | wall median | 90/90 | 90/90 | 102.8 | 37.5 | 602.8 | pass | 102.8 / 209.0 / 251.2 | 37.5 / 186.5 / 212.3 | 31.5 / 36.0 / 38.3 | 2.74 / 4.13 / 7.32 |
| bind.getApp | wall median | 3/3 | 3/3 | 6916.5 | 6201.4 | 7608.2 | pass | 6916.5 / 9704.5 / 9704.5 | 6201.4 / 6290.0 / 6290.0 | 6646.2 / 6649.0 / 6649.0 | 6072.8 / 6097.3 / 6097.3 |
| approval.elicitation | – | 3/3 | 3/3 | 75.6 | 37.6 | – | not judged | 75.6 / 122.7 / 122.7 | 37.6 / 50.7 / 50.7 | – | – |
| warm.getAXState | wall median | 90/90 | 90/90 | 144.7 | 109.4 | 644.7 | pass | 144.7 / 281.1 / 1226.1 | 109.4 / 312.1 / 5768.1 | 59.7 / 86.5 / 91.2 | 52.3 / 71.9 / 96.2 |
| warm.getScreenshot | wall median | 90/90 | 90/90 | 130.2 | 125.4 | 630.2 | pass | 130.2 / 293.7 / 319.4 | 125.4 / 293.7 / 9402.1 | 55.6 / 84.3 / 93.2 | 55.1 / 70.9 / 77.8 |
| task.act | wall median | 30/30 | 30/30 | 1104.9 | 937.0 | 1604.9 | pass | 1104.9 / 1302.7 / 5779.9 | 937.0 / 1040.3 / 1045.5 | 961.1 / 999.1 / 1004.3 | 734.5 / 788.5 / 815.2 |
| task.verify | wall median | 30/30 | 30/30 | 518.0 | 523.8 | 1018.0 | pass | 518.0 / 638.1 / 647.5 | 523.8 / 652.3 / 848.0 | 452.2 / 467.6 / 469.4 | 422.0 / 437.8 / 730.8 |
| task.close | wall median | 30/30 | 30/30 | 2656.3 | 1611.5 | 3156.3 | pass | 2656.3 / 4772.1 / 5208.0 | 1611.5 / 1736.4 / 1742.0 | 2586.9 / 2729.9 / 2790.7 | 1556.1 / 1587.5 / 1589.4 |
| task.total | wall median | 30/30 | 30/30 | 4253.8 | 3080.8 | 4753.8 | pass | 4253.8 / 6748.7 / 8965.8 | 3080.8 / 3295.9 / 3599.1 | 3992.3 / 4167.2 / 4169.1 | 2711.1 / 2825.5 / 2983.8 |
| end_task | wall median | 3/3 | 3/3 | 47.2 | 42.9 | 547.2 | pass | 47.2 / 127.4 / 127.4 | 42.9 / 72.6 / 72.6 | – | – |
| bind.getApp.retry | – | 3/3 | 3/3 | 1381.9 | 961.9 | – | not judged | 1381.9 / 1441.2 / 1441.2 | 961.9 / 1009.1 / 1009.1 | 1310.8 / 1352.1 / 1352.1 | 882.1 / 885.8 / 885.8 |
| guard.scratch | – | 6/6 | 6/6 | 155.8 | 153.4 | – | not judged | 155.8 / 349.2 / 349.2 | 153.4 / 218.9 / 218.9 | 78.4 / 91.6 / 91.6 | 60.3 / 64.7 / 64.7 |
| setup.activate | – | 3/3 | 3/3 | 2033.0 | 1665.8 | – | not judged | 2033.0 / 9039.5 / 9039.5 | 1665.8 / 1666.7 / 1666.7 | – | – |
| setup.newDocument | – | 3/3 | 3/3 | 1726.1 | 893.7 | – | not judged | 1726.1 / 1778.2 / 1778.2 | 893.7 / 922.6 / 922.6 | 1626.5 / 1629.3 / 1629.3 | 746.2 / 763.2 / 763.2 |

## What differs, by design

- engine: vendor (attested: vendor 26.924.1001281, build 26.928.40906-darwin-arm64) -> cua (attested: cua 0.1.0, build faecf7d9f4b0)
- service: computer surface, answered by vendor (helper: pinned runtime) -> computer surface, answered by cua (helper: approved engine)

## Failures and notes

- bind.getApp.retry (not judged): counted in bind.getApp, the first attempt plus the retry

## Problems

None: both sides are complete, attested and comparable.

Verdict: **PASS**
