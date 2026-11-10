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
