# M4 T8, task 62's fix wave: the settle by what an input runs, on corrected judges

The review of task 62 found its judges accepting a partial effect, a stale clipboard, late readers, lost inputs set
aside on failed measurements, audits passing on inputs that never ran, and `perform_secondary_action` able to run an
element's primary action under a context action's settle. The design session ruled (2026-11-06): settle each input by
the action it actually runs, split `click` into a coordinate click and an element's primary action, give the families
whose toolkit animates that action their own value, re-measure every method whose value rests on a corrected judge or
reader from the 0 ms control, idle and at twice the load, and confirm the final values on the shipped lane.

Development runs on the #171 VM (8 vCPU), 2026-11-07 UTC, not a release gate. Every sitting ran on a private Xvfb the
experiment (or task 63's `private-run.mjs`, for the device cases) started itself, with Openbox and the run's own
applications, homes and session bus; nothing ran on `:0`. `pgrep -x stress-ng` was empty before each sitting
(`scripts/sitting.sh`, `scripts/engine-stop.sh` refuse otherwise). "Twice the load" is the harness's 16 stress-ng CPU
workers on 8 cores (`--load-factor 2`; load average 16.5 to 17.5 at the sittings' ends). Firefox is the Mozilla deb
unpacked beside task 59's run, first on `PATH`. Each harness is an export of its commit (`scripts/export-harness.sh`).
The engine is one musl build of 0ad17f8f made the release workflow's way (`scripts/build-musl.sh`):
`cua-engine 0.3.0 (0ad17f8f0ed8)`, sha256 `a695199151f1f6d8e23e0aee758acb61070d869c3849cd544d669134ee827e7d`,
static-pie. Its one change is the answer below.

## What an input runs, and its settle

- **The engine names an animated action.** An element's primary action (DoAction index 0, from a left `click` naming
  an element or from `perform_secondary_action` naming the primary action) in a family whose toolkit animates it
  (`families.rs` `animates_primary_action`: GTK 4 and Qt) answers `{"animated_action": "<family>"}`; every other
  answer stays `null`, so the vendor JavaScript sees nothing new.
- **The service settles by it** (`src/services/engine/linux/settle.mjs`, `methods.mjs`): a coordinate click (a right
  click included, an element's too: it presses at the element's point) by `click`; an element's left click by
  `click_element`; a context action by `perform_secondary_action`; and either, where the answer names an animating
  family, by that family's `animated_gtk4` or `animated_qt` (a family the service does not know: the longest).
- **The vendor lets `perform_secondary_action` run the primary action too.** Its `perform_action`
  (`sky_linux_client::x11::accessibility::perform_action`, 0x181800 in 26.928.40906's `sky_linux_x64`) trims the name
  only to refuse an empty one, then compares it with every advertised action from index 0 and runs the match through
  `do_action(..., index)`, index 0 included; its JavaScript (`targets/linux/perform_secondary_action.js`) passes the
  input on unchecked. cua is not the only one that allows it.

## The constants

| settle | task 62 | fix wave | set by (the slowest cell) | why it moved |
|---|---:|---:|---|---|
| `click` | 100 | **25** | gnome-terminal's screen at twice the load | the split: a coordinate click alone; the element actions that held it at 100 have their own |
| `click_element` | – | **10** | Electron's page, idle (0 missed 3 of 34 in the confirmation) | new: an element's primary action in a family that does not animate it |
| `animated_gtk4` | – | **250** | GTK 4's button, idle and at twice the load | new |
| `animated_qt` | – | **125** | Qt 6 at twice the load (Qt 5 held at 100) | new |
| `perform_secondary_action` | 10 | 10 | Electron's page, idle (0 missed 5 of 33 in the confirmation) | – |
| `move` | 10 | **75** | Electron's page on the desktop route, idle and at twice the load | the judge now asks for the complete motion (where the pointer was left), not the first event |
| `scroll` | 10 | **75** | Electron's page, idle and at twice the load | the judge now counts every wheel step, not the first |
| `drag` | 10 | 10 | Electron's page; gedit and xterm at twice the load | – (the judge now asks for the press and the release, the selection settled) |
| `drag_handle` | 10 | 10 | Electron's page; gedit at twice the load | – |
| `activate_window` | 10 | 10 | every family whose window manager's activation the reader sees (GTK 3's scene held at 0) | – (re-measured on task 63's raise wait, with a kept reader) |
| `clipboard_read` | 0 | 0 | – | – (the clipboard now holds another value before each run) |
| `move_relative` | 0 | 0 | – | – |
| `press_key` | 100 | 100 | Electron's page key release, past 100 ms (#302, the declared limit) | – |
| `key_down` | 25 | 25 | Writer and gnome-terminal | – (judge and reader unchanged: confirmed only) |
| `key_up` | 50 | 50 | Chrome's page on the desktop route at twice the load | – (confirmed only) |
| `type_text`, `clipboard_write` | 0 | 0 | – (the engine confirms the paste before it answers) | – (confirmed only) |
| `launch_app` | 100 | 100 | not measured (the trusted wrapper launches in service) | – |

The element-click steps of the animating families (`ANIMATED_STEPS`: 0, then 100 to 400 by 25; misses late of runs):

| cell | idle | twice the load |
|---|---|---|
| GTK 4's button, element click | 0, 100, 125, 150, 175, 200, 225: 31 of 31 each; **250 held** | 0 to 200: 31 of 31 each; 225: 23 of 32; **250 held** |
| GTK 4's button, its primary action named | the same; **250 held** | 0 to 200: 31 of 31 each; 225: 28 of 31; **250 held** |
| Qt 5's scene, element click and named primary action | 0: 31 of 31; **100 held** | 0: 31 of 31; **100 held** |
| Qt 6's scene, element click | 0: 31 of 31; **100 held** | 0: 31 of 31; **100 held** |
| Qt 6's scene, its primary action named | 0: 31 of 31; **100 held** | 0: 31 of 31; 100: 3 of 40; **125 held** |

The ruling's estimates were about 300 for GTK 4 and about 150 for Qt; the searches put them at 250 and 125.

The held step of each settle per family, idle / twice the load (`·` no cell):

| settle | chrome | electron | firefox | gedit | kate | qtcreator | writer | gnome-terminal | xterm | gtk3 | qt5 | qt6 | gtk4 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| click | 0 / 0 | 10 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 10 / 25 | 0 / 10 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |
| click_element | 0 / 0 | 10 / 0 | 0 / 0 | · / · | · / · | · / · | · / · | · / · | · / · | 0 / 0 | · / · | · / · | · / · |
| perform_secondary_action | 0 / 0 | 10 / 0 | 0 / 0 | · / · | · / · | · / · | · / · | · / · | · / · | · / · | · / · | · / · | · / · |
| animated_qt | · / · | · / · | · / · | · / · | · / · | · / · | · / · | · / · | · / · | · / · | 100 / 100 | 100 / 125 | · / · |
| animated_gtk4 | · / · | · / · | · / · | · / · | · / · | · / · | · / · | · / · | · / · | · / · | · / · | · / · | 250 / 250 |
| move | 50 / 0 | 75 / 75 | 0 / 0 | · / · | · / · | · / · | · / · | · / · | · / · | 0 / 0 | 0 / 0 | 0 / 0 | 10 / 10 |
| scroll | 50 / 0 | 75 / 75 | 0 / 0 | · / · | · / · | · / · | · / · | 0 / 0 | 0 / 10 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |
| drag | 0 / 0 | 10 / 0 | 0 / 0 | 10 / 10 | 0 / 0 | 0 / 0 | · / · | · / · | 0 / 10 | · / · | · / · | · / · | 0 / 0 |
| drag_handle | 0 / 0 | 10 / 0 | · / · | 0 / 10 | · / · | · / · | · / · | · / · | · / · | · / · | · / · | · / · | · / · |
| activate_window | 10 / 10 | 10 / 10 | 10 / 10 | 10 / 10 | 10 / 10 | 10 / 10 | 10 / 10 | 10 / 10 | · / · | 0 / 0 | · / · | · / · | 10 / 10 |
| clipboard_read | 0 / 0 | · / · | · / · | 0 / 0 | · / · | · / · | · / · | · / · | · / · | · / · | · / · | · / · | · / · |
| move_relative | 0 / 0 | 0 / 0 | · / · | · / · | · / · | · / · | · / · | · / · | · / · | · / · | · / · | · / · | · / · |

Electron's `click_element` and `perform_secondary_action` held at 0 in the searches and missed at 0 in the idle
confirmation; their 10 is the next step, held 30 of 30 in `confirm/idle/` and in `shipped/load2/`. Every cell with each
sitting's series is in `search/constants.md`.

## The corrected judges and readers (`scripts/linux-engine-diff/action-settle-cells.mjs`, `action-settle.mjs`)

- **The complete effect.** xterm's mode-1000 reports are decoded six bytes each, and a click needs its press and its
  release, a drag its release elsewhere, a scroll one report a step; gnome-terminal's screen must show the last report
  its program echoed; the input page counts wheel notches (the legacy `wheelDeltaY`, 120 a notch) and a scroll needs
  every one; a page's move is judged by where the pointer was left (the page's `at X Y`), not by a count of events (an
  Electron page counted a second move about 160 ms later with no input, most likely Blink's own synthetic move after
  the layout change); an editor's drag and GTK 4's scale are
  judged by the reading the scene settles at (still for 300 ms, polled every 25 ms, at most 2 s), and each drag path
  keeps one settled selection (a run settling elsewhere is invalid).
- **A fresh clipboard.** Each `clipboard_read` run starts with a harness owner serving `stale <trial>`; the word must
  replace it.
- **Readers kept running.** The clipboard and `_NET_ACTIVE_WINDOW` are read by a kept `xprobe reader`, and an
  activation's two reads go out together: a process started for each read began it late by that start.
- **What a run is.** Each run is one of pass, invalid, refused, desktop, late or never (`runClass`); a lost input is
  set aside only on a complete, valid measurement whose every miss was an effect that never came (`lostInput`), and
  none was (`SET_ASIDE` is empty); a method with no measured cell keeps the vendor's 100 (`methodConstants`); a run
  must have deferred the cell's settle (a recording settler); `late_ms` counts from the answer.
- **An audit passes only on inputs that ran** (`auditVerdict`): its runs must pass, not just be clean.
- **Alternation.** Moves, drags and scrolls alternate their points, paths and directions per scene across series, so a
  series' first move is never to where the pointer already is.
- **A scene window wholly on the screen** (`scenes.mjs` `placeOnScreen`): see "The font change" below.

## The sittings

| directory | harness | when (UTC) | what |
|---|---|---|---|
| `search/idle/` | c4ddf9b9 | 01:36–03:49 | every re-measured kind searched from the 0 ms control, idle |
| `search/idle-2/` | 57ef54c9 | 03:51–04:02 | the pages' moves again, on the pointer-position judge (supersedes their rows in `idle/`) |
| `search/load2/` | 57ef54c9 | 04:02–06:16 | every re-measured kind searched from 0, at twice the load |
| `shipped/idle/` | 1225351f | 06:18–08:08 | the confirmation, every cell (132), with audits, idle |
| `shipped/load2/` | 89e09867 | 08:13–10:29 | the confirmation at the final values, every cell, with audits, at twice the load (after the font change) |
| `confirm/idle/` | 89e09867 | 10:36–10:43 | every element action at the final values, idle (after the font change) |
| `firefox/load2/` | 89e09867 | 10:49–11:09 | Firefox again at twice the load: the same refusals (after the font change; superseded by `fitted/`) |
| `device/idle/` | 23d0eb32 | 12:37–12:48 | task 63's device cases of Firefox and of Chrome's drag and drop, once, idle, on the fitted windows (after the font change) |
| `fitted/idle/`, `fitted/load2/` | 23d0eb32 | 12:49–13:26, 13:27–14:17 | Firefox's and Chrome's cells (43) on the shipped lane, on the fitted windows (after the font change) |
| `engine-stop/idle/`, `engine-stop/load2/` | 23d0eb32 | 14:18–14:57, 14:58–15:45 | the burst lane with the ruled control (after the font change) |

`search/constants.md` holds every searched cell's series and the per-family table (`scripts/constants.mjs`). Every
run that is not a pass breaks its series' streak, whatever its class (late, never, refused, invalid, desktop). Beside
the font change's refusals (below), the refused runs were single ones that the series outlived: Firefox's background
right click on an element refused its first run in five sittings (`element has no visible bounds in this window`),
its dedicated one once in each of two loaded sittings, and a Firefox `type_text` once at twice the load (`Paste was
sent once and could not be confirmed`, the engine's own refusal; the text landed). 21,172 settle runs in all, every
one on a desktop left alone where its route requires it: no witness change, no activation request, the front window
still active.

## The confirmation

Every cell at the final values, idle and at twice the load, with an xtrace audit of each background cell's engine
(5 runs, which must also pass: `auditVerdict`):

- **Idle.** `shipped/idle/`: 129 of 132 series reached 30 consecutive, 83 audits passed. The three misses: Electron's
  `click_element` (3 of 34) and `perform_secondary_action` (5 of 33) at 0, both now 10, and 30 of 30 with every other
  element action in `confirm/idle/` (13 series, 13 audits passed); Electron's page key release (`press_key` at 100: 6
  of 37, seen 200 to 226 ms after the answer at the next read), the declared limit #302. Firefox's and Chrome's 43
  cells again on the fitted windows, `fitted/idle/`: 43 of 43, 26 audits passed.
- **Twice the load.** `shipped/load2/`: 125 of 132 reached; 78 of 83 audits passed. The misses: Electron's key release
  on both routes (4 of 44 background, 4 of 38 desktop, seen 232 to 299 ms after the answer: #302), and Firefox's five
  unobscured background cells refused 31 of 31 with their five audits (the font change). `fitted/load2/`: 43 of 43,
  26 audits passed (load average 16.8 at its end).
- **Set aside:** none. Every lost-input candidate of task 62 (GTK 4's dedicated click, scroll and drag at twice the
  load) delivered on the head, which carries task 63's raise wait: GTK 4's dedicated cells held 30 of 30, idle and
  loaded, as did task 63's
  `activate_click` cells (GTK 3's scene, background and dedicated) and every `activate_window` cell on the raise wait.

So every settle's value holds on every cell that takes it, idle and at twice the load, but `press_key`'s on an
Electron page's key release (#302), which no value up to 100 holds and which the value does not change.

## The font change (every sitting from 08:09Z)

The VM's MAWS devenv update (08:09:13–08:10:14Z) installed `fonts-noto-cjk`, `fonts-noto-color-emoji`,
`fonts-noto-mono` and `fonts-noto-core` system-wide (08:09:32Z; fontconfig's cache rebuilt 08:09:34Z). Openbox's title
bar grew from 20 to 22 px, so the 1050x780 Firefox window, placed at the screen's top left, ran 2 px off the 800 px
screen, and `families.rs` refuses Firefox's pointer kinds on the background route unless the window is fully
unobscured: every such cell was refused, 31 of 31, in `shipped/load2/` and `firefox/load2/`, and their audits failed
on it ("5 of 5 runs did not run their input", the audit fix above at work). The fonts stay. The harness now fits every
scene window to the screen by its frame (`placeOnScreen`, `fitted`: the frame's `_NET_FRAME_EXTENTS` and 8 px inside
the 1280x800 screen; `test/linux-engine-diff/fit.test.mjs`): Firefox is asked for 1050x766 and takes 1050x765, its
frame ending at y 791. `shipped/load2/`, `confirm/idle/`, `firefox/load2/` and every later sitting ran after the font
change. Of the scene windows only Firefox's is both framed by Openbox and taller than fits: Chrome and Electron draw
their own frames (no extents; the window at 0,0, so Chrome keeps its 1050x780), and every other family's window is at
most 760 px tall. So the change touched no other cell of `shipped/load2/` or `confirm/idle/`, and `fitted/` re-measures
Firefox (with Chrome, on the same harness) on the shipped lane, idle and at twice the load: 43 of 43 each. Task 63's
device cases that need a window fully visible ran once, idle, on the fitted harness (`device/idle/`, task 63's
`private-run.mjs`): all 29 verdicts passed, Firefox's 12 (`firefox_click_visible_shared` and the offscreen, overlap and
covered cases) and Chrome's 12 drag-and-drop cases (`chrome_dnd_shared`, `chrome_dnd_late_shared`,
`chrome_dnd_late_take_shared`, the in-front ones and the rest) among them, the watchdog clean.

The other session's two read-only ssh sessions into the VM (about 07:58Z and 08:00Z, during `shipped/idle/`)
coincided with no miss: the sitting's misses were all Electron's, its second scene, which ran in its first hour by the
series' order; the cells running near 08:00Z were its last scenes' (GTK 4's and gnome-text-editor's), and every one
held.

## The engine-stop burst lane (`engine-stop/`)

The design session's ruling 1: the control built from the head's own cua, its service and settle included, with only
the REPL host's stop as it was before T7b (`scripts/control-tree.sh`: `src/repl-host/kernel-child.mjs`,
`supervisor.mjs` and `trusted-worker.mjs` from f59575fb, nothing else changed); `press_key` bursts and
`key_down`/`key_up` pair bursts (16 keys) into Chrome's and Electron's windows on the background route, through every
production stop path that carries a burst (`idle` end_task, stdin's `eof`, the supervisor's `signal`, a `remote`
session's DELETE), 10 runs each, idle and at twice the load (load average 17.0 at its end), the control required to
cut (`--require-burst-cut`).

| lane | idle: runs passed | engine after the stop, medians per path (ms) | twice the load: runs passed | medians (ms) |
|---|---:|---|---:|---|
| drain (the head) | 160 of 160 | 285–376 | 160 of 160 | 274–421 |
| control (the stop before T7b) | 160 of 160 | 77–175 | 160 of 160 | 149–336 |

**The control cut nothing: press_key bursts 0 of 80, pair bursts 0 of 80, idle and at twice the load**, every key
landing in order at the field's caret on every path and browser; both sittings fail their verdict on
`--require-burst-cut` for that alone. Why: a burst's cell awaits each input's answer, the engine answers an input only
once it has sent it, and the stop comes straight after the last answer, so at the stop every key of the burst has
already left cua; what a stop could still cut is only what the window had not yet taken from its redirect when the
engine's connection closed. The control's engine never closed sooner than 75 ms after the last answer (idle; 124 ms at
twice the load; medians 86 to 188 and 171 to 358 per path), and the windows had taken every key by then. A settle
defers only the next call, and after a burst's last input there is none, so no spacing of the settle changes this:
the control cannot cut through these paths on this VM, and the drain's proof rests on T7b's held-input control (a key
and a button the control leaves down) and its fault injection, not on this lane. No process was left
stopped after any of the 640 runs.

## Scripts

`scripts/`: `build-musl.sh` (the engine), `export-harness.sh`, `sitting.sh` (one settle sitting), `engine-stop.sh`,
`control-tree.sh` (the burst lane's control), `device.sh` (the device cases on task 63's rig), `constants.mjs` (each settle's constant and every cell's series from the
search sittings), `copy-evidence.py` (the sittings copied here, home paths labelled, files over 512 KiB gzipped).

```bash
node scripts/constants.mjs <harness> search/idle/results.jsonl.gz search/idle-2/results.jsonl.gz search/load2/results.jsonl.gz
```
