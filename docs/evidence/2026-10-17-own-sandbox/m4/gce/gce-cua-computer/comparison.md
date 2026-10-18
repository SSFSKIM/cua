# Native baseline comparison, same host (before and after)

| | Baseline | Candidate |
|---|---|---|
| REPL host | cua | cua |
| initialize answered by | cua-repl-host 0.5.0 | cua-repl-host 0.5.0 |
| Commit | aacc6755b46b1898b6b102d32a2a15b6e50e9cd0 | 7b8787312a156d7029ecf04aff1cbc355de2e9ae |
| device | cua-gce | cua-gce |
| release | 26.928.40906-linux-arm64 | 26.928.40906-linux-arm64 |
| hardware | Google Compute Engine, arm64, 4 CPUs, 16 GiB | Google Compute Engine, arm64, 4 CPUs, 16 GiB |
| os | Ubuntu 24.04.5 LTS (7.0.0-1014-gcp) | Ubuntu 24.04.5 LTS (7.0.0-1014-gcp) |
| display | 1280 x 800 points at scale 1 (1280 x 800 pixels) | 1280 x 800 points at scale 1 (1280 x 800 pixels) |
| service | computer surface, answered by vendor (helper: pinned runtime) | computer surface, answered by vendor (helper: pinned runtime) |
| sandbox | disabled (platform default) | scoped (platform default) |
| plan | 5 cold, 30 warm, 10 tasks | 5 cold, 30 warm, 10 tasks |
| Runs | run-1, run-2, run-3 | run-1, run-2, run-3 |
| ssh.roundtrip median | 2624.4 | 2276.2 |

