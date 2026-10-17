# Native baseline comparison

| | Baseline | Candidate |
|---|---|---|
| REPL host | vendor | cua |
| initialize answered by | rmcp 1.5.0 | cua-repl-host 0.5.0 |
| Commit | b3cb6dbfde346a7e1e90bd2bc065052853aec056 | b3cb6dbfde346a7e1e90bd2bc065052853aec056 |
| device | cua-bench | cua-bench |
| release | 26.928.40906-linux-arm64 | 26.928.40906-linux-arm64 |
| hardware | Google Compute Engine, arm64, 4 CPUs, 16 GiB | Google Compute Engine, arm64, 4 CPUs, 16 GiB |
| os | Ubuntu 24.04.5 LTS (7.0.0-1014-gcp) | Ubuntu 24.04.5 LTS (7.0.0-1014-gcp) |
| display | 1440 x 900 points at scale 1 (1440 x 900 pixels) | 1440 x 900 points at scale 1 (1440 x 900 pixels) |
| service | computer surface, answered by vendor (helper: pinned runtime) | computer surface, answered by vendor (helper: pinned runtime) |
| sandbox | disabled (platform default) | disabled (platform default) |
| plan | 5 cold, 30 warm, 10 tasks | 5 cold, 30 warm, 10 tasks |
| Runs | run-1, run-2, run-3 | run-1, run-2, run-3 |
| ssh.roundtrip median | 2149.5 | 2207.3 |

Rule (acceptance 8): three complete, attested runs a side covering the same plan; per operation (method cases included), the candidate's judged median must be at most the baseline's plus max(10%, 500 ms), or faster, and it must succeed in no smaller share of its valid samples. The judged median is wall time around the MCP call; the cold-connection phases that open the ssh pipe are judged net of each side's ssh.roundtrip median. ssh, approval, guard and setup operations are reported, not judged. Milliseconds; "OK" is successes over valid samples; wall and in-cell columns are median / p95 / max of successful samples.

