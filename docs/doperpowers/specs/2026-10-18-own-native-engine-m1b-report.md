# #117 own native engine — M1b execution report

This is the executor's account of milestone M1b of `docs/doperpowers/specs/2026-10-18-own-native-engine-design.md` (the spec). The work is on branch `feat/117-own-native-engine` in SSFSKIM/cua, base a254a1f0.

The spec's Progress, Decision Log ("M1b pre-flight", "M1b.1"–"M1b.4b", "whole-M1b review", "M1b.5 sitting") and Surprises carry the decisions. The ledger, `.doperpowers/sde/2026-10-18-own-native-engine-design/progress.md` (gitignored), carries every base, head and hold time.

## Status

M1b is open on one line of its Proves: the goldens. Everything else it promises is met.

| Proves | State | Evidence |
|---|---|---|
| Comparison A's full default plan within the no-regression rule | **Met** on the reviewed build 4b31b8e61195 (b076648e): 3 vv and 3 vc runs complete, `compare --engines` VERDICT: PASS | `docs/doperpowers/research/2026-10-18-own-native-engine/m1b/comparison-a/` |
| The selection table live | **Met**: 303 rows, oracle passed | `m1b/selection/selection.json` |
| Finder's golden compared as full text, and the goldens' corrections expiring (re-recorded live, every engine-fault correction deleted) | **Not met**: TextEdit and Electron recorded on 4b31b8e61195; Finder and Chrome not. Nothing installed, so the expiry audit has not run | `m1b/goldens-run/` |

M1b.1–M1b.4b are ticked. M1b.5 and M1b stay unticked.

## Commits

a254a1f0..b8ec2d76: 56 commits plus this report, 236 files, +62k/−0.3k lines. Most of the lines are recorded evidence and goldens.

The code tasks, M1b.1–M1b.4b and their reviews, are in the spec's Progress and the ledger. This report covers what came after the code landed: the live sitting (M1b.5) and its fixes, 16f4ceb6..HEAD.

| Commit | What |
|---|---|
| 1e4a5425 | The GUI-session sign job's `codesign` is bounded by the sign wait. Before, a fixed 60 s `spawnSync` killed it under the owner's prompt and left the prompt orphaned. |
| 59e3295b | The capture watch matches the SCAlert class's own lines (`[SCAlert `). Before, it matched replayd's `SCAlertStatsManager` bookkeeping, a false positive on every capture. |
| 737dbf20, e73ed084 | Spec only: the two defects' Surprises, including the owner's observation. |
| 284a9220 | The baseline's bind check allows 1 s of `ps` etime slack. etime subtracts whole seconds, and the check had refused the TextEdit the run's own bind launched. |
| 6956da3d, 86cc306d | The goldens harness. Finder's unset keys are read under macOS 27's wording, and deleting an already-unset key counts as restored. Chrome for Testing gets a fresh profile per launch. |
| 3fcc4e49 | The engine reopens a running app with no primary window, as the vendor does, then waits 5 s at 50 ms for its window. |
| ccbb8242 | Takes `native/engine/.build`, committed by mistake in 3fcc4e49, out of git and ignores it. |
| aa6652fe, 049c6812, b076648e | The engine fix's review rounds. A failed AX read never leads to an open. The open's own process is followed. Every attribute read is charged to the request's deadline, and no result is accepted past it. |
| 34b4c796 | The sitting's evidence and the spec folded in. |
| 24c1f01f, b8ec2d76 | The after-hold review's fixes: TextEdit ownership read immediately before the bind; Chrome's fresh profile cleaned up after a failed start. |

## Reviews

- **M1b.1–M1b.4b and the whole-M1b review:** recorded in the ledger. The whole-M1b re-review was correct at 1a3cb173, and the sitting commit was 16f4ceb6.
- **1e4a5425..737dbf20** (the phase-1 fixes): reviewer-medium, correct, no findings.
- **The engine reopen fix:** task-reviewer, four rounds.
  - 3fcc4e49: not correct at three boundaries.
  - aa6652fe: one deadline gap left.
  - 049c6812: per-attribute deadline accounting left.
  - b076648e: **correct**.
  The coordinator's convergence rule: a finding voids the runs only if it changes what a responsive app's bind resolves to, captures or returns; there is no fifth round inside the hold.
- **After the hold:** reviewer-medium on f6d713d2..b076648e, covering the harness and engine fixes. Verdict: incorrect, with two harness regressions; the engine part was clean.
  - **P1:** the 1 s etime slack let an owner's TextEdit launched in the second before the bind pass as the run's. Fixed in 24c1f01f: a presence read immediately before the bind, with the age check kept as a secondary guard.
  - **P2:** a failed Chrome scene start left its fresh profile with no record. Fixed in b8ec2d76: the profile is removed once the processes have stopped, or kept with a record for `down`.
  - The re-review of 34b4c796..b8ec2d76: **correct**, no material findings.
  - P1 does not touch the hold's runs: each final run launched its own TextEdit, and no foreign window appeared at any run start.

## The live sitting (M1b.5)

**Hold 1, phase 1 (2026-10-20 22:10–22:23Z).**
- The first sign failed: the job's 60 s `spawnSync` killed `codesign`, leaving an orphaned prompt. The owner cancelled it.
- A one-shot key-trust job in `gui/501` took the owner's Always Allow (22:15:28Z). Every sign since has been silent.
- Approve stopped twice on the capture watch's false positive. The matched lines were `SCAlertStatsManager`'s; no `userAcknowledgement` or `showAlertWithTitle` line was logged, nothing was on screen, and the owner confirmed it.
- Approved at 22:22:24Z with the three grants carried over.

