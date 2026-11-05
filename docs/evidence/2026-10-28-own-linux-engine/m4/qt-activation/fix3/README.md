# Task 61, fix 3: no acknowledgement outlives its press

The bounded re-review of fix 2 found that a multi-click's later press reused the request's cached acknowledgement
without reading Qt's state. When the person focused another window of the same Qt application during the first
click's hold, the second press activated the target. The design session ruled the fix structural: every press gets an
acknowledgement valid for that press alone, as a token the press consumes, and a source test holds the rule.

Everything here ran on private Xvfb displays, never on `:0`.

## The rule as built (commits b499b80b, 028b57e3)

- `focus_ack::press_ack` is the one function that issues a `PressAck`. On a background session it reads the press's
  recipient and Qt's state again, just before that press (`FocusAck::check`, which is private).
- `PressAck` is built only in `focus_ack`, is neither `Clone` nor `Copy`, and is spent by value by `Route::press` and
  `Session::press`, the only ways to press.
- `Session::press` refuses a token taken for another window, point or press (the session's press count).
- `tests/press_boundary.rs` holds the rest from the source, each rule with a negative control.

The press paths, every one routed through it, at b499b80b:

| Press | Token issued | Token spent |
|---|---|---|
| coordinate click, every press of a multi-click | `src/engine/pointer.rs:487` | `src/engine/pointer.rs:198` (`click_once`) |
| drag's press, plain | `src/engine/pointer.rs:718` | `src/engine/pointer.rs:307` (`drag_along`) |
| drag's press, Chromium's atomic press | `src/engine/pointer.rs:718` | `src/engine/pointer.rs:154` (`atomic_press`) |
| element right click | `src/engine/elements.rs:215` | `src/engine/elements.rs:218` |
| paste's focusing click (each of at most two) | `src/engine/paste.rs:337` | `src/engine/paste.rs:342` |
| scroll, each wheel step (asks no toolkit) | `src/engine/pointer.rs:960` | `src/engine/pointer.rs:962` |
| the presses themselves | – | `src/route.rs:455` (`Route::press`), `src/input.rs:518` (`Session::press`) |

The one press outside the token: `drag_handle`'s XTEST press, `src/engine/pointer.rs:900`. It is the desktop route's,
names no window, and its lifecycle is T17's (#250). The boundary test allows it by name and catches any other XTEST
press.

## Evidence

- **RED, the reviewer's case as a live test** (`tdd/red-live-synthmulti.txt`): on fix 2's musl build (d1ea56ce), the
  second press took the X focus from B 5 of 5 (Qt 5; the test stops at its first lane).
- **RED, the press boundary on fix 2's sources** (`tdd/red-press-boundary.txt`): it reports `before_press` in three
  files, no `PressAck`, a `ButtonPress` built outside `send_button`, and no `Session::press`.
- **GREEN** (`tdd/green-live-synthmulti.txt`, and the suites): 5 of 5 on Qt 5 and Qt 6; B keeps the X focus, and both
  presses land.
- **The reviewer's own probe** (`scripts/review-probe.sh` over the reviewer's `probe-fix2.py synthmulti`). The probe's
  `activated` flag compares the focus with its front window, which the case itself moves to B, so read `after`
  against `main` (A) instead.
  - Fix 3 (`review-probe/fix3-b499b80b.txt`): `after` is B in every run, 6 of 6 double clicks and 6 of 6 one-click
    controls, Qt 5 and Qt 6. At press 2 the X focus is B.
  - Fix 2 (`review-probe/fix2-d1ea56ce.txt`): the double click left the focus on A (Qt 5 and Qt 6), while the
    one-click control kept B.
- **Suites on b499b80b** (`suites/`):
  - fmt and clippy are clean.
  - Unit 369 (1 ignored), live 19, live_device 24, live_focus_ack 14, live_focus_out 20, live_minimized 6,
    launcher_shim 15, press_boundary 2, send_boundary 5, no_text_mutators 3, identity_boundary 2.
  - The harness: 736 of 736.
  - `live_focus_ack` on the musl build: 14 of 14 (`build-b499b80b.txt`, sha256 `740a12d7…4dd4403`).