| Operation | Basis | Baseline OK | Candidate OK | Baseline judged | Candidate judged | Limit | Verdict | Baseline wall | Candidate wall | Baseline in-cell | Candidate in-cell |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ssh.roundtrip | – | 15/15 | 15/15 | 2149.5 | 2207.3 | – | not judged | 2149.5 / 2769.2 / 2769.2 | 2207.3 / 3606.0 / 3606.0 | – | – |
| cold.miss.initialize | wall median net of ssh.roundtrip median | 6/6 | 6/6 | 553.3 | 491.9 | 1053.3 | pass | 2702.8 / 3006.5 / 3006.5 | 2699.2 / 2827.3 / 2827.3 | – | – |
| cold.miss.tools_list | wall median | 6/6 | 6/6 | 187.4 | 175.8 | 687.4 | pass | 187.4 / 351.4 / 351.4 | 175.8 / 194.6 / 194.6 | – | – |
| cold.miss.first_js | wall median | 6/6 | 6/6 | 640.0 | 651.8 | 1140.0 | pass | 640.0 / 785.4 / 785.4 | 651.8 / 742.6 / 742.6 | 0.01 / 0.01 / 0.01 | 0.01 / 0.03 / 0.03 |
| cold.miss.total | wall median net of ssh.roundtrip median | 6/6 | 6/6 | 1368.7 | 1359.1 | 1868.7 | pass | 3518.2 / 3979.9 / 3979.9 | 3566.4 / 3730.4 / 3730.4 | – | – |
| cold.hit.initialize | wall median net of ssh.roundtrip median | 9/9 | 9/9 | 411.7 | 89.2 | 911.7 | pass | 2561.2 / 2951.5 / 2951.5 | 2296.5 / 3183.8 / 3183.8 | – | – |
| cold.hit.tools_list | wall median | 9/9 | 9/9 | 160.0 | 172.2 | 660.0 | pass | 160.0 / 187.0 / 187.0 | 172.2 / 195.5 / 195.5 | – | – |
| cold.hit.first_js | wall median | 9/9 | 9/9 | 755.3 | 769.1 | 1255.3 | pass | 755.3 / 863.0 / 863.0 | 769.1 / 1033.0 / 1033.0 | 0.01 / 0.01 / 0.01 | 0.01 / 0.03 / 0.03 |
| cold.hit.total | wall median net of ssh.roundtrip median | 9/9 | 9/9 | 1329.3 | 1047.2 | 1829.3 | pass | 3478.8 / 3996.4 / 3996.4 | 3254.6 / 4397.1 / 4397.1 | – | – |
| warm.noop | wall median | 90/90 | 90/90 | 176.0 | 173.1 | 676.0 | pass | 176.0 / 338.4 / 519.9 | 173.1 / 243.7 / 275.0 | 0.01 / 0.03 / 0.06 | 0.01 / 0.03 / 0.05 |
| warm.getState | wall median | 90/90 | 90/90 | 174.2 | 179.8 | 674.2 | pass | 174.2 / 222.6 / 753.3 | 179.8 / 361.4 / 631.8 | 2.50 / 3.98 / 28.7 | 2.67 / 3.24 / 16.4 |
| warm.listApps | wall median | 90/90 | 90/90 | 167.2 | 167.9 | 667.2 | pass | 167.2 / 232.7 / 600.0 | 167.9 / 233.9 / 300.7 | 2.46 / 2.81 / 4.10 | 2.61 / 2.92 / 3.02 |
| setup.findWindow | – | 3/3 | 3/3 | 443.5 | 211.2 | – | not judged | 443.5 / 457.2 / 457.2 | 211.2 / 420.9 / 420.9 | 262.1 / 262.5 / 262.5 | 8.66 / 262.3 / 262.3 |
| bind.getApp | wall median | 3/3 | 3/3 | 521.3 | 529.4 | 1021.3 | pass | 521.3 / 534.5 / 534.5 | 529.4 / 829.4 / 829.4 | 351.4 / 362.2 / 362.2 | 362.0 / 379.6 / 379.6 |
| warm.getAXState | wall median | 90/90 | 90/90 | 497.8 | 518.6 | 997.8 | pass | 497.8 / 534.5 / 638.3 | 518.6 / 599.4 / 765.0 | 328.1 / 343.2 / 348.7 | 333.6 / 343.1 / 351.1 |
| warm.getScreenshot | wall median | 90/90 | 90/90 | 617.0 | 620.3 | 1117.0 | pass | 617.0 / 720.5 / 855.4 | 620.3 / 756.6 / 951.7 | 446.8 / 457.2 / 462.2 | 447.9 / 461.8 / 466.9 |
| task.act | wall median | 30/30 | 30/30 | 16328.6 | 16318.5 | 17961.5 | pass | 16328.6 / 16608.0 / 16615.7 | 16318.5 / 16443.0 / 16471.6 | 16152.1 / 16171.0 / 16172.5 | 16142.5 / 16174.5 / 16178.2 |
| task.verify | wall median | 30/30 | 30/30 | 499.4 | 512.1 | 999.4 | pass | 499.4 / 533.8 / 716.8 | 512.1 / 710.3 / 905.0 | 330.1 / 340.4 / 344.1 | 336.0 / 352.6 / 353.6 |
| task.clear | wall median | 30/30 | 30/30 | 1314.1 | 1318.1 | 1814.1 | pass | 1314.1 / 1440.4 / 1647.7 | 1318.1 / 1419.4 / 1439.4 | 1133.6 / 1142.9 / 1144.5 | 1138.8 / 1152.7 / 1157.1 |
| task.total | wall median | 30/30 | 30/30 | 18158.7 | 18159.3 | 19974.6 | pass | 18158.7 / 18500.4 / 18584.9 | 18159.3 / 18413.5 / 18796.0 | 17617.1 / 17635.4 / 17637.7 | 17616.9 / 17644.0 / 17669.4 |
| end_task | wall median | 3/3 | 3/3 | 159.7 | 189.6 | 659.7 | pass | 159.7 / 235.6 / 235.6 | 189.6 / 233.0 / 233.0 | – | – |
| setup.findTarget | – | 6/6 | 6/6 | 174.8 | 182.9 | – | not judged | 174.8 / 426.7 / 426.7 | 182.9 / 517.9 / 517.9 | 9.56 / 268.6 / 268.6 | 9.88 / 270.2 / 270.2 |

