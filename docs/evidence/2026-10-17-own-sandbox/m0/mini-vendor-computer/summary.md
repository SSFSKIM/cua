# Native baseline summary

Runs: run-1 (2026-10-17T13:38:02.196Z to 2026-10-17T13:39:18.888Z); run-2 (2026-10-17T14:49:03.062Z to 2026-10-17T14:50:21.695Z); run-3 (2026-10-17T14:51:17.256Z to 2026-10-17T14:52:32.544Z).

| Attested | Value |
|---|---|
| Device | mini |
| Host commit | 90cbfe0bd6f21cbde9b656392ee1f2b8dccbc754 |
| REPL host | vendor (initialize: rmcp 1.5.0) |
| Runtime release | 26.928.40906-darwin-arm64 |
| Hardware | Mac14,12, Apple M2 Pro, 16 GiB |
| OS | macOS 27.0 (26A428) |
| Display | 2560 x 1440 points at scale 2 (5120 x 2880 pixels) |
| Service | computer surface, answered by vendor (helper: pinned runtime) |
| Sandbox | scoped (platform default) |
| Sample plan | 5 cold, 30 warm, 10 tasks |

Milliseconds. Latency columns cover successful samples only (invalidated samples, whose target was not the scratch document, are counted apart); wall is the harness's time around the MCP call (it includes the ssh pipe), in-cell is `performance.now()` inside the cell on the device.

| Operation | Samples | OK | Invalid | Errors | Wall median | Wall p95 | Wall max | In-cell median | In-cell p95 | In-cell max |
|---|---|---|---|---|---|---|---|---|---|---|
| ssh.roundtrip | 15 | 15 | 0 | 0 | 520.8 | 1022.1 | 1022.1 | – | – | – |
| cold.miss.initialize | 6 | 6 | 0 | 0 | 901.8 | 1304.8 | 1304.8 | – | – | – |
| cold.miss.tools_list | 6 | 6 | 0 | 0 | 26.0 | 63.2 | 63.2 | – | – | – |
| cold.miss.first_js | 6 | 6 | 0 | 0 | 400.9 | 2321.9 | 2321.9 | 0.00 | 0.01 | 0.01 |
| cold.miss.total | 6 | 6 | 0 | 0 | 1353.9 | 3471.6 | 3471.6 | – | – | – |
| cold.hit.initialize | 9 | 9 | 0 | 0 | 639.0 | 1010.2 | 1010.2 | – | – | – |
| cold.hit.tools_list | 9 | 9 | 0 | 0 | 25.5 | 107.4 | 107.4 | – | – | – |
| cold.hit.first_js | 9 | 9 | 0 | 0 | 429.3 | 519.7 | 519.7 | 0.00 | 0.01 | 0.01 |
| cold.hit.total | 9 | 9 | 0 | 0 | 1159.0 | 1429.6 | 1429.6 | – | – | – |
| warm.noop | 90 | 90 | 0 | 0 | 20.7 | 112.2 | 159.2 | 0.02 | 0.04 | 0.35 |
| warm.getState | 90 | 90 | 0 | 0 | 52.7 | 155.4 | 1302.5 | 21.3 | 31.7 | 1262.9 |
| warm.listApps | 90 | 90 | 0 | 0 | 57.3 | 142.5 | 199.6 | 24.4 | 34.2 | 37.6 |
| bind.getApp | 3 | 3 | 0 | 0 | 1771.3 | 1843.1 | 1843.1 | 1750.6 | 1816.8 | 1816.8 |
| approval.elicitation | 3 | 3 | 0 | 0 | 32.4 | 158.7 | 158.7 | – | – | – |
| warm.getAXState | 90 | 90 | 0 | 0 | 90.7 | 195.6 | 214.4 | 49.8 | 75.6 | 85.5 |
| warm.getScreenshot | 90 | 90 | 0 | 0 | 87.1 | 168.2 | 230.2 | 50.4 | 62.3 | 91.9 |
| task.act | 30 | 30 | 0 | 0 | 900.7 | 1012.3 | 1148.5 | 854.1 | 961.4 | 1047.0 |
| task.verify | 30 | 30 | 0 | 0 | 512.1 | 603.8 | 630.3 | 446.6 | 482.8 | 482.8 |
| task.close | 30 | 30 | 0 | 0 | 2663.9 | 2923.6 | 2928.4 | 2626.9 | 2768.1 | 2888.1 |
| task.total | 30 | 30 | 0 | 0 | 4038.3 | 4325.4 | 4334.6 | 3914.4 | 4116.0 | 4130.1 |
| end_task | 3 | 3 | 0 | 0 | 29.4 | 32.3 | 32.3 | – | – | – |
| guard.scratch | 6 | 6 | 0 | 0 | 102.1 | 171.5 | 171.5 | 51.1 | 64.8 | 64.8 |
| setup.newDocument | 3 | 3 | 0 | 0 | 1839.1 | 2163.7 | 2163.7 | 1754.3 | 2006.0 | 2006.0 |

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
| warm.getState | apps 7 (7–7); browsers 0 (0–0) |
| warm.listApps | apps 7 (7–7); running 7 (7–7) |
| bind.getApp | approvals 1 (1–1) |
| approval.elicitation | app com.apple.TextEdit; action accept |
| warm.getAXState | chars 2810 (2810–2810); lines 56 (56–56); elements 53 (53–53) |
| warm.getScreenshot | bytes 49975 (49975–49975); width 1172 (1172–1172); height 976 (976–976); format jpeg; sha256 8685ca2f74acd530 |
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

No problems: every run is complete and attests the same commit, REPL host, release, hardware, OS, display, service, sandbox and sample plan.
