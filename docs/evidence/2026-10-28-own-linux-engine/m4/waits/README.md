# M4, T9 (task 64): the remaining fixed waits

T9's row: desktop `move`'s leading motion dropped if no `MotionNotify` comes, else the 8 ms path wait shortened;
`drag_handle`'s held moves with it; GTK 4's covered-capture cap shortened where nothing repaints; every fixed wait
inventoried. This directory holds the motion listener, the path wait's measurements and its search, the capture
readiness on every family, the settle experiment's reruns T8 and task 63 carried here, and the inventory.

Development runs on the #171 VM (8 vCPU), 2026-11-07 UTC, not a release gate. Every sitting ran on a private Xvfb the
experiment started itself (the settle and events experiments) or task 63's `private-run.mjs` started (the readiness
check), with Openbox and the run's own applications, homes and session bus; nothing ran on `:0`. `pgrep -x stress-ng`
and the hold file were checked before each sitting (`scripts/env.sh` `guard`). "Twice the load" is the harness's 16
stress-ng CPU workers on 8 cores (`--load-factor 2`). From 21:02 to 21:14 the sittings paused for another session's
service update at 21:04 (the controller's hold, which `final/readiness-gtk4-load2` ran into and finished under; the
update changed no package, font, theme, X or config file). From 21:21:35Z another
session's idle Claude seat (m7b-vm) ran on the VM, with no display, no install and no build, so every sitting that
began at or after 21:14 (`final/readiness-all-load2` and every `*-load2` sitting after it) overlaps it. Firefox is the
Mozilla deb unpacked beside task 59's run, first
on `PATH`. Each harness is an export of its commit; each engine a musl build made the release workflow's way
(`scripts/build-musl.sh`), static-pie:

| label | commit | what it is | sha256 |
|---|---|---|---|
| before | 21cc0e73 | the head before this task | `a9f94f16f7b60e51ee7df63e0b1f5fae3baadb363d39040663e8a46a9b22f4e6` |
| no pause | 500b48fd | no pause anywhere in a desktop path (`PATH_STEP` 0), the offscreen capture rule, `--path-step-ms` | `7e8977e52d9a9e3a818407bf19d9b0e6cd30bec03a6bba6d7c0a0b20927c8747` |
| final | 992a51a1 | the vendor's 8 ms between two positions, none after the leading motion; the offscreen capture rule | `c7d809be768496c7a7c21b2dfdababb68dcbb18c9b50ea58dc7ace1c5f7dd32b` |

The search's lanes are the no-pause build with `--path-step-ms N` (`scripts/make-wrapper.sh`: the settle experiment's
service spawns its engine with no flags of ours, so a wrapper appends the flag to `server` only). The harness is
500b48fd's for every sitting here but `before/` (21cc0e73's); the harness did not change after 500b48fd.

## The motion listener: a motion to the pointer's own position is delivered

