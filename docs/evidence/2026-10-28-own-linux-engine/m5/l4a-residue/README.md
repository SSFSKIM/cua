# L4a's residue (ruling 827, 3b; task 102)

The rule lives in `scripts/linux-engine-diff/drop-signals-judge.mjs`: `RESIDUE`, `residueBound`, `honestNonLanding`,
and `electronDropVerdict`'s `plan`.

- **Where it applies:** L4a's plain cell alone. The dispatcher (`dropSignalsVerdict`) passes the plan, and only
  `t17-fix3` is opted in. Within that plan, only rows at load `load2` count.
  - No other plan gets an allowance, even at twice the load. `t17-floor`'s 300 plain drops get none.
  - No other load gets one: H1 (idle) and H2 (the gate's window load) are judged as before.
  - No other cell gets one.
- **The bound:** each lane's plain cell may hold at most floor(2 × n / 100) honest unconfirmed non-landings in its n
  drops. For L4a's 100 drops that is 2, and a third fails. A short series rounds down and never up: 99 drops allow 1,
  49 and a pilot's 2 allow none.
- **Honest**, judged on the whole evidence (`honestNonLanding`). Every one of these must hold:
  - the dispatch answered ok, no handle step failed before its end, and the harness did not end the drag with its
    own Escape;
  - the unconfirmed notice was on the read, and the next acting request was refused with it;
  - the zone's drop counter was read before and after the drag, and did not move;
  - this trial's own completed dragend reports no drop. A missing, stale, foreign or unfinished record does not count.
- **Anything less is not residue.** It is judged as any non-landing is, and fails as a missing landing. A false ok
  (an ok with nothing pending and no landing, ruling 650) always fails.
- **Reporting:** each covered cell's count and bound are printed in the verdict's findings, apart from the passes, as
  #364's are. A cell over its bound fails with its count and bound. The counts carry `residue`, one entry per covered
  cell.

## The re-judge (§8.1, point 4), read-only

`rejudge-l4a-residue.sh` runs `rejudge-l4a-residue.mjs` over every stored step of H1, H2 and L4a. Task 98's prototype
steps are read from their own commit (85886a76). The output is `rejudge-l4a-residue.txt`.

**How each step is judged:**

- Each step is judged twice from its own rows: once by H's judge (fefe306c's, unchanged through H‴) and once by this
  checkout's.
- **The replay stands only when** all of these hold:
  - H's judge reproduces the step's stored judge verdict exactly;
  - the run's terminal outcome (`experiment-summary`) carries that verdict's failures;
  - its completeness matches its failures;
  - the run's exit in `step.json` matches its completeness.

  Otherwise the step keeps its stored result.
- **The new result starts from the stored terminal outcome.** Only the judge failures the residue clears come out;
  every other failure of the run is kept, such as a window the harness did not open. The step's own failures are kept
  too: the display's watchdog, or an exit its run does not explain. The end check and the unclean end stay findings,
  as in gate.mjs.

| step | stored | with the residue | residue (cua:handle plain / cua plain) |
|---|---|---|---|
| x64 T5's counted L4a (pinned 0.4.0, at H) | pass | pass, unchanged | 0 of 100, bound 2 / 0 of 100, bound 2 |
| x64 pilot's L4a (task 87, pilot 2) | pass | pass, unchanged | 0 of 2, bound 0 / 0 of 2, bound 0 |
| arm64 pilot's L4a (task 96, pilot 2, 0.4.0) | FAIL | FAIL, unchanged: the cua:handle left false ok | 0 of 2, bound 0 / 0 of 2, bound 0 |
| arm64 pilot's L4a rate run (task 96, pilot 100, 0.4.0; task 98's 0.4.0 column) | FAIL | FAIL, unchanged: the cua:handle left false ok (#20) stands; the missed landing (#20) is cleared as residue | 1 of 100, bound 2 / 0 of 100, bound 2 |
| task 98's L4a on the prototype (arm64, b74961ca, pilot 100) | FAIL (exit 1) | **pass: the result moves.** Its terminal outcome's one failure, the missed landing (#0), is residue; the watchdog was clean | 1 of 100, bound 2 / 0 of 100, bound 2 |
| H1 and H2: x64 T5 (counted), x64 pilot, arm64 pilot, arm64 H1 rate run, task 98's prototype H1 | pass | pass, unchanged | not covered |

**Negative controls**, 19 of 19 failing. They use the prototype's L4a records, and each control edits one thing.

Fourteen are judged by the residue. A row edit's records are first made whole again as H's judge would have recorded
them, so the replay stands and the residue's own judgement is what is tested:

- one more honest non-landing than the bound;
- the residue row answered ok, with no notice (a false ok);
- its notice not kept by the refusal;
- an error carrying the kept notice;
- its dragend record missing;
- its dragend stale;
- its dragend foreign;
- its dragend a drop;
- its zone counters unread;
- the same rows at idle;
- the same rows under `t17-fix2` at twice the load;
- a false ok added to the same series;
- a failure outside this judge in the terminal outcome;
- the watchdog not clean.

The other five check the replay's own guards; each must refuse the replay:

- no terminal outcome;
- no `step.json`;
- a stored verdict that H's judge does not reproduce;
- a terminal outcome without the judge's failures;
- a run exit that the outcome does not explain.

## Ruling 830: zone-truth mismatches, a declared app-level limit

`zoneMismatch` in the same judge flags a zone-truth mismatch. Every one of these must hold:

- an ok answer, with nothing honestly pending;
- a cell in the window;
- this trial's own completed dragend reported copy;
- the zone's drop counter was read before and after, and did not move.

What follows from that:

- **Never a fail.** The dragend rule stands, so a mismatch is never a fail and never a false ok.
- **Always listed.** `electronDropVerdict` lists mismatches apart, per lane and cell, in its findings (and so in the
  summary), and in `counts.zone_mismatch`. With none, the line says the check ran.
- **Everywhere.** It runs in every run, at every load and in every plan: H1, H2 and L4a.
- **Off the window it doesn't apply.** There the dragend rule excuses nothing, so such an ok is a false ok and fails.
- **The motivating case:** task 101's candidate, on arm64 at twice the load. 2 of 30 plain-left drags were answered
  ok; Electron's dragend said copy and the drop landed 50 px outside the zone.

**The stored rows:** the replay finds no mismatch in any of the 13 steps above. That is 320 drags of the window's cells
in each 100-a-cell sitting, and 12 in each pilot.

**Controls on the prototype's L4a rows:**

- a `cua left` drag made an ok on its own copy dragend, outside the zone, is listed (1 of 30) and passes;
- the same ok on a dragend of none is a false ok and fails.

## The reach under §8.1

- `electronDropVerdict` is shared by H1, H2 and L4a, the gate's three T17 Electron steps (`t17-fix3`).
- The residue can move only L4a's result, because only L4a's rows are at `load2`. No stored H1 or H2 result moved.
- C1, L4b and L4c use `chromeDropVerdict`, which is unchanged.
