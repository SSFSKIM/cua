# M4, task 63: the foreground route's pointer input waits for its window's raise

In `dedicated` mode a family that ignores the background route takes the foreground route: the engine activates the
window (`_NET_ACTIVE_WINDOW`, a raise, `SetInputFocus`), waits until the window holds the X input focus, then sends
XTEST input. Task 62's settle sittings saw GTK 4's covered clicks, scrolls and drags never take effect in 7 to 18 of
about 32 runs per series at twice the load, the engine answering success (`../settle/`, tech-debt-tracker.md
2026-11-06). This directory holds the mechanism, the fix's proof on the same cells, the other families the route
carries, and the device-mode cases' witness and audit on the fixed engine.

Development runs on the #171 VM (8 vCPU), 2026-11-06 UTC, not a release gate. Every sitting ran on a private Xvfb with
Openbox (the settle experiment's own, or `scripts/private-run.mjs`'s for the device cases); nothing ran on `:0`.
`pgrep -x stress-ng` was empty before each sitting (`scripts/sitting.sh` refuses otherwise). "Twice the load" is the
harness's 16 stress-ng CPU workers on 8 cores (`--load-factor 2`). Firefox is the Mozilla deb task 59 unpacked, first
on `PATH`. Each harness is an export of its commit (`scripts/export-harness.sh`); each engine one musl build made the
release workflow's way (`scripts/build-musl.sh`), static-pie:

| label | commit | sha256 |
|---|---|---|
| before | 4996fd29 (task 62's head) | `0a32831d2289fde1a94b5846863f5ee9549947fad83550158bf3c1c16485bab7` |
| first fix | 4dc625da | (superseded; its sittings are kept in `first-fix/`) |
| final | c87e5584 | `211cbfd01b2953cb322127f1b0e7c3111b2844812c4400406ef2b5985fd736dc` |

Harnesses: 4996fd29 for `before/gtk4-load2`; 89e64080 (the new cells, `xprobe order-watch`) for `before/others-load2`
and `first-fix/`; 3e9619a8 (the Qt scene counting its wheel steps) for `before/qt-load2` and `final/`.

## The trace: `xprobe order-watch`

`xprobe order-watch` (task 63) is attached to the sitting's own display for its whole length
(`scripts/traced-sitting.sh`). On one X connection it receives, in the order the server generated them: the focus
transitions (`FocusChange` on every root child), the activation requests, `_NET_ACTIVE_WINDOW`'s changes, every
restack, map and unmap of a root child with its geometry, and every pointer button press and release from any device
(XInput 2 raw events on the root). `scripts/analyze-order.mjs` replays the stacking from those lines and gives, per
activation the engine requested: when the target's frame got the focus, when its frame came on top, when
`_NET_ACTIVE_WINDOW` changed, when the press went, and the topmost window under the press's point (replayed, and the
pointer's `child` read a round trip later). Each sitting's `analysis.md` has the tables.

## The mechanism (`before/gtk4-load2`: the old engine, GTK 4's click, scroll and drag cells)

The order, every activation: the engine's `SetInputFocus` gives the target the focus at once (+0.0 ms, its own
request); the window manager raises the frame when it processes the activation request, later (median +0.1 ms, up to
+9.0 ms at twice the load); the engine sends the press as soon as the focus is in. XTEST pointer events go to the
topmost window under the point, whatever holds the focus.

- 25 of 98 presses went before the frame's raise, and each of those 25 went to the front window covering the target
  (the replayed stacking at the press: the front window's frame on top at the point). No press after the raise went
  anywhere else.
- Every lost run is one of those 25 or follows one: the 6 clicks lost are 6 presses into the front window; the scroll
  and drag cells alternate their direction or path between runs, so a run after a lost one could not change the
  reading (12 more misses, each right after a lost run, its own press on the target).
- Example (activation 12, a click): focus +0.0 ms, press +1.1 ms with the front window on top under it, the target's
  raise +7.6 ms.

## The fix (`native/linux-engine/src/route.rs` `Route::on_top_at`, `cover.rs` `reach`)

Every pointer input the foreground route carries now waits, before it sends anything, until the window is on top at
every point it will use, as the server's stacking says (`cover.rs`'s stacking read; `reach`): a click's point, the
wheel's point (the window's centre when none is given), a move's end, every sample of a drag's path, an element's
right click's point, the paste's focusing click's point. Windows of the target's own X client (its popups and menus)
take its input and do not count; InputOnly windows do, since they take pointer input. A point outside the window is
refused at once; a window still covered at the bound (1 s) is refused; both say nothing was sent. Keys go to the
focus, which the route already waits for.

## The proof

`node scripts/linux-engine-diff.mjs --experiment settle --family gtk4 --routes dedicated --lanes shipped
--load-factor 2` (and the same idle), and the other families (`--family firefox,chrome,electron,qt5,qt6`). "Lost" is a
run answered success whose effect never came within 2 s; a refusal sends nothing.

