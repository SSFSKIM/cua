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
