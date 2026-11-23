# linux-engine 0.4.4's counted reach on arm64 (task 147)

The reach list of rulings 1102, 1113 and 1114, run on the arm64 VM (`cua-171-arm64`) on private displays only. Nothing
ran on any `:0`.

## At H9 (0.4.4) (2026-11-23 09:59Z to 11:49Z; task 147)

The head is **H9 = `cd03a47bde2a484e1c3ecbf07cc97aada720fda7`**, branch `engine-044-pin`. It is the 0.4.4 tag commit
23f34217 with the pin, `MIN_ENGINE_VERSION` 0.4.4, and task 142's harness (harness-487) merged in. The engine is
**linux-engine-v0.4.4** (release run 45138098451). The arm64 `cua-engine` has sha256
`f54b2aeb8e00676a9f521410156c9bdd1b578e2308724013eef2eb6145c7da3e` and reads `cua-engine 0.4.4 (23f342178d94)`.
- Holder `h9-arm64`. The lock lines are in `scripts/lock-lines.txt`. The lock was last released at 11:49:29Z.
- **The run stopped at L4d, which failed** (below). Ruling 1140 keeps L4d recorded as FAIL at H9, with no rerun.
- **The development work after the ruling** is under `dev/` (development, not counted):
  - item 3, Chrome `drag_handle` long-left ×100;
  - item 4, `t487-named` ×30;
  - a new t14-floor `left` ×100 measurement with each row's `release_sync`.

**Setup** (`scripts/setup-all.sh`; logs `setup-all.log.txt`, `setup-h9.log.txt`, `install-home.log.txt`):
- `t147-h9` is a fresh worktree of the VM's clone, detached and clean at H9. It has a real `npm ci`, the Electron
  binary present (`node_modules/electron/dist/electron`, v44.9.0, aarch64) and xprobe built.
- The home `home-arm64-044` is fresh. Its own `node bin/cua.mjs install --engine` placed linux-engine-v0.4.4, and the
  engine's sha256 equals H9's arm64 pin.
- `gate.mjs check --pinned` **exited 0**, with `engine_tree` `{"path":"native/linux-engine","commit":"23f342178d94f81fc37a95124e818f8238b36ef0","equal":true}`
  and `clean: true`. The attestations of runs 45138098451 and 45135771944 were both verified.
- Before each set, hold-sittings was absent and the disk had 99–101G free.

