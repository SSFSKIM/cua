# Native baseline comparison

| | Baseline | Candidate |
|---|---|---|
| REPL host | vendor | cua |
| initialize answered by | rmcp 1.5.0 | cua-repl-host 0.4.0 |
| Commit | 1d34683496332c702016bf41683633663d56aa60 | a5ccc1b40b85fd688cd4f47d52a70ee3a09ec09b |
| device | cua-linux | cua-linux |
| release | 26.928.40906-linux-arm64 | 26.928.40906-linux-arm64 |
| hardware | Apple Virtualization Generic Platform, arm64, 4 CPUs, 8 GiB | Apple Virtualization Generic Platform, arm64, 4 CPUs, 8 GiB |
| os | Ubuntu 24.04.5 LTS (7.0.0-38-generic) | Ubuntu 24.04.5 LTS (7.0.0-38-generic) |
| display | 1440 x 900 points at scale 1 (1440 x 900 pixels) | 1440 x 900 points at scale 1 (1440 x 900 pixels) |
| service | computer surface, answered by vendor (helper: pinned runtime) | computer surface, answered by vendor (helper: pinned runtime) |
| sandbox | disabled (platform default) | disabled (platform default) |
| plan | 5 cold, 30 warm, 10 tasks | 5 cold, 30 warm, 10 tasks |
| Runs | run-1, run-2, run-3 | run-1, run-2, run-3 |
| ssh.roundtrip median | 188.7 | 335.3 |

Rule (acceptance 8): three complete, attested runs a side covering the same plan; per operation (method cases included), the candidate's judged median must be at most the baseline's plus max(10%, 500 ms), or faster, and it must succeed in no smaller share of its valid samples. The judged median is wall time around the MCP call; the cold-connection phases that open the ssh pipe are judged net of each side's ssh.roundtrip median. ssh, approval, guard and setup operations are reported, not judged. Milliseconds; "OK" is successes over valid samples; wall and in-cell columns are median / p95 / max of successful samples.

