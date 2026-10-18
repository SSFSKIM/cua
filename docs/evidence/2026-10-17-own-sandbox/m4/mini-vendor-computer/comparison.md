# Native baseline comparison, same host (before and after)

| | Baseline | Candidate |
|---|---|---|
| REPL host | vendor | vendor |
| initialize answered by | rmcp 1.5.0 | rmcp 1.5.0 |
| Commit | 90cbfe0bd6f21cbde9b656392ee1f2b8dccbc754 | 8782604260f3e3dd90a507ea15ecaf887a8c88ab |
| device | mini | mini |
| release | 26.928.40906-darwin-arm64 | 26.928.40906-darwin-arm64 |
| hardware | Mac14,12, Apple M2 Pro, 16 GiB | Mac14,12, Apple M2 Pro, 16 GiB |
| os | macOS 27.0 (26A428) | macOS 27.0 (26A428) |
| display | 2560 x 1440 points at scale 2 (5120 x 2880 pixels) | 2560 x 1440 points at scale 2 (5120 x 2880 pixels) |
| service | computer surface, answered by vendor (helper: pinned runtime) | computer surface, answered by vendor (helper: pinned runtime) |
| sandbox | scoped (platform default) | scoped (platform default) |
| plan | 5 cold, 30 warm, 10 tasks | 5 cold, 30 warm, 10 tasks |
| Runs | run-1, run-2, run-3 | run-1, run-2, run-3 |
| ssh.roundtrip median | 520.8 | 389.4 |

