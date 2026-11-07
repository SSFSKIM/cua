# M4 T8, task 62: the action settle, per method

cua's Linux service holds the call after a successful input until that input's settle has passed, so the model's
next observation finds the input's effect (`src/services/engine/linux/settle.mjs`, the vendor's `ActionSettler`). Until
T8 every input deferred the next call by the vendor's 100 ms. T8 makes it a constant per method, each the smallest
step whose effects an observation through the service showed, by the design session's wait rule (M4 pre-flight,
2026-11-02): every cell of the method passing 30 consecutive independent runs, idle and at twice the gate's load;
otherwise the shipped value, 100 ms.

Development runs on the #171 VM (8 vCPU), 2026-11-05 to 2026-11-06 UTC, not a release gate. Every sitting ran on a
private Xvfb the experiment started itself, with Openbox and the run's own applications, homes and session bus; nothing
ran on `:0`. `pgrep -x stress-ng` was empty before each sitting (`scripts/sitting.sh` refuses otherwise). "Twice the
load" is the harness's 16 stress-ng CPU workers on 8 cores (`--load-factor 2`; load average 16.2 to 16.6 at the
sittings' ends). Firefox is the Mozilla deb unpacked beside task 59's run, first on `PATH` (task 59's README says why).
Each harness is an export of its commit (`scripts/export-harness.sh`; no `.git`, so the `meta` rows say `commit:
null`). The engine is one musl build of the branch head 51dfdf00 made the release workflow's way
(`scripts/build-musl.sh`): `cua-engine 0.3.0 (51dfdf00042f)`, sha256
`80ff787910f7c6e2fdb71970f9674927b40d8e905c49574c0eab33e53a2c552e`, static-pie. T8 changes no engine source.

## The constants

Task 62's fix wave (`fix/README.md`) re-measured these on corrected judges and split `click` by what it runs; the
service ships its values (the last column). The rest of this README is task 62's first measurement.

| method | vendor | task 62 | fix wave | set by in task 62 (the slowest cell) |
|---|---:|---:|---:|---|
| `perform_secondary_action` | 100 | **10** | **10** | Electron's page, idle |
| `click` | 100 | 100 | **25** (a coordinate click); an element's primary action `click_element` **10**, GTK 4's `animated_gtk4` **250**, Qt's `animated_qt` **125** | GTK 4's element action (its effect about 250 ms after the answer) and Qt 6's at twice the load (about 100 ms, Qt's animated click), at no step up to 100; every coordinate click held at 25 or less (gnome-terminal's screen at twice the load; 10 elsewhere) |
| `clipboard_read` | 100 | **0** | **0** | – |
| `clipboard_write` | 100 | **0** | **0** | – (the engine confirms the paste before it answers) |
| `drag` | 100 | **10** | **10** | Electron's page, idle; xterm at twice the load |
| `drag_handle` | 100 | **10** | **10** | Electron's page, idle; gedit at twice the load |
| `activate_window` | 100 | **10** | **10** | kate and qtcreator at twice the load |
| `move` | 100 | **10** | **75** | Electron's page: held at 0 in the search, missed at 0 in the confirmation (below) |
| `move_relative` | 100 | **0** | **0** | – |
| `press_key` | 100 | 100 | 100 | an Electron page's key release, at no step up to 100 (60 to 150 ms late in about a third of the runs at every step; #302); a key into a text field held at 25 (Writer, gnome-terminal) |
| `key_down` | 100 | **25** | **25** | Writer and gnome-terminal, idle and at twice the load |
| `key_up` | 100 | **50** | **50** | Chrome's page through the desktop route at twice the load |
| `scroll` | 100 | **10** | **75** | xterm at twice the load: held at 0 in the search, missed at 0 in the confirmation |
| `type_text` | 100 | **0** | **0** | – (the engine confirms the paste before it answers) |
| `launch_app` | 100 | 100 | 100 | not measured: in service the trusted wrapper launches (`src/services/sky.mjs`), and every other shape the engine refuses, which defers nothing |

Task 62's held step of each method per family, idle / twice the load (`search/families.md`; the fix wave's is in
`fix/README.md`; `·` no cell, `**none**` a cell
held at no step, `lost` its input never came at any step):

