# Task 22: the gate's cold short-drop misses, the hold, and its keepalives

`m3-gate-final` failed `chrome_dnd_short_in_front_shared` on all three cold samples. Each page fired a `dragstart` and
then a cancel 16–18 ms later. cua's 40 px drag released about 34 ms after the press with no take, and answered ok.
This directory sizes the fix (step A, a scratch engine and a scratch copy of the harness, never in the branch) and
proves the engine's build of it (step B).

## Step A: the gate's own sequence, sized

Every run drives the gate's own harness on `device-chrome-dnd`: `chrome_dnd_covered_dedicated`, then
`chrome_dnd_short_in_front_shared`, with a fresh engine for each case in each block. The scratch engine
(`tools/patch-hold.py`, then `tools/patch-keepalive.py`) holds the button when no take came by the path's end, up to
500 ms after the path's end, then applies the 350 ms floor. "Take" below means the server time of the drag source's
take of `XdndSelection`, minus the press's. Tables: `runs/tables.txt` (`tools/table.mjs`).

| run | what | cold landed | warm landed | takes after the path's end (held) | takes (ms after the press) |
|---|---|---:|---:|---:|---|
| `base1` | the hold off, 10 blocks | 9/10 | 19/20 | 0 (the 2 misses never took by the answer) | 6–30 |
| `hold1` | the hold on (first scratch: a single 1 px nudge after a late take), 30 blocks | 30/30 | 58/60 | 1 | 4–35 |
| `hold2` | keepalives; the gate's other Chrome windows open (`dnd.mjs` `GATE_BALLAST`), 30 blocks | 30/30 | 60/60 | 27 (7 cold, 20 warm), all landed | 5–78 |
| `fast1` | the same, drag step 0 so nearly every take comes after the path's end, 20 blocks | 20/20 | 40/40 | 54 plus 1 at the path's end, all landed | 4–73 |
| `warm1` | the same, each short drop's engine warm first (a window state with a screenshot before the case's condition), 15 blocks | 15/15 | 30/30 | 12 (7 cold, 5 warm), all landed | 5–93 |

- **The mechanism**: `base1`'s two misses match the gate's. Chrome's renderer got the drag's first moves a frame late
  (`dragstart` at about 26 ms), and the release came at about 26.5 ms, before the drag-and-drop loop started.
  - Under the gate's load of Chrome windows (`hold2`), takes came 53–78 ms after the press in 27 of 90 drags.
  - Without the hold, every one of those 27 would have been released at about 26 ms, before its take: the gate's
    miss.
- **The fresh engine is not the cause.** With the engine warm and its window retained before the case (`warm1`),
  late takes came in 7 of 15 cold and 5 of 30 warm drags. With fresh engines (`hold2`) the counts were 7 of 30 and 20
  of 60. So the late take is Chrome's state under load, reachable by any agent. The engine is the right place for the
  fix.
- **A floor waited out without motion still misses** (`hold1`):
  - A take on the path's last sample left a single silent 350 ms wait, and missed.
  - So did a late take followed by one 1 px nudge.
  - Over every recorded drag, 1 of 6 with three or fewer steps after the take missed, against 0 of 308 with more
    steps.
  - Chrome's drag loop sends its target a position only on a motion. So the floor was filled with motions
    (keepalives) from `hold2` on: no miss in 195 drags, about 93 of them held.
- **The bound**: the largest take was 93 ms. In the gate run the take came after the release, at most about 134 ms
  after the press. The engine holds until 250 ms after the press: the largest take plus about one more Chrome stall
  of the size task 18 saw (about 100 ms). Measured from the press, a drag whose path lasts 250 ms or more pays nothing.

## Step B: the engine's hold (`dnd.rs` `TAKE_HOLD_AFTER_PRESS`, `KEEPALIVE`, `wait_for_take`, `keepalive`)

The hold applies to a Chromium drag the engine lets drop: one into a window in front, on a dedicated desktop, or
through the desktop route.

- With no take by the path's end, the button stays down until 250 ms after the press. A take then, or one seen at the
  path's last look, gets the 350 ms floor.
