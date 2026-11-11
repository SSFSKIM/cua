# T17 (#250): the second fix wave of `drag_handle`'s build

The fix wave (2ed591f4..2d76095c) was re-reviewed (reviewer-medium on 6e55c836..2d76095c, verdict incorrect). The
review had three findings, and the design session ruled on them on 2026-11-11. This wave fixes all three on
`feat/171-m4`. It also fixes a false success its own pilot found, which the design session ruled on the same day.

- 0a83de46: the three findings.
- 74aa0771, ed0f9e9b, 1945b9d2: the drop-signals cells and their pilot fixes.
- 69d095f8: the XdndAware condition.

Every sitting and proof ran on a private display (`../scripts/private.sh`), never `:0`. Each ran in its own call under
the host lock, holder `task73fix2`. The counted sittings ran on 69d095f8's musl build (`scripts/prepare.sh`), with the
harness of 1945b9d2. The engine is unchanged since 69d095f8.

## What was fixed

1. **The cursor judge no longer confirms a failed drop** (review P1). The design session ruled to replace the
   difference judge, not patch it.
   - The fix wave's rule counted the cursor at the release as the accept when its image differed from the images it
     excluded. Those were the initial image, the images shown up to the take, and the drag loop's, which it took to be
     the first unnamed cursor around the take.
   - With no loop cursor seen and a first status that already accepted, the accept became the excluded "loop" image. A
     path that then left showed the no-drop image, which differed, so the drop read as confirmed.
   - Now the accept is identified by its own image (`drag_cursors.rs`). Chromium draws its drag cursors from the
     Xcursor theme, pixels and hotspot unchanged (`ui/base/x/x11_cursor_loader.cc`).
     - The status cursors are `dnd-none`, `dnd-move`, `dnd-copy` and `dnd-link`, each falling back to `hand2` and then
       `left_ptr` (`DesktopDragDropClientOzoneLinux::OnDragOperationChanged`, `CursorNamesFromType`).
     - The drag loop starts on `kGrabbing` (`closedhand`, `grabbing`, `hand2`).
   - The engine reads every installed theme once, under the Xcursor search path, following each theme's `Inherits`. An
     image is an accept only when both hold:
     - it is a `dnd-move`, `dnd-copy` or `dnd-link` image in some theme;
     - it is no theme's `dnd-none`, `closedhand`, `grabbing`, `hand2` or `left_ptr` image.
   - The image shown at the release is judged against that set alone. The drag's earlier cursors decide nothing. A
     named cursor never counts, and neither does the image the watch began on. If no installed theme tells an accept
     apart, the drop is unconfirmed.
2. **A plain drag picks its cursor watch from its source** (review P2).
   - The watch starts when the source is Electron's, wherever the path ends.
   - The handover decides as a handle's does (`handle::confirming`). A Chrome source's drop over a window that is not
     Chrome's is now unconfirmed too, where the window manager supports the activation request.
3. **The idle bound holds while another request blocks the engine** (review P3).
   - Every request but the handle's own (`drag_handle`, `release_handle`) arms a watchdog thread
     (`engine/idle_watchdog.rs`). At the bound it releases button 1 through XTEST, on its own connection, where the
     pointer is. The release is recorded in the exit ledger.
   - The watchdog tells a Chromium handle's after-release watch at once, so a late take is still cancelled.
   - When the request is done, the engine collects the release and leaves the timeout pending through T14's path. The
     blocked request's own reply carries the notice, and the next acting request is refused once.