| Operation | Basis | Baseline OK | Candidate OK | Baseline judged | Candidate judged | Limit | Verdict | Baseline wall | Candidate wall | Baseline in-cell | Candidate in-cell |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ssh.roundtrip | – | 15/15 | 15/15 | 188.7 | 335.3 | – | not judged | 188.7 / 245.8 / 245.8 | 335.3 / 645.2 / 645.2 | – | – |
| cold.miss.initialize | wall median net of ssh.roundtrip median | 6/6 | 6/6 | 150.5 | 262.1 | 650.5 | pass | 339.1 / 443.3 / 443.3 | 597.4 / 1149.5 / 1149.5 | – | – |
| cold.miss.tools_list | wall median | 6/6 | 6/6 | 2.30 | 6.10 | 502.3 | pass | 2.33 / 3.14 / 3.14 | 6.08 / 26.1 / 26.1 | – | – |
| cold.miss.first_js | wall median | 6/6 | 6/6 | 137.6 | 323.9 | 637.6 | pass | 137.6 / 164.9 / 164.9 | 323.9 / 426.2 / 426.2 | 0.01 / 0.02 / 0.02 | 0.01 / 0.02 / 0.02 |
| cold.miss.total | wall median net of ssh.roundtrip median | 6/6 | 6/6 | 289.3 | 591.5 | 789.3 | pass | 478.0 / 610.9 / 610.9 | 926.9 / 1601.8 / 1601.8 | – | – |
| cold.hit.initialize | wall median net of ssh.roundtrip median | 9/9 | 9/9 | 64.7 | 11.4 | 564.7 | pass | 253.4 / 268.3 / 268.3 | 346.7 / 968.3 / 968.3 | – | – |
| cold.hit.tools_list | wall median | 9/9 | 9/9 | 1.10 | 1.60 | 501.1 | pass | 1.09 / 1.33 / 1.33 | 1.63 / 6.42 / 6.42 | – | – |
| cold.hit.first_js | wall median | 9/9 | 9/9 | 201.9 | 227.7 | 701.9 | pass | 201.9 / 213.6 / 213.6 | 227.7 / 1139.6 / 1139.6 | 0.01 / 0.01 / 0.01 | 0.01 / 0.01 / 0.01 |
| cold.hit.total | wall median net of ssh.roundtrip median | 9/9 | 9/9 | 262.8 | 240.3 | 762.8 | pass | 451.4 / 476.7 / 476.7 | 575.7 / 1928.5 / 1928.5 | – | – |
| warm.noop | wall median | 90/90 | 90/90 | 1.90 | 3.50 | 501.9 | pass | 1.87 / 3.42 / 4.04 | 3.48 / 18.8 / 107.0 | 0.00 / 0.01 / 0.01 | 0.00 / 0.01 / 0.04 |
| warm.getState | wall median | 90/90 | 90/90 | 7.40 | 18.7 | 507.4 | pass | 7.38 / 13.4 / 18.3 | 18.7 / 172.5 / 243.6 | 5.14 / 10.4 / 15.6 | 14.7 / 150.8 / 227.1 |
| warm.listApps | wall median | 90/90 | 90/90 | 7.00 | 23.1 | 507.0 | pass | 7.03 / 10.1 / 30.1 | 23.1 / 87.6 / 200.5 | 5.00 / 7.00 / 23.2 | 16.5 / 77.5 / 193.7 |
| setup.findWindow | – | 3/3 | 3/3 | 297.8 | 513.8 | – | not judged | 297.8 / 310.6 / 310.6 | 513.8 / 940.7 / 940.7 | 292.5 / 305.1 / 305.1 | 507.3 / 930.8 / 930.8 |
| bind.getApp | wall median | 3/3 | 3/3 | 509.3 | 954.1 | 1009.3 | pass | 509.3 / 513.0 / 513.0 | 954.1 / 2022.8 / 2022.8 | 506.0 / 509.6 / 509.6 | 945.6 / 2012.1 / 2012.1 |
| warm.getAXState | wall median | 90/90 | 90/90 | 428.3 | 1181.5 | 928.3 | fail | 428.3 / 708.6 / 1082.6 | 1181.5 / 3488.6 / 4954.9 | 424.9 / 701.8 / 1079.5 | 1171.7 / 3479.8 / 4906.1 |
| warm.getScreenshot | wall median | 90/90 | 90/90 | 532.0 | 1122.9 | 1032.0 | fail | 532.0 / 709.9 / 1025.5 | 1122.9 / 3261.9 / 4692.1 | 526.7 / 700.1 / 1021.5 | 1115.5 / 3223.1 / 4633.0 |
| task.act | wall median | 30/30 | 30/30 | 17351.1 | 18536.9 | 19086.2 | pass | 17351.1 / 17544.9 / 17572.4 | 18536.9 / 25578.2 / 26706.6 | 17346.9 / 17526.3 / 17568.0 | 18483.9 / 25559.0 / 26661.8 |
| task.verify | wall median | 30/30 | 30/30 | 530.3 | 1842.3 | 1030.3 | fail | 530.3 / 744.2 / 843.0 | 1842.3 / 6438.9 / 6734.4 | 522.8 / 736.5 / 837.2 | 1817.6 / 6382.5 / 6679.5 |
| task.clear | wall median | 30/30 | 30/30 | 1292.8 | 2177.8 | 1792.8 | fail | 1292.8 / 1366.9 / 1400.6 | 2177.8 / 6921.1 / 8200.5 | 1289.4 / 1363.0 / 1396.0 | 2170.5 / 6906.6 / 8165.1 |
| task.total | wall median | 30/30 | 30/30 | 19223.3 | 24536.7 | 21145.6 | fail | 19223.3 / 19410.1 / 19429.4 | 24536.7 / 34869.4 / 41641.5 | 19211.3 / 19378.9 / 19410.7 | 24485.5 / 34814.1 / 41506.5 |
| end_task | wall median | 3/3 | 3/3 | 2.70 | 8.50 | 502.7 | pass | 2.68 / 2.68 / 2.68 | 8.54 / 12.4 / 12.4 | – | – |
| setup.findTarget | – | 6/6 | 6/6 | 316.0 | 535.2 | – | not judged | 316.0 / 339.5 / 339.5 | 535.2 / 687.1 / 687.1 | 311.8 / 336.1 / 336.1 | 529.0 / 672.7 / 672.7 |