| method | chrome | electron | firefox | gedit | kate | qtcreator | writer | gnome-terminal | xterm | gtk3 | qt5 | qt6 | gtk4 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| press_key | 0 / 75 | **none** / **none** | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 25 / 25 | 25 / 25 | 0 / 10 | · / · | · / · | · / · | 0 / 0 |
| key_down | 0 / 0 | 10 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 25 / 25 | 25 / 25 | · / · | · / · | · / · | · / · | · / · |
| key_up | 0 / 50 | 0 / 0 | 0 / 0 | · / · | · / · | · / · | · / · | · / · | · / · | · / · | · / · | · / · | · / · |
| click | 0 / 0 | 10 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 10 / 25 | 0 / 0 | 0 / 0 | 100 / 100 | 100 / **none** | **none** / **none** |
| perform_secondary_action | 0 / 0 | 10 / 0 | 0 / 0 | · / · | · / · | · / · | · / · | · / · | · / · | · / · | · / · | · / · | · / · |
| move | 0 / 0 | 0 / 0 | 0 / 0 | · / · | · / · | · / · | · / · | · / · | · / · | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |
| scroll | 0 / 0 | 0 / 0 | 0 / 0 | · / · | · / · | · / · | · / · | 0 / 0 | 0 / 0 | 0 / 0 | · / · | · / · | 0 / lost |
| drag | 0 / 0 | 10 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | · / · | · / · | 0 / 10 | · / · | · / · | · / · | 0 / lost |
| type_text | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | · / · | · / · | 0 / 0 | 0 / 0 | · / · | · / · | · / · | · / · | 0 / 0 |
| clipboard_read | 0 / 0 | · / · | · / · | 0 / 0 | · / · | · / · | · / · | · / · | · / · | · / · | · / · | · / · | · / · |
| clipboard_write | 0 / 0 | · / · | · / · | 0 / 0 | · / · | · / · | · / · | · / · | · / · | · / · | · / · | · / · | · / · |
| activate_window | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 10 | 0 / 10 | 0 / 0 | 0 / 0 | · / · | · / · | · / · | · / · | 0 / 0 |
| move_relative | 0 / 0 | 0 / 0 | · / · | · / · | · / · | · / · | · / · | · / · | · / · | · / · | · / · | · / · | · / · |
| drag_handle | 0 / 0 | 10 / 0 | · / · | 0 / 10 | · / · | · / · | · / · | · / · | · / · | · / · | · / · | · / · | · / · |

Every cell, with each sitting's series (step: held, or misses late and never in runs), is in `search/constants.md`.

## The method (`--experiment settle`, `scripts/linux-engine-diff/action-settle.mjs`)

