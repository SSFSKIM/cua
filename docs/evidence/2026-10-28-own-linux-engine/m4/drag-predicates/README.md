# M4, T15: drag predicates (task 70) — stopped at a design question

T15's row, narrowed by the design session (2026-11-09): build Gecko's predicate for Move and Drag (Scroll keeps the
window's rule), and the manifest of adopted cases that joins the gate; each newly allowed case 30 of 30 with the
witness clean, and every other refusal unchanged. The row's first two items close as measured with nothing to adopt,
from T13 (`m4/drop-signals/`): on a private display no part of a Chromium covered path decides (every kind survived
every covered part, under an override-redirect cover and under a managed front window, 1,000 drags, 20 of 20 a cell,
M3.1's covered failures not reproduced), and no start role predicts anything, so there is no start-role refinement.

**The finding: Gecko decides by the real pointer, not by the cover.** Firefox takes background pointer input (moves,
drags, clicks, scrolls) while the real pointer is in its window, and none of it while the pointer is outside, whatever
covers the window and wherever the request's points are. A fully visible Firefox with the pointer elsewhere took 0 of
10 of every kind. A Firefox window whose top 55% is covered, with the pointer in its visible bottom part, took a move
and a range drag at points under the cover 10 of 10. M3.1's and this task's pilot "covered" results follow where the
pointer happened to be. So neither the shipped window rule (`unless_unobscured`) nor the point rule built here
(`unless_path_unobscured`, commit 6c4a739c) is what Gecko decides by, and both let through requests that answer
success and do nothing while the person's pointer is elsewhere. The predicate is a design call, sent back to the
design session (below); no case was adopted, and the manifest's sitting was stopped at its first contradiction.

## The pilot (`pilot/`): where the point seemed to decide

The pinned build's background requests (it has no device mode) and the XTEST control, 10 a cell (canvas 40),
`scripts/pilot.sh`, on T13's head (`cua-engine 0.3.0 (2917848db187)`, whose shipped Gecko rule refuses every cover).
The real pointer was not placed: it stayed where the run left it (the screen's centre at the start, then wherever
the control lane's XTEST input put it).

| occlusion | move | click | scroll | select | range | scroller | dnd | canvas |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| covered | 0/10 | 0/10 | 0/10 | 0/10 | 0/10 | 0/10 | 0/10 | 0/40 |
| partial (bottom 50%) | 10/10 | 10/10 | 10/10 | 10/10 | 10/10 | 10/10 | 10/10 | 0/40 |
| partial-deep (bottom 70%) | 10/10 | 10/10 | 0/10 | 0/10 | 10/10 | 0/10 | 0/10 | 0/40 |
| partial-top (top 55%) | 0/10 | 0/10 | 0/10 | 0/10 | 0/10 | 0/10 | 0/10 | 40/40 |

Read by the point, this looked decisive: under a top cover the covered move, selection, range, thumb and drop were
ignored and the visible canvas stroke taken, under bottom covers the reverse for the canvas. The partial-deep row
already did not fit (the selection at a visible point 0 of 10, with the control 0 of 10 too). The pilot also shows
Gecko's clicks taken with half the window covered (10 of 10), against M0.4's `:0` finding.

## The manifest's first sitting (`idle1-predicates-aborted/`)

The point rule built (6c4a739c) and the manifest run as the gate would run it (`scripts/sitting.sh`, `--experiment
predicates`). The first cases held: `partial` move 30 of 30 for cua and the pinned build, `partial` click and scroll
refused 10 of 10. Then `partial-deep` move, every point visible: cua 0 of 30 and the pinned build 0 of 30, the move
answered ok and the page counted nothing. The real pointer sat at the screen's centre (640, 400) throughout: inside
Firefox just above the half cover, and inside the cover once it reached 70%. The sitting was stopped there (lock
acquired 2026-11-10T00:58:39Z at load 1.02; it was ended by a task stop, so the lock's release line is missing; its
next holder acquired at 01:12:32Z).

## The pointer probe (`pointer-probe/`, `pointer-probe-clicks/`)

`--experiment predicates --plan pointer|pointer-clicks` (`scripts/pointer-probe.sh`), measured, never judged. Each case
parks the real pointer before every request (`predicates.mjs` `parkPoint`): `in`, a point of the window the occlusion
leaves visible that no request aims at; `out`, a point of the screen outside the window. Moves and drags are cua's own
events with the cover left unjudged (`cua:any-cover`, `--drag-ignore-cover`), clicks and scrolls the pinned build's;
the candidate is 6c4a739c's musl build. 10 runs a cell. The selection and range counts are the runs whose value changed
(the probe has no pinned lane, so the drag experiment's value judge has no reference and its `took` column reads 0).

| occlusion | the request's points | pointer | move | select / range | canvas | click | scroll |
|---|---|---|---:|---:|---:|---:|---:|
| visible | visible | out | 0/10 | 0/10 (select) | 0/10 | 0/10 | 0/10 |
| visible | visible | in | – | 10/10 (select) | – | 10/10 | 10/10 |
| partial | visible (canvas covered) | in | 10/10 | 10/10 (select) | **10/10** | 10/10 | 10/10 |
| partial | visible (canvas covered) | out | 0/10 | 0/10 (select) | 0/10 | 0/10 | 0/10 |
| partial-deep | move and range visible | in | 10/10 | 10/10 (range) | – | – | – |
| partial-deep | move and range visible | out | 0/10 | 0/10 (range) | – | – | – |
| partial-top | move and range **covered**, canvas visible | in | **10/10** | **10/10** (range) | 10/10 | – | – |
| partial-top | move and range covered, canvas visible | out | 0/10 | 0/10 (range) | 0/10 | – | – |

Every cell is 10 of 10 or 0 of 10, and the pointer alone decides it: covered points are taken with the pointer in
(bold), and a fully visible window takes nothing with the pointer out. The witness was clean in every run.

| run | lock acquire | lock release |
|---|---|---|
| `pilot/` (8 runs) | 2026-11-09T07:31:17Z, load 1.13 | 2026-11-09T09:23:00Z, status 1 (the drag runs' judges fail the old engine's refusals, as expected), load 0.29 |
| `idle1-predicates-aborted/` | 2026-11-10T00:58:39Z, load 1.02 | none (ended by a task stop) |
| `pointer-probe/` | 2026-11-10T01:14:36Z, load 0.31 | 2026-11-10T01:30:08Z, status 0, load 0.23 |
| `pointer-probe-clicks/` | 2026-11-10T01:30:56Z, load 0.27 | 2026-11-10T01:36:39Z, status 0, load 0.66 |

All on private displays (Xvfb with Openbox and a stand-in person's xterm, `scripts/private-run.mjs`, no whole-run
RECORD), never `:0`; every watchdog ended clean; no stress-ng and no hold file at any start. These are development
runs, not release gates.

## What it means

- **The shipped rule's silent no-ops.** In shared mode a fully unobscured Firefox takes the background route for every
  pointer kind, and Gecko then ignores the input whenever the person's pointer is elsewhere: the request answers
  success and nothing happened. The vendor builds do the same (the pinned build's 0 of 10 above).
- **The engine already sends a synthetic `EnterNotify`** before its motions (`input.rs` `move_to`, the vendor's
  recipe), so Gecko's test is not the crossing event the engine can send; it reads the real pointer.
- **Elsewhere in the matrix this was not measured**: whether a Firefox window with the pointer on the root (no window
  under it) takes input, and whether other families depend on the pointer (gedit took covered drags in M3.1).

## For the design session

1. Gecko's predicate for its pointer kinds is the real pointer in the window: X's `QueryPointer` on the window says
   the pointer is inside it (its child chain), which also means the pointer's spot of the window is visible. In
   shared mode a pointer kind into Firefox with the pointer elsewhere is refused with the Device mode sentence; in
   dedicated mode it takes the foreground route. Clicks and scrolls follow the same evidence, which goes beyond
   T15's Move and Drag scope.
2. The person's pointer moves. A pointer that leaves during a drag cuts it, as Chromium's stray watch handles for
   its press (task 20); a check at the start alone answers success for a drag the person's motion broke.
3. If the rule is the pointer, the cover conditions go: the point rule of 6c4a739c, and `unless_unobscured` for Gecko,
   with the device cases rebuilt around the pointer (`device.mjs`'s Firefox cases park nothing today).

## Instruments (kept)

- `scripts/linux-engine-diff/predicates.mjs`: the manifest (`PREDICATE_CASES`) and its judge, the occlusions
  `overlay` and `offscreen` beside the kinds and drag experiments', pointer parking, and the probe plans. Its tests
  are `test/linux-engine-diff/predicates.test.mjs`. The manifest is written to the point rule and needs rewriting to
  whatever the design session rules.
- `--drag-ignore-cover` now also leaves a Gecko move's point unjudged (measurement only).
- Scripts: `scripts/pilot.sh`, `scripts/sitting.sh`, `scripts/pointer-probe.sh` (`PLAN=pointer-clicks` for the
  second), `scripts/prepare.sh` (the musl build made the release workflow's way and the exported harness), and
  `scripts/engine-tests.sh` and `scripts/focused-tests.sh` (the engine's tests with the gate's flags).
