# Native baseline comparison A: engine and service

| | Baseline | Candidate |
|---|---|---|
| REPL host | vendor | vendor |
| Engine | vendor (attested: vendor 26.924.1001281, build 26.928.40906-darwin-arm64) | cua (attested: cua 0.1.0, build 6757e0ebe188) |
| Approved engine | 6757e0ebe188 (cua 0.1.0, /Users/new/Library/Application Support/cua/engine/cua Engine.app) | 6757e0ebe188 (cua 0.1.0, /Users/new/Library/Application Support/cua/engine/cua Engine.app) |
| initialize answered by | rmcp 1.5.0 | rmcp 1.5.0 |
| Commit | ccbb824265b0c7853d60dacdbc8b706069b6c647 | ccbb824265b0c7853d60dacdbc8b706069b6c647 |
| device | mini | mini |
| release | 26.928.40906-darwin-arm64 | 26.928.40906-darwin-arm64 |
| hardware | Mac14,12, Apple M2 Pro, 16 GiB | Mac14,12, Apple M2 Pro, 16 GiB |
| os | macOS 27.0 (26A428) | macOS 27.0 (26A428) |
| display | 2560 x 1440 points at scale 2 (5120 x 2880 pixels) | 2560 x 1440 points at scale 2 (5120 x 2880 pixels) |
| service | computer surface, answered by vendor (helper: pinned runtime) | computer surface, answered by cua (helper: approved engine) |
| sandbox | scoped (platform default) | scoped (platform default) |
| plan | 5 cold, 30 warm, 10 tasks | 5 cold, 30 warm, 10 tasks |
| Runs | run-1, run-2, run-3 | run-1, run-2, run-3 |
| ssh.roundtrip median | 706.7 | 723.1 |

