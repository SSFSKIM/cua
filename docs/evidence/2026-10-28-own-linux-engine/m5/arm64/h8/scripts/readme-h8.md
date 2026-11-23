## At H8 (0.4.3) (2026-11-22 02:49Z to 05:07Z; task 136)

The head is **H8 = `048140a2`**, feat/171-m5 after task 134's pin merge. The engine is **linux-engine-v0.4.3**, tag
ba5b0438 (release run 44966356899): arm64 `cua-engine` sha256 `dd74e19b44596f992dd120b13fbbe8021a7ca0af581c07496f5cee8f5edbcf1e`,
`cua-engine 0.4.3 (ba5b043834ce)`. `MIN_ENGINE_VERSION` is 0.4.3.
- The steps are ruling 990 (3)'s reach: class A on Chrome sources, H1 as the cross-check, item 9 and the doctor.
- The records are in `h8/`. Holder `h8-arm64`; the lock lines are `h8/scripts/lock-lines.txt`.

**Setup** (`h8/scripts/setup-all.sh`, `setup-all.log.txt`):
- `t136-h8` is a fresh worktree, detached and clean at `048140a2`, with npm ci, the Electron binary present
  (`node_modules/electron/dist/electron`), and xprobe.
- The home `home-arm64-043` is fresh. Its own `cua install --engine` placed the 0.4.3 engine, whose sha256 equals H8's
  pin, and `check --pinned` exited 0 (`install-home.log.txt`).
- **Item 9** (`item9/transcript.txt`) ran in a fresh mktemp home on a private display. Install exited 0, the engine's
  sha256 equals the pin, and the doctor exited 0 (17 PASS, 7 SKIP, 3 BLOCKED, the 3 being the Chrome registration
  lines).
- **The doctor on the pinned home** (`item9/doctor-pinned-home.txt`) ran in the same private session: exit 0, with the
  same 17 / 7 / 3.
- Disk: 101–103G free at every check. hold-sittings was absent before every set.

**How the steps ran** (`h8/scripts/steps.sh`):
- Each step's line is `gate.mjs print`'s (`out/<step>.print.txt`), run once as printed.
- The printed line's own `locked.sh h8-arm64` takes the hold, and inside it step.sh's quiet wait runs before the gate
  command, which is unchanged.
- Each print's record is kept apart (`<step>.print-record`).
- The runner stops at a nonzero exit. It stopped at L4b, and L4c and L4d ran after the controller's word (ruling 1050).

| step | stands on | run (UTC, 11-22) | exit | load at the start (after the quiet wait) | result |
|---|---|---|---:|---|---|
| D1 | 048140a2 | 02:51:33–03:15:20 | 0 | 0.71 0.31 0.12 | **PASS** (below) |
| H1 | 048140a2 | 03:15:20–03:32:47 | 0 | 0.57 0.40 0.31 | **the cross-check**: identical to H6, cell by cell (below) |
| C1 | 048140a2 | 03:32:47–03:34:51 | 0 | 0.14 0.14 0.18 | **PASS**: inside 10/10, past 10/10, 3 edge late takes all reported; 0 unexercised, 0 stale |
| K1 | 048140a2 | 03:34:52–03:37:47 | 0 | 0.15 0.14 0.18 | **PASS**, Chrome 156: draggable 8 held / 8 started, max 88.9, median 85.0 ms; plain max 1.1 ms |
| K2 | 048140a2 | 03:37:48–03:40:44 | 0 | 0.50 0.34 0.25 | **PASS**, Chrome 158 from its extracted tree: 6 / 6, max 93.1, median 90.0 ms; plain max 1.1 ms |
| K3 | 048140a2 | 03:40:44–03:41:50 | 0 | 0.27 0.33 0.27 | **PASS**: dragstart-150 and dragstart-400 each landed 10 of 10 |
| V5 | 048140a2 | (`:0`) | 1, 1 | – | **two runs, each stopped by wrap71 on #432's class** (below). V5_RESULT |
| L2a | 048140a2 | 03:46:13–04:14:01 | 0 | 0.17 0.36 0.31 | **PASS** |
| L4b | 048140a2 | 04:16:51–04:33:29 | **1** | 0.92 9.46 11.80 | **FAIL, the unshipped accept lane's finding** (rulings 871, 872, 1050; #474) (below) |
| L4c | 048140a2 | 04:36:24–04:38:55 | 0 | 0.92 9.33 12.65 | **PASS**: inside 10/10, past 10/10, 2 edge late takes reported; 0 unexercised, 0 skipped, 0 stale; 40/40 marks bound; the stop came 54.1–55.9 ms after the mark, never before it (982) |
| L4d | 048140a2 | 04:41:56–05:05:50 | 0 | 0.86 6.85 10.98 | **PASS at 993's bar**: 0 false oks and 0 stale on every Chrome cell (below) |