4. **An Electron accept confirms only over a window that takes drag and drop** (the design session's ruling,
   2026-11-11, on this wave's pilot).
   - When a path leaves for a window that is not XdndAware (the bare root, an xterm), Chromium sends `XdndLeave` but
     resets neither its negotiated operation nor its status cursor. It ends the drag with the accept, and the page's
     `dragend` reports `copy`, though nothing received the drop.
   - Now the cursor confirms only when the managed top-level under the release, past the drag image, carries
     `XdndAware` (`x11::xdnd_aware`, `drop_cursor::over_drop_target`). Otherwise the drop is unconfirmed. The check
     applies to handles and plain drags, is read after the release, and can only turn a confirmation into unconfirmed.

**The shipped false success this removes:** desktop drags from Electron released over a window that takes no drag
and drop answered ok on the engine before this wave (d70b9e89, the fix wave's engine). That was 30 of 30 to the bare
root and 30 of 30 to the xterm (`tables-before.md`, `red-d70b9e89`). On this wave's first engine (74aa0771, before the
XdndAware condition), the root still answered ok 30 of 30, on a stale accept.

## The cursor theme this depends on

The VM's `/usr/share/icons/default/index.theme` inherits `breeze_cursors`. Electron names no theme of its own on these
displays (there is no XSETTINGS daemon), so Chromium reads `default`, which is breeze_cursors.

breeze_cursors draws:
- `dnd-copy`: fingerprint `2dc5cc4f0690ad4a`, the accept every landed copy drop showed;
- `dnd-move`: the same image as its `dnd-none` and grabbing hand (`95690fee06c19ade`);
- no `dnd-link`, so a link falls back to `hand2`.

So **Electron's confirmation depends on the cursor theme.** Under breeze_cursors:
- a copy drop is confirmed;
- a move drop is never confirmed, because its accept cannot be told from no-drop;
- a link drop is never confirmed.

Another theme may draw `dnd-move` apart and confirm moves. The engine reads whatever themes are installed, so the
rule needs no change for them, only measurement.

**The cost, with the theme named (breeze_cursors):** every landed move drop answered unconfirmed. That was 60 of 60 at
each load (30 plain drags, 30 handles), 180 of 180 over the three loads, all landed with `dropEffect` move. The
notice is honest, but it lands on every move drop under this theme. It goes to #364.

## Why the plain-lane move drags were refused in the pilot

In the second pilot, the plain drags from the new move source were answered "may not have started the drag ... the
desktop pointer was outside the window", 3 of 3. Their handles landed.

The cause is the harness's order. Those drags ran right after the root cell's desktop drags, which leave the real
pointer on the bare root. A background-route Chromium drag with the real pointer outside its window is task 20's
case:
- Chromium's capture grab crosses in with no button (`press.strays.first: enter_grab`, `pointer_inside: false`);
- no take follows;
- the press watch answers that the drag may not have started.

The page saw no drag start, so the refusal is right. The harness now puts the pointer back at the drag's start after
every off-window cell. From the third pilot on, the plain move drags ran and landed, 30 of 30 at each load.

Every off-window end is verified where the drag left the pointer, against the window it is for (`end_park`). An end
that was not verified is left out of its row and counted apart. A park on the bare root before the drag would be a
pointer warp on a window the run did not open, which the harness's own audit fails. The third pilot's runs exited 1
on that audit, with their rows complete.

## The counts (`tables.md`, from `scripts/table.mjs`)

Electron, on the drop-signals page, at three loads: idle, the gate's window load (`--ballast gate`) and twice the load
(`--load-factor 2`). The cells:

- **plain**: the short drop, 100 a load;
- **left** and **inzone-out**: the controls, accepted then left, and a press inside the zone then out of it;
- **move**: a drop that only moves, from a source above the zone;
- **root**: a desktop drag, or a handle, out of the window to the bare root 30 px beside it;
- **xterm**: the same, to the middle of the run's front xterm, which takes no drag and drop;
- **other**: the same, to another of the run's Electron windows (XdndAware), over its scroller, outside any drop
  zone. Only that window's `XdndStatus` clears the accept here.

Each control and off-window cell ran 30 times a load, as plain drags (`cua`, or `cua:desktop` for the off-window
cells) and as handles. A **false ok** is an answer of ok with nothing pending on a drag that dropped nowhere. An
off-window drag never counts as dropped, because nothing there takes the drop, whatever the page's `dragend` says.

| load | drags | landed drops (plain and move) | false ok | landed but unconfirmed, copy drops |
|---|---:|---:|---:|---|
| idle | 560 | 260 of 260 | **0** | 0 of 200 |
| the gate's window load | 500 counted (60 ends not the bare root) | 260 of 260 | **0** | handles 4 of 100 (all cold), plain 0 |
| twice the load | 558 counted (2 ends not the other window) | 260 of 260 | **0** | handles 5 of 100 (all cold), plain 0 |

- **0 answered ok without a drop** in 1,618 counted drags. Every control and every off-window drag answered with the
  unconfirmed notice.
- **At the gate's window load the root cell was not measured.** In 60 of 60 drags, a gate ballast window lay under the
  root's end, so no bare root was there. Every one of those 60 answered unconfirmed, 0 ok, and they are left out of
  the counts. The xterm and other cells ran there, 30 and 30.
- **Landed but unconfirmed, copy drops**: 0% idle, 4% for handles at the gate's window load, and 5% for handles at
  twice the load. Each was the cold first drag of a block. #364 tracks it.
  - The fix wave had recorded 6.0% for handles at the gate's window load, above T14's 5% finding threshold. The design
    session ruled that a finding tracked by #364, not a bar (2026-11-11). Here it is 4% at that load, and the 5% at
    twice the load sits at the threshold.
  - So the adoption is not "fully within T14's 5%". It is honest at every load, and a cold Electron drag's cursor can
    lag its own drop. #364 tracks that.
- **Move drops**: 180 of 180 landed, all unconfirmed (above).

## The tests

The RED and GREEN runs are in the task-73 report's "Fix wave 2". The logs are in `tests/`.

- The judge (P1): unit tests of the reviewer's reproduction and of an accept after a no-drop. Both failed on the
  difference judge (`red-judge.log`: `left: Some(true), right: Some(false)` and the reverse), and both pass now.
- The themes: unit tests of `drag_cursors.rs` (Xcursor parsing, inheritance, the refusing images in any theme
  winning, a missing theme).
- The idle bound (P3): a live test holds a key 1.5 s against a 0.3 s bound. On 2d76095c it fails, with button 1
  still down 900 ms in (`red-live-idle-2d76095c.log`). It passes now.
- The XdndAware condition: a unit test of `over_drop_target`, which failed to build before the function existed
  (`red-xdnd-aware.log`) and passes now (`green-xdnd-aware.log`). Live, the off-window RED sittings above failed on
  the engines before, and the counted sittings pass.
- The watch from the source (P2): live, the off-window cells on Electron. Before the fix wave's fix there was no
  cursor watch, and the root and xterm answered ok (`red-d70b9e89`). After it, they answer unconfirmed.
- The suites on 69d095f8's code, with the gate's flags (`suites-s2.out`, `s3-live-results.txt`):
  - fmt and clippy are clean, with and without `live`;
  - unit 386 passed;
  - every live binary passed (`--no-fail-fast`).
  - The first live run stopped at task 75's logged flake (`identity_faults::a_paste_whose_frame…`). It passed on the
    rerun.
  - Services 47 of 47.
  - Harness 874 of 876: the stale X42 and X43 sockets, tech-debt item 3.
  - `ci-gate` GREEN 8/8 on 69d095f8 (run 43109225414).

## Sittings (`sittings/`)

| sitting | engine | what |
|---|---|---|
| `pilot`, `pilot2` | 74aa0771 | the first pilots: the root's end clamped back into the window; then the stale accept at the bare root |
| `red-root`, `red-root2` | d70b9e89 | the root cell before the harness's fixes (`red-root` ended inside the window) |
| `idle` | 74aa0771 | an idle sitting before the XdndAware condition (`tables-before.md`) |
| `pilot3` | 69d095f8 | the off-window cells; exited 1 on the park audit, rows complete |
| `red-off-old`, `red-off-74aa` | d70b9e89, 74aa0771 | the three off-window cells, 30 each, idle: RED; exited 1 on the park audit, rows complete |
| `pilot4` | 69d095f8 | the end read after the drag |
| `idle2`, `gate2`, `load2` | 69d095f8 | the counted sittings |

## Scripts (`scripts/`)

| script | what it does |
|---|---|
| `env.sh` | the wave's paths, `T` its work directory |
| `prepare.sh` | the musl build and the harness export of a commit |
| `sitting.sh`, `batch.sh` | one drop-signals sitting, its load by name; a list of them on one engine |
| `table.mjs`, `rows.mjs` | the tallies |
| `copy-evidence.py` | the copy into this directory, paths labelled |