**Hold 2, phases 2–5 (2026-10-21 00:02–01:34Z).** The sequence:
1. `repl-parity prepare` needed a live Chrome profile. The coordinator approved opening the owner's Chrome for phase 3 only.
2. Goldens, first attempt: Finder's key read failed under macOS 27's wording, and Chrome's restart showed the AI-mode placeholder. A fixer worked on both while phase 4 ran.
3. Comparison A, first attempt:
   - The bind check refused the run's own TextEdit, because of etime rounding. Fixed in 284a9220.
   - The first vc run then failed its bind: the engine did not reopen a windowless TextEdit.
   - A live read showed TextEdit, launched in the background, opens no window at all. The vendor's decompile showed the reopen: open helper `0x1001648c4` with `activates = false`, and `waitUntilHasPrimaryWindow` `0x1006fbdf0` for 5 s at 50 ms.
4. The engine fix: four review rounds, three rebuilds, each signed and approved silently.
   - The provisional runs on 6757e0eb passed.
   - The runs on faecf7d9 passed but were voided by the third review.
   - The final runs on 4b31b8e61195 passed.
5. Goldens, second attempt: TextEdit and Electron recorded. Finder (status bar) and Chrome (readiness) did not; see the residue.
6. Phase 3 with the owner's Chrome (ssfs profile), opened at 01:28:57Z and quit at about 01:33:30Z from its own app menu. ⌘Q is ignored while "Warn before quitting" is on.
7. Cleanup.

**Put back:**
- Finder's keys at their pre-state: ShowSidebar=1, ShowStatusBar and ShowPathbar absent.
- The input source is ABC.
- The engine is approved and stopped.
- No scene app or Chrome is running.
- The prepared home is removed.
- Scratch is removed on both machines, and the fixer's worktree is removed.
- No prompt was answered by automation. No foreign window appeared at any final run's start.

## Residue

These need tickets. The dispatching session registers them.

1. **Finder's unset status-bar default on macOS 27.**
   - With `ShowStatusBar` unset, macOS 27 shows the status bar. The scene's `FINDER_CHROME` table assumes the macOS 26 default (hidden), so the setup never sends ⌘/.
   - The fix is an OS-dependent unset default carried through `restoreSteps` and the save/restore path, with tests for macOS 26 and 27.
   - It blocks Finder's golden and the full-text Finder comparison M1b's Proves names.
2. **Chrome scene readiness.**
   - The harness side: `scenes-mac.mjs up chrome` returns before the page's AX tree has filled (44 nodes at once, 83 five seconds later). The fix is to wait for the page's load (CDP's load event; Chrome for Testing is under automation), so the goldens are deterministic.
   - Separately, an M2a question: should `get_app_state` settle on a still-filling web tree, as the vendor's UI-settle wait (`0x1006f7408`) does?
3. **The minimized-window branch.**
   - The vendor reopens an app whose primary window is minimized; cua deliberately does not, because the reopen would un-minimize the owner's window. This is a declared difference (Decision Log, "M1b.5 sitting" item 2).
   - Revisit it if a scene needs an app observed while minimized.
4. **The goldens: record, install, audit.** After 1 and 2, re-record all four scenes on the approved build, install them, run `goldens.mjs check` (the expiry audit), and delete every expired engine-fault correction in `test/native-goldens/expected.json`. This is the last line of M1b's Proves.
5. **Merge constraint.** 3fcc4e49 added `native/engine/.build`, about 217 MB of blobs, to the branch's history. Integrate #117 by squash merge, or filter `native/engine/.build/` out of history before a merge commit.
6. **Stale remote branches.** `ci/m1b-baseline-31ea5760-13fc5d`, `m1b/selection`, `m1b/baseline` and `m1b/goldens-harness-fix`, all pushed during M1b. Delete them once their commits are on feat (they are).
7. **M4's `cua install --engine`** must read the sign wait the way `cua engine build` does. The spec's M4 text already says so.
8. **Two hosted-CI flakes**, seen on b8ec2d76's first gate (run 39531662385); both passed on the re-run (39533801956).
   - `AutoStopTests.testCancelStopsTheDeadlineFromFiring` (native/engine/Tests/EngineTests/InputTests.swift:368): `arm(seconds: 0)` then `cancel()` races the timer on a loaded runner. The test should arm a deadline that cannot fire before the cancel.
   - The parity-browser vendor-host api suite's `api/browser-cuaapi/keypress` assertion failed once. It is the vendor host's case, not this branch's code.

## Validation

- **Comparison A:** `node scripts/native-baseline.mjs compare --engines m1b/comparison-a/vv m1b/comparison-a/vc` → `Verdict: **PASS**` (`m1b/comparison-a/comparison.md`).
- **Selection:** `node scripts/repl-parity/selection.mjs --device mini --node22 … --out m1b/selection` → `{"complete":true,"rows":303,…}`.
- **Engine unit tests:** `swift test --package-path native/engine` → 221 tests, 0 failures, at b076648e.
- **Harness unit tests:** `node --test test/repl-parity/scenes-mac.test.mjs test/native-baseline/run.test.mjs` → 83/83 at 86cc306d; the run test file is 38/38 with the etime case.
- **Harness unit tests after the review fixes:** `node --test test/native-baseline/run.test.mjs test/repl-parity/scenes-mac.test.mjs test/repl-parity/scenes-mac-finder.test.mjs` → 103/103. `npm test` → 3,480 passed, 170 skipped, 0 failed.
- **Hosted CI:**
  - ci-gate 39506615602 (1e4a5425) and 39507932222 (737dbf20): GREEN.
  - 39528214569 (34b4c796): GREEN, 6/6.
  - 39531662385 (b8ec2d76): RED 2/6, the two flakes in residue item 8. The failed gates re-ran GREEN in 39533801956 (engine-swift, parity-browser); the other four passed in the first run.
