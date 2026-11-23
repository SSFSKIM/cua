# Native baseline comparison A: engine (Linux)

| | Baseline | Candidate |
|---|---|---|
| REPL host | cua | cua |
| Engine | vendor (answered: sky_linux_arm64 of the run's runtime) | cua (answered: cua-engine installed in the run's home) |
| Approved engine | – | – |
| initialize answered by | cua-repl-host 0.5.0 | cua-repl-host 0.5.0 |
| Commit | da306cc6319e7e9da282812402308c074b872dee | da306cc6319e7e9da282812402308c074b872dee |
| device | cua-171-arm64 | cua-171-arm64 |
| release | 26.928.40906-linux-arm64 | 26.928.40906-linux-arm64 |
| hardware | Google Compute Engine, arm64, 8 CPUs, 31 GiB | Google Compute Engine, arm64, 8 CPUs, 31 GiB |
| os | Ubuntu 24.04.5 LTS (7.0.0-1017-gcp) | Ubuntu 24.04.5 LTS (7.0.0-1017-gcp) |
| display | 1280 x 800 points at scale 1 (1280 x 800 pixels) | 1280 x 800 points at scale 1 (1280 x 800 pixels) |
| service | computer surface, answered by vendor | computer surface, answered by cua |
| sandbox | scoped (platform default) | scoped (platform default) |
| plan | 5 cold, 30 warm, 10 tasks | 5 cold, 30 warm, 10 tasks |
| Runs | run-1, run-2, run-3 | run-1, run-2, run-3 |
| ssh.roundtrip median | 183.7 | 185.0 |

