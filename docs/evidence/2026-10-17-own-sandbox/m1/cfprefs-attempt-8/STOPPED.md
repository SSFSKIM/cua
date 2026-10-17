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

## Cleanup, 20:39Z

The mini was cleared at 20:35:24Z, after securityd had stayed up since 20:20Z. Each item removed was checked to be the run's own:
- the run's `log stream` (pid file, after side) was ended;
- `cleanup-prepared` reported removed and siblingRemoved;
- `~/.cp/cua-cap-YJoG7B` and its `.home` sibling, both born inside the run, were removed.

Chrome was still pid 36513. The ssfs backend was not live at 20:39:30Z: the listing found no Chrome backend after the owner's Screen Sharing visit.

## securityd crash correlation (read-only)

**Crash reports.** There are five on the mini, `securityd-*.ips`, at 10-16 06:37:19Z and 06:54:40Z and 10-17 20:05:56Z, 20:17:19Z and 20:18:13Z. Only the crashing thread of each was read.
- All five read EXC_CRASH SIGABRT, from an uncaught C++ exception inside securityd: `std::terminate` called `_objc_terminate`, which called `abort`.
- securityd's own frames are unsymbolicated.
- The crashing thread differs each time (4, 20, 2, 0), and the 20:17Z crash is on thread 0.

**Against our runs, from the evidence directories, the sitting logs and git history across all branches:**
- **10-16 06:37Z and 06:54Z.** No run of ours is recorded. No commit on any branch falls between 06:00Z and 07:15Z, and no evidence file carries a timestamp from 06:30Z to 06:59Z. #116's first mini records that day begin at 07:46Z (`m5/oracle/diagnostics/unmatched-scope/polling-vendor-*`). #115 had not started.
- **10-17 20:05:54Z.** cfprefs attempt 8 was running, in the after side's services suite.
- **10-17 20:17:18Z and 20:18:13Z.** Nothing of ours was running.

**Conclusion.** One of the five crashes overlaps a run of ours, and four do not. All five share one stack. Our activity is not necessary for the crash, and the records give no sign that it contributes.
