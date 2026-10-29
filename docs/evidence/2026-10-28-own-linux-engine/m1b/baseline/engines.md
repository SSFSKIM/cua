# Native baseline comparison A: engine (Linux)

| | Baseline | Candidate |
|---|---|---|
| REPL host | cua | cua |
| Engine | vendor (answered: sky_linux_x64 of the run's runtime) | cua (answered: cua-engine named by --engine-bin /Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/native/linux-engine/target/release/cua-engine) |
| Approved engine | – | – |
| initialize answered by | cua-repl-host 0.5.0 | cua-repl-host 0.5.0 |
| Commit | 41db78a2aa35b18655782d3aa28311518298ad44 | 41db78a2aa35b18655782d3aa28311518298ad44 |
| device | cua-171 | cua-171 |
| release | 26.928.40906-linux-x64 | 26.928.40906-linux-x64 |
| hardware | vServer, x64, 8 CPUs, 15 GiB | vServer, x64, 8 CPUs, 15 GiB |
| os | Ubuntu 24.04.4 LTS (6.8.0-138-generic) | Ubuntu 24.04.4 LTS (6.8.0-138-generic) |
| display | 1280 x 800 points at scale 1 (1280 x 800 pixels) | 1280 x 800 points at scale 1 (1280 x 800 pixels) |
| service | computer surface, answered by vendor | computer surface, answered by vendor |
| sandbox | scoped (platform default) | scoped (platform default) |
| plan | 5 cold, 30 warm, 10 tasks | 5 cold, 30 warm, 10 tasks |
| Runs | run-1, run-2, run-3 | run-1, run-2, run-3 |
| ssh.roundtrip median | 295.0 | 286.8 |

Rule (#171 comparison A, engine (Linux)): the baseline runs `--host cua --engine vendor`, the candidate `--host cua --engine cua`; three complete, attested runs a side of one sitting covering the same plan, every attested field equal but engine (below). The engine is the one variable: the vendor engine against cua's, both driven by the vendor service in cua's own host, the only one Linux serves. Per operation (method cases included), the candidate's judged median must be at most the baseline's plus max(10%, 500 ms), or faster, and it must succeed in no smaller share of its valid samples; the cold-connection phases that open the ssh pipe are judged net of each side's ssh.roundtrip median. On an operation the engine answers (warm.getState, warm.listApps, bind.getApp, warm.getAXState, warm.getScreenshot, task.act, task.verify, task.clear, task.total, method.typeText, method.paste) the candidate's judged median must also be at most the baseline's (Acceptance 10), and the typeText and paste method cases accept, until M2, exactly M1b's temporary candidate outcome (scripts/repl-parity/expected/native-linux.json baselineMethodCases), verdict "declared". ssh, approval, guard and setup operations are reported, not judged. Milliseconds; "OK" is successes over valid samples; wall and in-cell columns are median / p95 / max of successful samples.

| Operation | Basis | Baseline OK | Candidate OK | Baseline judged | Candidate judged | Limit | Verdict | Baseline wall | Candidate wall | Baseline in-cell | Candidate in-cell |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ssh.roundtrip | – | 15/15 | 15/15 | 295.0 | 286.8 | – | not judged | 295.0 / 339.9 / 339.9 | 286.8 / 326.7 / 326.7 | – | – |
| cold.miss.initialize | wall median net of ssh.roundtrip median | 6/6 | 6/6 | 373.3 | 380.7 | 873.3 | pass | 668.3 / 678.2 / 678.2 | 667.5 / 701.5 / 701.5 | – | – |
| cold.miss.tools_list | wall median | 6/6 | 6/6 | 2.60 | 2.60 | 502.6 | pass | 2.59 / 3.33 / 3.33 | 2.62 / 3.13 / 3.13 | – | – |
| cold.miss.first_js | wall median | 6/6 | 6/6 | 366.4 | 367.7 | 866.4 | pass | 366.4 / 430.3 / 430.3 | 367.7 / 417.0 / 417.0 | 0.01 / 0.02 / 0.02 | 0.01 / 0.02 / 0.02 |
| cold.miss.total | wall median net of ssh.roundtrip median | 6/6 | 6/6 | 741.6 | 742.6 | 1241.6 | pass | 1036.7 / 1097.6 / 1097.6 | 1029.4 / 1100.5 / 1100.5 | – | – |
| cold.hit.initialize | wall median net of ssh.roundtrip median | 9/9 | 9/9 | 219.4 | 238.6 | 719.4 | pass | 514.4 / 564.7 / 564.7 | 525.4 / 576.7 / 576.7 | – | – |
| cold.hit.tools_list | wall median | 9/9 | 9/9 | 1.10 | 1.20 | 501.1 | pass | 1.15 / 1.43 / 1.43 | 1.16 / 2.01 / 2.01 | – | – |
| cold.hit.first_js | wall median | 9/9 | 9/9 | 481.7 | 493.8 | 981.7 | pass | 481.7 / 545.1 / 545.1 | 493.8 / 522.9 / 522.9 | 0.02 / 0.02 / 0.02 | 0.01 / 0.02 / 0.02 |
| cold.hit.total | wall median net of ssh.roundtrip median | 9/9 | 9/9 | 702.3 | 717.8 | 1202.3 | pass | 997.3 / 1062.7 / 1062.7 | 1004.6 / 1100.6 / 1100.6 | – | – |
| warm.noop | wall median | 90/90 | 90/90 | 13.8 | 13.7 | 513.8 | pass | 13.8 / 17.8 / 20.8 | 13.7 / 22.2 / 31.4 | 0.01 / 0.02 / 0.04 | 0.01 / 0.03 / 0.04 |
| warm.getState | wall median | 90/90 | 90/90 | 23.8 | 17.7 | 523.8 | pass | 23.8 / 33.5 / 48.4 | 17.7 / 24.1 / 27.2 | 9.96 / 13.5 / 22.4 | 3.87 / 8.26 / 10.1 |
| warm.listApps | wall median | 90/90 | 90/90 | 20.9 | 17.7 | 520.9 | pass | 20.9 / 30.9 / 38.0 | 17.7 / 27.7 / 30.9 | 8.69 / 14.2 / 20.3 | 3.72 / 7.16 / 16.2 |
| setup.findWindow | – | 3/3 | 3/3 | 292.5 | 273.7 | – | not judged | 292.5 / 300.0 / 300.0 | 273.7 / 280.6 / 280.6 | 277.8 / 286.6 / 286.6 | 258.1 / 259.4 / 259.4 |
| bind.getApp | wall median | 3/3 | 3/3 | 538.8 | 128.8 | 1038.8 | pass | 538.8 / 551.3 / 551.3 | 128.8 / 174.3 / 174.3 | 519.7 / 537.4 / 537.4 | 115.2 / 155.3 / 155.3 |
| approval.elicitation | – | 3/3 | 3/3 | 40.2 | 23.0 | – | not judged | 40.2 / 64.5 / 64.5 | 23.0 / 27.7 / 27.7 | – | – |
| warm.getAXState | wall median | 90/90 | 90/90 | 522.9 | 97.2 | 1022.9 | pass | 522.9 / 646.4 / 805.5 | 97.2 / 131.1 / 169.2 | 509.1 / 633.0 / 786.5 | 83.7 / 108.5 / 151.8 |
| warm.getScreenshot | wall median | 90/90 | 90/90 | 654.8 | 117.1 | 1154.8 | pass | 654.8 / 855.1 / 906.3 | 117.1 / 141.8 / 161.1 | 639.6 / 840.2 / 895.3 | 103.5 / 128.0 / 144.9 |
| task.act | wall median | 30/30 | 30/30 | 16994.9 | 8836.3 | 18694.4 | pass | 16994.9 / 17209.0 / 17425.7 | 8836.3 / 8879.4 / 8899.5 | 16976.7 / 17189.9 / 17405.6 | 8824.2 / 8858.3 / 8879.1 |
| task.verify | wall median | 30/30 | 30/30 | 611.5 | 186.3 | 1111.5 | pass | 611.5 / 822.3 / 848.0 | 186.3 / 236.4 / 238.8 | 597.7 / 801.0 / 832.4 | 172.7 / 214.8 / 225.9 |
| task.clear | wall median | 30/30 | 30/30 | 1334.4 | 515.2 | 1834.4 | pass | 1334.4 / 1554.0 / 1646.1 | 515.2 / 557.2 / 567.7 | 1322.1 / 1538.7 / 1623.9 | 501.7 / 544.1 / 555.3 |
| task.total | wall median | 30/30 | 30/30 | 19003.2 | 9538.1 | 20903.5 | pass | 19003.2 / 19295.7 / 19630.9 | 9538.1 / 9617.9 / 9659.3 | 18965.4 / 19251.3 / 19582.2 | 9499.3 / 9569.2 / 9608.8 |
| end_task | wall median | 3/3 | 3/3 | 2.90 | 3.00 | 502.9 | pass | 2.89 / 2.92 / 2.92 | 3.01 / 3.24 / 3.24 | – | – |
| setup.findTarget | – | 6/6 | 6/6 | 306.8 | 273.8 | – | not judged | 306.8 / 314.6 / 314.6 | 273.8 / 275.2 / 275.2 | 292.5 / 298.4 / 298.4 | 259.6 / 261.4 / 261.4 |

## Method cases

Outcomes are counted per sample (`n x` the outcome); wall is median / p95 / max of the samples the harness ran, judged by the same rule.

| Method case | Baseline samples | Baseline outcomes | Candidate samples | Candidate outcomes | Baseline wall | Candidate wall | Limit | Verdict |
|---|---|---|---|---|---|---|---|---|
| method.typeText | 3 | 3x {"outcome":"threw","error":"editable Paste did not insert text","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"type_text is not available in this engine build","target":"survived","inserted":null} | 10238.8 / 10248.4 / 10248.4 | 17.8 / 18.5 / 18.5 | 11262.7 | declared |
| method.paste | 3 | 3x {"outcome":"threw","error":"editable Paste did not insert text","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"type_text is not available in this engine build","target":"survived","inserted":null} | 10244.5 / 10256.6 / 10256.6 | 16.8 / 18.9 / 18.9 | 11269.0 | declared |
| method.paste.format | 3 | 3x {"outcome":"threw","error":"Linux paste supports only text format.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"Linux paste supports only text format.","target":"survived","inserted":null} | 13.3 / 13.4 / 13.4 | 12.1 / 20.4 / 20.4 | 513.3 | pass |
| method.setValue | 3 | 3x {"outcome":"threw","error":"setValue is unavailable on Linux; use click, pressKey, and typeText.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"setValue is unavailable on Linux; use click, pressKey, and typeText.","target":"survived","inserted":null} | 13.2 / 15.1 / 15.1 | 17.1 / 17.9 / 17.9 | 513.2 | pass |
| method.selectText | 3 | 3x {"outcome":"threw","error":"selectText is unavailable on Linux.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"selectText is unavailable on Linux.","target":"survived","inserted":null} | 13.5 / 14.2 / 14.2 | 16.8 / 23.3 / 23.3 | 513.5 | pass |
| method.scroll.pages | 3 | 3x {"outcome":"threw","error":"Linux scroll accepts { pixels }, not pages.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"Linux scroll accepts { pixels }, not pages.","target":"survived","inserted":null} | 11.8 / 14.4 / 14.4 | 14.6 / 18.2 / 18.2 | 511.8 | pass |

## Where cua's median is above the vendor engine's

- cold.miss.initialize: cua 380.7 ms, vendor 373.3 ms (no engine answers it: judged by the tolerance alone)
- cold.miss.first_js: cua 367.7 ms, vendor 366.4 ms (no engine answers it: judged by the tolerance alone)
- cold.miss.total: cua 742.6 ms, vendor 741.6 ms (no engine answers it: judged by the tolerance alone)
- cold.hit.initialize: cua 238.6 ms, vendor 219.4 ms (no engine answers it: judged by the tolerance alone)
- cold.hit.tools_list: cua 1.20 ms, vendor 1.10 ms (no engine answers it: judged by the tolerance alone)
- cold.hit.first_js: cua 493.8 ms, vendor 481.7 ms (no engine answers it: judged by the tolerance alone)
- cold.hit.total: cua 717.8 ms, vendor 702.3 ms (no engine answers it: judged by the tolerance alone)
- method.setValue: cua 17.1 ms, vendor 13.2 ms (no engine answers it: judged by the tolerance alone)
- method.selectText: cua 16.8 ms, vendor 13.5 ms (no engine answers it: judged by the tolerance alone)
- method.scroll.pages: cua 14.6 ms, vendor 11.8 ms (no engine answers it: judged by the tolerance alone)
- end_task: cua 3.00 ms, vendor 2.90 ms (no engine answers it: judged by the tolerance alone)

## What differs, by design

- engine: vendor (answered: sky_linux_x64 of the run's runtime) -> cua (answered: cua-engine named by --engine-bin /Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/native/linux-engine/target/release/cua-engine)

## Failures and notes

- method.typeText (declared): M1b's temporary candidate outcome (until M2) on all 3 cua samples: threw, "type_text is not available in this engine build", window survived; the vendor engine's: 3x {"outcome":"threw","error":"editable Paste did not insert text","target":"survived","inserted":null}
- method.paste (declared): M1b's temporary candidate outcome (until M2) on all 3 cua samples: threw, "type_text is not available in this engine build", window survived; the vendor engine's: 3x {"outcome":"threw","error":"editable Paste did not insert text","target":"survived","inserted":null}

## Problems

None: both sides are complete, attested and comparable.

Verdict: **PASS**
