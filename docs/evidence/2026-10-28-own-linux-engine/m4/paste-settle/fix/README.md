# M4 T7, task 60's fix: the design session's rulings and the review

The design session's rulings on task 60 (2026-11-05):

1. The late-take Escape precedes its drag's `FocusOut` again, by construction: a drag's session stays focused until
   its armed late-take watch ends, 300 ms at most, for drags only.
2. Click-then-paste is measured on task 59's 8 families, idle and at twice the load, by the wait rule at 0, 25, 50, 75
   and 100 ms. If a family needs a settle, the paste's settle follows clicks too, with S from that measurement.
3. The Qt burst cost at twice the load is a stated cost (task 60's report); nothing changes.

The review (reviewer-medium) found a paste right after a focusing click observing the field the click left (ruling 2's
case), and the paste control's audit running with the wrong flags.

Development runs on the #171 VM (8 vCPU), 2026-11-05 UTC, not a release gate. Every sitting ran on a private Xvfb the
harness (or the probe) started itself, with Openbox and the run's own applications, homes and session bus; nothing ran
on `:0`. `pgrep -x stress-ng` was empty before each sitting (`scripts/sitting.sh` refuses otherwise); twice the load is
the harness's 16 stress-ng workers on 8 cores (`--load-factor 2`). Firefox is the Mozilla deb beside task 59's run.
Each harness is an export of its commit (`scripts/export-harness.sh`). Engines are musl builds made the release
workflow's way (`scripts/build-musl.sh`):

| build | `--version` | sha256 | used by |
|---|---|---|---|
| ae92249b | `cua-engine 0.3.0 (ae92249b8256)` | `99848477149d0e9afaf3a28c827740a6b3ba0f29d196b4c5d5309defbbc51a26` | `click-paste/`, `click-field/` (the click settle set by `--paste-click-settle-ms` per lane) |
| 397b2191 | `cua-engine 0.3.0 (397b21913d20)` | `a941fc3258620382f13c212d3064c7b46fca60519d1561f1b42a6b01e510de91` | `shipped/`, `review-probe/`, `device-dnd/`, `qt-activation/` (fix) |

397b2191's engine is the code the branch head ships: later commits change comments, the harness and evidence only.

## Ruling 2: click-then-paste, by the wait rule

Two scenarios of the focus-timer experiment (harness README, `--scenarios`), each run a fresh engine's, pipelined, T7's
measurement rules (independent starts, 30 consecutive in at most 60, raw counts beside them):

- `click-paste`, every family: the caret put at the field's end first (a fresh engine's Ctrl+End), then a click at
  the field's first character and a `type_text` with no element; the paste must land at the text's start, confirmed.
  A terminal's recorder reports the click, so there the paste must follow the click's mouse reports.
- `click-field`, Chromium's keys page (the review's own case): the focus in the page's field, a click at the first
  character of its other field, then the paste; it must land in the field clicked, the first field unchanged. The page
  spends 3 ms on each press, as it does on each key.

Firefox cannot have either case (`firefox-click-probe.txt`): shared mode refuses a background click to a covered Gecko
window with nothing sent, and with the window fully unobscured the click is taken but moves no caret (three clicks
inside the textarea and an element click, each key typed after them landing at the end). Gecko also answers no
extents for the field. The other families' scenes have one text field a window, so `click-field` is Chromium's.

| sitting | lanes | result |
|---|---|---|
| `click-paste/idle`, `click-paste/load2` (harness d43e5c10) | `click-0` | held on all 7 families, idle and at twice the load (gnome-terminal idle: 2 refused in 48, then 30 consecutive) |
| `click-field/zero-idle`, `click-field/zero-load2` (harness 4180c291) | `click-0` | idle held on Chrome and Electron; at twice the load **Electron 3 of 60, not reached** (each refused: the observation read the field the click left), Chrome held |
| `click-field/steps-idle`, `click-field/steps-load2` | `click-25` to `click-100` | every step held on both, idle and at twice the load, no miss |

