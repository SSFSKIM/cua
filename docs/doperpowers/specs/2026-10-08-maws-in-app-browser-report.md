# Execution report: MAWS in-app browser driven by cua_repl (board #13)

Status at hand-back (2026-10-08, second): in progress. The harness requires a hand-back whenever this run idles waiting
for a background reviewer; resume it with SendMessage. The M2 frontier reviewer (handle in the ledger) is still running.

## State
- M1 (cua): complete. Reviewed clean (reviewer-high on opus; astra is at its usage limit until Oct 13).
  Commits 919dae7..0bd4190, plus the fix 95a63ef..ab7db6e. Spec commits ride along on the same branch.
- M2 (MAWS): executed. MAWS b5dec4aa..d1d9d910 on e13-cua-in-app-browser (pushed), plus cua 602391b (the harness reads
  JPEG). Its frontier review (reviewer-high on opus) was dispatched against review-M2-aa1fa4f..d1d9d91.diff and has
  not returned. Spikes S1 and S2 both PROMOTE; their verdicts are recorded in the spec's Surprises & Discoveries.
- M3, M4, M5: not started. No pull request is open yet.
- e2e typecheck: `tsc --noEmit -p tsconfig.e2e.json --composite false` exits 0. The IDE's TS6307 comes from composite
  mode and is a pattern across the repo (140 occurrences, mostly in files from master). It goes into MAWS's tech-debt row
  in the M2 fix wave.
- Spec (cua worktree): Progress, Surprises & Discoveries and Decision Log are current through M2. The last spec
  commit is 5f2533c (the A-42 wording the coordinator asked for).
- The ledger is .doperpowers/sde/2026-10-08-maws-in-app-browser-design/progress.md in the cua worktree (gitignored). It
  holds the bases, heads and agent handles. The per-task reports are task-1-report.md and task-2-report.md in the same
  directory.

## Resume
1. Take M2's review verdict and fix the findings by resuming the M2 executor, then re-review.
2. Tick M2 in the spec's Progress.
3. M3. Its first MAWS commit is the A-42 entry.
4. M4, then M5. M5 runs the live acceptance; the coordinator does the manual half.
5. Open one PR per repository: cua against main, MAWS against master.

## Environment friction
- astra is rate-limited (HTTP 400 until Oct 13). reviewer-high runs with model: opus, which the coordinator accepted.
- The owner's packaged MAWS is running from the main checkout's dist. All live work uses dev builds with their own
  userData under /tmp.

## Residue so far
- M1 tech-debt row in cua's tech-debt-tracker.md: per-process log files accumulate, and a profiles.json that does not
  parse hides the maws entry.
- The flaky pty test in MAWS, `pause-take-over.pty.test.ts`. It is unrelated to this work.
