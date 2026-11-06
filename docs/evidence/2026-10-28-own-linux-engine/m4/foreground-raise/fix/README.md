# Task 63's fix wave: only the window's own points wait; `activate_window` answers once it is on top

The design session's rulings on task 63 (2026-11-06):

- **(A)** The foreground route's wait for the raise checks only the points inside the target window; points outside go
  as before. A drag from a covered window into another window, in `dedicated` mode, is sent, not refused (task 63's
  c87e5584 refused it: `the input's point is outside window …`).
- **(B)** `activate_window` waits, bounded at 1 s, until the window is on top over its visible area, and errors at the
  bound: `window <id> was not brought to the front: another window still covered it 1000 ms after its activation was
  requested; nothing else was sent`. The live cell: `activate_window`, then a pipelined windowless click, 30 runs at
  twice the load, 0 reaching the old top window, in both modes. The service's settle after `activate_window` (10 ms,
  T8) is unchanged; T8's next wave re-measures it on top of this wait.
- The residual few milliseconds between the last stacking read and the press is a stated limit (#307): in the
  sittings below and task 63's, no press after a passing read reached another window, in about 2,200 foreground and
  activate-then-click presses on the fixed engines (task 63's ~1,000 foreground runs, and this wave's).

Development runs on the #171 VM, 2026-11-06 UTC, not a release gate, under the rules of `../README.md`: private Xvfb
with Openbox, nothing on `:0`, `pgrep -x stress-ng` empty before each sitting, twice the load as 16 stress-ng workers
on 8 cores, each sitting traced by `xprobe order-watch`. Engines, musl builds made the release workflow's way:

| label | commit | sha256 |
|---|---|---|
| previous (task 63) | c87e5584 | `211cbfd01b2953cb322127f1b0e7c3111b2844812c4400406ef2b5985fd736dc` |
| fix wave | c5aa8ea5 | `78c657a93654e0689598dfe1b1930e5c0c25f317cb412b2ca07b89e99c12bfb8` |

Harness f0b96f1c (the `activate_click` cell). `scripts/fixwave-chain.sh` ran the sittings in order.

## (B) The live cell: `activate_window`, then a pipelined windowless click

`activate_click` (`action-settle-cells.mjs`): the GTK 3 settle scene covered by the front window (an xterm standing for
the person's window in `shared` mode), `activate_window`, then a windowless click at the scene's button on the screen;
it passes when the scene counts the click. In the `settle-0` lane the service defers nothing, so the click goes as soon
as `activate_window` answers (pipelined); `shipped` keeps the service's 10 ms.

| sitting | engine | series (mode, lane) | runs | landed | lost | refused | presses reaching the old top window |
|---|---|---|---:|---:|---:|---:|---:|
| `activate-click-load2` | fix wave | shared and dedicated, `settle-0` and `shipped`, twice the load | 120 | 120 | 0 | 0 | 0 of 120 |
| `activate-click-idle` | fix wave | the same, idle | 120 | 120 | 0 | 0 | 0 of 120 |
| `activate-click-before-load2` | previous | the same, twice the load | 120 | 120 | 0 | 0 | 0 of 120 |

The previous engine also landed every click: the pipelined click reached the server at least 40.4 ms after the
activation request (median 51.4: the service's round trip, then the desktop route's paced path to the point), and the
window manager's raise came at most 7.6 ms after it. So at this window manager's speed the cell cannot tell the two
engines apart; what fails the previous engine is the live test below, whose window manager raises 150 ms late. The cell
stands as the guard for the property, and for T9, which may shorten the desktop path's wait that hides the race today.

## (A) and (B), the tests that fail on the previous engine (`native/linux-engine/tests/live_device.rs`)

`CUA_ENGINE_BIN=<c87e5584 musl build> scripts/live.sh live_device <bin> a_foreground_drag_from_its_window
activate_window_answers` (the gate's `--release --locked --target x86_64-unknown-linux-musl --features live`):

```
test a_foreground_drag_from_its_window_into_another_window_is_sent_not_refused ... FAILED
  a drag into another window is sent: "the input's point is outside window 2097152; nothing was sent, so it is safe to retry"
test activate_window_answers_once_its_window_is_on_top_so_a_pipelined_click_lands_in_it ... FAILED
  shared: nothing reached the window that covered it
  left: [ButtonPress { button: 1, sent: false }, ButtonRelease { button: 1, sent: false }]
 right: []
```

On the fix wave both pass, with the other foreground tests (6 passed). `activate_window_answers_…` runs in both modes
under the window manager's stand-in (`SlowRaises`): raised 150 ms late, the answer waits for it and the pipelined click
lands in the window; never raised, the answer is the error above at 1 s, and nothing reaches either window.

## The foreground cells again, on the fix wave

| sitting | series | runs | lost | refused | presses before the raise |
|---|---|---:|---:|---:|---:|
| `gtk4-load2` | GTK 4 press_key, click, move, scroll, drag; gnome-text-editor type_text | 180 | 0 | 0 | 0 of 90 |
| `gtk4-idle` | the same, idle | 180 | 0 | 0 | 0 of 90 |
| `others-load2` | Chrome and Electron drags, Firefox click, right click, move, scroll, drag, Qt 5 and Qt 6 scroll | 271 | 0 | 1 | 0 of 240 |
| `others-idle` | the same, idle | 271 | 0 | 1 | 0 of 240 |

Every series reached its 30 consecutive passing runs. The refusal is Firefox's first right click of each series,
`element has no visible bounds in this window`, before anything is sent, on every engine (tech-debt-tracker.md,
2026-11-06). The raise after the activation request: at most 7.6 ms at twice the load, 2.2 ms idle.

## The witness and the audit (`device/`)

Acceptance 8's device cases with the minimized scenes, which call `activate_window` (`--scene device-gtk4,
device-firefox,device-qt,device-chrome,device-chrome-dnd,device-xterm,minimized,minimized-xterm,minimized-recorder
--ops all --blocks 3`, cua alone, idle, private display, no whole-run RECORD): the run is valid and every verdict
passes. Every dedicated foreground case keeps the foreground allowance and audit, 9 of 9; `minimized_activate`
restores and activates the window and answers success; `minimized_activate_withdrawn` still answers the focus error at
the 1 s map bound.
