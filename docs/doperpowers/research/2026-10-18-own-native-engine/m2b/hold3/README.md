# M2b hold 3 (2026-10-22 20:04:39–21:36Z, the mini, sitting hold3)

- S = 926181506bd923949ef7e6d5c854ff83f50c7d45; engine 0c363f8f, approved 10:29:15Z by M3's hold; phase 0 checks only (`phase0.txt`), live grants read during run 1's cua lane (`lanes.txt`).
- `lanes.txt`: per-lane interference reads (5900, cua-shim children, foreign engines, front app, input source), maws-3f's rulings, every deviation with its error text, cleanup output and readings.

| What | Where | Outcome |
|---|---|---|
| Run 1 vendor | `matrix/vendor/run-1` | 563 rows; put-back failed at the Finder teardown ("another process's window is on top"); counts under override (a) |
| Run 1 cua | `matrix/cua/run-1` | complete, put-back ok |
| route-ab ×4 | `route-ab-stopped-a1..a3`, `route-ab` (attempt 4), `winlist-*` | each stopped at Finder's bind; A/B unsettled |
| native-mac | `native-mac/vendor`, `native-mac/cua`, `nm-diff.txt` | both complete; the diff refused the pair (Finder frames 492/520); raw comparison in the Decision Log |
| Run 2 cua | `matrix/cua/run-2` | 562 rows; front-app put-back declined a scene app; counts under override (b), unpaired |
| Phase 4 | `phase4.txt` | put-back done; Tailscale and Terminal unhidden |

Counting overrides (maws-3f; results unedited): (a) a lane whose only put-back failure is the Finder teardown's "another process's window is on top", and (b) one whose only failure is the front-app step declining a scene app, count when every row ran and the cleanup's readings verify. `summary-as-recorded.md` is the summary without them (FAIL); the Decision Log entry "M2b hold 3" gives the reading with them and what stays missing.

Window lists record owner pid, process name, layer and bounds only; Claude Desktop by name only.
