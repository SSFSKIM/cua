# #117 own native engine — M2b execution report (interim)

Executor's account of milestone M2b ("The matrix, oracles and the `native-mac` suite") of
`docs/doperpowers/specs/2026-10-18-own-native-engine-design.md`, on branch `feat/117-m2b` (from main 885d7d8e).
The spec's Progress, Decision Log ("M2b pre-flight", "M2b.1a", "M2b.1b", "M2b.2, the native matrix", "M2b.2, the
TextEdit launch cell", "M2b.4", "M2b.4, the comparison is exact on indexes") carry the decisions; the ledger
(`.doperpowers/sde/2026-10-18-own-native-engine-design/progress.md`, gitignored) carries bases, heads and handles.

## Status (interim, 2026-10-21)

| Task | State |
|---|---|
| M2b.1a `--probe keystroke --key-codes-only` / `--ansi-keys`; HID row ×3 variants + paste | Reviewed clean (96a36d01..b7161e6d, fix f36b1f38) |
| M2b.1b five residue cells (route4, minimized-select, enablement, menu, hscroll) | Reviewed clean (5f947e9b, 46b71cca, fixes 74a93b34, ce1d491d) |
| M2b.2 native-matrix.mjs (method matrix, speed, finding, oracle, summary) | Reviewed clean after 3 rounds; merged ffa6c51f |
| M2b.4 native-mac parity suite | Reviewed clean after 5 rounds; merged 754802f7 |
| M2b.3 probe cells, Korean/Unicode matrix, settle | Built (6bd80f74..d8585eff); review found 4 Important + 1 Minor; fix round in flight with the hold-2 split change (run number, hold id and load per run, per-pair judgement) |
| M2b.5 holds | Hold 1 booked on 95a39eeb (HID row + paste + five residue cells), not yet started; hold 2 split by run (2a runs 1–2, 2b run 3 + suite), commit to be named after M2b.3 and the whole-milestone review |

Hosted ci-gate: 39638137969 (ce1d491d, hold 1's code) and 39647725336 (6bd80f74) fully green.

Not yet done: M2b.3's fix review, the whole-milestone reviewer-high, holds 1 and 2, Outcomes & Retrospective, the PR.