| sitting | engine | series | runs | lost, answered success | refused | presses before the raise |
|---|---|---|---:|---:|---:|---:|
| `before/gtk4-load2` | before | GTK 4 click, scroll, drag | 98 | **37** | 0 | **25** of 98 |
| `final/gtk4-load2` | final | GTK 4 press_key, click, move, scroll, drag; gnome-text-editor type_text | 180 | 0 | 0 | 0 of 90 |
| `final/gtk4-idle` | final | the same | 180 | 0 | 0 | 0 of 90 |
| `before/others-load2` | before | Chrome drag, Electron drag, Firefox click, right click, move, scroll, drag | 230 | **16** | 5 | **28** of 199 |
| `before/qt-load2` | before | Qt 5 scroll, Qt 6 scroll | 69 | **22** | 0 | **22** of 69 |
| `final/others-load2` | final | Chrome, Electron, Firefox, Qt 5, Qt 6 as above | 271 | 0 | 1 | 0 of 240 |
| `final/others-idle` | final | the same | 271 | 0 | 1 | 0 of 240 |

`before/others-load2` also ran the Qt cells on the Qt scene as it was, which counted no wheel steps (every engine read
no effect; its 21 presses before the raise are left out of the row above); `before/qt-load2` ran them again on the
scene that counts them. Every final series reached its 30 consecutive passing runs (`summary.md`; each verdict passes). Per series:

- GTK 4 at twice the load: press_key, click, move, scroll and drag 30 of 30 each, gnome-text-editor's paste 30 of 30;
  0 lost, 0 refused. Idle the same.
- The other families at twice the load: Chrome's and Electron's covered drags 30 of 30, Firefox's click, move, scroll
  and drag 30 of 30, its element right click 30 of 31, Qt 5's and Qt 6's scroll 30 of 30; 0 lost. Idle the same.
- The one refusal in each Firefox right-click series is its first run, `element has no visible bounds in this window`,
  answered before anything is sent, with the old engine too (`before/others-load2`): Gecko's first extents read of the
  covered page's element is empty. Not this route's.
- Before the fix, beyond GTK 4: Chrome lost 4 of 38 drags, Electron 4 of 36, Firefox 8 of 35 drags, Qt 5 5 of 36
  scrolls and Qt 6 17 of 33; Firefox's scrolls lost none, yet 12 of their first wheel steps went to the front window
  (the later steps landed after the raise, so the reading still moved: a short scroll answered as a full one). Its
  clicks and moves lost none. The 5 refusals there are the Chromium press watch's (4, `may not have started the
  drag`) and Firefox's first right click.

`first-fix/` holds the same sittings on 4dc625da, before windows of the target's own client stopped counting as
covering (c87e5584): the same 0 lost on every GTK 4, Chromium and Firefox series, idle and at twice the load; their Qt
rows read no effect, on the scene that counted no wheel steps. Part of `first-fix/gtk4-load2` ran beside a musl build
of the engine, above twice the load.

**The longest wait.** The wait is the time from the focus to the raise. Across every sitting the window manager raised
the frame at most 17.2 ms after the activation request at twice the load (`before/qt-load2`; 10.8 ms in
`final/others-load2`, 10.0 ms in `final/gtk4-load2`), at most 4.4 ms idle. The bound is 1 s, the foreground route's
focus bound: about 58 times the longest measured, and no run was refused at it.

**`_NET_ACTIVE_WINDOW` follows the raise.** Openbox set `_NET_ACTIVE_WINDOW` after the raise in 2,190 of 2,191
activations recorded with both (once before it, `first-fix/others-load2`; `before/gtk4-load2`'s watcher predates the
`active` line); task 62's `activate_window` settle (10 ms)
was measured on `_NET_ACTIVE_WINDOW` and the frame's ACTIVE state.

## The witness and the audit (`final/device/`)

Acceptance 8's device-mode cases on the final engine (`--scene device-gtk4,device-firefox,device-qt,device-chrome,
device-chrome-dnd,device-xterm --ops all --blocks 3`, cua alone, idle, `scripts/private-run.mjs`, no whole-run
RECORD): the run is valid (the activating stub failed by the witness and the audit; the foreground and in-front
negative checks held) and no verdict fails. Every dedicated case takes the foreground route with the witness's
foreground allowance and the foreground audit clean, 9 of 9 each (GTK 4's click, key, scroll, move and drag; Firefox's
covered click, move, drag and scroll; Qt's scroll; Chrome's covered drag, covered drop, short covered drop and the
pointer-outside drop; xterm's key), and every shared case keeps its witness and background audit as before. The run's
`desktop` scene passes as usual (desktop `get_screenshot` cold at its declared parity).

## Live tests (`native/linux-engine/tests/live_device.rs`)

A window manager's stand-in (`SlowRaises`) takes `SubstructureRedirect` and carries out the target's restack 150 ms
late, or never. Against the old engine (`CUA_ENGINE_BIN` the before build) the click reached the covering window,
`[ButtonPress, ButtonRelease]`, and the never-raised click answered success; on the fix, the click, the wheel step and
the drag land in the window after the raise and the covering window receives nothing, a never-raised window is refused
at the bound, a drag path or move leaving the window is refused at once, each with nothing sent, and a click under the
window's own popup goes at once.

## Scripts

`scripts/`: `build-musl.sh`, `export-harness.sh`, `sitting.sh`, `traced-sitting.sh` (a sitting with `order-watch`
attached), `proof-chain.sh` and `final-chain.sh` (the sittings in order), `private-run.mjs` and `norecord.mjs` (the
device run's private display), `analyze-order.mjs`, `by-frame.mjs`, `series-table.mjs`, `summarize.sh` (the
analyses), `copy-evidence.py` and `copy-final.sh` (home paths labelled `<home>` and `<task63>`, files over 512 KiB
gzipped), `live.sh` and `live-at.sh` (the engine's live tests as the gate runs them), `ow-smoke.sh`.