Every private step's run was clean, with the watchdog clean.

**D1.** The judges' verdict for `cua` is PASS.
- dnd is #358, declared: [26.8, 27] ms (355 against newest's 328.1), within 40.
- **Canvas is judged against pinned.** The newest build gave up the bar with 19 usable of 40, under the judge's own
  rule (stats.mjs `judgeSeriesSpeed`, line 238: a vendor build sets the bar only with `MIN_NOISE_SAMPLES` = 20 usable).
  cua 473.7 ms against pinned's 1045.35, the interval [−572.75, −571.15].
- Against newest's 19 samples the judge prints no interval. Offline, its own `medianDifferenceInterval` gives
  [−12.3, −11.6] ms (cua 473.7, newest 485.5), as at H6.

**H1, the cross-check** (`h8/scripts/compare-t17.mjs`, `crosscheck-H1.txt`): H1 at H8 against its H6 record,
`h6/out/H1.pinned-release`.
- All 14 T17 cells match, with every shared count column identical (a Fisher exact test per column: p 1.0
  throughout).
- The verdict line gains only the new "no drop at a stale position" clause.
- #365 is 0 of 60 and ruling 830's mismatches are none in 320, as at H6. **The reach argument holds.**

**L4b** (rulings 871, 872, 1050; **#474**: retire the flag and its L4b lane, or put the lane under the tail at 993's
bar).
- Stored: "Fails: cua:accept left: answered ok with no drop and nothing pending on 3 of 30 (#5, #6, #15)". The lane is
  `cua:accept`, behind `--drag-dnd-release-at-accept`, which nothing that ships selects.
- 0.4.3 keeps that lane on 0.4.2's floor by design: native/linux-engine/src/engine/pointer.rs:1366–1371, `let syncing =
  guard.is_none() && hold.is_some() && !self.cfg.dnd_release_at_accept && …`, "not the release at the accept
  (measurement only), which keeps 0.4.2's floor".
- plain-long landed 300/300, with 0 false oks and 0 stale.

The three false oks. The gate is derived (below): counted rows carry no `release_sync`.

| left # | take (ms after the press) | path after the take (ms) | derived gate | last step to release (ms) | keepalives | activation after the release (ms) | accept read |
|---|---:|---:|---|---:|---:|---:|---|
| 5 | 35.0 | 371.0 | open | 1.0 | 0 | 2.0 | none |
| 6 | 26.2 | 390.6 | open | 0.1 | 0 | 3.8 | none |
| 15 | 26.3 | 374.4 | open | 1.0 | 0 | 1.6 | none |

The accept lane's false releases, head by head:

| head | inzone-out: false releases at the accept (answered ok) | left: false releases (answered ok) | left: false oks (the fail) |
|---|---:|---:|---:|
| H⁗ (0.4.1) | 5 (2) | – | 1 |
| H6 (0.4.2) | 7 (6) | – | 1 (#23) |
| H8 (0.4.3) | 3 (1) | 1 (1) | 3 (#5, #6, #15) |

**L4d at 0.4.3** (`h8/out/L4d.pinned-release/`; `l4d-parts.md`, `l4d-parts.mjs`). Ruling 993's bar is met: 0 false oks
and 0 stale-position drops on every Chrome cell, `left` included.
- The gate's reading is **derived offline**, since a counted row carries no `release_sync` record and runs no
  `--engine-stats`.
- The table uses ruling 993's rule: open = a take, no keepalive, and the path after the take past 350 ms. c-cost.mjs's
  0.4.2 rule (the release more than 2 ms past take + 350) is shown beside it; it misreads a late in-floor release as
  open.
- `motions` and `visits_dropped` can't be read from the rows.

| part / cell | drags | landed | stale | false ok | honest (a notice) | untaken | gate open / shut, 993's rule | the same, c-cost's rule |
|---|---:|---:|---:|---:|---:|---:|---|---|
| Chrome t14-long, long-left | 100 | 0 | 0 | 0 | 100 | 0 | 100 / 0 | 100 / 0 |
| Chrome t14-floor, plain-long | 300 | 300 | 0 | 0 | 0 | 0 | 176 / 124 | 178 / 122 |
| Chrome t14-floor, left | 30 | 0 | 0 | 0 | 30 | 0 | 17 / 13 | 17 / 13 |
| Chrome t14-floor, inzone-out | 30 | 0 | 0 | 0 | 30 | 0 | 0 / 30 | 2 / 28 |
| Electron t17-long, long-left | 30 | 0 | 0 | 0 | 26 | 0 | – | – |

- The Electron part has 30/30 exercised (972). Its 4 plain oks are ruling 830's zone-truth mismatches, which the
  judge counts as no false ok.
- Against the 0.4.2 baseline at H7.1 (15/100 on t14-long, and `left` #24), every Chrome cell is now 0.

V5_PART

**Scans:** SCAN_H8
