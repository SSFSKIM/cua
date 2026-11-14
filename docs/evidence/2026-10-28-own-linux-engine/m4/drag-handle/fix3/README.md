# T17 (#250): the third fix wave of `drag_handle`'s build

The second fix wave (0a83de46..1df5d015) was re-reviewed (reviewer-medium on 2d76095c..1df5d015, verdict incorrect).
Each of the review's three findings was a path to an ok answer without a drop. This wave fixes all three on
`feat/171-m4`, each test-first:

- 78605c7d: P1, a late take read before the watchdog's notice.
- a823346e: the live cells that reproduce P2 and P3 (`slow`, `moved`), with the hung drop target (`xprobe xdnd-sink`)
  and the live build's hook in `drag`.
- ba1f6bc4: P3, the destination read under the real pointer at the release.
- 83dd7e5b: P2, the accept held to the window the drag last came into.

Everything the second wave ruled and fixed stands: the accept identified by its own image, the XdndAware condition, the
cursor watch chosen from the source, the idle bound held during blocking requests.

Every sitting ran on a private display (`../scripts/private.sh`), never `:0`, each in a locked call of its own under
the host lock, holder `task73fix3`. The counted sittings ran on 83dd7e5b's musl release build (`scripts/prepare.sh`)
with the harness of 83dd7e5b. The `moved` cell needs the live build's hook, so it ran on live builds
(`scripts/build-musl-live.sh`, the release workflow's build with `--features live`).

## What was fixed

1. **A take read after the watchdog's release counts as late, whenever its notice comes** (P1, `dnd.rs`
   `watch_loop`).
   - The idle watchdog stamps its release, sends the button-up, and tells the after-release watch only after the
     round trip. The watch counted any take it had read by the time the notice came as before the release. So a late
     take read in between suppressed its Escape: the reviewer's order gave `Unconfirmed` with no Escape.
   - Now takes are ordered against the release's own stamp. A take read before it was handled before the button-up was
     sent: a drag and drop under way. A take read at or after it may be a late start: cancelled. Doubt counts as late.
2. **The destination is read under the real pointer at the release** (P3, `engine/pointer.rs`).
   - On the desktop and foreground routes a plain drag's release goes where the real pointer is, but the XdndAware
     check read the window under the path's requested end.
   - Now, on a route whose input is XTEST's, the pointer is read with the cursor just before the release, and the
     managed top-level under it decides. The background route's input is synthetic and leaves the real pointer where it
     is, so its release stays the path's end. A handle already read the pointer at its release.
3. **An accept confirms only when put up after the drag came into the window under the release** (P2,
   `drop_cursor.rs`, `x11.rs`, `engine/handle.rs`).
   - XdndAware under the release does not prove the accept on display is that window's. Chromium resets its negotiated
     operation when its target changes, but leaves the cursor as the last status set it, and changes it only on the
     new target's own status (`XDragDropClient::ProcessMouseMove`, `OnXdndStatus`, which ignores any window's status but
     the current target's). Released over a target that has not answered yet, it drops nothing
     (`HandleMouseReleased`: still waiting on the first status since the enter) and still shows the accept of the
     window before.
   - The drop's cursor watch now also reads the real pointer's motions: XInput 2 raw motion, which a grab does not
     hide, on the same connection as the cursor's changes, so the server orders the two. The XTEST pointer's raw values
     are the places its motions asked for; a live unit test proves both the places and the order. Another device's
     motion is relative, so it has no place, and counts as outside.
   - The accept counts only when the change that put it up comes after the motion that last brought the pointer into
     the managed top-level under the release (`set_since_entry`). The top-levels are one stacking snapshot read after
     the release (`x11::TopLevels`), the drag image passed over. A cursor the watch did not see put up never counts. A
     drag that stays in one window from the watch's start is judged as before.
   - Plain drags and handles share the judgment (`Engine::accept_held_to_release`). `--stats` records `release_over`:
     the point, the window, XdndAware, `since_entry`, and for a plain drag whether the point is the pointer's or the
     path's end. The drop cursor record carries the watch's start and its last motions.

## The cells (`scripts/` and the harness's `drop-signals.mjs`)

- **`slow`** (P2): the plain source into the zone at page (640, 128), as the `left` cell's path (the accept), then out
  of the window to the middle of
  `xprobe xdnd-sink`. The sink is a managed window of the run's own, at (1100, 40), 160 × 150, marked `XdndAware`
  (version 5), which reads and answers nothing, as a hung application. It is opened only for plans with the cell.
- **`moved`** (P3): the short drop, its path ending in the zone. The live build's hook
  (`CUA_ENGINE_FAULT=drag-release-move`, `CUA_ENGINE_FAULT_AT`, which the harness puts in that block's engine
  environment) has a second client move the real pointer onto the bare root beside the window just before the
  release's reads. The release goes there.
- Both are off-window cells: the drag is never counted as dropped, and its release point is verified after the drag
  (`end_park`): the sink under the end, or the pointer at the hook's point on the bare root.

## RED and GREEN (`sittings/`, `tests/`)

