# T17 (#250): the fix wave of `drag_handle`'s build

Task 73's build was reviewed (reviewer-medium on 6f216132..df988aa5, verdict incorrect). The design session ruled the
fix on 2026-11-11. This wave builds it on `feat/171-m4` after T16's merge:

- 2ed591f4: the code;
- 0fa3b3c8, 2dd4d995, d70b9e89: how the Electron cursor is judged, revised after three pilots (below).

The sittings ran on d70b9e89's musl build, made the release workflow's way (`../scripts/build-musl.sh`, through
`scripts/prepare.sh`). Every sitting and proof ran on a private display (`../scripts/private.sh`, or `xvfb-run -a`),
never `:0`, each in its own call under the host lock (holder `task73fix`).

## What was built

1. **A lost handle is released after 30 s with no request of its own** (review P1). A cell that throws between
   `start` and `end` loses its handle. Before this fix, every desktop pointer request and every new `start` was then
   refused for good, with button 1 held.
   - Now a held handle that gets no `move_to` or `end` for 30 s (`HANDLE_IDLE`) is released where the pointer is. The
     engine does this between requests (`serve.rs`'s `next_due`), or at the next request when that comes first.
   - What the release did is then pending, the way a drag watch's end is. Every reply carries it: `Pending from your
     last drag, a drag handle released by timeout: your drag handle in <app> got no request for 30 s, so it was
     released where the pointer was, at (x, y); the release may have dropped what it held and changed the desktop`.
   - The next acting request is refused with it, and so is the released handle's own `end`. Neither is run.
   - A refused desktop request does not count as the handle's request, so it does not extend the 30 s.
   - The refusal while a handle is held names the bound: `a drag handle is held; end it before sending desktop
     pointer input (a handle that gets no request for 30 s is released where it is)`.
   - `--drag-handle-idle-ms` sets another bound, for the live tests.
2. **A reset releases the handle at once** (ruling 4b). The trusted worker outlives a kernel. A new kernel's bootstrap
   asks cua's service for `setup` before its first cell's code runs. At that `setup`, the service forgets the handles a
   former kernel started and sends the engine `release_handle`.
   - `release_handle` is a new cua-only release: it is never refused and sends nothing when no handle is held.
   - A held handle is released as its `end` would release it.
3. **The pointer is read at the release** (review P3). It is read again after the release dwell and the hold watch's
   round trip. That reading decides both the pointer-moved answer and the drop window. The only work between it and
   the button-up is the drop window's lookup and an Electron source's cursor read.
4. **A Chrome handle's drop that nothing can confirm is unconfirmed** (review P2). This is a Chrome source's drag and
   drop under way at the release, over a window whose activation request cannot confirm it (none, or not Chrome's),
   where the window manager supports that request. Before, it answered ok; now it is pending unconfirmed at once.
5. **Electron's drop is confirmed by its drag loop's accept cursor at the release** (rulings 4 and 4c). This covers
   handles and plain drags behind the floor.
   - The cursor is read at the release itself, not sampled before it (`drop_cursor.rs`). A thread with its own
     connection keeps every displayed-cursor change from before the press, with the images it fetches. Just before the
     button goes up, the engine stops the thread and asks the server which cursor is shown, with its image and name.
   - The accept is the unnamed cursor shown then whose image is not excluded. Excluded are the image shown when the
     watch began, every unnamed cursor's image up to the take (a page's own cursor among them, as `accept.rs`
     excludes them), and the drag loop's image.
   - The drag loop's image is taken from the first unnamed cursor from 3 ms before the take on.
   - No accept, or a cursor that cannot be told, leaves the drop unconfirmed, never ok.

## How the cursor rule was set: the pilots

Each pilot sat 3–10 drags of each cell, Electron, idle (`sittings/pilot*`).

| commit | what the pilot showed | change |
|---|---|---|
| 2ed591f4 | Rule: the images up to the take are excluded. The drag loop's cursor came 1 ms after the take on the server's clock, so its image was not known and a landed handle drop was unconfirmed. `t14-floor`'s long drop does not fit Electron's window: the plain drag was refused there, and a handle's drop landed on another element of the page (`dropEffect` copy, not the zone) | 0fa3b3c8: a 3 ms slack after the take; Electron's plans use the short drop (`t17-floor`, `t17-handle`) |
| 0fa3b3c8 | 2 of 5 plain drags landed unconfirmed. In one, the loop cursor was never seen; in the other, the accept itself came 3 ms after the take and was excluded | 2dd4d995: the first unnamed cursor after the take stands for the loop's |
| 2dd4d995 | 1 of 10 landed unconfirmed. The loop cursor and the first status both came up to the take, and the rule then excluded the accept, 234 ms later | d70b9e89: the loop's is the first unnamed cursor from 3 ms before the take on |
| d70b9e89 | 10 of 10 drops confirmed, 20 of 20 controls unconfirmed, plain and handle | the bytes sat on |

## The counts (d70b9e89; `tables.md`, made by `scripts/table.mjs` from `sittings/*/run/results.jsonl.gz`)

The drop-signals experiment ran on the run's own Electron page. A drop counts as *landed* when the page's zone counted
it. It counts as *dropped* when the page's last `dragend` had a `dropEffect` other than none, that is, the drop was
performed anywhere.

A **false ok** is an answer of ok with nothing pending on a drag that dropped nowhere. The two controls are:

- *left*: a path that enters the zone 80 px and leaves it before its end, so its accept is withdrawn;
- *inzone-out*: a press on a source inside the zone, whose first status already accepts, then a path out of the zone
  (task 69's control of a stale accept).

| load | kind | drops landed | false ok: drops | false ok: left | false ok: inzone-out | landed, unconfirmed (cold / warm) |
|---|---|---:|---:|---:|---:|---:|
| idle | plain drag (`t17-floor`) | 300 of 300 | 0 | 0 of 30 | 0 of 30 | 0 (0%) |
| idle | handle (`t17-handle`) | 300 of 300 | 0 | 0 of 30 | 0 of 30 | 0 (0%) |
| the gate's window load | plain drag | 300 of 300 | 0 | 0 of 30 | 0 of 30 | 0 (0%) |
| the gate's window load | handle | 300 of 300 | 0 | 0 of 30 | 0 of 30 | 18 (17 / 1), 6.0% |
| twice the load | plain drag | 300 of 300 | 0 | 0 of 30 | 0 of 30 | 5 (0 / 5), 1.7% |
| twice the load | handle | 300 of 300 | 0 | 0 of 30 | 0 of 30 | 10 (6 / 4), 3.3% |

- **0 answered ok without a drop** in 2,160 drags: 1,800 drops and 360 controls, across the three loads.
- Every control drag was answered with the unconfirmed notice, and the next acting request (the harness's
  `preflight`) was refused with it.
- No drop in any cell landed outside the zone, and none errored.
- So the confirmation is adopted, as ruled.
- **Landed but unconfirmed**: 0% at idle; 6.0% (handles) and 0% (plain) at the gate's window load; 3.3% and 1.7% at
  twice the load. Each of these is an honest answer, the notice on a drop that did land.
  - The handles' 6.0% at the gate's window load is above T14's 5% finding threshold.
  - 17 of its 18 were the cold drag of a block, the first drag a fresh engine makes.
  - At the release, Electron's drag loop still showed the no-drop status. Its cursor lagged the drop.
  - #364 tracks a better signal.

**The cursor at the exact release** (ruling 4c; for #364), read by the engine just before the button-up:

| load | landed drops: accept / another cursor / not told | controls, no drop: accept / another / not told |
|---|---|---|
| idle | 600 / 0 / 0 | 0 / 120 / 0 |
| the gate's window load | 582 / 17 / 1 | 0 / 120 / 0 |
| twice the load | 585 / 7 / 8 | 0 / 117 / 3 |

The cursor in the second column was the no-drop image every time. "Not told" means the drag loop's image was unknown:
the thread had fetched no image for a cursor that was shown up to the take. The build's harness-side samples, taken
after each change, had 7 of 110 landed Electron drops without the accept (6–7.5%). Read at the release, it is 0 of 600
at idle, 18 of 600 at the gate's load and 15 of 600 at twice the load.

## The reset, end to end (`reset-before.json`, `reset-after.json`; `scripts/reset-proof.sh`)

The proof drives cua's real Linux service and facade over a real engine, on `xvfb-run`'s display. The steps:

1. In kernel 1, a handle is started and moved on an xterm.
2. A desktop click is refused while the handle is held.
3. Kernel 1 loses the handle, and the facade is imported again: kernel 2's bootstrap, and its `setup`.
4. Then the proof reads whether button 1 is down, and sends a desktop click.

| engine and service | held after the reset | click after the reset |
|---|---|---|
| 1629d9ce (before the fix) | yes | refused, `a drag handle is held; …` |
| d70b9e89 | no (`setup` took 2 ms) | ran |

## Tests

These are in the task-73 report's "Fix wave", with RED and GREEN.

- Live tests on the engine before the fix (`red.sh`, 1629d9ce) and after it:
  - the idle release;
  - the unconfirmed Chrome drop;
  - the pointer moved during Gecko's dwell, through a hook (`CUA_ENGINE_FAULT=handle-dwell-move`). Its mutant, the
    end judged on the reading from before the dwell, fails the test;
  - the reset's release.
- Unit tests of the cursor rule, the confirmation, the sentences and the families.
- The services test of `setup`'s release.
- The deviations declarations.
- The drop-signals handle lane.

## Lock lines (`host-lock.log`, holder `task73fix`)

| call | acquire | release |
|---|---|---|
| pilots on 2ed591f4 | 10:21:32Z, 1.59 | 10:23:39Z, 0.45 |
| pilots on 0fa3b3c8 | 10:29:23Z, 1.51 | 10:31:09Z, 0.48 |
| pilot on 2dd4d995 | 10:37:22Z, 1.21 | 10:38:38Z, 1.11 |
| pilots on d70b9e89 | 10:43:33Z, 1.22 | 10:46:06Z, 0.53 |
| `idle-floor` | 10:46:36Z, 0.37 | 10:58:48Z, 0.72 |
| `idle-handle` | 11:00:06Z, 2.00 (just after the 1629d9ce build) | 11:10:37Z, 0.85 |
| `gate-floor` | 11:10:37Z, 1.02 | 11:23:12Z, 0.65 |
| `gate-handle` | 11:23:13Z, 0.65 | 11:34:08Z, 0.86 |
| reset proof, d70b9e89 | 11:34:08Z, 0.86 | 11:34:09Z, 0.86 |
| `load2-floor` | 11:34:09Z, 0.86 | 11:47:19Z, 17.29 |
| reset proof, 1629d9ce | 11:47:19Z, 17.29 (stress-ng ended; the guard checked) | 11:47:20Z |
| `load2-handle` | 11:47:20Z, 17.29 | 11:58:47Z, 17.40 |

The first reset-proof calls (11:10:37Z and 11:23:13Z) failed at once on the script's pointer-state read. `xinput`
finds no device on xvfb-run's Xvfb, so the script now reads the state through the export's `xprobe buttons-down`. No
proof result came from those calls.

## Scripts (`scripts/`)

| script | what it does |
|---|---|
| `env.sh` | task 73's paths with this wave's `T` |
| `prepare.sh` | the musl build and the harness export |
| `sitting.sh` | one drop-signals sitting, its load by name |
| `table.mjs`, `rows.mjs` | the tallies |
| `reset-proof.sh`, `reset-proof.mjs` | the reset proof |
| `copy-evidence.py` | the copy into this directory, paths labelled |