So a family needs a settle after clicks, and **S = 25 ms**, the smallest step that held everywhere
(`settle::PASTE_CLICK_SETTLE`). Every row: `verdicts.md`.

**The engine as it ships** (`shipped/idle`, `shipped/load2`, harness 2358aa9b, engine 397b2191): both scenarios, every
applicable family, 30 consecutive with no miss, idle and at twice the load. The settle waited a median of 22–24 ms per
series, the click 1–3 ms before the paste: that is what a paste right after a click now costs. A paste with no click
to its window within 25 ms waits nothing for it. Idle every audit is clean. At twice the load the kate and qtcreator
audits are not, for a reason that is not this fix's (below). `shipped/first-*` is the first such sitting (harness
397b2191): its `click-field` audit runs, after 30 series runs, missed because the page's small other field had scrolled
and the click's point left it; the harness now empties that field before each run.

## The review's probe (`review-probe/`)

The review's probe (`scripts/review-probe.mjs`, its page and steps unchanged): Chrome with two textareas, the focus put
in A by GrabFocus, B's `mousedown` handler spending 50 ms; a click into B and a paste with no element, a fresh engine
per run, 10 runs per engine. As the review ran it (`focused/`, GrabFocus leaving Chrome the X focus) and with the
front window focused again before each run (`background/`, `--front`):

| engine | focused | background |
|---|---|---|
| before task 60 (40b1e163, T7's flush) | 10/10 confirmed in B | 10/10 |
| task 60 (5570d064) | 0/10: 9 landed in B unconfirmed, 1 refused | 0/10: 9 unconfirmed, 1 refused |
| the fix (397b2191, 25 ms) | 10/10 confirmed in B | 10/10 |

Its engine-side regression is `live_focus_out`'s `as_shipped_a_paste_right_after_a_click_to_its_window_waits_out_the_click_settle`
(`tdd/`: 1.2 ms against 1.2 ms before the fix).

## Ruling 1: the late-take Escape inside its drag's session

`device-dnd/` (`scripts/device-dnd.sh`, scene `device-chrome-dnd`, `--ops all --blocks 3`, engine 397b2191): every
case's verdict passes, `chrome_dnd_late_take_shared` 9 of 9 (the drag answered as a plain drag, the next request
answered the late notice, its Escape at 0.8–2.6 ms after the release). The drag's stats line has no `focus_out`: its
session's `FocusOut` is held back for the watch. The order itself, the watch's Escape and then the drag's `FocusOut`
with the exit's order (release, the watch runs out, the `FocusOut`s, the settle), is proven on the engine's live
tests (`tests/live_device.rs`; `tdd/`).

## Discovery: a background click activates Qt at twice the load (`qt-activation/`)

At twice the load the front window stops being the active one after a background click to kate or qtcreator, from the
first runs on (`front_active` in each click run's row): 27 of 30 on kate and 28 of 30 on qtcreator in `shipped/load2`,
none idle. The engines before task 60 and task 60's do the same (`qt-activation/`, 10 runs on kate each: 10 and 9).
So a Qt window takes the X focus and becomes active, and the audits then see input with no synthetic-focus session
(`input outside a session`), which fails them closed. It is not this fix's, nor task 60's. It changes the person's
desktop in shared mode, so it goes to the design session. Task 61 settled it: a background press to a Qt window now
waits for Qt's focus (`../../qt-activation/`).

## Files

- Each sitting's `results.jsonl`, `summary.md`, `watchdog.jsonl`, stdout and the applications' stderr, home paths
  labelled (`scripts/copy-evidence.py`); `verdicts.md` (`scripts/verdicts.py`).
- `tdd/`: the failing-first and passing runs of the new tests.
- `scripts/`: the builds, the exports, the sittings' drivers, the probe, the tables' scripts.
