# H6: C1 and L4c recast, the canary's criterion by architecture, and the runner comparison (#171 M5, task 121)

**Development runs, not a release gate, except the canary proof runs**, which `gate.mjs` ran as it runs K1 and K2
(labelled "acceptance on the pinned release" in their own records). They are the proof ruling 930 asked for, not M5's
counted reruns.

Everything ran on the x64 VM, on private displays (none on `:0`), against the pinned linux-engine 0.4.2 installed in a
run-owned home (`cua install --engine`: sha256 `a1314106…a85a78`, `cua-engine 0.4.2 (9371d2348cf8)`; `logs/setup.log`).
Each run was held under the host lock as `m5-h6` (`logs/host-lock-m5-h6.txt`). The engine was not changed. Chrome was
156.0.8078.73 (installed), and 158.0.8127.36 (extracted current stable) for K2.

## 1. What 0.4.2 does to a late take: the sweeps (`sweeps/`, `bands.md`)

These are drop-signals' freeze cells: the press-150 source, with the run's own browser process stopped from 60 ms after
the drag's send until the cell's end (`freeze-<end>`). The coarse sweep `freeze-042` ran 10 drags a cell from 440 to
700 ms. The fine sweep `freeze-042-fine` ran 646 to 654 ms in 1 ms steps. Both ran at idle and at twice the load (16
stress-ng workers).

- **Chrome was identified on every drag** (580 of 580 across the sweeps and the development runs). With the browser stopped, the hold's pings went unanswered, so
  every hold past B was extended to press + 650.
- **A thaw before the release:** the take came inside the extended hold, and the drop landed. That was 600 to 648 ms at
  idle (bar one late take at 647), and 600 to 630 at twice the load.
- **A thaw after the release:** the browser had already read the button up, so Chrome refused the drag. No take came,
  and the drag answered ok with the hold notice: 654 ms and later at idle, 670 and 700 at twice the load.
- **A late take** came only when the browser restarted within a few ms of the release. In those cells some drags took
  inside the hold, some made a late take and some were refused:
  - idle: at 647 and 649 to 653, 18 late takes in the 90 drags of the fine sweep, plus 4 at 650 in the coarse sweep;
  - twice the load: from 640 to 660, 17 in the 90 drags of the fine sweep (646 to 654) and 6 in the coarse sweep.
  - The `thaw - release` column measures the thaw against the release on the noticed drags: late takes came from thaws
    0 to about 4 ms after the release. On drags that took, the release followed the take, so that column means nothing
    there.

**So under 0.4.2 a Chrome drag lands inside the hold, or Chrome refuses it.** The late-take window is about 3 ms wide.
A freeze ending past the hold, as first planned, gives no take at all. C1 and L4c's 0.4.1 plan (`freeze-250`, 40 drags)
made its late takes only because 0.4.1 released at press + 250. On 0.4.2 that plan fails by construction on "no late take
came".

## 2. C1 and L4c recast (ruling 931)

`t14-late` is now three bands, 40 drags (`drop-signals.mjs` PLANS, judged by `drop-signals-judge.mjs` `LATE_BANDS`):

| band | cells | drags | its outcome, required | minimum | the sweeps' rate |
|---|---|---:|---|---:|---|
| inside | freeze-600 | 10 | landed | 7 | 30/30 at 600–630 idle, 30/30 at twice the load |
| edge | freeze-646, -648, -650, -652 | 5 each | none: the late takes are counted, each judged in full | – | idle 18 in 90 (646–654), twice the load 17 in 90 (646–654) |
| past | freeze-700 | 10 | the hold notice, no drop, nothing sent after it | 7 | 10/10 idle, 10/10 at twice the load (670 and 700 together 40/40) |

- **Every answer is judged.** A plain ok on a drag whose page started it, which did not land and was not taken, is a
  false ok, and it fails. A hold notice on a drop that landed is a false alarm, counted and reported (898.2). A late
  take is held to T14's contract: its notice on the read, the next acting request refused, its Escape.
