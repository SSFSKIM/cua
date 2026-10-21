# Native baseline comparison A: engine and service

| | Baseline | Candidate |
|---|---|---|
| REPL host | vendor | vendor |
| Engine | vendor (attested: vendor 26.924.1001281, build 26.928.40906-darwin-arm64) | cua (attested: cua 0.1.0, build 4b31b8e61195) |
| Approved engine | 4b31b8e61195 (cua 0.1.0, /Users/new/Library/Application Support/cua/engine/cua Engine.app) | 4b31b8e61195 (cua 0.1.0, /Users/new/Library/Application Support/cua/engine/cua Engine.app) |
| initialize answered by | rmcp 1.5.0 | rmcp 1.5.0 |
| Commit | b076648ee5b840555f0f2bf9c46a92b9ca9e5f31 | b076648ee5b840555f0f2bf9c46a92b9ca9e5f31 |
| device | mini | mini |
| release | 26.928.40906-darwin-arm64 | 26.928.40906-darwin-arm64 |
| hardware | Mac14,12, Apple M2 Pro, 16 GiB | Mac14,12, Apple M2 Pro, 16 GiB |
| os | macOS 27.0 (26A428) | macOS 27.0 (26A428) |
| display | 2560 x 1440 points at scale 2 (5120 x 2880 pixels) | 2560 x 1440 points at scale 2 (5120 x 2880 pixels) |
| service | computer surface, answered by vendor (helper: pinned runtime) | computer surface, answered by cua (helper: approved engine) |
| sandbox | scoped (platform default) | scoped (platform default) |
| plan | 5 cold, 30 warm, 10 tasks | 5 cold, 30 warm, 10 tasks |
| Runs | run-1, run-2, run-3 | run-1, run-2, run-3 |
| ssh.roundtrip median | 804.5 | 611.5 |