Rule (#117 comparison A, engine and service): the baseline runs `--host vendor --engine vendor`, the candidate `--host vendor --engine cua`; three complete, attested runs a side of one sitting covering the same plan, every attested field equal but engine, service (below). The engine is the one variable: cua's service loaded in the vendor trusted worker against the vendor's, on the vendor host. Per operation (method cases included), the candidate's judged median must be at most the baseline's plus max(10%, 500 ms), or faster, and it must succeed in no smaller share of its valid samples; the cold-connection phases that open the ssh pipe are judged net of each side's ssh.roundtrip median. ssh, approval, guard and setup operations are reported, not judged. Milliseconds; "OK" is successes over valid samples; wall and in-cell columns are median / p95 / max of successful samples.

| Operation | Basis | Baseline OK | Candidate OK | Baseline judged | Candidate judged | Limit | Verdict | Baseline wall | Candidate wall | Baseline in-cell | Candidate in-cell |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ssh.roundtrip | – | 15/15 | 15/15 | 706.7 | 723.1 | – | not judged | 706.7 / 1123.9 / 1123.9 | 723.1 / 4101.4 / 4101.4 | – | – |
| cold.miss.initialize | wall median net of ssh.roundtrip median | 6/6 | 6/6 | 443.6 | 447.4 | 943.6 | pass | 1150.3 / 2463.4 / 2463.4 | 1170.5 / 8073.2 / 8073.2 | – | – |
| cold.miss.tools_list | wall median | 6/6 | 6/6 | 52.3 | 146.2 | 552.3 | pass | 52.3 / 170.5 / 170.5 | 146.2 / 211.2 / 211.2 | – | – |
| cold.miss.first_js | wall median | 6/6 | 6/6 | 323.3 | 339.0 | 823.3 | pass | 323.3 / 403.2 / 403.2 | 339.0 / 481.7 / 481.7 | 0.00 / 0.00 / 0.00 | 0.00 / 0.00 / 0.00 |
| cold.miss.total | wall median net of ssh.roundtrip median | 6/6 | 6/6 | 885.1 | 1022.0 | 1385.1 | pass | 1591.8 / 2783.0 / 2783.0 | 1745.1 / 8657.7 / 8657.7 | – | – |
| cold.hit.initialize | wall median net of ssh.roundtrip median | 9/9 | 9/9 | 72.8 | -65.00 | 572.8 | pass | 779.5 / 1516.5 / 1516.5 | 658.2 / 1034.2 / 1034.2 | – | – |
| cold.hit.tools_list | wall median | 9/9 | 9/9 | 35.3 | 52.2 | 535.3 | pass | 35.3 / 164.1 / 164.1 | 52.2 / 193.7 / 193.7 | – | – |
| cold.hit.first_js | wall median | 9/9 | 9/9 | 536.8 | 501.6 | 1036.8 | pass | 536.8 / 636.0 / 636.0 | 501.6 / 534.5 / 534.5 | 0.00 / 0.01 / 0.01 | 0.00 / 0.01 / 0.01 |
| cold.hit.total | wall median net of ssh.roundtrip median | 9/9 | 9/9 | 612.8 | 515.9 | 1112.8 | pass | 1319.5 / 2068.1 / 2068.1 | 1239.0 / 1540.4 / 1540.4 | – | – |
| warm.noop | wall median | 90/90 | 90/90 | 38.8 | 33.9 | 538.8 | pass | 38.8 / 181.4 / 195.3 | 33.9 / 152.2 / 185.9 | 0.02 / 0.03 / 0.05 | 0.02 / 0.03 / 0.05 |
| warm.getState | wall median | 90/90 | 90/90 | 77.6 | 38.5 | 577.6 | pass | 77.5 / 218.4 / 1056.9 | 38.5 / 176.9 / 668.9 | 25.0 / 35.9 / 955.9 | 3.08 / 18.2 / 531.4 |
| warm.listApps | wall median | 90/90 | 90/90 | 84.4 | 66.3 | 584.4 | pass | 84.4 / 194.3 / 2251.4 | 66.3 / 193.7 / 214.5 | 28.7 / 35.8 / 38.2 | 2.77 / 3.83 / 4.78 |
| bind.getApp | wall median | 3/3 | 3/3 | 6756.7 | 6181.4 | 7432.4 | pass | 6756.7 / 6765.3 / 6765.3 | 6181.4 / 6228.4 / 6228.4 | 6595.4 / 6646.5 / 6646.5 | 6044.9 / 6047.6 / 6047.6 |
| approval.elicitation | – | 3/3 | 3/3 | 36.5 | 50.7 | – | not judged | 36.5 / 115.0 / 115.0 | 50.7 / 139.6 / 139.6 | – | – |
| warm.getAXState | wall median | 90/90 | 90/90 | 123.1 | 114.1 | 623.1 | pass | 123.1 / 222.2 / 322.6 | 114.1 / 232.0 / 1909.6 | 55.4 / 85.2 / 94.6 | 54.3 / 72.6 / 84.0 |
| warm.getScreenshot | wall median | 90/90 | 90/90 | 108.6 | 113.8 | 608.6 | pass | 108.6 / 209.9 / 246.1 | 113.8 / 288.7 / 1168.8 | 49.9 / 82.0 / 95.9 | 52.2 / 70.3 / 74.8 |
| task.act | wall median | 30/30 | 30/30 | 1109.8 | 879.2 | 1609.8 | pass | 1109.8 / 1219.6 / 1291.4 | 879.2 / 1049.9 / 8580.2 | 957.1 / 994.6 / 1047.4 | 732.7 / 777.8 / 782.0 |
| task.verify | wall median | 30/30 | 30/30 | 519.2 | 515.9 | 1019.2 | pass | 519.2 / 534.9 / 539.3 | 515.9 / 656.3 / 4538.6 | 456.1 / 463.8 / 468.8 | 420.9 / 432.0 / 439.7 |
| task.close | wall median | 30/30 | 30/30 | 2611.3 | 1626.7 | 3111.3 | pass | 2611.3 / 2775.4 / 4869.5 | 1626.7 / 1849.3 / 1963.8 | 2571.5 / 2634.6 / 2796.4 | 1558.6 / 1811.0 / 1901.8 |
| task.total | wall median | 30/30 | 30/30 | 4187.3 | 3069.3 | 4687.3 | pass | 4187.3 / 4594.2 / 6477.4 | 3069.3 / 7404.2 / 10673.8 | 3971.0 / 4050.6 / 4251.1 | 2707.3 / 3006.6 / 3037.9 |
| end_task | wall median | 3/3 | 3/3 | 65.3 | 34.1 | 565.3 | pass | 65.3 / 99.0 / 99.0 | 34.1 / 192.4 / 192.4 | – | – |
| bind.getApp.retry | – | 3/3 | 3/3 | 1344.8 | 896.7 | – | not judged | 1344.8 / 1378.9 / 1378.9 | 896.7 / 959.4 / 959.4 | 1310.1 / 1317.7 / 1317.7 | 834.2 / 862.5 / 862.5 |
| guard.scratch | – | 6/6 | 6/6 | 128.0 | 169.8 | – | not judged | 128.0 / 221.9 / 221.9 | 169.8 / 200.4 / 200.4 | 52.4 / 89.7 / 89.7 | 57.7 / 71.3 / 71.3 |
| setup.activate | – | 3/3 | 3/3 | 1725.7 | 2457.9 | – | not judged | 1725.7 / 2239.4 / 2239.4 | 2457.9 / 5350.9 / 5350.9 | – | – |
| setup.newDocument | – | 3/3 | 3/3 | 1769.6 | 903.6 | – | not judged | 1769.6 / 7364.5 / 7364.5 | 903.5 / 938.6 / 938.6 | 1637.7 / 1640.3 / 1640.3 | 849.2 / 863.2 / 863.2 |

## What differs, by design

- engine: vendor (attested: vendor 26.924.1001281, build 26.928.40906-darwin-arm64) -> cua (attested: cua 0.1.0, build 6757e0ebe188)
- service: computer surface, answered by vendor (helper: pinned runtime) -> computer surface, answered by cua (helper: approved engine)

## Failures and notes

- bind.getApp.retry (not judged): counted in bind.getApp, the first attempt plus the retry

## Problems

None: both sides are complete, attested and comparable.

Verdict: **PASS**