| sitting | engine | cell | drags | answered ok, nothing pending (false ok) | unconfirmed |
|---|---|---|---:|---:|---:|
| `red-slow` | 69d095f8 (the second wave's) | slow, desktop drag | 30 | **30** | 0 |
| `red-slow` | 69d095f8 | slow, handle | 30 | **30** | 0 |
| `red-moved` | a823346e, live (the hook, no fix) | moved, desktop drag | 30 | **30** | 0 |
| `green-moved-p3` | ba1f6bc4, live (P3 alone) | moved, desktop drag | 30 | 0 | 30 |
| `green-slow` | 83dd7e5b | slow, desktop drag | 30 | 0 | 30 |
| `green-slow` | 83dd7e5b | slow, handle | 30 | 0 | 30 |
| `green-moved` | 83dd7e5b, live | moved, desktop drag | 30 | 0 | 30 |

Every RED drag showed the zone's accept at the release, over an XdndAware window for `slow` and the bare root for
`moved`, and none of them landed. After the fix, every `slow` drag's record reads `since_entry: false` over the sink.

The unit tests (`tests/`):
- P1: `a_take_read_after_the_release_but_before_its_notice_is_late_not_a_drop_under_way`, the reviewer's order exactly
  (release stamped, take read, notice processed). It failed on the unchanged `watch_loop` with `Unconfirmed`
  (`red-p1.log`) and passes now (`green-p1.log`, 30 of 30 `dnd` tests).
- P2: four tests of `set_since_entry` and the extended `over_drop_target` test. A mutant with the rule before this wave
  (any change the watch saw counts) fails the three that say never (`red-p2-mutant.log`); they pass now
  (`green-p2-unit.log`, 392 unit tests). The live unit test reads the XTEST pointer's raw motions at their asked places,
  in the server's order with a cursor change (`green-p2-live-unit.log`).
- `x11::TopLevels::at`: the topmost rectangle, the exclusive edges.

## The counts (`tables.md`, from `scripts/table.mjs`)

Electron, on the drop-signals page, plan `t17-fix3`, at three loads: idle, the gate's window load (`--ballast gate`)
and twice the load (`--load-factor 2`). Each cell ran as plain drags (`cua`, or `cua:desktop` for the off-window
cells) and as handles: 100 short drops; the accepted-then-left and press-inside controls; and the releases off the
window to the bare root, the xterm, the other browser window and the sink, 30 each. A **false ok** is an answer of ok
with nothing pending on a drag that dropped nowhere.

| load | drags | counted | landed drops | false ok | landed but unconfirmed |
|---|---:|---:|---:|---:|---|
| idle | 560 | 560 | 200 of 200 | **0** | 0 of 200 |
| the gate's window load | 560 | 499 | 200 of 200 | **0** | handles 6 of 100 (all cold), plain 0 |
| twice the load | 560 | 560 | 200 of 200 | **0** | handles 6 of 100 (all cold), plain 0 |

- **0 answered ok without a drop, in 1,619 counted drags.** Every control and every off-window drag answered with the
  unconfirmed notice, the `slow` cell 180 of 180 among them, plain drags and handles.
- **Not counted at the gate's window load: 61 ends** whose window was not under the release (`end_park`), as in the
  second wave: the 60 `root` ends lay over a gate ballast window, and one `other` end over another window. All 61
  answered unconfirmed, none ok.
- **The new rule cost no landed drop.** Every landed drop whose cursor showed the accept read `since_entry: true` (588
  of 588). The 12 landed but unconfirmed were each a block's cold first handle drag, whose cursor still showed no-drop
  at the release: the cursor's lag that #364 tracks, not this wave's rule. That is 6% at the gate's window load and at
  twice the load, against the second wave's 4% and 5%, above T14's 5% finding threshold, which the design session ruled
  a finding for #364, not a bar (2026-11-11).

## Sittings (`sittings/`)

| sitting | engine | what |
|---|---|---|
| `pilot-slow`, `pilot-moved` | 69d095f8; a823346e live | the two new cells, 3 a lane: the false ok reproduced |
| `red-slow`, `red-moved` | 69d095f8; a823346e live | RED, 30 a lane |
| `green-moved-p3` | ba1f6bc4 live | P3 alone, GREEN |
| `pilot-fix3` | 83dd7e5b | the counted plan, 2 a cell |
| `green-slow`, `green-moved` | 83dd7e5b; 83dd7e5b live | GREEN |
| `idle3`, `gate3`, `load3` | 83dd7e5b | the counted sittings |

`step1.out`, `step2.out`, `step3.out` and `counted.out` are the locked calls' own output, the builds' paths and each
sitting's start, end, load average and status.

## Scripts (`scripts/`)

| script | what it does |
|---|---|
| `env.sh` | the wave's paths, `T` its work directory |
| `build-musl-live.sh` | the release workflow's musl build with `--features live` (the `moved` cell's hook) |
| `prepare.sh`, `step-prepare.sh` | a commit's build (release or live) and harness export, then sittings on them |
| `sitting.sh`, `batch.sh`, `counted.sh` | one sitting, its load by name; a list of them; the three counted ones |
| `table.mjs`, `rows.mjs`, `tables.sh` | the tallies (`table.mjs` counts `slow` and `moved` as off the window) |
| `copy-evidence.py` | the copy into this directory, paths labelled |