Rule (#115 acceptance 11): one host, three complete, attested runs a side covering the same plan, on the same machine and configuration except the permitted differences below; the judged rows are cold.miss.first_js and cold.hit.first_js: the candidate's median must be at most the baseline's plus max(10%, 500 ms), or faster, and it must succeed in no smaller share of its valid samples. Every other row is reported, not judged. Milliseconds; "OK" is successes over valid samples; wall and in-cell columns are median / p95 / max of successful samples.

| Operation | Basis | Baseline OK | Candidate OK | Baseline judged | Candidate judged | Limit | Verdict | Baseline wall | Candidate wall | Baseline in-cell | Candidate in-cell |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ssh.roundtrip | – | 15/15 | 15/15 | 520.8 | 389.4 | – | not judged | 520.8 / 1022.1 / 1022.1 | 389.4 / 521.1 / 521.1 | – | – |
| cold.miss.initialize | wall median net of ssh.roundtrip median | 6/6 | 6/6 | 381.0 | 358.7 | – | not judged | 901.8 / 1304.8 / 1304.8 | 748.1 / 836.3 / 836.3 | – | – |
| cold.miss.tools_list | wall median | 6/6 | 6/6 | 26.0 | 22.8 | – | not judged | 26.0 / 63.2 / 63.2 | 22.8 / 134.7 / 134.7 | – | – |
| cold.miss.first_js | wall median | 6/6 | 6/6 | 400.9 | 258.7 | 900.9 | pass | 400.9 / 2321.9 / 2321.9 | 258.7 / 379.2 / 379.2 | 0.00 / 0.01 / 0.01 | 0.00 / 0.01 / 0.01 |
| cold.miss.total | wall median net of ssh.roundtrip median | 6/6 | 6/6 | 833.1 | 695.3 | – | not judged | 1353.9 / 3471.6 / 3471.6 | 1084.7 / 1246.1 / 1246.1 | – | – |
| cold.hit.initialize | wall median net of ssh.roundtrip median | 9/9 | 9/9 | 118.2 | 85.6 | – | not judged | 639.0 / 1010.2 / 1010.2 | 474.9 / 563.6 / 563.6 | – | – |
| cold.hit.tools_list | wall median | 9/9 | 9/9 | 25.5 | 18.1 | – | not judged | 25.5 / 107.4 / 107.4 | 18.1 / 38.4 / 38.4 | – | – |
| cold.hit.first_js | wall median | 9/9 | 9/9 | 429.3 | 489.0 | 929.3 | pass | 429.3 / 519.7 / 519.7 | 489.0 / 630.6 / 630.6 | 0.00 / 0.01 / 0.01 | 0.00 / 0.01 / 0.01 |
| cold.hit.total | wall median net of ssh.roundtrip median | 9/9 | 9/9 | 638.2 | 585.6 | – | not judged | 1159.0 / 1429.6 / 1429.6 | 975.0 / 1172.6 / 1172.6 | – | – |
| warm.noop | wall median | 90/90 | 90/90 | 20.7 | 17.5 | – | not judged | 20.7 / 112.2 / 159.2 | 17.5 / 104.3 / 216.6 | 0.02 / 0.04 / 0.35 | 0.01 / 0.02 / 0.03 |
| warm.getState | wall median | 90/90 | 90/90 | 52.7 | 40.4 | – | not judged | 52.7 / 155.4 / 1302.5 | 40.4 / 142.5 / 1040.5 | 21.3 / 31.7 / 1262.9 | 17.7 / 31.8 / 1025.8 |
| warm.listApps | wall median | 90/90 | 90/90 | 57.3 | 52.9 | – | not judged | 57.3 / 142.5 / 199.6 | 52.9 / 125.2 / 178.5 | 24.4 / 34.2 / 37.6 | 22.0 / 30.8 / 37.1 |
| bind.getApp | wall median | 3/3 | 3/3 | 1771.3 | 1689.0 | – | not judged | 1771.3 / 1843.1 / 1843.1 | 1689.0 / 1959.7 / 1959.7 | 1750.6 / 1816.8 / 1816.8 | 1609.2 / 1902.1 / 1902.1 |
| approval.elicitation | – | 3/3 | 3/3 | 32.4 | 104.0 | – | not judged | 32.4 / 158.7 / 158.7 | 104.0 / 111.5 / 111.5 | – | – |
| warm.getAXState | wall median | 90/90 | 90/90 | 90.7 | 72.1 | – | not judged | 90.7 / 195.6 / 214.4 | 72.1 / 162.5 / 200.4 | 49.8 / 75.6 / 85.5 | 43.7 / 59.3 / 63.6 |
| warm.getScreenshot | wall median | 90/90 | 90/90 | 87.1 | 73.3 | – | not judged | 87.1 / 168.2 / 230.2 | 73.3 / 178.8 / 208.7 | 50.4 / 62.3 / 91.9 | 44.6 / 58.7 / 92.0 |
| task.act | wall median | 30/30 | 30/30 | 900.7 | 870.7 | – | not judged | 900.7 / 1012.3 / 1148.5 | 870.7 / 1012.3 / 1016.6 | 854.1 / 961.4 / 1047.0 | 836.0 / 933.3 / 978.7 |
| task.verify | wall median | 30/30 | 30/30 | 512.1 | 507.2 | – | not judged | 512.1 / 603.8 / 630.3 | 507.2 / 531.3 / 615.5 | 446.6 / 482.8 / 482.8 | 463.8 / 475.9 / 476.8 |
| task.close | wall median | 30/30 | 30/30 | 2663.9 | 2646.9 | – | not judged | 2663.9 / 2923.6 / 2928.4 | 2646.9 / 2774.2 / 2820.2 | 2626.9 / 2768.1 / 2888.1 | 2608.1 / 2715.6 / 2749.9 |
| task.total | wall median | 30/30 | 30/30 | 4038.3 | 4016.0 | – | not judged | 4038.3 / 4325.4 / 4334.6 | 4016.0 / 4225.4 / 4268.4 | 3914.4 / 4116.0 / 4130.1 | 3913.5 / 4076.8 / 4081.2 |
| end_task | wall median | 3/3 | 3/3 | 29.4 | 11.8 | – | not judged | 29.4 / 32.3 / 32.3 | 11.8 / 11.8 / 11.8 | – | – |
| guard.scratch | – | 6/6 | 6/6 | 102.1 | 68.9 | – | not judged | 102.1 / 171.5 / 171.5 | 68.9 / 97.6 / 97.6 | 51.1 / 64.8 / 64.8 | 45.2 / 58.3 / 58.3 |
| setup.newDocument | – | 3/3 | 3/3 | 1839.1 | 2095.3 | – | not judged | 1839.1 / 2163.7 / 2163.7 | 2095.3 / 2194.2 / 2194.2 | 1754.3 / 2006.0 / 2006.0 | 2055.8 / 2077.0 / 2077.0 |

## Permitted configuration differences

- sandbox launcher: codex-cli -> cua-compat (cua's own launcher replaces the Codex CLI (#115))
- TMPDIR: inherited -> session (each session gets its own TMPDIR (#115))

## Failures and notes

None.

## Problems

None: both sides are complete, attested and comparable.

Verdict: **PASS**