## Method cases

Outcomes are counted per sample (`n x` the outcome); wall is median / p95 / max of the samples the harness ran, judged by the same rule.

| Method case | Baseline samples | Baseline outcomes | Candidate samples | Candidate outcomes | Baseline wall | Candidate wall | Limit | Verdict |
|---|---|---|---|---|---|---|---|---|
| method.typeText | 3 | 2x {"outcome":"threw","error":"D-Bus org.freedesktop.DBus.Properties.Get failed: org.freedesktop.DBus.Error.NoReply: Message recipient disconnected from message bus without replying","target":"exited","inserted":null}<br>1x {"outcome":"threw","error":"Resource temporarily unavailable (os error 11)","target":"exited","inserted":null} | 3 | 3x {"outcome":"threw","error":"D-Bus org.freedesktop.DBus.Properties.Get failed: org.freedesktop.DBus.Error.NoReply: Message recipient disconnected from message bus without replying","target":"exited","inserted":null} | 1634.5 / 3014.3 / 3014.3 | 1636.2 / 1641.6 / 1641.6 | 2134.5 | fail |
| method.paste | 3 | 3x {"outcome":"threw","error":"D-Bus org.freedesktop.DBus.Properties.Get failed: org.freedesktop.DBus.Error.NoReply: Message recipient disconnected from message bus without replying","target":"exited","inserted":null} | 3 | 3x {"outcome":"threw","error":"D-Bus org.freedesktop.DBus.Properties.Get failed: org.freedesktop.DBus.Error.NoReply: Message recipient disconnected from message bus without replying","target":"exited","inserted":null} | 1637.8 / 1661.6 / 1661.6 | 1662.3 / 1674.5 / 1674.5 | 2137.8 | pass |
| method.paste.format | 3 | 3x {"outcome":"threw","error":"Linux paste supports only text format.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"Linux paste supports only text format.","target":"survived","inserted":null} | 164.8 / 166.3 / 166.3 | 196.8 / 202.9 / 202.9 | 664.8 | pass |
| method.setValue | 3 | 3x {"outcome":"threw","error":"setValue is unavailable on Linux; use click, pressKey, and typeText.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"setValue is unavailable on Linux; use click, pressKey, and typeText.","target":"survived","inserted":null} | 179.3 / 202.4 / 202.4 | 165.3 / 193.6 / 193.6 | 679.3 | pass |
| method.selectText | 3 | 3x {"outcome":"threw","error":"selectText is unavailable on Linux.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"selectText is unavailable on Linux.","target":"survived","inserted":null} | 159.4 / 175.1 / 175.1 | 156.7 / 202.7 / 202.7 | 659.4 | pass |
| method.scroll.pages | 3 | 3x {"outcome":"threw","error":"Linux scroll accepts { pixels }, not pages.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"Linux scroll accepts { pixels }, not pages.","target":"survived","inserted":null} | 183.3 / 199.0 / 199.0 | 159.7 / 204.6 / 204.6 | 683.3 | pass |

## Failures and notes

- method.typeText (fail): outcome differs: baseline 2x {"outcome":"threw","error":"D-Bus org.freedesktop.DBus.Properties.Get failed: org.freedesktop.DBus.Error.NoReply: Message recipient disconnected from message bus without replying","target":"exited","inserted":null} | 1x {"outcome":"threw","error":"Resource temporarily unavailable (os error 11)","target":"exited","inserted":null}; candidate 3x {"outcome":"threw","error":"D-Bus org.freedesktop.DBus.Properties.Get failed: org.freedesktop.DBus.Error.NoReply: Message recipient disconnected from message bus without replying","target":"exited","inserted":null}

## Problems

None: both sides are complete, attested and comparable.

Verdict: **FAIL**
