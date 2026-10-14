# Native baseline summary

Runs: run-1 (2026-10-14T18:13:07.215Z to 2026-10-14T18:14:28.314Z); run-2 (2026-10-14T18:14:28.359Z to 2026-10-14T18:15:50.729Z); run-3 (2026-10-14T18:15:50.801Z to 2026-10-14T18:17:07.801Z).

| Attested | Value |
|---|---|
| Device | mini |
| Host commit | 2a590527f2489516422239e9ae45100bc107f154 |
| Runtime release | 26.928.40906-darwin-arm64 |
| Hardware | Mac14,12, Apple M2 Pro, 16 GiB |
| OS | macOS 27.0 (26A428) |
| Display | 2560 x 1440 points at scale 2 (5120 x 2880 pixels) |
| Service | computer surface, answered by vendor (helper: pinned runtime) |

Milliseconds. Latency columns cover successful samples only (invalidated samples, whose target was not the scratch document, are counted apart); wall is the harness's time around the MCP call (it includes the ssh pipe), in-cell is `performance.now()` inside the cell on the device.

| Operation | Samples | OK | Invalid | Errors | Wall median | Wall p95 | Wall max | In-cell median | In-cell p95 | In-cell max |
|---|---|---|---|---|---|---|---|---|---|---|
| ssh.roundtrip | 15 | 15 | 0 | 0 | 503.8 | 705.2 | 705.2 | – | – | – |
| cold.miss.initialize | 6 | 6 | 0 | 0 | 813.4 | 1787.8 | 1787.8 | – | – | – |
| cold.miss.tools_list | 6 | 6 | 0 | 0 | 52.6 | 199.3 | 199.3 | – | – | – |
| cold.miss.first_js | 6 | 6 | 0 | 0 | 272.3 | 356.5 | 356.5 | 0.00 | 0.01 | 0.01 |
| cold.miss.total | 6 | 6 | 0 | 0 | 1123.4 | 2313.7 | 2313.7 | – | – | – |
| cold.hit.initialize | 9 | 9 | 0 | 0 | 673.8 | 1097.7 | 1097.7 | – | – | – |
| cold.hit.tools_list | 9 | 9 | 0 | 0 | 21.3 | 147.3 | 147.3 | – | – | – |
| cold.hit.first_js | 9 | 9 | 0 | 0 | 470.2 | 530.1 | 530.1 | 0.00 | 0.01 | 0.01 |
| cold.hit.total | 9 | 9 | 0 | 0 | 1165.0 | 1775.1 | 1775.1 | – | – | – |
| warm.noop | 90 | 90 | 0 | 0 | 21.5 | 115.7 | 135.3 | 0.02 | 0.03 | 0.03 |
| warm.getState | 90 | 90 | 0 | 0 | 70.2 | 217.4 | 824.8 | 22.3 | 34.4 | 765.6 |
| warm.listApps | 90 | 90 | 0 | 0 | 51.3 | 176.4 | 199.9 | 21.7 | 32.5 | 33.6 |
| bind.getApp | 3 | 3 | 0 | 0 | 1430.6 | 1597.2 | 1597.2 | 1410.0 | 1536.3 | 1536.3 |
| approval.elicitation | 3 | 3 | 0 | 0 | 57.3 | 169.3 | 169.3 | – | – | – |
| warm.getAXState | 90 | 90 | 0 | 0 | 112.4 | 220.8 | 339.3 | 51.4 | 86.8 | 93.1 |
| warm.getScreenshot | 90 | 90 | 0 | 0 | 115.2 | 220.5 | 326.7 | 53.3 | 83.6 | 89.2 |
| task.act | 30 | 30 | 0 | 0 | 933.4 | 1049.0 | 1160.1 | 870.7 | 921.7 | 1002.4 |
| task.verify | 30 | 30 | 0 | 0 | 521.8 | 622.9 | 671.9 | 461.5 | 476.0 | 482.6 |
| task.close | 30 | 30 | 0 | 0 | 2788.8 | 2872.5 | 2963.5 | 2718.3 | 2808.4 | 2827.0 |
| task.total | 30 | 30 | 0 | 0 | 4224.8 | 4470.9 | 4490.3 | 4039.0 | 4174.6 | 4213.0 |
| end_task | 3 | 3 | 0 | 0 | 16.5 | 113.8 | 113.8 | – | – | – |
| guard.scratch | 6 | 6 | 0 | 0 | 85.4 | 136.0 | 136.0 | 50.8 | 52.5 | 52.5 |
| setup.newDocument | 3 | 3 | 0 | 0 | 1860.2 | 2072.2 | 2072.2 | 1735.5 | 2011.4 | 2011.4 |

| Operation | Observed (median, range) |
|---|---|
| cold.miss.initialize | planned miss |
| cold.miss.tools_list | planned miss |
| cold.miss.first_js | planned miss; documentChars 19775 (19775–19775) |
| cold.miss.total | planned miss |
| cold.hit.initialize | planned hit |
| cold.hit.tools_list | planned hit |
| cold.hit.first_js | planned hit; documentChars 19775 (19775–19775) |
| cold.hit.total | planned hit |
| warm.getState | apps 20 (20–20); browsers 0 (0–0) |
| warm.listApps | apps 20 (20–20); running 9 (9–9) |
| bind.getApp | approvals 1 (1–1) |
| approval.elicitation | app com.apple.TextEdit; action accept |
| warm.getAXState | chars 2810 (2810–2810); lines 56 (56–56); elements 53 (53–53) |
| warm.getScreenshot | bytes 49975 (49975–49975); width 1172 (1172–1172); height 976 (976–976); format jpeg; sha256 29856e897d4eb839 |
| task.act | actions 2 (2–2); observations 2 (2–2) |
| task.verify | observations 1 (1–1) |
| task.close | actions 2 (2–2); observations 3 (3–3) |
| task.total | cells 3 (3–3); actions 4 (4–4); observations 6 (6–6); outcome typed text verified, document closed without saving |
| setup.newDocument | actions 1 (1–1); observations 2 (2–2); via panel |

## Invalidated samples

None.

## Errors

None.

## Problems

No problems: every run is complete and attests the same commit, release, hardware, OS, display and service.