Rule (#117 comparison A, engine and service): the baseline runs `--host vendor --engine vendor`, the candidate `--host vendor --engine cua`; three complete, attested runs a side of one sitting covering the same plan, every attested field equal but engine, service (below). The engine is the one variable: cua's service loaded in the vendor trusted worker against the vendor's, on the vendor host. Per operation (method cases included), the candidate's judged median must be at most the baseline's plus max(10%, 500 ms), or faster, and it must succeed in no smaller share of its valid samples; the cold-connection phases that open the ssh pipe are judged net of each side's ssh.roundtrip median. ssh, approval, guard and setup operations are reported, not judged. Milliseconds; "OK" is successes over valid samples; wall and in-cell columns are median / p95 / max of successful samples.

| Operation | Basis | Baseline OK | Candidate OK | Baseline judged | Candidate judged | Limit | Verdict | Baseline wall | Candidate wall | Baseline in-cell | Candidate in-cell |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ssh.roundtrip | – | 15/15 | 15/15 | 804.5 | 611.5 | – | not judged | 804.5 / 1331.6 / 1331.6 | 611.5 / 1045.1 / 1045.1 | – | – |
| cold.miss.initialize | wall median net of ssh.roundtrip median | 6/6 | 6/6 | 317.4 | 363.9 | 817.4 | pass | 1121.9 / 1423.7 / 1423.7 | 975.4 / 1309.7 / 1309.7 | – | – |
| cold.miss.tools_list | wall median | 6/6 | 6/6 | 129.7 | 23.9 | 629.7 | pass | 129.7 / 199.1 / 199.1 | 23.9 / 68.5 / 68.5 | – | – |
| cold.miss.first_js | wall median | 6/6 | 6/6 | 345.1 | 397.1 | 845.1 | pass | 345.1 / 485.2 / 485.2 | 397.1 / 458.4 / 458.4 | 0.00 / 0.01 / 0.01 | 0.00 / 0.01 / 0.01 |
| cold.miss.total | wall median net of ssh.roundtrip median | 6/6 | 6/6 | 861.3 | 813.8 | 1361.3 | pass | 1665.8 / 1939.1 / 1939.1 | 1425.3 / 1836.6 / 1836.6 | – | – |
| cold.hit.initialize | wall median net of ssh.roundtrip median | 9/9 | 9/9 | 193.7 | 109.4 | 693.7 | pass | 998.2 / 7781.1 / 7781.1 | 720.9 / 6813.1 / 6813.1 | – | – |
| cold.hit.tools_list | wall median | 9/9 | 9/9 | 41.2 | 24.4 | 541.2 | pass | 41.2 / 227.9 / 227.9 | 24.4 / 221.3 / 221.3 | – | – |
| cold.hit.first_js | wall median | 9/9 | 9/9 | 592.5 | 500.2 | 1092.5 | pass | 592.5 / 8003.7 / 8003.7 | 500.2 / 5633.3 / 5633.3 | 0.00 / 0.01 / 0.01 | 0.00 / 0.00 / 0.00 |
| cold.hit.total | wall median net of ssh.roundtrip median | 9/9 | 9/9 | 808.3 | 662.6 | 1308.3 | pass | 1612.8 / 8961.6 / 8961.6 | 1274.1 / 7538.2 / 7538.2 | – | – |
| warm.noop | wall median | 90/90 | 90/90 | 42.4 | 38.8 | 542.4 | pass | 42.4 / 191.8 / 211.8 | 38.8 / 197.1 / 205.6 | 0.02 / 0.03 / 0.04 | 0.02 / 0.03 / 0.14 |
| warm.getState | wall median | 90/90 | 90/90 | 90.9 | 69.8 | 590.9 | pass | 90.9 / 211.3 / 963.1 | 69.8 / 206.7 / 536.3 | 28.6 / 37.4 / 828.8 | 2.93 / 19.4 / 518.7 |
| warm.listApps | wall median | 90/90 | 90/90 | 78.4 | 75.1 | 578.4 | pass | 78.4 / 192.0 / 206.7 | 75.1 / 204.2 / 283.5 | 31.0 / 36.3 / 38.1 | 2.71 / 3.78 / 4.60 |
| bind.getApp | wall median | 3/3 | 3/3 | 6756.8 | 6262.4 | 7432.5 | pass | 6756.8 / 11987.4 / 11987.4 | 6262.4 / 10264.2 / 10264.2 | 6598.3 / 6607.7 / 6607.7 | 6069.1 / 6125.0 / 6125.0 |
| approval.elicitation | – | 3/3 | 3/3 | 94.2 | 93.1 | – | not judged | 94.2 / 161.5 / 161.5 | 93.1 / 131.5 / 131.5 | – | – |
| warm.getAXState | wall median | 90/90 | 90/90 | 131.3 | 120.8 | 631.3 | pass | 131.3 / 296.8 / 5339.4 | 120.8 / 289.7 / 311.2 | 59.0 / 89.4 / 92.0 | 53.0 / 68.4 / 73.8 |
| warm.getScreenshot | wall median | 90/90 | 90/90 | 132.4 | 115.9 | 632.4 | pass | 132.4 / 239.5 / 1116.6 | 115.9 / 294.2 / 473.6 | 55.4 / 89.0 / 94.3 | 54.2 / 73.0 / 81.3 |
| task.act | wall median | 30/30 | 30/30 | 1137.7 | 917.6 | 1637.7 | pass | 1137.7 / 1263.9 / 2428.8 | 917.6 / 5082.9 / 6109.9 | 963.4 / 987.5 / 1090.3 | 737.2 / 799.4 / 800.2 |
| task.verify | wall median | 30/30 | 30/30 | 519.3 | 502.4 | 1019.3 | pass | 519.3 / 831.9 / 7317.8 | 502.4 / 526.3 / 548.4 | 459.5 / 652.5 / 775.4 | 417.3 / 441.3 / 442.0 |
| task.close | wall median | 30/30 | 30/30 | 2625.6 | 1635.9 | 3125.6 | pass | 2625.6 / 2804.3 / 2822.8 | 1635.9 / 5583.8 / 9696.2 | 2584.4 / 2666.3 / 2804.7 | 1555.4 / 1767.7 / 1854.5 |
| task.total | wall median | 30/30 | 30/30 | 4309.1 | 3041.5 | 4809.1 | pass | 4309.1 / 5344.8 / 10916.3 | 3041.5 / 8210.0 / 11227.0 | 4002.1 / 4093.5 / 4205.7 | 2716.5 / 2946.2 / 3036.2 |
| end_task | wall median | 3/3 | 3/3 | 30.6 | 77.0 | 530.6 | pass | 30.6 / 77.1 / 77.1 | 77.0 / 114.6 / 114.6 | – | – |
| bind.getApp.retry | – | 3/3 | 3/3 | 1400.1 | 967.9 | – | not judged | 1400.1 / 1412.8 / 1412.8 | 967.9 / 1240.5 / 1240.5 | 1317.8 / 1326.0 / 1326.0 | 866.8 / 874.9 / 874.9 |
| guard.scratch | – | 6/6 | 6/6 | 81.7 | 117.7 | – | not judged | 81.7 / 295.2 / 295.2 | 117.7 / 191.5 / 191.5 | 57.2 / 91.6 / 91.6 | 51.1 / 64.3 / 64.3 |
| setup.activate | – | 3/3 | 3/3 | 1554.6 | 4146.7 | – | not judged | 1554.6 / 6846.4 / 6846.4 | 4146.7 / 4160.3 / 4160.3 | – | – |
| setup.newDocument | – | 3/3 | 3/3 | 2041.8 | 908.7 | – | not judged | 2041.8 / 5458.9 / 5458.9 | 908.7 / 954.1 / 954.1 | 1656.9 / 1926.1 / 1926.1 | 866.2 / 872.4 / 872.4 |

## What differs, by design

- engine: vendor (attested: vendor 26.924.1001281, build 26.928.40906-darwin-arm64) -> cua (attested: cua 0.1.0, build 4b31b8e61195)
- service: computer surface, answered by vendor (helper: pinned runtime) -> computer surface, answered by cua (helper: approved engine)

## Failures and notes

- bind.getApp.retry (not judged): counted in bind.getApp, the first attempt plus the retry

## Problems

None: both sides are complete, attested and comparable.

Verdict: **PASS**
