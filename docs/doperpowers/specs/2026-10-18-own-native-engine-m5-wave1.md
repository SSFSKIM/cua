# #117 M5, first wave: T8, T9 and T11 — execution record

- Plan: the M4/M5 pre-flight, revision 3, `docs/doperpowers/specs/2026-10-18-own-native-engine-m4m5-preflight.md`
  at 8f06f132 on `docs/117-progress` (cited `PF §<n>`). Tasks T8 (§6's gates, T8a to T8e), T9 (R4, the minimum
  engine) and T11 (the default-selection mode, then the flip), §7 and §8.
- Spec: `docs/doperpowers/specs/2026-10-18-own-native-engine-design.md`. The design session owns it and its Decision
  Log; this file is the wave's living record on `feat/117-m5` until the design session folds it into the spec (the
  spec's Progress is being reconciled on `docs/117-progress` and M4's re-cut adds its own block, so this wave does not
  edit the spec's log in place).
- Branch `feat/117-m5` from main b1b15484. M4's re-cut runs beside it on `feat/117-m4-recut`.
- Rulings received during the wave: 1118 (install never replaces an approved engine at or above the minimum; a new
  source builds pending beside it, `cua engine approve` promotes). #189 and #185 are with the design session.

## Plan of Work (this wave)

Order: T9 first, so the engine-version rule binds every engine change T8 makes; then T8a to T8e; then T11's two
commits. Nothing here runs hosted, touches the GUI or Accessibility, or needs the owner: a witness that needs a runner
or the owner is prepared and named in its gate's disposition file under
`docs/evidence/2026-11-23-own-native-engine/gates/`.

| # | Task | Scope (PF) |
|---|---|---|
| 1 | T9 | R4: `engineVersion` moves with every engine change, a check fails a change to `native/engine/` that does not move it, the service names its minimum, a default selection below it keeps the vendor's with a warning naming the remedy, an explicit one is refused, `doctor` warns; ruling 1118's wording |
| 2 | T8a | #186, #190, #420: fixes, unit witnesses, disposition files, runner witnesses prepared |
| 3 | T8b | #184's route A/B removed (`CUA_ENGINE_SPIKE_ROUTE`, `route-ab`); #189 and #185 as ruled |
| 4 | T8c | #212 with PR #218 re-cut on main; the hosted save-sheet cell prepared |
| 5 | T8d | #216: diagnosis, fix if found, the hosted twenty-cycle session prepared |
| 6 | T8e | #258, #259: one cell each prepared beside the vendor; dispositions drafted (T8e also waits on T10) |
| 7 | T11a | The default-selection mode, failing while the macOS default is the vendor's |
| 8 | T11b | The flip: `darwin: 'cua'`, its mirrors, tests and docs (PF §7). Stays on the branch, unmerged |

## Progress

- [ ] T9
- [ ] T8a
- [ ] T8b
- [ ] T8c
- [ ] T8d
- [ ] T8e
- [ ] T11a
- [ ] T11b

## Surprises & Discoveries

## Decision Log

- 2026-11-23, ruling 1119 (#189): pressKey sends physical keys, composed by the active input method. With the source
  and layout observed after refocus, Korean 2-Set expects 가 and Latin expects "rk", in all three scenes. typeText
  keeps its exact-text contract. If the vendor's lane composes differently the row fails and cannot be declared.
- 2026-11-23, ruling 1119 (#185): the per-context rows are out of M5's judged matrix. Cause: a stored per-context
  preference does not show live behaviour, and establishing it would mean focusing each window, which non-interference
  forbids. The rows still run and report as excluded / NO VERDICT; the owner's page lists them under "not judged" with
  that cause; #185 stays in the backlog with its design.
- 2026-11-23, ruling 1118: a plain `cua install` never replaces an approved engine at or above the minimum; it builds
  the new source as a pending build beside it and `cua engine approve` promotes it. Remedy wording by case: an approved
  build below the minimum falls back to the vendor's with a warning naming `cua engine approve` when a pending build
  exists, else `cua install` then `cua engine approve`; an approved build at or above the minimum with a newer pending
  build does not fall back, and `doctor` shows both builds with "a new build is pending; cua engine approve to use it".
  M4's T1 is reshaped to match; wording aligns with `feat/117-m4-recut` when it lands.
- 2026-11-23: T9 runs before T8 (accepted, 1119) so that T8's engine changes are the first to move `engineVersion` under the rule.
- 2026-11-23: this wave's decisions are recorded here, not in the spec's Decision Log, which the design session and
  M4's re-cut are both editing on other branches; the design session folds this file in.