**How the steps ran** (`scripts/steps.sh`, task 136's runner re-pointed):
- Each step's line is `gate.mjs print <step> --pinned home-arm64-044 --holder h9-arm64`'s (`out/<step>.print.txt`). It
  ran once, as printed.
- The printed line's own `locked.sh h9-arm64` takes the hold. Inside it, step.sh's quiet wait runs before the
  unchanged gate command.
- Each print's record is kept apart (`<step>.print-record`). The runner stops at a nonzero exit.

| item | step | run (UTC, 11-23) | exit | load at the start (after the quiet wait) | result |
|---|---|---|---:|---|---|
| 1 | H1 | 10:01:00–10:18:28 | 0 | 0.62 0.23 0.08 | **PASS**; 560 of 560 settled drags rested 30 ms |
| 1 | H2 | 10:18:28–10:36:31 | 0 | 0.24 0.18 0.12 | **PASS**; 560 of 560 settled drags rested 30 ms |
| 1 | L4a | 10:36:31–10:58:04 | 0 | 0.21 0.11 0.10 | **PASS**; 560 of 560 settled drags rested 30 ms |
| 2 | L4d | 10:58:04–11:24:39 | **1** | 0.89 9.12 10.40 (a 170 s wait) | **FAIL**: `cua left: answered ok with no drop and nothing pending on 1 of 30 (#28)`, in t14-floor |
| 3 | Chrome `drag_handle` long-left ×100 (development) | 11:32:46–11:41:32 | 0 | 0.00 3.38 9.33 | **bar met**: 0 false oks, 0 stale in 100; the tail ran on 100 of 100 with 4 motions, 0 `interrupted_unconfirmed`, +22.1 / 27.0 / 31.1 ms (`dev/README.md`) |
| 4 | `t487-named` ×30 (measured, not gated) | 11:41:33–11:43:16 | 0 | 16.63 14.44 12.55 | **bar met**: exercised 0, not exercised 30 (no drag began; start 30 and settle 30 missing), as ruling 1113 expects (`dev/README.md`) |
| – | t14-floor `left` ×100 (development, ruling 1140) | 11:43:16–11:49:29 | 0 | 16.43 14.91 12.92 | 2 false oks in 100, both in floor with Chrome's leave unseen; 1 of the 2 had a dropped visit (`dev/floor-left/README.md`) |

Every run that took place was clean, and so was each private display's watchdog.

**Item 1: t17-fix3 and the settle's rest (#487).** The judge's line is the same in each of the three steps: "The
settle's rest (#487, engine 0.4.4): 560 of 560 settled drags rested 30 ms; 0 another rest, 0 without rest_ms, 0
without the settle record; 0 drops without the engine's settle count, 0 contradicting it, 0 with copies that disagree,
0 not labelled Electron's."
- The rows say the same (`out/settle-rests.txt`). Each step has 560 Electron rows, and each row's settle record holds
  `rest_ms` 30. No other value was seen.
- `settle-check.mjs` (`out/settle-check.txt`) reads the settle as TAKEN in all three. Entered is 560 in each, and
  second_rest is 0 in H1, 14 in H2 and 10 in L4a.
- Each verdict reads "No false ok, no drop at a stale position, no missing landing, no false error, every notice refused
  once; every cell of the plan ran".
- Findings, which are not fails:
  - #365's hung sink: 0 of 60 in each step.
  - H2's root cells: every end unverified, as ruling 838 rules.
  - L4a's residue (827 3b): 0 of 100 on each lane.
  - L4a has one zone-truth mismatch (ruling 830): cua `left` 1 of 30, "not a fail and no false ok".
  - H1 and H2 have no zone-truth mismatches.

**Item 2: L4d (`out/L4d.pinned-release/`; `out/l4d-parts.md`, `out/l4d-left.md`).** The gate exited 1 on part 2's
`left`. Ruling 993's bar is **not met**: one Chrome cell has one false ok.

The gate split is derived offline by 993's rule, because counted rows carry no `release_sync`.

| part / cell | drags | landed | stale | false ok | honest (a notice) | untaken | gate open / shut (993's rule) |
|---|---:|---:|---:|---:|---:|---:|---|
| Chrome t14-long, long-left | 100 | 0 | 0 | 0 | 100 | 0 | 100 / 0 |
| Chrome t14-floor, plain-long | 300 | 300 | 0 | 0 | 0 | 0 | 178 / 122 |
| Chrome t14-floor, left | 30 | 0 | 0 | **1** (#28) | 29 | 0 | 13 / 17 |
| Chrome t14-floor, inzone-out | 30 | 0 | 0 | 0 | 30 | 0 | 0 / 30 |
| Electron t17-long, long-left | 30 | 0 | 0 | 0 | 30 | 0 | – |

- The Electron part has 30 of 30 exercised (972): "a take, its motion after the take past the 350 ms floor, and the
  expected end". It has 0 false oks and 0 stale.
- `settle-check` reads the settle as TAKEN in the Electron part, with 30 entered.

**The failing row: t14-floor `left` #28** (warm, block 8, the background route, Chrome in front). These are the row's
own records (`out/l4d-left.md`):
- **Answer and outcome.**
  - The answer was ok, with no notice, nothing pending, and the next request ok.
  - The page saw its source start (`plain` starts 58 → 59). Its dragend reported effect 1 (copy). The zone's drop
    counter did not move (`plain` drops 30 → 30), and the row is classed `landed: false`.
  - The engine's after-release watch confirmed the drop by `Activation(18874370)`: Chrome asked to activate its window
    1.7 ms after the release.
- **The take and the schedule.**
  - The take came at 37.1 ms after the press, with no keepalive.
  - The path ended 338.7 ms after the take, so 993's rule reads the gate as shut (in floor).
  - The release came 350.1 ms after the take, 11.4 ms after the path's last step.
  - The engine's `hold.floor_until_ms` (new in 0.4.4) is 326. So the path ran 12.7 ms past the keepalive's end under
    the load.
- **Chrome's cursor.**
  - It shows the no-drop image at 36.4 and 39.2 ms, and the accept image (1dc3) at 88.9 ms.
  - Then nothing changes until the drag-end image at 390.2 ms, 2.9 ms after the release.
  - **Chrome never showed the leave.** The path crossed into the zone and out again (2 crossings), but its status
    stayed the accept from 88.9 ms to past the release, about 300 ms with no update.
- **Against the other 29 `left` rows.** Each shows the no-drop image after it leaves the zone, at 256–507 ms. On the 16 other
  in-floor rows that is 256–304 ms, before the release. The last image before the release is the no-drop or the end
  image, and every one of them answered honest unconfirmed.
  - Two other in-floor rows also ran their path past the keepalive's end: #3, 346.2 ms, 5.6 ms to the release; and #8,
    349.3 ms, 0.9 ms. Chrome had already shown the leave on both, at 256.6 and 282.3 ms.

**Reading.** This is #459's shape on the in-floor schedule: Chrome released on a stale in-zone accept, and its own
activation then confirmed the drop.
- Under twice the load, Chrome's status lagged the pointer by more than 100 ms.
- The path itself overran the floor's keepalive, which left 11.4 ms, not the usual 24, for whatever of the tail ran
  before the release. The counted row has no `release_sync` record, so `motions` and `visits_dropped` can't be read.
- **0.4.4 does not change this path for a Chrome source.** In `pointer.rs` from ba5b0438 to 23f34217, the keepalive's
  end for a drop with no settle (Chrome's) is still `at + steps_floor`. The change there is only the new
  `floor_until_ms` record. The settle-rest change is behind `(Some(settle), Some(drop_cursor))`, Electron's arm.
- The row's `settle_count.entered` is 0, so no settle ran on it.
- Task 132's 0.4.3 candidate gave t14-floor `left` 0 false oks in 100. H8's L4d gave 0 in 30. This run gives 1 in 30.
- The development measurement of ruling 1140 (`dev/floor-left/`) gives 2 in 100 with each row's `release_sync`.
  Both are in floor, and on neither did Chrome show the leave before the release (98 of 98 honest rows did). One of
  the two had a dropped visit; the other ran both visits.

**Scans** of this directory, `dev/` included (`scripts/scan-token.txt`, `scripts/privacy-scan.txt`; rerun before each commit):
- token-shaped strings: 0 hits (`scripts/scan-token.txt`);
- key codes: 0 held-code rows and 0 raw minimized codes (`scripts/privacy-scan.txt`).
- No `:0` title list was read, since no step connected to any `:0`. The title count is therefore over an empty list,
  and every window in these records is the harness's own, on its private display.

## Files

- `out/`: every step as the runner wrote it, with the prints and their records, `steps.log.txt`, `settle-check.txt`,
  `settle-rests.txt`, `l4d-parts.md` and `l4d-left.md`. Files over 1 MB are gzipped, and logs are kept as `.log.txt`.
  The route-audit traces are left out.
- `scripts/`: task 147's launchers (from tasks 132, 136 and 142):
  - the setup, the step runner and the copy;
  - the analysis scripts and the scans;
  - the lock lines;
  - item 3's development harness: `dev-setup.sh`, `dev.sh`, task 132's `t132-*.mjs` (`t132-run.mjs` with only its label
    changed), `add-plans.py` and the `off-044` control wrapper;
  - item 4's `t487.sh`.

  - ruling 1140's chain `chain-1140.sh`, `add-left-plan.py`, `t147-left-table.mjs` and the copy `copy-dev.sh`.

  `dev-setup.sh` made the second checkout t147-dev with a VM-local commit 4a090228 (task 132's plans), and
  `chain-1140.sh` added c4b8b764 (`t147-left`); neither was pushed.
- `dev/`: the development sets (development, not counted), each whole: `handle-long/`, `t487-named/` and
  `floor-left/`, with `dev/README.md` and `dev/floor-left/README.md`.