- **Through the service.** Each series makes a fresh `createService` in this process (its engine the build above, its
  settle the lane's) and sends each input as a kernel's call reaches it (`handleRpc`), then reads the effect at once:
  through the same service's `get_window_state` where the window's tree carries it (the input page's status lines, a
  field's value, a counter's name), else, where the tree hides it, the moment the service's own settle ends
  (`settler.wait()`, the instant the next call would reach the engine), through the harness's AT-SPI reader on a kept
  connection (`bus-client.mjs`; `busctl` starts each call about 5 ms late): a caret (a gedit click), a selection (a
  drag), a field whose node has no value (Writer's paragraphs, Firefox and GTK 4 fields), a terminal's screen, the
  clipboard, what xterm's program received, and an activation (the window manager's `_NET_ACTIVE_WINDOW` and the
  frame's ACTIVE state; Chromium reports none).
- **The cells** (118: `action-settle-cells.mjs` `CELLS`). Every input kind each family takes: keys (`press_key`,
  `key_down`, `key_up`), coordinate, element and right clicks, a key then a click on Qt (task 61: the click must not
  activate the window), the context action, moves, scroll, drags and drag handles, `type_text`, the clipboard pair and
  `activate_window`; on the background route in shared mode, covered by the front window (Firefox's pointer kinds and
  Chromium's drags fully unobscured, as `families.rs` requires), on the desktop route with the window active
  (`move_relative`, `drag_handle`, and the other kinds on Chrome, Electron and gedit), and in dedicated mode where the
  family ignores the background route (GTK 4's pointer and key kinds, xterm's keys). Scenes: Chrome, Electron and Firefox
  on the input page (`pages/input.html`) and the matrix page's field; gedit, kate, qtcreator, Writer, gnome-terminal,
  xterm; the new GTK 3 and Qt 5/6 settle scenes (`pages/settle-gtk3.py`, `pages/settle-qt.py`: presses, moves and wheel
  steps in accessible names); GTK 4's button and input scenes and gnome-text-editor. Left out, each with its reason in
  `CELLS`: kinds a family refuses in shared mode (nothing sent, nothing to settle), Qt's paste (always unconfirmed: an
  error, which defers nothing), the clipboard on Electron and Firefox (the engine copies nothing there), an editor's
  right click (another window, a menu), Writer's drag (it selected nothing at all).
- **A run.** Prepared outside its span (a caret parked, a terminal cleared, a key held before a `key_up`, a word
  copied before a `clipboard_write`), read once the scene is still, then the requests and the reading of their effect
  in one witness span. It passes on its answers and its effect, and on the background route on a desktop left alone:
  the witness clean, no activation request, the front window still active. A miss records whether the effect came
  within 2 s (`late`) or never.
- **The lanes and the search.** Every method at one step (`settle-0`, `-10`, `-25`, `-50`, `-75`, `-100`). A search
  sitting runs each cell from 0 ms, the control, and goes to the next step only while none held, 30 consecutive in at
  most 60 (a series stops once it cannot). Each method's constant is the largest held step of its cells across the
  idle and loaded sittings (`methodConstants`; `scripts/constants.mjs`); a cell that held at no step keeps the method at
  100.
- **A lost input is set aside** (`lostInput`): a cell whose every miss at every step, 100 included, was one whose effect
  never came. A settle only delays the reading; it cannot bring an effect that never comes, so such a cell says nothing
  about the settle. Three, all at twice the load, GTK 4's dedicated click, scroll and drag (below).
- **The confirmation.** A sitting of the shipped constants (`--lanes shipped`) over every cell, idle and at twice the
  load, with an xtrace audit of each background cell's engine (5 runs). Where it missed at the value the search gave, the
  method went to the next step that held 30 consecutive, idle and at twice the load, in a sitting of its own
  (`confirm/`).

## The sittings

| directory | harness | what |
|---|---|---|
| `search/idle/` | cb4f1981 | every cell, searched, idle |
| `search/idle-2/` | 39bb38fd | the editors' drags again (a press inside the last selection started a drag and drop: the selection now cleared first), and the new page-field keys |
| `search/idle-3/` | 5efbbe58 | the editors again; superseded by `idle-4` (the text's growth scrolled gedit's view sideways, so the desktop route missed the first line) |
| `search/idle-4/` | bdf2a0c0 | the editors on the final harness |
| `search/load2/` | 39bb38fd | every cell, searched, at twice the load |
| `search/load2-2/` | 425ea086 | gedit and GTK 4 again (the window's place read before each desktop run) |
| `search/load2-3/`, `load2-4/` | 5efbbe58, bdf2a0c0 | the editors, as `idle-3` and `idle-4` |
| `shipped/idle/`, `shipped/load2/` | 3c10889a | the confirmation of the constants as first set, with the audits |
| `confirm/idle/`, `confirm/load2/` | 3c10889a | Electron's move and xterm's scroll at 10 to 100 ms |
| `engine-stop/idle/` | c6dd4c3d | T7b's burst lane with its control on the final service |

A later sitting of a cell at the same load supersedes an earlier one (`scripts/constants.mjs`); the superseded rows stay
for the record. In all, about 27,000 runs, 17,000 of them on the background route: none changed the desktop (no witness
change, no activation request, the front window always still active), the Qt key-then-click cells included, and every
audit (80 cells a sitting, idle and at twice the load) found no forbidden request.

## The 0 ms control

Where a method settles above 0, its control missed in the cells that set it (late effects, every one): Electron's
context action 3 of 40, drag 9 of 35, drag handle 8 of 33 (idle); kate's and qtcreator's activation 9–12 of 31–36 at
twice the load; Writer's and gnome-terminal's key_down 16 of 32 and 31 of 31 (the terminal's echo comes back about 50
ms after the key); Chrome's key_up on the desktop route 8 of 33 at twice the load, and 3 each at 10 and 25. Electron's
move and xterm's scroll held at 0 in the search and missed at 0 in the confirmation (4 of 37 idle, and once at load;
7 of 31 at load), and held 30 of 30 at every step from 10, idle and at twice the load.

## The confirmation (`shipped/`)

118 series a sitting. Idle, 115 reached their 30: the misses are Electron's page key release (`press_key` at 100: 10 of
33), GTK 4's element click (`click` at 100: 31 of 31, its effect about 250 ms after the answer) and Electron's move at
0 (now 10). At twice the load, 110: the same two `press_key` and `click` limits (Electron's key release on both routes,
Qt 5's element click 3 of 50, GTK 4's element click), xterm's scroll at 0 (now 10), and GTK 4's three dedicated pointer
cells, whose input never came in 8 to 16 of 31–34 runs (set aside; tech-debt-tracker.md: the foreground route waits
for the focus, not the raise). Every audit was clean.

## What it saves

The call after an input waited 100 ms after every input. Now it waits nothing after `type_text`, `clipboard_read` and
`clipboard_write`, a move by `move_relative`; 10 ms after a context action, a drag, a drag handle's step, an
activation, a move and a scroll; 25 after `key_down`, 50 after `key_up`. `click` and `press_key` keep their 100.

## T7b's burst lane, carried to T8 (`engine-stop/idle/`)

The fix wave ran it again with the control the design session ruled (the head's service with only the stop from
before T7b), idle and at twice the load, on Chrome and Electron: `fix/README.md`. What follows is task 62's sitting.

The brief asked for the engine-stop burst lane with its control again once T8 shortened the spacing between a burst's
keys, the control required to cut where the drain holds (`--cases burst --require-burst-cut --trials 10`). T8 keeps
`press_key` at 100 ms, so the spacing is unchanged, and the control cut nothing: **drain 40 of 40, the control 0 of 40
cut**, on every path (the engine lived 83–175 ms after the kill began in the control, 289–372 ms in the drain, medians
per path). The sitting's verdict fails on `--require-burst-cut` for that reason alone. A further limit of this control:
its lane runs `cua serve` from the control checkout (f59575fb) whole, its own service and settle included, so even a
shortened `press_key` on the head would not reach the control's burst; a control that can cut needs the head's service
with the stop as it was before T7b.

## Scripts

`scripts/`: `build-musl.sh` (the engine), `export-harness.sh`, `sitting.sh` (one settle sitting), `engine-stop.sh`,
`constants.mjs` (each method's constant and every cell's series from the search sittings' results), `families.mjs`
(the per-family table), `copy-evidence.py` (the sittings copied here, home paths labelled, files over 512 KiB gzipped).

```bash
node scripts/constants.mjs <checkout> search/idle/results.jsonl.gz search/idle-2/results.jsonl.gz search/idle-3/results.jsonl.gz search/idle-4/results.jsonl.gz search/load2/results.jsonl.gz search/load2-2/results.jsonl.gz search/load2-3/results.jsonl.gz search/load2-4/results.jsonl.gz
```