`xprobe motion-watch` (new) listens the ways an application does, one per pass, since the server gives a device
event to a window's XInput 2 clients and then to none of its core ones: core `MotionNotify`, or XInput 2 `XI_Motion`,
each with raw motion and device changes on the root. The events experiment now opens with it over the wire
(`events.mjs` `motionListener`): per engine and mode, a move to where the pointer already is, a 1 px move (the
positive control), a 400 px path, and the same with button 1 held through `drag_handle`, the engine's X connection
through xtrace, so each XTEST motion it sent (read from FakeInput's body) is matched against what the listener received.

From `final/events-idle/summary.md` (both modes alike; `no-pause/events-idle` the same):

| engine | a move to the pointer | 1 px (control) | a 400 px path | held, 1 px (control) | held, to the pointer |
|---|---|---|---|---|---|
| pinned | 1 sent / 1 received | 2 / 2 | 11 / 11 | 2 / 2 | 1 / 1 |
| newest | 1 / 1 | 1 / 1 | 10 / 10 | 1 / 1 | 1 / 1 |
| cua | 1 / 1 | 2 / 2 | 11 / 11 | 2 / 2 | 1 / 1 |

The control's 1 px move arrived in every engine and mode. **Every motion at the pointer's own position was received:
36 of 36**, core and XInput 2, with and without a button held. The pinned build's path always begins with one (its
trace: 11 motions for a ten-step path, the first at the pointer), and the newest leaves it out (10). So dropping it
would change what an application receives, and the row's first route is closed. (A first look with `xdotool
mousemove` misled: xdotool warps the pointer, which is not XTEST; `probes/` keeps the quick engine probe.)

## The path wait: no pause fails on Chromium pages; the pause after the leading motion goes

**No pause at all** (`no-pause/`): every pointer cell of the settle experiment on the desktop and foreground routes
held 30 consecutive idle on every family, but the page's desktop `move` did not. In Chrome 21 of 32 runs and in
Electron 26 of 31 missed the service's move settle (75 ms): the page reported an intermediate point of the path (one
`mousemove`, at 690 of 696 for example) and the last only 160 to 260 ms later, by Blink's own move. So the 8 ms is
needed there, and the move settle T8 set does not hold without it (reported as the brief asked; the constant is
unchanged).

**The search** (`search/`, Chrome's and Electron's page `move` on the desktop route, idle, shipped settle):

| pause | Chrome | Electron |
|---:|---|---|
| 0 | 21 of 32 missed | 26 of 31 missed |
| 1 | 29 of 31 missed | 30 of 31 missed |
| 2 | 23 of 31 missed | 30 of 31 missed |
| 4 | 1 of 31 missed, then 30 consecutive | 30 of 31 missed |
| 5 | 30 consecutive | 31 of 31 missed |
| 6 | 30 consecutive | 24 of 31 missed |
| 7 | 30 consecutive | 30 consecutive |
| 8 | 30 consecutive | 30 consecutive |

The wait rule would allow 7 ms idle, one step above a miss, and it closes nothing: a one-step move would still pause
7 ms where the newest build pauses none. The pause between two positions stays the vendor's 8 ms.

**The change** (`desktop.rs` `paused_before`): the path's leading motion is at the pointer's own position and moves
nothing, so no pause follows it. Every motion the pinned build sends is still sent (the events experiment: "cua sent
the pinned build's events and answers in every scenario"), every two positions are still 8 ms apart, and a one-step
move answers at once, as the newest build's does. A ten-step path pauses nine times, as the newest build's does.

Desktop request times, the events experiment's interleaved fresh engines (median ms; `final/events-idle`, and the
8 ms lane beside the no-pause build in `no-pause/events-idle`, judged as cua is with `scripts/variant-speeds.mjs`):

| command | series | n | pinned | newest | final | verdict | 8 ms everywhere (the change dropped) |
|---|---|---:|---:|---:|---:|---|---|
| `move` | first | 20 | 83.16 | 83.88 | 74.76 | faster [−8.67, −8.06] | 82.96, same |
| `move` | later | 60 | 8.61 | 5.95 | **0.40** | **faster [−5.64, −5.48]** | 8.65, **fail [2.32, 2.70]** |
| `click` | first | 60 | 87.27 | 86.83 | 78.92 | faster | 87.07, same |
| `click` | later | 80 | 46.36 | 30.11 | 12.89 | faster | 12.92, faster |
| `drag` | later | 40 | 329.53 | 110.96 | 47.43 | faster | 51.48, faster |
| `drag_handle` | first | 40 | 37.88 | 37.58 | 33.55 | faster | 37.65, within the bound |

So M1a's declared speed gap is closed: `deviations.mjs` `SPEED_GAPS` declares nothing, and the lane that keeps the
pause after the leading motion fails exactly the series the gap declared.

**The proof on the final engine**, the settle experiment's shipped lane (`--lanes shipped`):

| sitting | cells | result |
|---|---|---|
| `final/pointer-idle` | click, right click, scroll, drag, `drag_handle` on the desktop and foreground routes: Chrome, Electron, gedit, kate, Qt Creator, Writer, gnome-terminal, xterm (desktop); GTK 4, Firefox, Chrome, Electron, Qt 5, Qt 6 (foreground) | every series 30 consecutive; Firefox's first right click refused (the known debt) |
| `final/move-idle` | every `move` cell, every route | every series 30 consecutive; the background audits clean (6 of 6) |
| `final/pointer-load2` | the same at twice the load | every series 30 consecutive; the same first right click refused |
| `final/move-load2` | the same at twice the load | every series 30 consecutive; the background audits clean (6 of 6) |

`drag_handle`'s held moves keep their family's drag step (0; Chromium 500 µs; Gecko 300 µs), which never was the 8 ms;
they share the path code, so they too pause nowhere after their leading motion. The new desktop cells (kate, Qt
Creator, Writer, gnome-terminal, xterm, the GTK 3 and Qt scenes) put every family of the matrix under the wait rule.

## The service's move settle (T8, carried)

On the final engine T8's move cells hold at the shipped 75 ms: every `move` cell, background, desktop and foreground,
30 consecutive idle (`final/move-idle`) and 30 consecutive at twice the load (`final/move-load2`). On the no-pause
build they did not (above), which is why the 8 ms stays.

## `activate_window` then a pipelined windowless click (task 63, carried)

`activate_click` (`settle-gtk3`, both modes, the `settle-0` lane pipelining the click and `shipped`), traced by
`xprobe order-watch` and replayed (`scripts/analyze-order.mjs`, `scripts/press-gaps.mjs`):

| sitting | engine | runs | landed | presses reaching the old top window | the press after the activation request |
|---|---|---:|---:|---:|---|
| `no-pause/activate-click-idle` | no pause | 120 | 120 | **0 of 120** | min 2.2, median 11.9 ms |
| `final/activate-click-idle` | final | 120 | 120 | **0 of 120** | min 34.6, median 44.3 ms |
| `no-pause/activate-click-load2` | no pause, twice the load | 120 | 120 | **0 of 120** | min 2.2, median 12.9 ms |
| `final/activate-click-load2` | final, twice the load | 120 | 120 | **0 of 120** | min 33.4, median 46.0 ms |

Task 63's previous engine pressed at least 40.4 ms after the request, which hid the race; the no-pause build presses
2.2 ms after it, and still none reached the old top window, because `activate_window` now answers only once its window
is on top. The final engine's placing path pauses one step less than before (34.6 ms at least).

## GTK 4's covered capture: no first damage where the server already keeps the window offscreen

Why GTK 4 waited the 150 ms cap: its window and its Openbox frame are 32-bit (visual 0x40) under the 24-bit root
(`probes/visuals-all`, the ancestry of every family's window: only GTK 4's changes depth). Composite redirects such a
frame by itself, so the window's contents are kept offscreen and complete whatever covers it; the engine's redirect
copies them, and GTK 4 never repaints. Every other family's chain keeps one depth.

The rule, as the fix wave left it (`cover.rs` `complete_offscreen`, judged in `x11.rs` with the unobscured shortcut
from the same stacking read, before the redirect): a window of another depth than its parent owns a pixmap the server
keeps complete. A window inside such a window (GTK 4's client in its ARGB frame) counts as complete only when it lies
wholly inside every ancestor up to that window and no sibling above it, or above an ancestor inside that window,
overlaps it, judged by outer rectangles as the unobscured shortcut judges the screen (InputOnly and unmapped siblings
draw nothing). Such a window counts as complete at the redirect, as an unobscured one does, and waits only for 10 ms of
quiet (still capped at 150). Every other window, a read error included, waits for its first damage as before. A
resize or remap makes a new pixmap that waits for damage again. The capture's stats name it (`reason: offscreen`).
T9's first form (`readiness.rs` `kept_offscreen`: any depth change in the ancestry) was unsafe, as its review found: a
same-depth sibling over the window inside the frame is drawn in the frame's pixmap, and the window's new pixmap is
copied from there with its inferiors (Xorg's `compNewPixmap`), so the capture showed the sibling (`fix/`).

The judge (`readiness-check.mjs`): a window that never repaints shows the same pixels in its first and later capture,
right or wrong, so an `offscreen` capture is also judged against the same window's unobscured capture.

| sitting | engine | GTK 4 partial and covered first captures | wait |
|---|---|---|---|
| `before/readiness-gtk4-idle` | before | 24 of 24 right | 150.1 ms (cap) every one |
| `final/readiness-gtk4-idle` | final | 60 of 60 right, against their own and the unobscured capture | 10.0 ms median, 10.1 max |
| `final/readiness-gtk4-load2` | final | 60 of 60 right | 10.1 median, 12.6 max |
| `final/readiness-all-idle` | final | every family, 396 of 396 right; only GTK 4 took the rule | – |
| `final/readiness-all-load2` | final, twice the load | every family, 396 of 396 right; only GTK 4 took the rule | – |
| `fix/readiness-gtk4-idle` | the fix wave's (958db275) | 60 of 60 right, every one `offscreen` | 10.0 median, 10.1 max |
| `fix/readiness-gtk4-load2` | the fix wave's, twice the load | 60 of 60 right, every one `offscreen` | 10.0 median, 12.4 max |
| `fix/readiness-all-idle` | the fix wave's | every family, 396 of 396 right; only GTK 4 took the rule | – |
| `fix/readiness-all-load2` | the fix wave's, twice the load | every family, 396 of 396 right; only GTK 4 took the rule; PASS | – |

The cold window screenshot of a covered GTK 4 window answers about 90 ms where it took about 230.

**The control** (`--variant control=--capture-wait quiet`: every pixmap taken as complete, the first damage dropped
for every window): idle it captured every first frame right too (`no-pause/readiness-all-idle`, 0 of 396 wrong:
idle, every family's first damage comes within 2–5 ms, inside the 10 ms of quiet), so idle it shows nothing. At twice
the load it missed twice (`final/readiness-all-load2`): a partly covered Firefox window (67,696 pixels off) and a covered Chrome window (16,451 off), each captured after 10 ms of quiet with no damage yet, where the shipped rule waits for the first damage; so the run passes, and the first damage is shown needed where the server does not keep the window offscreen. A sitting whose control misses nothing could not have failed the rule. T9's check read it as
FAIL; since the fix wave it is labelled CONTROL NON-DISCRIMINATING (the design session, 2026-11-07), still no pass, and
the twice-the-load sitting, where the control missed, stays the proof (`fix/readiness-all-load2`: the control 2 of 396
wrong, both a covered Chrome window; the shipped rule 396 of 396 and PASS). Those sittings also show the
pinned build's capture of the unobscured Chrome page off its truth by 4,482 pixels (1 and 2 of 2), in both engines'
sittings alike: a vendor-side difference, not this rule's. Since the fix wave such a sitting reads REFERENCE MISMATCH
(`fix/readiness-all-idle`: `REFERENCE MISMATCH, CONTROL NON-DISCRIMINATING`, the pinned build's Chrome capture 4,500
pixels off, 2 of 2), never a pass.

## The inventory: every fixed wait in the engine

"Fixed" means a wait the engine sleeps whatever happens. Bounds of condition waits (it waits until something holds,
at most so long) are listed after them, since they cost nothing when the condition holds at once.

### Fixed waits

| wait | where | before | after | kept or changed, and why |
|---|---|---:|---:|---|
| after a desktop path's leading motion, the one at the pointer's own position | `desktop.rs` `paused_before` (desktop `move`; the desktop and foreground routes' placing for `click`, `scroll`, `drag`, the element right click and the paste's focusing click; `drag_handle`'s `start`, and its held moves on every family but Gecko) | 8 ms (the family's drag step, 500 µs on Chromium, for `drag_handle`'s held moves) | 0 | **changed**: that motion moves nothing (it is still sent, since the server delivers it), so the pause after it separates no two positions. Closes M1a's declared gap. Every pointer and move cell of the settle experiment on every family, 30 consecutive idle and at twice the load; held moves measured on Chrome and Electron (their `drag_handle` cells). |
| after a Gecko held `drag_handle` move's leading motion | `families.rs` `DragPacing.held_lead_pause` (Gecko's row) → `desktop.rs` `move_path_paced` | 300 µs | 300 µs (T9 had dropped it; the fix wave restored it) | **kept, T-drag owns it**: no Firefox held-move cell measured it gone. The design session (2026-11-07): keep it, and measure removing it with Firefox held-move cells in the drag tasks, T10 to T16. |
| between two positions of a desktop path | `desktop.rs` `PATH_STEP` | 8 ms | 8 ms | **kept**: 0 to 6 ms each missed the service's move settle on an Electron page (and 0 to 4 on Chrome's), idle; 7 held one step above a miss and closes nothing. `--path-step-ms` sets it for measurement. |
| between `drag_handle`'s held moves' positions | `engine/pointer.rs` `drag_handle` → `move_path_paced` with the family's `DragPacing.step` | the family's step (0; Chromium 500 µs; Gecko 300 µs) | unchanged | **kept**: the drag pacing M1a.4 measured per family and kind (T11 owns the Chromium and Gecko motion model). It never used the 8 ms. |
| after every sample of a `drag`, the last included | `engine/pointer.rs` `drag_along` (`let mut wait = pacing.step` … `sleep(wait)`), the family's `DragPacing.step` | 0; Chromium 500 µs; Gecko 300 µs | unchanged | **kept, T-drag owns it**: M1a.4's per-family spacing between motions (Chromium missed the canvas and the scroller thumb without it, Gecko drag and drop and the canvas). The drag motion model is T11's (coarse segments or pacing by elapsed time); the pause after the last sample goes or stays with it. After a take, the drop's keepalive may lengthen a step (`dnd.rs`, T14's). |
| a click's hold (no `duration`) | `engine/pointer.rs` `CLICK_HOLD` | 12 ms | 12 ms | **kept**: the vendor's (behaviour §10.1). Not measured (the row: only if the task has room); its measurement is ticket #323. |
| a wheel step's hold | `engine/pointer.rs` `WHEEL_HOLD` | 36 ms | 36 ms | **kept**: the vendor's (behaviour §10.3). Not measured (the row: only if the task has room); its measurement is ticket #323. |
| a drag's press and release dwells | `families.rs` `DragPacing` (Gecko 30 ms before the release) | as measured | unchanged | **kept**: M1a.4's, T11's to revisit. |
| key pacing | `input.rs` `Pacing.key` | 0 | 0 | **kept** at 0 (M0.4). |
| input settle after a fresh redirect | `x11.rs` `retain`, `--settle-ms` | 0 | 0 | **kept** at 0 (M0.3: input needs no wait after the redirect). |
| `FocusOut` teardown | `route.rs`, `--teardown-ms` | 0 | 0 | **kept** at 0 (T7 revised). |
| capture fallback without DAMAGE | `readiness.rs` `FIXED` | 100 ms once per pixmap | unchanged | **kept**: only a server without DAMAGE takes it. |
| the capture's quiet period | `readiness.rs` `QUIET` | 10 ms | 10 ms | **kept**: M0.4's rule. |
| the capture's cap | `readiness.rs` `CAP` | 150 ms | 150 ms; no longer reached by a window whose whole contents the server keeps offscreen | **changed where nothing repaints**: a window of another depth than its parent, or one inside such a window (GTK 4's ARGB frame) with nothing over it inside that window and none of it past it (`cover.rs` `complete_offscreen`, the fix wave's form), needs no first damage and waits 10 ms of quiet. The cap stays for every window whose pixmap needs a repaint. |
| the paste settle after keys / after clicks | `settle.rs` `PASTE_SETTLE`, `PASTE_CLICK_SETTLE` | 100 / 25 ms | unchanged | **kept**: T7 revised measured them by the wait rule. |
| the exit settle | `settle.rs` `EXIT_SETTLE` | 300 ms | unchanged | **kept**: T7's SIGTERM series. |
| the Chromium drop's hold and floor | `dnd.rs` `TAKE_HOLD_AFTER_PRESS`, `RELEASE_AFTER_TAKE` | 250 / 350 ms | unchanged | **kept**: the pre-flight ruling, T13/T14's. |
| the drop's keepalive motion interval | `dnd.rs` `KEEPALIVE` | 12 ms | unchanged | **kept**: T14's. |
| the late-take watch's lifetime | `dnd.rs` `SETTLE` | 300 ms | unchanged | **kept**: M3's, off the request path. |
| Qt's focus linger after a `FocusOut` | `focus_ack.rs` `TOOLKIT_LINGER` | 100 ms (when the frame is still active) | unchanged | **kept**: task 61, Qt's own 100 ms. |
| the service's action settle | `src/services/engine/linux/settle.mjs` | T8's constants | unchanged | **kept**: T8's; `move` 75 confirmed here on the final engine, and shown not to hold with no path pause at all. |

### Bounds of condition waits (no cost when the condition holds)

| bound | where | value | why |
|---|---|---|---|
| a Qt press's focus acknowledgement | `focus_ack.rs` `FOCUS_ACK` | 25 ms, polled 2 ms | task 61's wait rule |
| a foreground pointer input's raise | `route.rs` `ON_TOP_WAIT` | 1 s, polled 2 ms | task 63 |
| the foreground route's focus after activation | `engine/way.rs` `ACTIVATION_WAIT` | 1 s, polled 10 ms | M3 |
| a minimized window's map after activation | `engine/windows.rs` `MAP_WAIT` | 1 s, polled 5 ms | T4 |
| a paste's `TARGETS` request | `paste.rs` `TARGETS_REFRESH_WAIT` | 25 ms, polled 2 ms | T7 |
| a paste's confirmation | `paste.rs` `CONFIRM_WAIT` | 2 s, polled 20 ms | M2 |
| a focusing click's element reporting the focus | `engine/paste.rs` `FOCUS_WAIT` | 500 ms, polled 10 ms | M2 |
| the clipboard lock, snapshot and transfer bounds | `clipboard/mod.rs` | 5 s; 500 ms, 500 ms, 2 s, 5 s; 500 ms, 2 s, 10 s | M2 |
| a Copy's context menu | `copy.rs` `MENU_WAIT` | 1 s, polled 20 ms | M2 |
| a D-Bus reply | `dbus.rs` `IO_TIMEOUT` | 2 s | M1a |
| the exit's backstop, forced release, the shim's writer wait | `serve.rs`, `pressed.rs`, `shim.rs` | 1000, 200, 1250 ms | T7b |
| the capture's first damage | `readiness.rs` `CAP` | 150 ms | the rule above |

## Scripts

`scripts/`: `env.sh` (paths), `build-musl.sh`, `export-harness.sh`, `sitting.sh`, `traced-sitting.sh`, `experiment.sh`,
`private.sh` with `private-run.mjs` and `norecord.mjs`, `readiness.sh`, `path-chain.sh`, `path-search.sh`,
`make-wrapper.sh`, the chains (`c2-*`, `c3-*`), `variant-speeds.mjs`, `scenario-diffs.mjs`, `analyze-order.mjs`,
`press-gaps.mjs`, `copy-evidence.py` (home paths labelled `<home>` and `<task64>`, files over 512 KiB gzipped).