- After a take, the remaining steps are at most 12 ms apart. The rest of the floor re-visits the path's
  second-to-last sample and its last, 12 ms apart, ending on the last.
- With no take by 250 ms, the drag is released and answers as before.
- `--stats` `hold`, after the task review's fix round 1, has one shape on every drag the hold watches:
  - `bound_ms`;
  - `path_ms`, the press to the path's end;
  - `held`, whether there was no take by the path's end, so the hold ran;
  - `waited_ms`, 0 when the hold did not run;
  - `taken`, whether a take came by the release;
  - `take_after_press_ms`, null without a take;
  - `keepalives`.

  The bound and the take's time count from the button's press itself. `runs/proof240/` was recorded before that fix,
  with a conditional shape: a drag whose take came during its path recorded only `take_after_press_ms` and
  `keepalives`, and its bound counted from just after the press's threshold batch, 1–4 ms later.

**The keepalives against the press watch** (`runs/proof240/`, `runs/proof240.json`, `tools/proof.mjs`): 240
undisturbed drags of the built engine, with the gate's ballast. The four cases were in front, shared (background
route), and covered, dedicated (foreground route, XTEST), each with a long and a short path.

- 240/240 answered ok and 240/240 landed. 0 answers said the drag may not have started.
- 109 drags sent keepalives; 17 were held for a late take, and all 17 landed.
- The press watch counted exactly one event per drag, and the keepalives did not change it:

  | route | keepalives | watch saw |
  |---|---|---|
  | background | none (66 drags) or some (54) | `leave_grab` |
  | foreground | none (65 drags) or some (55) | `leave_normal` |

  That event is Chrome's own crossing when its drag loop starts, after the take, which the take excuses as before.
  The keepalives added none: on the background route they are synthetic, and on the XTEST routes they come from the
  XTEST pointer, which the watch leaves out.

**The cost** (`runs/cost1.jsonl`, `tools/cost.mjs`): Chrome's drag page in front, with the hold on and with
`--drag-dnd-hold-ms 0`.

| drag | the hold off | the hold on |
|---|---:|---:|
| 40 px range | 129.6 ms | 355.4 ms |
| 40 px text selection (no take) | 134 (task 20's `cost2`) | 355.4 |
| 288 px range (its path 200 ms) | 304.9 | 354.6 |

- The run was stopped after about half its rounds.
- The off lane's selections, and the long selections in both lanes, pressed inside the last selection and so dragged
  the text (a take). Those rows measure a text drag and are not counted.
- A drag the shared mode's guard watches (Chrome not in front) has no hold and pays nothing.

## The limits, declared

- **A speed gap for M4**: a Chromium drag that never takes (a text selection, a range, a short thumb drag), into a
  window in front, on a dedicated desktop or through the desktop route, holds its button until 250 ms after the press.
  It pays 250 ms less its path's time: a 40 px selection goes from about 134 ms to about 355.
- **A residual**: a take later than 250 ms after the press still answers ok, and its drop misses unseen.
- The press watch's window now runs to the held release. So the person's real pointer moving during a selection's
  hold answers the declared false error (#249) for 250 ms rather than about 30.

## Files

- `runs/<run>/results.jsonl`, `summary.md`: the harness's own records. The `prepare-faults` rows of `hold2`, `fast1`,
  `warm1` and `proof240` were written while the rule's aggregate was named `run`, which replaced the run's name. They
  are corrected to `total` with the run's name restored, and their `summary.md` rendered again (task review, fix round
  1; `tools/fix1-evidence.mjs`). The short drop's rows carry the scratch
  engine's `scratch` record (press, take, path end) and `dnd_wait`; `proof240` carries the built engine's `hold`.
- `tools/`: the scratch engine's patches over the branch's engine as of 47143d38 (its sources unchanged until step B), the scratch harness's patch (the
  `scratch` stats, `SCRATCH_WARM_FIRST`, `SCRATCH_BALLAST`), the run scripts, and the table, proof and cost scripts.
