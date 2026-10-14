# Native baseline summary

Runs: run-1 (2026-10-14T17:53:59.628Z to 2026-10-14T17:55:06.584Z); run-2 (2026-10-14T17:55:06.631Z to 2026-10-14T17:56:13.285Z); run-3 (2026-10-14T17:56:13.334Z to 2026-10-14T17:57:21.483Z).

| Attested | Value |
|---|---|
| Device | mini |
| Host commit | 9a6b25ab679a08ab448a5497277773cb095c6c6d |
| Runtime release | 26.928.40906-darwin-arm64 |
| Hardware | Mac14,12, Apple M2 Pro, 16 GiB |
| OS | macOS 27.0 (26A428) |
| Display | 2560 x 1440 points at scale 2 (5120 x 2880 pixels) |
| Service | computer surface, answered by vendor (helper: pinned runtime) |

Milliseconds. Latency columns cover successful samples only; wall is the harness's time around the MCP call (it includes the ssh pipe), in-cell is `performance.now()` inside the cell on the device.

| Operation | Samples | OK | Errors | Wall median | Wall p95 | Wall max | In-cell median | In-cell p95 | In-cell max |
|---|---|---|---|---|---|---|---|---|---|
| ssh.roundtrip | 15 | 15 | 0 | 473.4 | 551.3 | 551.3 | – | – | – |
| cold.miss.initialize | 6 | 6 | 0 | 767.3 | 900.9 | 900.9 | – | – | – |
| cold.miss.tools_list | 6 | 6 | 0 | 20.1 | 104.0 | 104.0 | – | – | – |
| cold.miss.first_js | 6 | 6 | 0 | 292.5 | 320.4 | 320.4 | 0.00 | 0.00 | 0.00 |
| cold.miss.total | 6 | 6 | 0 | 1082.2 | 1167.4 | 1167.4 | – | – | – |
| cold.hit.initialize | 9 | 9 | 0 | 631.0 | 1180.2 | 1180.2 | – | – | – |
| cold.hit.tools_list | 9 | 9 | 0 | 23.2 | 209.7 | 209.7 | – | – | – |
| cold.hit.first_js | 9 | 9 | 0 | 494.0 | 699.4 | 699.4 | 0.00 | 0.01 | 0.01 |
| cold.hit.total | 9 | 9 | 0 | 1145.2 | 2089.3 | 2089.3 | – | – | – |
| warm.noop | 90 | 90 | 0 | 19.5 | 177.2 | 221.4 | 0.01 | 0.02 | 0.02 |
| warm.getState | 90 | 90 | 0 | 50.2 | 219.6 | 993.3 | 20.1 | 35.4 | 813.8 |
| warm.listApps | 90 | 90 | 0 | 45.3 | 146.5 | 231.8 | 21.5 | 33.5 | 35.1 |
| bind.getApp | 3 | 3 | 0 | 1470.2 | 1499.6 | 1499.6 | 1415.2 | 1442.9 | 1442.9 |
| approval.elicitation | 3 | 3 | 0 | 31.0 | 108.6 | 108.6 | – | – | – |
| warm.getAXState | 90 | 90 | 0 | 95.0 | 244.0 | 269.9 | 47.6 | 73.3 | 95.0 |
| warm.getScreenshot | 90 | 90 | 0 | 88.2 | 199.8 | 259.4 | 46.5 | 66.3 | 73.9 |
| task.act | 30 | 30 | 0 | 897.3 | 1134.3 | 1213.7 | 853.4 | 1075.8 | 1191.5 |
| task.verify | 30 | 30 | 0 | 506.2 | 668.3 | 726.4 | 453.7 | 478.1 | 486.1 |
| task.close | 30 | 30 | 0 | 1770.8 | 1947.9 | 1971.0 | 1698.4 | 1823.3 | 1868.3 |
| task.total | 30 | 30 | 0 | 3158.3 | 3568.1 | 3592.7 | 3012.7 | 3284.1 | 3362.4 |
| end_task | 3 | 3 | 0 | 17.7 | 100.5 | 100.5 | – | – | – |
| setup.newDocument | 3 | 3 | 0 | 2093.9 | 2175.6 | 2175.6 | 2032.3 | 2037.0 | 2037.0 |

| Operation | Observed (median, range) |
|---|---|
| cold.miss.first_js | documentChars 19775 (19775–19775) |
| cold.hit.first_js | documentChars 19775 (19775–19775) |
| warm.getState | apps 20 (20–20); browsers 0 (0–0) |
| warm.listApps | apps 20 (20–20); running 9 (9–9) |
| bind.getApp | approvals 1 (1–1) |
| warm.getAXState | chars 2810 (2810–2810); lines 56 (56–56); elements 53 (53–53) |
| warm.getScreenshot | bytes 49884 (49884–49975); width 1172 (1172–1172); height 976 (976–976) |
| task.act | actions 2 (2–2); observations 2 (2–2) |
| task.verify | observations 1 (1–1) |
| task.close | actions 2 (2–2); observations 3 (3–3) |
| task.total | cells 3 (3–3); actions 4 (4–4); observations 6 (6–6) |
| setup.newDocument | actions 1 (1–1); observations 2 (2–2) |

## Errors

None.

## Problems

No problems: every run is complete and attests the same commit, release, hardware, OS, display and service.