Rule (#171 comparison A, engine (Linux)): the baseline runs `--host cua --engine vendor`, the candidate `--host cua --engine cua`; three complete, attested runs a side of one sitting covering the same plan, every attested field equal but engine, service (below). The engine and its service are the variable: the vendor engine behind the vendor service against cua's engine behind cua's service, both in cua's own host, the only one Linux serves. Per operation (method cases included), the candidate's judged median must be at most the baseline's plus max(10%, 500 ms), or faster, and it must succeed in no smaller share of its valid samples; the cold-connection phases that open the ssh pipe are judged net of each side's ssh.roundtrip median. On an operation the engine answers (warm.getState, warm.listApps, bind.getApp, warm.getAXState, warm.getScreenshot, task.act, task.verify, task.clear, task.total, method.typeText, method.paste) the candidate is judged by the in-cell time (#370), the cell's own call through the service to the engine, what the engines change; the wall time, which adds the MCP transport and the REPL host both lanes share, is reported beside it and judged only by a gross wall backstop: the candidate's wall median above the baseline's plus max(10%, 500 ms) fails the operation (ruling 706), and the backstop never passes anything. Its speed is also judged by Acceptance 3's rule (Acceptance 10): with at least 20 samples a side, the upper end of the bootstrap 95% interval of its in-cell median minus the baseline's must be within max(5% of the baseline's median, 1 ms); with fewer, its in-cell median must be at most the baseline's, and every cua typeText and paste sample must return without an error, survive and read back its text (Plan of Work M2); the ordinary better-outcome rule accepts this improvement over the vendor engine's text failures, with no failure waived on cua. ssh, approval, guard and setup operations are reported, not judged. Milliseconds; "OK" is successes over valid samples; wall and in-cell columns are median / p95 / max of successful samples.

| Operation | Basis | Baseline OK | Candidate OK | Baseline judged | Candidate judged | Limit | Verdict | Baseline wall | Candidate wall | Baseline in-cell | Candidate in-cell |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ssh.roundtrip | – | 15/15 | 15/15 | 183.7 | 185.0 | – | not judged | 183.7 / 184.6 / 184.6 | 185.0 / 189.7 / 189.7 | – | – |
| cold.miss.initialize | wall median net of ssh.roundtrip median | 6/6 | 6/6 | 237.4 | 239.8 | 737.4 | pass | 421.1 / 429.1 / 429.1 | 424.8 / 430.8 / 430.8 | – | – |
| cold.miss.tools_list | wall median | 6/6 | 6/6 | 1.60 | 1.60 | 501.6 | pass | 1.57 / 1.64 / 1.64 | 1.59 / 1.85 / 1.85 | – | – |
| cold.miss.first_js | wall median | 6/6 | 6/6 | 224.5 | 189.5 | 724.5 | pass | 224.5 / 229.2 / 229.2 | 189.5 / 191.6 / 191.6 | 0.01 / 0.01 / 0.01 | 0.01 / 0.01 / 0.01 |
| cold.miss.total | wall median net of ssh.roundtrip median | 6/6 | 6/6 | 462.2 | 430.3 | 962.2 | pass | 645.9 / 660.0 / 660.0 | 615.3 / 624.2 / 624.2 | – | – |
| cold.hit.initialize | wall median net of ssh.roundtrip median | 9/9 | 9/9 | 164.8 | 163.7 | 664.8 | pass | 348.4 / 353.2 / 353.2 | 348.7 / 354.3 / 354.3 | – | – |
| cold.hit.tools_list | wall median | 9/9 | 9/9 | 0.70 | 0.70 | 500.7 | pass | 0.69 / 0.81 / 0.81 | 0.70 / 0.77 / 0.77 | – | – |
| cold.hit.first_js | wall median | 9/9 | 9/9 | 296.7 | 260.6 | 796.7 | pass | 296.7 / 301.2 / 301.2 | 260.6 / 265.8 / 265.8 | 0.01 / 0.01 / 0.01 | 0.01 / 0.01 / 0.01 |
| cold.hit.total | wall median net of ssh.roundtrip median | 9/9 | 9/9 | 462.0 | 425.5 | 962.0 | pass | 645.6 / 653.3 / 653.3 | 610.5 / 615.5 / 615.5 | – | – |
| warm.noop | wall median | 90/90 | 90/90 | 8.50 | 8.20 | 508.5 | pass | 8.46 / 10.8 / 12.5 | 8.22 / 10.6 / 12.3 | 0.01 / 0.01 / 0.02 | 0.01 / 0.01 / 0.01 |
| warm.getState | in-cell median | 90/90 | 90/90 | 1.80 | 1.60 | 501.8 | pass | 8.36 / 10.7 / 15.0 | 8.01 / 9.99 / 11.0 | 1.79 / 2.23 / 6.22 | 1.57 / 1.89 / 3.25 |
| warm.listApps | in-cell median | 90/90 | 90/90 | 1.80 | 1.50 | 501.8 | pass | 8.19 / 10.5 / 11.3 | 7.85 / 8.40 / 9.97 | 1.76 / 2.31 / 3.38 | 1.50 / 1.73 / 3.39 |
| setup.findWindow | – | 3/3 | 3/3 | 263.9 | 261.7 | – | not judged | 263.9 / 263.9 / 263.9 | 261.7 / 261.8 / 261.8 | 255.4 / 255.4 / 255.4 | 253.3 / 253.3 / 253.3 |
| bind.getApp | in-cell median | 3/3 | 3/3 | 177.7 | 62.4 | 677.7 | pass | 185.7 / 186.2 / 186.2 | 70.3 / 71.2 / 71.2 | 177.7 / 178.3 / 178.3 | 62.4 / 63.3 / 63.3 |
| approval.elicitation | – | 3/3 | 3/3 | 14.2 | 10.5 | – | not judged | 14.2 / 14.4 / 14.4 | 10.5 / 10.9 / 10.9 | – | – |
| warm.getAXState | in-cell median | 90/90 | 90/90 | 162.0 | 50.6 | 662.0 | pass | 169.6 / 173.0 / 178.2 | 57.9 / 60.1 / 63.1 | 162.0 / 165.1 / 167.3 | 50.6 / 52.8 / 54.0 |
| warm.getScreenshot | in-cell median | 90/90 | 90/90 | 269.8 | 57.6 | 769.8 | pass | 277.5 / 279.4 / 282.0 | 64.9 / 68.4 / 78.3 | 269.8 / 271.8 / 273.5 | 57.6 / 60.0 / 70.0 |
| task.act | in-cell median | 30/30 | 30/30 | 16014.7 | 4334.5 | 17616.2 | pass | 16022.3 / 16028.9 / 16029.0 | 4342.1 / 4350.0 / 4352.5 | 16014.7 / 16020.7 / 16021.2 | 4334.5 / 4342.3 / 4344.7 |
| task.verify | in-cell median | 30/30 | 30/30 | 256.5 | 145.0 | 756.5 | pass | 264.3 / 266.7 / 266.9 | 152.6 / 155.1 / 155.5 | 256.5 / 259.1 / 259.2 | 145.0 / 147.0 / 147.2 |
| task.clear | in-cell median | 30/30 | 30/30 | 972.1 | 255.9 | 1472.1 | pass | 979.6 / 982.5 / 982.6 | 263.4 / 266.1 / 266.2 | 972.1 / 974.6 / 974.8 | 255.9 / 257.8 / 258.2 |
| task.total | in-cell median | 30/30 | 30/30 | 17243.9 | 4734.8 | 18968.3 | pass | 17266.7 / 17273.5 / 17274.2 | 4757.4 / 4767.8 / 4769.6 | 17243.9 / 17250.1 / 17251.4 | 4734.8 / 4743.7 / 4746.7 |
| end_task | wall median | 3/3 | 3/3 | 2.00 | 2.00 | 502.0 | pass | 1.99 / 2.00 / 2.00 | 2.02 / 2.04 / 2.04 | – | – |
| setup.findTarget | – | 6/6 | 6/6 | 267.7 | 262.0 | – | not judged | 267.7 / 269.5 / 269.5 | 262.0 / 263.9 / 263.9 | 259.8 / 261.4 / 261.4 | 254.2 / 255.8 / 255.8 |

## Method cases

Outcomes are counted per sample (`n x` the outcome); wall and in-cell are median / p95 / max of the samples the harness ran, judged by the same rule on the basis shown.

| Method case | Baseline samples | Baseline outcomes | Candidate samples | Candidate outcomes | Baseline wall | Candidate wall | Baseline in-cell | Candidate in-cell | Basis | Limit | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|
| method.typeText | 3 | 1x {"outcome":"threw","error":"D-Bus org.freedesktop.DBus.Properties.Get failed: org.freedesktop.DBus.Error.ServiceUnknown: The name :1.195 was not provided by any .service files","target":"exited","inserted":null}<br>1x {"outcome":"threw","error":"D-Bus org.freedesktop.DBus.Properties.Get failed: org.freedesktop.DBus.Error.ServiceUnknown: The name :1.297 was not provided by any .service files","target":"exited","inserted":null}<br>1x {"outcome":"threw","error":"D-Bus org.freedesktop.DBus.Properties.Get failed: org.freedesktop.DBus.Error.ServiceUnknown: The name :1.93 was not provided by any .service files","target":"exited","inserted":null} | 3 | 3x {"outcome":"returned","error":null,"target":"survived","inserted":true} | 786.8 / 788.3 / 788.3 | 42.6 / 43.6 / 43.6 | 779.2 / 780.7 / 780.7 | 35.5 / 36.1 / 36.1 | in-cell median | 1279.2 | pass |
| method.paste | 3 | 1x {"outcome":"threw","error":"D-Bus org.freedesktop.DBus.Properties.Get failed: org.freedesktop.DBus.Error.ServiceUnknown: The name :1.198 was not provided by any .service files","target":"exited","inserted":null}<br>1x {"outcome":"threw","error":"D-Bus org.freedesktop.DBus.Properties.Get failed: org.freedesktop.DBus.Error.ServiceUnknown: The name :1.300 was not provided by any .service files","target":"exited","inserted":null}<br>1x {"outcome":"threw","error":"D-Bus org.freedesktop.DBus.Properties.Get failed: org.freedesktop.DBus.Error.ServiceUnknown: The name :1.96 was not provided by any .service files","target":"exited","inserted":null} | 3 | 3x {"outcome":"returned","error":null,"target":"survived","inserted":true} | 786.8 / 788.5 / 788.5 | 41.4 / 42.0 / 42.0 | 779.4 / 781.0 / 781.0 | 34.5 / 34.7 / 34.7 | in-cell median | 1279.4 | pass |
| method.paste.format | 3 | 3x {"outcome":"threw","error":"Linux paste supports only text format.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"Linux paste supports only text format.","target":"survived","inserted":null} | 7.80 / 9.31 / 9.31 | 7.88 / 7.93 / 7.93 | 0.05 / 0.05 / 0.05 | 0.06 / 0.07 / 0.07 | wall median | 507.8 | pass |
| method.setValue | 3 | 3x {"outcome":"threw","error":"setValue is unavailable on Linux; use click, pressKey, and typeText.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"setValue is unavailable on Linux; use click, pressKey, and typeText.","target":"survived","inserted":null} | 7.74 / 9.43 / 9.43 | 7.80 / 7.96 / 7.96 | 0.08 / 0.10 / 0.10 | 0.09 / 0.10 / 0.10 | wall median | 507.7 | pass |
| method.selectText | 3 | 3x {"outcome":"threw","error":"selectText is unavailable on Linux.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"selectText is unavailable on Linux.","target":"survived","inserted":null} | 7.80 / 9.30 / 9.30 | 7.78 / 7.84 / 7.84 | 0.07 / 0.09 / 0.09 | 0.07 / 0.07 / 0.07 | wall median | 507.8 | pass |
| method.scroll.pages | 3 | 3x {"outcome":"threw","error":"Linux scroll accepts { pixels }, not pages.","target":"survived","inserted":null} | 3 | 3x {"outcome":"threw","error":"Linux scroll accepts { pixels }, not pages.","target":"survived","inserted":null} | 7.98 / 8.45 / 8.45 | 7.83 / 7.85 / 7.85 | 0.08 / 0.09 / 0.09 | 0.09 / 0.10 / 0.10 | wall median | 508.0 | pass |

## Speed of the operations the engine answers (Acceptance 3's rule)

Judged by the in-cell time (#370). With at least 20 successful samples a side, the bootstrap 95% interval of cua's in-cell median minus the vendor engine's passes when its upper end is within the bound, max(5% of the vendor's median, 1 ms); with fewer, cua's in-cell median must be at most the vendor's (the median rule). The wall time is reported beside it by the same calls; its interval and label judge nothing, and only the wall backstop, cua's wall median at most the vendor's plus max(10%, 500 ms), can fail the operation on it (ruling 706).

| Operation | Samples (vendor / cua) | Vendor in-cell | cua in-cell | Interval of cua minus vendor, ms | Bound, ms | Label | Verdict | Vendor wall | cua wall | Wall interval, ms (unjudged) | Wall label (unjudged) | Wall backstop, ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| warm.getState | 90 / 90 | 1.79 | 1.57 | [-0.278, -0.159] | 1 | faster | pass | 8.36 | 8.01 | [-1.771, -0.112] | faster | 508.4, pass |
| warm.listApps | 90 / 90 | 1.76 | 1.50 | [-0.301, -0.218] | 1 | faster | pass | 8.19 | 7.85 | [-0.43, -0.249] | faster | 508.2, pass |
| bind.getApp | 3 / 3 | 177.7 | 62.4 | – | – | median rule | pass | 185.7 | 70.3 | – | – | 685.7, pass |
| warm.getAXState | 90 / 90 | 162.0 | 50.6 | [-111.855, -110.568] | 8.1 | faster | pass | 169.6 | 57.9 | [-112.309, -110.911] | faster | 669.6, pass |
| warm.getScreenshot | 90 / 90 | 269.8 | 57.6 | [-212.827, -211.75] | 13.49 | faster | pass | 277.5 | 64.9 | [-213.164, -212.081] | faster | 777.5, pass |
| task.act | 30 / 30 | 16014.7 | 4334.4 | [-11683.172, -11674.977] | 800.74 | faster | pass | 16022.3 | 4342.1 | [-11683.24, -11675.133] | faster | 17624.5, pass |
| task.verify | 30 / 30 | 256.5 | 144.9 | [-112.541, -110.062] | 12.82 | faster | pass | 264.3 | 152.6 | [-112.585, -110.114] | faster | 764.3, pass |
| task.clear | 30 / 30 | 972.0 | 255.9 | [-716.786, -715.365] | 48.6 | faster | pass | 979.6 | 263.4 | [-716.882, -715.449] | faster | 1479.6, pass |
| task.total | 30 / 30 | 17243.9 | 4734.8 | [-12510.627, -12502.249] | 862.19 | faster | pass | 17266.7 | 4757.4 | [-12510.928, -12502.433] | faster | 18993.4, pass |
| method.typeText | 3 / 3 | 779.2 | 35.5 | – | – | median rule | pass | 786.8 | 42.6 | – | – | 1286.8, pass |
| method.paste | 3 / 3 | 779.4 | 34.5 | – | – | median rule | pass | 786.8 | 41.4 | – | – | 1286.8, pass |

## Unproved: declared gaps, not passes

None: no series was left undetermined under a declared gap.

## Where cua's median is above the vendor engine's

The judged median: in-cell where the engine answers the operation (#370), else the wall time.

- cold.miss.initialize: cua 239.8 ms, vendor 237.4 ms (no engine answers it: judged by the tolerance alone)
- method.paste.format: cua 7.90 ms, vendor 7.80 ms (no engine answers it: judged by the tolerance alone)
- method.setValue: cua 7.80 ms, vendor 7.70 ms (no engine answers it: judged by the tolerance alone)

## What differs, by design

- engine: vendor (answered: sky_linux_arm64 of the run's runtime) -> cua (answered: cua-engine installed in the run's home)
- service: computer surface, answered by vendor -> computer surface, answered by cua

## Failures and notes

- method.typeText (pass): better: the method returned, its window survived and its text was read back
- method.paste (pass): better: the method returned, its window survived and its text was read back

## Problems

None: both sides are complete, attested and comparable.

Verdict: **PASS**
