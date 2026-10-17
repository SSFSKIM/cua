# cfprefs attempt 8: stopped by a system dialog

90cbfe0 against 8bf4343 (code under test 5d9bf70, run through 8bf4343's harness), ssfs.
- **Gate:** idle at 19:41:56Z (loads 3.23 and 3.84).
- **Runner:** idle throughout. Every watch reading showed workers=0 and queued=0, and no pause occurred.

**Results before the stop:**
- Before side (90cbfe0): cells 150/150 and services 41/41, complete, PASS.
- After side (8bf4343): cells 150/150, complete, PASS.

**The stop.** At 2026-10-17T20:07:11Z the watch read `front=com.apple.SecurityAgent` while the after side's services suite was running. It ended only the run's own process tree (20:07:17Z). The dialog was not touched or read, and it was still frontmost at 20:11:30Z.

**Cell in flight at 20:07.** The services run has no per-cell timestamps, so this is known from completed rows only:
- the last completed row in `after-services/results.jsonl` is `cells/budget/remaining-budget` (cell-2 recorded);
- the next case in the suite's order is `cells/budget/approval-and-startup-waits`. That is inferred from the order the before side ran, not logged.

**Not yet done.** On-mini cleanup (the run's own log stream, cleanup-prepared, leftover capability homes) is held until the dialog is dealt with.

**Chrome after the stop:** pid 36513, 1 tab.