- **A band short of its minimum fails as unexercised.** It never passes.
- **The minimum, 7 of 10, is below 10 of 10 by enough margin.** A band whose outcome held 30 of 30 or more has under a
  0.2% chance of falling short by chance.
- **The edge cells, 646 to 652,** cover where the late takes came at idle (647, 649–653) and at twice the load (646–654, most at 646–651).

**The development runs** (`dev-runs/C1.development-run`, `dev-runs/L4c.development-run`) are `gate.mjs run C1|L4c
--pinned <home> --dev`, at 4fffcdd3. Both PASS.

| run | inside landed | past: notice, no drop | edge late takes, reported | false ok | false alarms |
|---|---:|---:|---:|---:|---:|
| C1 (idle) | 10/10 | 10/10 | 1, 1 | 0 | 0 |
| L4c (twice the load) | 10/10 | 10/10 | 3, 3 | 0 | 0 |

**Each late take, from the rows,** was taken after the engine's release. The drag had answered ok with the hold notice
(`hold.adaptive.way` noticed). The read after it carried the late notice ("Pending from your last drag, a late drag and
drop: Google-chrome started a drag and drop after your drag into it ended…"). The next acting request was refused with
it, and the engine's Escape went out:

| run | cell | take after the release (watch's clock) | Escape after the release |
|---|---|---:|---:|
| C1 | freeze-650 #2 | 1.1 ms | 1.4 ms |
| L4c | freeze-646 #0 | −2.5 ms (engine: no take by its release) | 7.8 ms |
| L4c | freeze-646 #1 | 0.9 ms | 1.7 ms |
| L4c | freeze-646 #2 | 8.9 ms | 9.5 ms |

A late take is judged by the engine's own record of whether a take came by its release, where the run has it
(`signalsOf`'s `engineTook`). The watch's wall clock and the engine's release stamp can differ by a few ms.

**The knife-edge ride-along** (ruling 931.5) is the development plan `t14-late-edge`: freeze-650 × 40. It is judged by
T14's old late-take contract (at least one late take, each reported), and no gate step runs it.
- idle: **19 late takes in 40**, 19 reported;
- twice the load: **12 in 40**, 12 reported.
- Rows in `dev-runs/t14-late-edge-{idle,load2}`.

## 3. The late-take path covered deterministically (ruling 931.4; `mutation/`)

The engine's live tests force the late take with a source of their own that takes `XdndSelection` after the release:
- `tests/live_device.rs` `a_take_up_to_700_ms_after_a_plain_drag_s_release_is_reported_and_one_later_is_not`: a take
  500 ms after the release, on the guarded and in-front routes, and one after the watch's end;
- `a_late_take_into_a_chromium_window_the_engine_lets_drop_is_cancelled_on_the_drag_s_route_and_reported_by_every_reply`.

Both run in ci-gate's `engine-linux` gate (`.github/ci-kit.yml`: `cargo test --release … --features live`).

`scripts/mutation.sh` ran them on a copy of `native/linux-engine/`; the worktree's copy was never changed. The two
tests were run alone, as the gate runs them (a private Xvfb, its own session bus):

| `dnd.rs` | the 500 ms take test | the Chromium late-take test |
|---|---|---|
| as released (`LATE_TAKE_WATCH` 700 ms) | ok | ok |
| the watch shortened to 400 ms, below the take's 500 | **FAILED**: "Guarded: the read carries the notice", left Null | ok (its take comes sooner) |
| the watch removed (`late_watch_end` answers the release) | **FAILED**, as above | **FAILED**: "in front, shared: the watch's Escape reached the source" |

The copy was restored after each mutation, and the worktree's `dnd.rs` was compared unchanged (`mutation/mutation.log`).

## 4. The hold canary's criterion (ruling 930; `canary/`)

- **On x64, K1 and K2 now pass a draggable cell on a relative test.** At least one press that started a drag (a take,
  or the page's own dragstart) must wait at least 3× the plain control's warm maximum wait in the same run, and at
  least 5 ms.
- **arm64 keeps the engine's absolute 20 ms.**
- **The criterion is a step parameter the gate sets by architecture:** `steps.mjs` `CANARY_CRITERION` sets
  `--hold-canary relative|absolute`, by `process.arch`, on K1 and K2 only. Every other run keeps the absolute default.
- **The busy half, the held count and the identification still apply** under both criteria.
- **Every canary record now carries its waits**, in the verdict row and in a new summary table: the started presses'
  largest and median wait, the plain control's warm largest, and the bar.

`gate.mjs run K2|K1 --pinned <home>` at 4fffcdd3, on a clean checkout. Each run's verdicts PASS, its `canaryCheck` (the
intended Chrome) passed, and its exit was 0:

| run | Chrome | held | started | largest wait | median | plain largest | bar | absolute 20 ms would |
|---|---|---:|---:|---:|---:|---:|---:|---|
| K2 #1 | 158.0.8127.36 | 9 | 9 | 16.3 | 9.7 | 1.2 | 5 | fail |
| K2 #2 | 158 | 9 | 9 | 20.0 | 14.1 | 1.2 | 5 | pass |
| K2 #3 | 158 | 8 | 8 | 44.4 | 14.2 | 1.2 | 5 | pass |
| K2 #4 | 158 | 8 | 8 | 20.4 | 11.0 | 1.2 | 5 | pass |
| K2 #5 | 158 | 9 | 9 | 33.1 | 12.1 | 1.2 | 5 | pass |
| K1 #1 | 156.0.8078.73 | 9 | 9 | 29.3 | 20.5 | 2.3 | 6.9 | pass |

K2 passes 5 of 5. Under the old floor, run 1 would have failed with every drop landing, as task 119's first K2 did. The
draggable waits sit 2–20 times above the bar. The plain control's waits are steady at 1.2 ms on 158.

## 5. The runner comparison (ruling 929.2; `comparison/`)

`scripts/linux-engine-gate/launch-plan.mjs` is new; `gate.mjs` itself is unchanged. It drives `gate.mjs` `runStep`
through the runner's own injected seams (the private display, the spawn, the pinned rule, the checks), so it records
what the runner would launch on the pinned release without launching anything:
- the step's `print` line;
- the script, its arguments and its working directory;
- what the launch environment changes from the caller's.

A `:0` step prints its `print` line only. `scripts/compare.sh` exports each head's tree to the same path, puts the same
`launch-plan.mjs` beside its `gate.mjs`, and prints the plan under one fixed environment (`env -i HOME PATH LANG`), with
the same pinned home and out directory. A suite's fresh log directory prints as `/tmp/cua171-gl-XXXXXX`.

- **Every non-K step, H5 (7d554dea) against H6 (4fffcdd3): byte-identical.** `h5.txt` and `h6.txt` are 1,101 lines
  each, both with sha256 `b34f489f…cf5869`.
  - They hold every step's print line, script, arguments, directory and environment: V1–V5 and Z0 by print line; the
    private, own-display, facade and suite steps by their launch.
  - C1 and L4c launch exactly as before: `--plan t14-late`. Their plan's contents changed in `drop-signals.mjs`, which is
    why they rerun anyway.
- **The K steps** (`k-h5.txt`, `k-h6.txt`) did not exist at H5. At H6 K1 and K2 carry `--engine-sandbox --hold-canary
  relative` on x64, and K3 carries `--engine-sandbox`.

So no non-K step differs in how the runner launches it. Under 929.2, none reruns for the runner.

## Files

- `bands.md`: every run's freeze cells, by `scripts/bands.mjs`.
- `sweeps/`, `dev-runs/` and `canary/`: each run's README, `step.json` (gate runs), session rows and logs, its summary,
  and its rows gzipped (`run/results.jsonl.gz`). The whole-run order-watch record is left out.
- `comparison/`, `mutation/`, `scripts/` and `logs/`.