Rule (#115 acceptance 11): one host, three complete, attested runs a side covering the same plan, on the same machine and configuration except the permitted differences below; the judged rows are cold.miss.first_js and cold.hit.first_js: the candidate's median must be at most the baseline's plus max(10%, 500 ms), or faster, and it must succeed in no smaller share of its valid samples. Every other row is reported, not judged. Milliseconds; "OK" is successes over valid samples; wall and in-cell columns are median / p95 / max of successful samples.

| Operation | Basis | Baseline OK | Candidate OK | Baseline judged | Candidate judged | Limit | Verdict | Baseline wall | Candidate wall | Baseline in-cell | Candidate in-cell |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ssh.roundtrip | – | 15/15 | 15/15 | 2624.4 | 2276.2 | – | not judged | 2624.4 / 3011.6 / 3011.6 | 2276.2 / 2617.7 / 2617.7 | – | – |
| cold.miss.initialize | wall median net of ssh.roundtrip median | 6/6 | 6/6 | 275.4 | 349.2 | – | not judged | 2899.8 / 3238.5 / 3238.5 | 2625.4 / 2765.1 / 2765.1 | – | – |
| cold.miss.tools_list | wall median | 6/6 | 6/6 | 287.0 | 328.7 | – | not judged | 287.0 / 686.0 / 686.0 | 328.7 / 418.1 / 418.1 | – | – |
| cold.miss.first_js | wall median | 6/6 | 6/6 | 666.5 | 735.1 | 1166.5 | pass | 666.5 / 689.3 / 689.3 | 735.1 / 772.5 / 772.5 | 0.01 / 0.02 / 0.02 | 0.01 / 0.02 / 0.02 |
| cold.miss.total | wall median net of ssh.roundtrip median | 6/6 | 6/6 | 1306.1 | 1419.0 | – | not judged | 3930.5 / 4290.4 / 4290.4 | 3695.2 / 3898.5 / 3898.5 | – | – |
| cold.hit.initialize | wall median net of ssh.roundtrip median | 9/9 | 9/9 | 148.4 | 178.0 | – | not judged | 2772.8 / 3119.5 / 3119.5 | 2454.2 / 2873.6 / 2873.6 | – | – |
| cold.hit.tools_list | wall median | 9/9 | 9/9 | 397.8 | 358.6 | – | not judged | 397.8 / 627.1 / 627.1 | 358.6 / 447.1 / 447.1 | – | – |
| cold.hit.first_js | wall median | 9/9 | 9/9 | 773.6 | 825.8 | 1273.6 | pass | 773.6 / 992.4 / 992.4 | 825.8 / 901.7 / 901.7 | 0.01 / 0.02 / 0.02 | 0.01 / 0.02 / 0.02 |
| cold.hit.total | wall median net of ssh.roundtrip median | 9/9 | 9/9 | 1370.9 | 1352.5 | – | not judged | 3995.2 / 4380.5 / 4380.5 | 3628.7 / 4185.1 / 4185.1 | – | – |
| warm.noop | wall median | 90/90 | 90/90 | 175.4 | 175.3 | – | not judged | 175.4 / 302.0 / 349.3 | 175.3 / 217.1 / 281.3 | 0.01 / 0.03 / 0.06 | 0.01 / 0.03 / 0.06 |
| warm.getState | wall median | 90/90 | 90/90 | 400.0 | 177.6 | – | not judged | 400.0 / 578.3 / 653.3 | 177.6 / 253.2 / 268.9 | 5.67 / 7.68 / 19.2 | 5.73 / 7.72 / 18.9 |
| warm.listApps | wall median | 90/90 | 90/90 | 429.8 | 173.8 | – | not judged | 429.8 / 544.9 / 602.5 | 173.8 / 249.6 / 301.1 | 5.65 / 5.87 / 6.34 | 5.71 / 6.80 / 10.7 |
| setup.findWindow | – | 3/3 | 3/3 | 456.4 | 178.9 | – | not judged | 456.4 / 662.4 / 662.4 | 178.9 / 201.2 / 201.2 | 8.57 / 8.80 / 8.80 | 9.34 / 9.38 / 9.38 |
| bind.getApp | wall median | 3/3 | 3/3 | 739.0 | 533.9 | – | not judged | 739.0 / 795.6 / 795.6 | 533.9 / 537.0 / 537.0 | 364.8 / 366.4 / 366.4 | 363.1 / 366.4 / 366.4 |
| warm.getAXState | wall median | 90/90 | 90/90 | 698.1 | 522.6 | – | not judged | 698.1 / 842.7 / 1051.9 | 522.6 / 563.3 / 688.3 | 330.6 / 339.3 / 341.5 | 333.3 / 347.3 / 355.8 |
| warm.getScreenshot | wall median | 90/90 | 90/90 | 806.0 | 779.3 | – | not judged | 806.0 / 963.0 / 1035.2 | 779.3 / 829.1 / 885.3 | 446.9 / 459.8 / 472.8 | 447.2 / 457.5 / 461.5 |
| task.act | wall median | 30/30 | 30/30 | 16514.1 | 16497.1 | – | not judged | 16514.1 / 16733.3 / 16746.8 | 16497.1 / 16561.3 / 16606.0 | 16153.8 / 16168.7 / 16171.4 | 16146.7 / 16185.2 / 16191.9 |
| task.verify | wall median | 30/30 | 30/30 | 674.2 | 686.8 | – | not judged | 674.2 / 778.4 / 840.9 | 686.8 / 737.3 / 752.2 | 332.1 / 343.8 / 345.8 | 331.0 / 344.9 / 345.8 |
| task.clear | wall median | 30/30 | 30/30 | 1494.4 | 1472.5 | – | not judged | 1494.4 / 1626.1 / 1681.8 | 1472.5 / 1589.4 / 1749.2 | 1138.9 / 1148.5 / 1150.3 | 1137.4 / 1150.9 / 1151.5 |
| task.total | wall median | 30/30 | 30/30 | 18685.1 | 18667.9 | – | not judged | 18685.1 / 19020.8 / 19082.2 | 18667.9 / 18784.3 / 19006.4 | 17629.8 / 17654.0 / 17657.8 | 17617.1 / 17658.3 / 17681.0 |
| method.typeText | wall median | 3/3 | 3/3 | 2028.4 | 1642.9 | – | not judged | 2028.4 / 3242.4 / 3242.4 | 1642.9 / 1643.2 / 1643.2 | 1478.3 / 2876.4 / 2876.4 | 1477.1 / 1478.3 / 1478.3 |
| method.paste | wall median | 3/3 | 3/3 | 1869.9 | 1639.5 | – | not judged | 1869.9 / 1879.7 / 1879.7 | 1639.5 / 1707.3 / 1707.3 | 1471.6 / 1473.9 / 1473.9 | 1475.8 / 1481.5 / 1481.5 |
| method.paste.format | wall median | 3/3 | 3/3 | 322.4 | 164.3 | – | not judged | 322.4 / 493.0 / 493.0 | 164.3 / 178.2 / 178.2 | 0.07 / 0.09 / 0.09 | 0.07 / 0.07 / 0.07 |
| method.setValue | wall median | 3/3 | 3/3 | 437.4 | 164.8 | – | not judged | 437.4 / 470.4 / 470.4 | 164.8 / 174.8 / 174.8 | 0.13 / 0.16 / 0.16 | 0.13 / 0.15 / 0.15 |
| method.selectText | wall median | 3/3 | 3/3 | 385.9 | 168.0 | – | not judged | 385.9 / 540.7 / 540.7 | 168.0 / 171.3 / 171.3 | 0.13 / 0.14 / 0.14 | 0.11 / 0.21 / 0.21 |
| method.scroll.pages | wall median | 3/3 | 3/3 | 467.6 | 167.4 | – | not judged | 467.6 / 514.0 / 514.0 | 167.4 / 171.5 / 171.5 | 0.13 / 0.19 / 0.19 | 0.11 / 0.12 / 0.12 |
| end_task | wall median | 3/3 | 3/3 | 209.5 | 159.7 | – | not judged | 209.5 / 250.1 / 250.1 | 159.7 / 165.7 / 165.7 | – | – |
| setup.findTarget | – | 6/6 | 6/6 | 334.3 | 186.2 | – | not judged | 334.3 / 465.9 / 465.9 | 186.2 / 197.1 / 197.1 | 11.5 / 11.8 / 11.8 | 12.1 / 16.0 / 16.0 |

## Permitted configuration differences

- sandbox mode: disabled (platform default) -> scoped (platform default) (Linux computer sessions default to scoped with the confined kernel (#115), the change being measured)
- sandbox launcher: codex-cli -> cua (cua's own launcher replaces the Codex CLI (#115))
- TMPDIR: unset -> session (each session gets its own TMPDIR (#115))

## Failures and notes

None.

## Problems

- hardware environment differs between the baseline and the candidate

Verdict: **NO VERDICT**