## Method cases

Outcomes are counted per sample (`n x` the outcome); wall is median / p95 / max of the samples the harness ran, judged by the same rule.

| Method case | Baseline samples | Baseline outcomes | Candidate samples | Candidate outcomes | Baseline wall | Candidate wall | Limit | Verdict |
|---|---|---|---|---|---|---|---|---|
| method.typeText | 3 | 3x {"outcome":"threw","error":"D-Bus org.freedesktop.DBus.Properties.Get failed: org.freedesktop.DBus.Error.NoReply: Message recipient disconnected from message bus without replying","target":"exited","inserted":null} | 3 | 3x {"outcome":"threw","error":"D-Bus org.freedesktop.DBus.Properties.Get failed: org.freedesktop.DBus.Error.NoReply: Message recipient disconnected from message bus without replying","target":"exited","inserted":null} | 1458.4 / 1485.3 / 1485.3 | 1705.1 / 2720.5 / 2720.5 | 1958.4 | pass |
| method.paste | 3 | 3x {"outcome":"threw","error":"D-Bus org.freedesktop.DBus.Properties.Get failed: org.freedesktop.DBus.Error.NoReply: Message recipient disconnected from message bus without replying","target":"exited","inserted":null} | 3 | 3x {"outcome":"threw","error":"D-Bus org.freedesktop.DBus.Properties.Get failed: org.freedesktop.DBus.Error.NoReply: Message recipient disconnected from message bus without replying","target":"exited","inserted":null} | 1484.5 / 1487.9 / 1487.9 | 1532.8 / 2191.5 / 2191.5 | 1984.5 | pass |
| method.paste.format | 3 | 3x {"outcome":"threw","error":"Linux paste supports only text format.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"Linux paste supports only text format.","target":"survived","inserted":null} | 3.53 / 3.94 / 3.94 | 5.95 / 12.1 / 12.1 | 503.5 | pass |
| method.setValue | 3 | 3x {"outcome":"threw","error":"setValue is unavailable on Linux; use click, pressKey, and typeText.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"setValue is unavailable on Linux; use click, pressKey, and typeText.","target":"survived","inserted":null} | 3.21 / 3.50 / 3.50 | 4.37 / 8.39 / 8.39 | 503.2 | pass |
| method.selectText | 3 | 3x {"outcome":"threw","error":"selectText is unavailable on Linux.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"selectText is unavailable on Linux.","target":"survived","inserted":null} | 3.27 / 5.93 / 5.93 | 6.20 / 20.8 / 20.8 | 503.3 | pass |
| method.scroll.pages | 3 | 3x {"outcome":"threw","error":"Linux scroll accepts { pixels }, not pages.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"Linux scroll accepts { pixels }, not pages.","target":"survived","inserted":null} | 3.20 / 3.97 / 3.97 | 3.81 / 10.1 / 10.1 | 503.2 | pass |

## Failures and notes

- warm.getAXState (fail): median 1181.5 ms is above the limit 928.3 ms (baseline 428.3 ms + max(10%, 500 ms))
- warm.getScreenshot (fail): median 1122.9 ms is above the limit 1032 ms (baseline 532 ms + max(10%, 500 ms))
- task.verify (fail): median 1842.3 ms is above the limit 1030.3 ms (baseline 530.3 ms + max(10%, 500 ms))
- task.clear (fail): median 2177.8 ms is above the limit 1792.8 ms (baseline 1292.8 ms + max(10%, 500 ms))
- task.total (fail): median 24536.7 ms is above the limit 21145.6 ms (baseline 19223.3 ms + max(10%, 500 ms))

## Problems

None: both sides are complete, attested and comparable.

Verdict: **FAIL**
