# M4, T19 (#353): Gecko's pointer route by the real pointer (task 71)

T19's row (the design session, 2026-11-10, from T15's finding): Firefox takes background pointer input only while the
real pointer is in its window, so cua answered ok for input Gecko ignored. First a declared `:0` sitting under task
50's guards that reconciles with M0.4's `:0` finding ("Firefox ignores clicks while fully covered and takes them
visible", the pointer's place unrecorded), dry-run whole on a private display first; then the build, as far as the
sitting confirms it.

## The instrument

- **`--experiment pointer-route`** (`scripts/linux-engine-diff/pointer-route.mjs`), measured, never judged. Each cell
  is one family, kind, occlusion and pointer place; 10 runs a cell a lane.
  - The pointer: `in` the window's visible top part (x + 0.7 w, y + 110), `under` the cover inside the window's
    geometry (x + 0.7 w, y + 0.85 h), `out` of its geometry (1170, 715, the run's front window).
  - The occlusions: `visible` (raised, nothing over it; in, out), `partial` (a run window over its bottom half; in,
    under, out), `covered` (a run window over the whole screen; under, out).
  - The kinds: a click, a scroll, a move and a text-selection drag. Every request's points lie in the part the
    occlusion leaves visible.
  - Firefox (the subject) through cua and the pinned build; Chrome, Electron and gedit (GTK 3, the design session's
    added control) through cua alone.
  - cua's lane runs with `--ignore-cover` (measurement only): no cover condition refuses or reroutes, so what is counted
    is the application's answer. A drag the engine answers with an error still has its effect read.
- **The pointer.** Before every run it is parked at the cell's point, only where `pointerSafeAt` finds the bare root
  or a live window of the run's, read just before the move; a park point anywhere else stops the sitting unmoved. It is
  not moved when already there (a motion to the pointer's own place still reaches the application, T9). Just before
  every request it is read again (`xdotool getmouselocation`, `xprobe top-at`) with what lies under it (`scene`,
  `cover`, `harness`, `root` or `foreign`) and whether the park held; each run row carries that record as `pointer`.
- **Counts per lane:** taken, answered ok, answered ok with no effect (the false success T19 is for), witness changes,
  parks held.

## The dry run (`dry-run/`), a private display

`scripts/sitting.sh private`: a private Xvfb with Openbox and a stand-in person's xterm (`private-run.mjs`, task 70's),
no whole-run RECORD. Harness export of 7ada8597; candidate the musl build of aff8c032 made the release workflow's way
(`cua-engine 0.3.0 (aff8c0328186)`, sha256 `0c5b82a3bd92f78152fe088017204df28471958804dbdef52fc621d8a6d7ecea`; its
engine sources are 7ada8597's). A development run, not a release gate.

- 1,400 runs in 1 h 38 min; run exit 0; watchdog clean; the witness unchanged on every run; the park held at every
  request.
- **Firefox, cua and the pinned build alike:** with the pointer in the window, every kind 10 of 10, visible or half
  covered. With it under the cover or outside the window, every kind 0 of 10 in every occlusion, each answered ok.
- **Chrome and Electron:** click, scroll and move 10 of 10 in every cell. The selection drag 10 of 10 with the pointer
  in; with it under or out, the press watch answers that the drag may not have started (task 20), and nothing is
  selected.
- **gedit:** 10 of 10 in every cell but one: the move with the window half covered and the pointer under the cover,
  5 of 10, every miss the move off the toolbar button (its hover read as pixels).
- A first smoke run (`--trials 2`, not kept) stopped at Electron: the checkout's Electron binary was not installed; it
  is now. It also showed Chrome's refused drags read no effect, which the sitting now reads (7ada8597).

| run | lock acquire | lock release |
|---|---|---|
| `dry-run/` | 2026-11-10T02:25:26Z, load 1.32 | 2026-11-10T04:03:38Z, status 0, load 0.28 |

The load at the dry run's acquire was my own builds' tail. The sitting itself started at 02:25:46Z at load 0.95, after
sitting.sh's wait for a quiet machine.

The gedit cell's misses, itemized (the design session asked, 2026-11-10): each run's request point (window-relative),
its effect and the pointer record at its request. Every run found the pointer at (630, 595), under the cover:
`xdotool getmouselocation` names window 4194976, and `xprobe top-at` finds the same root child, which holds the run's
front window (29360140), inside gedit's geometry.

| run | point | pixels changed | took |
|---:|---|---:|---|
| 0, 2, 4, 6, 8 | (788, 26), onto the toolbar button | 297 | yes |
| 1, 3, 5, 7, 9 | (450, 210), off it to the window's middle | 0 | no |

With the pointer in the window or outside it, and fully covered, both moves took 10 of 10. Only the move off the
button misses, and only with the pointer under the half cover. It reproduced on `:0` (below).

## The `:0` sitting (`sitting-0/`, `sitting-0-rerun/`)

The design session's "GO :0" came at 04:45Z on 2026-11-10, after it cleared `:0` of the related sessions; the window ran
04:45Z to 06:45Z. Each step ran as a declared live run under task 50's guards unchanged (`scripts/run71.sh`: run50.sh's
body, the guards by path from `../person-display-live/scripts/`; the hold file absent, no stress-ng), with the same
harness export, candidate and arguments as the dry run, no whole-run RECORD, under the host lock.

- **`sitting-0/`**, 04:46:31Z to 05:47:45Z: Firefox's and Chrome's 56 cells, 840 runs. Every cell is identical to
  the dry run, the witness was unchanged on every run, the park held at every request, and no park point lay over
  another's window. The design session accepted these 840 runs as T19's evidence. wrap50.py then stopped the step at
  Electron's first window (below).
- **`sitting-0-rerun/`** (`--family electron,gedit`, the guards unchanged on the design session's word), 05:53:04Z to
  06:10:39Z: Electron's 28 cells, 280 runs, every cell identical to the dry run, witness and parks as above. The guard
  stopped it at gedit's first window on the same pattern, and as ruled the sitting stopped there.
- **`sitting-0-gedit/`** (`--family gedit`, `WRAP=wrap71.py`: the narrow rule below, approved by the design session for
  this step; its window 06:50Z to 07:20Z), 06:52:36Z to 07:12:05Z, status 0: gedit's 28 cells, 280 runs, every cell
  identical to the dry run, witness and parks as above. The rule counted no peer (no `counted.jsonl` was written):
  the race did not recur, so the step's guard behaved as wrap50.py.
- **The person's side, every step:**
  - The owner's Chrome kept its pid (2546101) and its start time.
  - owner-watch saw no change in 361, 104 and 115 checks.
  - The only difference between before and after, in the first two steps, is the mtime of `~/.config/google-chrome`,
    which the owner's Chrome writes on its own (task 50); the gedit step's showed none.
  - Each step's TMPDIR was empty afterwards, and nothing of the run was left.
  - The real pointer started at (142, 130), over the owner's Chrome. The first park moved it off there onto a window of
    the run's. After each step it was put back, and it read (142, 130) again.
- **The stops** were wrap50.py's `outside-peer-connection` (`flags.jsonl`). A run process (`electron`, then `gedit`)
  connected to `<tmproot>/cua171-run-*/session/bus/dbus-*`, the step's own session bus. ss showed no pid for the server
  end (`peer_pids: []`; peer inodes 128560064 and 129020042). Most likely the run's dbus-daemon had not yet accepted the
  connection when the socket table was read. The rule proposed to the design session for a later window
  (`scripts/wrap71.py`, not run) counts such a peer only when its path is inside the step's TMPDIR and is the unix path
  in the connecting process's own `DBUS_SESSION_BUS_ADDRESS`.

| run | lock acquire | lock release |
|---|---|---|
| `sitting-0/` | 2026-11-10T04:46:30Z, load 0.37 | 2026-11-10T05:48:05Z, status 1 (the guard's stop), load 1.25 |
| `sitting-0-rerun/` | 2026-11-10T05:53:03Z, load 0.45 | 2026-11-10T06:11:05Z, status 1 (the guard's stop), load 0.54 |
| `sitting-0-gedit/` | 2026-11-10T06:52:34Z, load 0.26 | 2026-11-10T07:12:06Z, status 0, load 0.56 |

The load at `sitting-0/`'s release is the sitting's own. It rose with the run from 0.37 at the start, and was below
0.6 again five minutes later.

## What the sittings show

- **Gecko decides by the real pointer's chain, on `:0` as on the private display.** Firefox took every pointer kind
  (click, scroll, move, text selection) 10 of 10 while the real pointer was in its window, through cua and the pinned
  build alike. That held fully visible, and half covered with the pointer in the visible part.
  - With the pointer under the cover, still inside the window's geometry, Firefox took 0 of 10 in every occlusion.
  - With the pointer outside the window it also took 0 of 10, the window fully visible included.
  - Every one of those requests answered ok.
  - So a pointer under a cover counts as out. What decides is the window the server finds under the pointer (the child
    chain of X `QueryPointer`), not the window's geometry.
- **M0.4 reconciled.** M0.4's ":0 Firefox ignores clicks while fully covered and takes them visible" holds only as a
  consequence of the pointer: a fully covered window can never have the pointer in it, and a visible one takes clicks
  only while the pointer is in it. M0.4's partial-cover flip (taken at 55% visible or more, ignored at 52% or less, at
  1280×781) fits a pointer near the screen's middle, which a cover over the window's bottom reaches at about half its
  height.
- **The controls.**
  - Chromium's click, scroll and move do not depend on the pointer: Chrome and Electron took them 10 of 10 in every
    cell, on `:0` and on the private display.
  - Chromium's selection drag does depend on it, as task 20 found. With the pointer under a cover or outside, the
    press watch answers that the drag may not have started, and nothing is selected, so cua already answers it
    honestly.
  - gedit (GTK 3) does not share Gecko's dependence: its clicks, scrolls, moves and selections take 10 of 10 wherever
    the pointer is, on `:0` and on the private display. The one exception reproduced on `:0`: with the window half
    covered and the pointer under the cover, the move off the toolbar button leaves its hover (5 of 10, the odd runs,
    0 pixels changed; the pointer at (630, 595) on root child 6001260, the front window 35651598, at every request).
    The design session takes it as a ticket of its own.

## The build (258f52b0, ddee5fd5) and its proof (`build-proof/`, private displays)

The engine:

- Gecko's clicks, scrolls, moves and drags are listed `unless_pointer_within` (families.rs).
  - They take the background route only while QueryPointer finds the real pointer in the window (the server's child
    chain from the window's parent), so a pointer under a window over it counts as outside.
  - Otherwise shared mode refuses them with the Device mode sentence and sends nothing, and dedicated mode takes the
    foreground route.
  - The window rule they replace (`unless_unobscured`) is gone: no family keeps it.
- Every such request on the background route is watched (`engine/within.rs`, on the press watch's connection).
  - The watch begins, then the pointer is read a second time; a pointer already gone routes the request afresh.
    (Fix wave: judged outside on that read, with no third read; see the last section.)
  - The watch is read a round trip after the request's events went out, and the pointer is read again.
  - A request the pointer left during (a `LeaveNotify` of the window to no inferior), or ended outside, answers
    `<app> may not have taken the <request>: the desktop pointer left its window during the <request>, …`, never
    success.
- `--ignore-pointer` (measurement only) leaves the pointer unjudged, for the manifest's `cua:any-pointer` lane.

Each step below ran under the host lock, at most about 45 minutes (manifest-b ran 53), on its own private display.
The harness was 55e66b78's export (manifest-a's first run used ddee5fd5's). The candidate is the musl build of
ddee5fd5 made the release workflow's way: `cua-engine 0.3.0 (ddee5fd5ae5a)`. 55e66b78 changes only the harness.

- **The manifest** (`--experiment predicates`, T19's), 28 + 4 cases, every one PASS by the judge before the fix wave.
  cua's failed clicks, scrolls and moves had their effect unread here, so those zeros are not observations; the fix
  wave's proof below replaces them:
  - Allowed with the pointer in, visible or half covered: cua took 30 of 30 of every kind (the pinned build 30 of 30).
  - Refused with the pointer under the cover or outside, in every occlusion: cua refused 10 of 10. The pinned build
    took 0 of 10, all answered ok. cua's own events with the pointer unjudged (`cua:any-pointer`) took 0 of 10, so
    the refusal keeps nothing Gecko would take.
  - Leave (the pointer moved out while the request runs), 20 runs each. None answered ok with no effect; the pinned
    build answered ok every time and took 0 of 20.

    | kind | took (ok) | answered that the pointer left | refused before sending |
    |---|---:|---:|---:|
    | click | 0 | 20 | 0 |
    | scroll | 0 | 20 | 0 |
    | move | 8 | 2 | 10 |
    | select | 0 | 20 | 0 |

  - Every other run's park held and the witness stayed unchanged; the leave runs' witness allowed only the harness's
    own pointer move.
- **Superseded:** `manifest-a/`'s first run's leave cases measured nothing. scenes.mjs's visible arrangement only raises
  the scene window, and after its covered cases the front window stayed over the whole screen, so the park missed (80
  of 80; the requests were refused honestly). 55e66b78 puts the front window back first, and `leave-a/` is the click
  and scroll leave cases rerun on it. `manifest-a/` itself is rerun because its lock's acquire load (1.48) was more
  than 1.0 above the idle; see `manifest-a-rerun/`.
- **The device cases** (`device/`, device-firefox's 16 and device-chrome's 3, three blocks, cua alone): every case PASS
  with the witness and the audit clean.
  - Refused in shared mode with the pointer out or under the cover: click, right click, scroll, move and drag.
  - The background route with the pointer in, half covered: click, scroll, move and drag, with their effects.
  - The foreground route in dedicated mode.
  - The element click on a covered window.
- **The controls** (`controls/`, the sitting's Chrome and Electron cells on the build): every cell identical to the
  dry run and to the `:0` sitting.
- **The engine's tests:**
  - Fails on 258f52b0: `src/engine/within_faults.rs` moves the real pointer out (and once back in) at one exact step,
    after a click's, scroll's and move's events went out. Built on 258f52b0 with only its hook's variant
    (`scripts/red-on.sh`), the hook never runs there, since nothing reads the pointer after sending.
  - `tests/live_device.rs` covers:
    - the pointer in, under, out, and in with a cover;
    - keys still going;
    - `--ignore-pointer`;
    - the dedicated foreground route;
    - a drag the pointer leaves, staying out or coming back.

| run | lock acquire | lock release |
|---|---|---|
| `build-proof/manifest-a/` (first run) | 2026-11-10T08:22:48Z, load 1.48 | 2026-11-10T09:01:12Z, status 0, load 0.46 |
| `build-proof/leave-a/` | 2026-11-10T09:30:00Z, load 0.35 | 2026-11-10T09:37:06Z, status 0, load 0.29 |
| `build-proof/manifest-b/` | 2026-11-10T09:49:15Z, load 0.58 | 2026-11-10T10:42:42Z, status 0, load 0.14 |
| `build-proof/device/` | 2026-11-10T10:51:12Z, load 0.62 | 2026-11-10T11:07:11Z, status 0, load 0.46 |
| `build-proof/controls/` | 2026-11-10T11:19:43Z, load 0.95 | 2026-11-10T12:03:33Z, status 0, load 0.69 |
| `build-proof/manifest-a-rerun/` | 2026-11-10T12:11:07Z, load 0.17 | 2026-11-10T13:02:26Z, status 0, load 0.40 |

`manifest-a-rerun/` (55e66b78's harness, the click and scroll cases with their leave cases) matched the first run in
every non-leave case. Its leave cases matched `leave-a/`: 20 of 20 answered that the pointer left. Every one of its 620
runs found the park held and the witness unchanged.

The first proof, on 258f52b0, was stopped at 08:03:56Z, 15 minutes into its manifest. The design session had asked for
the watch on every pointer kind, which changes every Gecko request's path, so its bytes were no longer the final ones.
It is not kept.

## The manifest on `:0` (`manifest-0/a/`, `manifest-0/b/`), the build's proof on the person's display

On the design session's "GO :0" (holds 13:40Z to 15:40Z, no conflict), T19's manifest (`--experiment predicates`) ran on
`:0` on the final bytes: the ddee5fd5 musl build (`cua-engine 0.3.0 (ddee5fd5ae5a)`, sha256 `c51164ac…46b3`) and
55e66b78's harness. It ran in two halves under the host lock (`scripts/manifest0.sh a|b`: click and scroll, then move and
selection), each through `scripts/run71.sh` under task 50's guards, with `WRAP` naming `scripts/wrap71.py` (the narrow
session-bus rule). The hold file was absent and no stress-ng ran. No whole-run RECORD was taken: the harness refuses it
on a display without the private mark.

- **Every case PASS, 32 of 32** ("Every case holds" in both halves' `run/summary.md`, by the judge before the fix wave;
  which of these counts were observed is in the fix wave's section below):
  - Allowed with the pointer in, visible or half covered: cua took 30 of 30 of every kind, and so did the pinned build.
  - Refused with the pointer under the cover or outside, in every occlusion: cua refused 10 of 10. The pinned build
    took 0 of 10, all answered ok, and `cua:any-pointer` took 0 of 10.
  - Leave, 20 runs each. None answered ok with no effect, and the pinned build took 0 of 20:

    | kind | took (ok) | answered that the pointer left | refused before sending |
    |---|---:|---:|---:|
    | click | 0 | 20 | 0 |
    | scroll | 0 | 20 | 0 |
    | move | 6 | 7 | 7 |
    | select | 0 | 20 | 0 |

  - Every case matches the private proof. The leave move's split differs from the private one (8, 2 and 10). That
    split is the race between the request and the mover, which starts at 0 s for a move. The case is judged on
    honesty, and that held.
- **The guards, both halves:**
  - The pointer was restored to its start (142, 130) and read back there.
  - The owner side showed no difference beyond the owner Chrome's own directory mtime (`owner-diff.txt`).
  - The step's TMPDIR was left empty. wrap71 recorded 0 flags, nothing counted, 0 decoy connections and no leftovers.
  - The foreign active window was active at the start and at the end and was never acted on. Every window change in
    the harness's trace was its own.
  - The three `/tmp/cua171-run-*` directories the check lists date from Nov 8 and 9 and are not this run's.

| run | lock acquire | lock release |
|---|---|---|
| `manifest-0/a/` | 2026-11-10T13:47:23Z, load 0.12 | 2026-11-10T14:38:57Z, status 0, load 0.98 |
| `manifest-0/b/` | 2026-11-10T14:39:18Z, load 0.72 | 2026-11-10T15:32:53Z, status 0, load 1.12 |

The release loads are the run's own load. Neither is more than 1.0 above the idle.

## The fix wave (review of be009c24..e47fc1e3; `fix-wave/`, private displays)

The review found three gaps, each a way to let the false success this task exists to prevent through.

1. **A reroute escaped the watch** (ca126e80). Suppose the route's read found the pointer in, but the watch's read
   (the second) found it out. `watch_within` then routed afresh, which meant a third read. A pointer back by that read
   took the background route unwatched, so a leave during the request answered success. Now the second read's
   "outside" is the judgement, with no third read (`route_judged`): refused in shared mode, the foreground route in
   dedicated mode, nothing sent on the background route. This follows the design session's ruling: refuse, no restart
   loop.
   - `within_faults.rs` hooks every pointer read (`Identity::PointerRead`). The pointer is in at the route's read, out
     at the watch's, back in at any later read, and out again after sending.
   - On e47fc1e3, with only the read hook added (`scripts/red-read-on.sh`), it failed: `click: answered success: Null`.
   - On the fix, click, scroll and move are each refused, and no press reaches the window.
2. **The effects of failed clicks, scrolls and moves were never read** (77935e73). kinds.mjs's series read the effect
   only of an ok answer, and wrote `took: false` otherwise. It now takes `readFailed`, as the drag's series does. The
   manifest and the sitting read every outcome, and `took` is null when the effect could not be read.
3. **Leave runs whose park missed were accepted** (77935e73). The judge now counts a run only when its park held at
   the request and its effect was read. The rest are left out and counted (`park_missed`, `unread`), and a case short
   of its valid runs fails. A refusal that took effect fails every refused and leave case.
   - Judged again (`scripts/rejudge.mjs`), the first `build-proof/manifest-a/` run's leave cells now fail: 0 valid of
     20, the park missed on 20 (`build-proof/manifest-a/rejudged.txt`).

**The proof on the fixed build.** The engine is the musl build of 77935e73, `cua-engine 0.3.0 (77935e73bc5d)`, sha256
`ef033ea5…00b3`. The harness is c184a3d4's export. The manifest ran one kind per locked step, since reading every
outcome no longer fits half of it in 45 minutes; the device cases ran after it. Every case PASS. Judged again from
the rows (`fix-wave/rejudged.txt`), every lane's runs found the park held and the effect read: 0 left out.

- Allowed, pointer in, visible or half covered: cua took 30 of 30 of every kind, and so did the pinned build.
- Refused, pointer under the cover or outside, in every occlusion and every kind: cua refused 10 of 10, and **0 of 10
  took effect, observed**. The pinned build answered ok 10 of 10 with 0 taking effect. `cua:any-pointer` took 0 of 10.
- Leave, 20 runs each, every effect observed. The pinned build answered ok 20 of 20 with 0 taking effect:

  | kind | ok and took | answered that the pointer left (of which took) | refused before sending (of which took) | ok with no effect |
  |---|---:|---:|---:|---:|
  | click | 0 | 20 (19) | 0 (0) | 0 |
  | scroll | 0 | 20 (20) | 0 (0) | 0 |
  | move | 3 | 5 (2) | 12 (0) | 0 |
  | select | 0 | 20 (0) | 0 (0) | 0 |

  The "may not have taken" answer is honest, but for clicks and scrolls at these timings it is mostly a false alarm.
  The mover lands within the watch's window but after Gecko took the events (19 of 20, 20 of 20). The selection drag,
  longer than the mover's 50 ms, is lost every time.
- The device cases (`fix-wave/device/`, device-firefox's 16 and device-chrome's 3, three blocks): every verdict PASS,
  the witness and the audit clean. A refusal's case reads the window after a quiet wait and requires it unchanged.

| run | lock acquire | lock release |
|---|---|---|
| `fix-wave/manifest-click/` | 2026-11-10T17:12:36Z, load 0.18 | 2026-11-10T17:40:49Z, status 0, load 0.47 |
| `fix-wave/manifest-scroll/` | 2026-11-10T17:41:22Z, load 0.48 | 2026-11-10T18:07:53Z, status 0, load 0.59 |
| `fix-wave/manifest-move/` | 2026-11-10T18:07:55Z, load 0.62 | 2026-11-10T18:34:17Z, status 0, load 1.12 |
| `fix-wave/manifest-select/` | 2026-11-10T18:37:07Z, load 1.98 (run start 18:38:07Z, 0.93) | 2026-11-10T19:07:06Z, status 0, load 0.29 |
| `fix-wave/device/` | 2026-11-10T19:12:05Z, load 0.70 | 2026-11-10T19:28:05Z, status 0, load 0.33 |
| `fix-wave/manifest-select-rerun/` | 2026-11-10T20:42:07Z, load 0.48 | 2026-11-10T21:11:03Z, status 0, load 0.73 |

`manifest-select/`'s lock was acquired at a load of 1.98 (another executor had just released it), more than 1.0 above
the idle, though the run itself started at 0.93. So it was rerun (`manifest-select-rerun/`), and the rerun matches it
in every case and count: 8 of 8 PASS, no park missed, no effect unread (`manifest-select-rerun/rejudged.txt`).

**What the `:0` manifest observed and what it did not** (`manifest-0/rejudged.txt`, its rows judged again). That run
was before the fix wave. The design session ruled that it is not rerun: a refusal's "nothing sent" is engine-side, and
the audit shows it.

- Observed: every allowed case's effect, for cua and pinned alike, 30 of 30 of every kind. The pinned lane's and
  `cua:any-pointer`'s effects on every refused case: 0 of 10, observed. Every leave answer that was ok: the effect was
  read, so "0 answered ok with no effect" holds. The selection drag's refused and leave effects, since the drag's
  series read every outcome then too: refused 10 of 10 with 0 taking effect, and left 20 of 20 with 0 taking effect.
- **Not read:** cua's refused and leave effects for click, scroll and move. These are the 150 refused runs, the 40
  "left" answers of click and scroll, and the move leave's 7 "left" and 7 refused runs. On `:0` their effect is not
  read, never zero.
- Every one of its runs found the park held.
