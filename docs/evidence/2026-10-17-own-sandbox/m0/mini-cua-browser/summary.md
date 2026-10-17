# Native baseline summary

Runs: run-1 (2026-10-17T14:53:46.935Z to 2026-10-17T14:54:02.739Z); run-2 (2026-10-17T14:55:14.929Z to 2026-10-17T14:55:29.999Z); run-3 (2026-10-17T14:56:41.545Z to 2026-10-17T14:56:57.080Z).

| Attested | Value |
|---|---|
| Device | mini |
| Host commit | 90cbfe0bd6f21cbde9b656392ee1f2b8dccbc754 |
| REPL host | cua (initialize: cua-repl-host 0.5.0) |
| Runtime release | 26.928.40906-darwin-arm64 |
| Hardware | Mac14,12, Apple M2 Pro, 16 GiB |
| OS | macOS 27.0 (26A428) |
| Display | 2560 x 1440 points at scale 2 (5120 x 2880 pixels) |
| Service | browser surface, no service call |
| Sandbox | scoped (platform default) |
| Sample plan | 5 cold, 30 warm, 10 tasks |

Milliseconds. Latency columns cover successful samples only (invalidated samples, whose target was not the scratch document, are counted apart); wall is the harness's time around the MCP call (it includes the ssh pipe), in-cell is `performance.now()` inside the cell on the device.

| Operation | Samples | OK | Invalid | Errors | Wall median | Wall p95 | Wall max | In-cell median | In-cell p95 | In-cell max |
|---|---|---|---|---|---|---|---|---|---|---|
| ssh.roundtrip | 15 | 15 | 0 | 0 | 593.4 | 766.7 | 766.7 | – | – | – |
| cold.miss.initialize | 6 | 6 | 0 | 0 | 792.0 | 864.1 | 864.1 | – | – | – |
| cold.miss.tools_list | 6 | 6 | 0 | 0 | 21.6 | 121.8 | 121.8 | – | – | – |
| cold.miss.first_js | 6 | 6 | 0 | 0 | 1160.5 | 2165.4 | 2165.4 | 0.00 | 0.01 | 0.01 |
| cold.miss.total | 6 | 6 | 0 | 0 | 2002.4 | 3034.0 | 3034.0 | – | – | – |
| cold.hit.initialize | 9 | 9 | 0 | 0 | 625.1 | 748.0 | 748.0 | – | – | – |
| cold.hit.tools_list | 9 | 9 | 0 | 0 | 29.6 | 128.1 | 128.1 | – | – | – |
| cold.hit.first_js | 9 | 9 | 0 | 0 | 316.6 | 428.1 | 428.1 | 0.00 | 0.01 | 0.01 |
| cold.hit.total | 9 | 9 | 0 | 0 | 1020.5 | 1092.9 | 1092.9 | – | – | – |

| Operation | Observed (median, range) |
|---|---|
| cold.miss.initialize | planned miss |
| cold.miss.tools_list | planned miss |
| cold.miss.first_js | planned miss; documentChars 18784 (18784–18784) |
| cold.miss.total | planned miss |
| cold.hit.initialize | planned hit |
| cold.hit.tools_list | planned hit |
| cold.hit.first_js | planned hit; documentChars 18784 (18784–18784) |
| cold.hit.total | planned hit |

## Invalidated samples

None.

## Errors

None.

## Problems

No problems: every run is complete and attests the same commit, REPL host, release, hardware, OS, display, service, sandbox and sample plan.
