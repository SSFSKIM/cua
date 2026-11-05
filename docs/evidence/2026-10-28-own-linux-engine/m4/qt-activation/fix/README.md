# M4 task 61, the fix: the design session's rulings and the review

Task 61 built a wait before a background press to a Qt window (`native/linux-engine/src/focus_ack.rs`): in shared mode
the press waits for the window's AT-SPI frame to report `active`, Qt's own focus state. Its review (reviewer-medium)
found two holes, each reproduced on Qt 5.15.13 and Qt 6.4.2, and the design session ruled on task 61's open concerns
(2026-11-05): (A) refuse background input to a Qt window its modal dialog blocks, after measuring the same probe on GTK
3, GTK 4 and Chromium; (B) find Qt with no accessibility bus through `_NET_WM_PID` and `/proc/<pid>/maps`, and refuse
its presses; (C) the 25 ms margin and the 100 ms key-then-click cost, written by the design session. This directory is
the fix's evidence. Every sitting ran on a private Xvfb (with no window manager, or with Openbox where named) and a
private session bus, every application in a scratch home; nothing ran on `:0`. `pgrep -x stress-ng` was empty before
each sitting. Engines:

| engine | `--version` | sha256 | used by |
|---|---|---|---|
| c595f4f6, task 61 as reviewed (engine sources as 0f046b66), musl the release workflow's way | `cua-engine 0.3.0 (c595f4f67c7b)` | `310341733f2801e1033ec78c5b3289c850b4753094eb612b3c873e8110d763a4` | every "before" lane, the RED runs, the family measurement (`modal/`) |
| aa2c43d2, the fix, musl the release workflow's way (`scripts/build-musl.sh`) | `cua-engine 0.3.0 (aa2c43d272ea)` | `37c6435bbbdbfccf756f5e83e79b4165cc2fa0b493fc42712aff5673bde707ac` | every "after" lane, `live/`, `load2/` |

The scripts are in `scripts/` (labels: `<task61fix>` is the fix's work directory, `<checkout>` the shared checkout).

## P1 1: a press onto a native child (`native-children/`)

The engine's background press goes to the deepest X window under its point (`input.rs`), and Qt's press handler
compares that window's own `QWindow` with `QGuiApplication::focusWindow()`, which is the top-level's. A native child (a
widget with `WA_NativeWindow`, and every ancestor Qt then makes native) is never Qt's focus window, so Qt asks to focus
it on every press; `requestActivate` on a child window sets the X input focus to it. The frame's `active` reports the
top-level only, and nothing on the bus reports a child's: Qt's check for a child cannot be observed exactly, so it is
not modelled (the design session's ruling). In shared mode a press whose recipient at its point is not the target window
itself is refused, nothing sent: "`<app>` gives a native child window of its own the input focus on a press at that
point, so a background press there would move the desktop's focus (use an element action, or a dedicated desktop);
nothing was sent, so it is safe to retry". The check reads the same descent the press would take (`Session::recipient`),
sending nothing, before the pointer is placed.

How often a press lands on one (`native-children.jsonl`, `summary.txt`; `scripts/native-children.sh`): every Qt
application on the #171 VM, each on its own Xvfb with Openbox, its visible windows sampled on a 40 × 30 grid, 8 s after
they mapped:

| application | toolkit | windows | points on a native child |
|---|---|---|---|
| kate | Qt 5 | 1 | 0 of 1,200 |
| keditbookmarks | Qt 5 | 1 | 0 of 1,200 |
| qtcreator | Qt 6 | 1 | 0 of 1,200 |
| assistant | Qt 6 | 1 | 0 of 1,200 |
| designer | Qt 6 | 2 (its main window and its New Form dialog) | 0 of 2,400 |
| linguist | Qt 6 | 1 | 0 of 1,200 |
| pixeltool | Qt 6 | 1 | 0 of 1,200 |
| qdbusviewer | Qt 6 | 1 | 0 of 1,200 |
| the review's reproducer (a QPlainTextEdit whose viewport is native), the control | Qt 5, Qt 6 | 1 each | 988 of 1,200 each (82.3%) |

So the refusal costs nothing measurable in the installed applications: none of their windows has a viewable native
child. It refuses what the review reproduced.

## P1 2: a reused session's stale focus

A session a hold keeps open is reused, and one opened while the real focus was within its window synthesized no
`FocusIn`. Task 61's gate read that snapshot (`focus_was_within`), so after the person moved the focus away the press
went with no synthetic focus and no wait. Now the real focus is read before every press (`focus_ack::need`): within the
window, Qt's focus window is the window and nothing is waited for; a synthetic focus held, its `active` is waited for
as before; neither (the review's case), the session takes a synthetic focus then, as a fresh session does: the earlier
focus let go (Qt's 100 ms count-down after the person's `FocusOut`), the `FocusIn`, its `active` waited for. The
session's end then sends the `FocusOut`. Chosen over a refusal because it is exactly the protocol a fresh session runs,
so the held key's request keeps working (shift+click into a background Qt window after the person left it) at the cost
of one wait; `--stats` `focus_ack.refocused` records it.

## Ruling A: a window its modal dialog blocks (`modal/`)

**The family measurement first** (`modal-probe.txt`, `modal-probe-chrome.txt`; `scripts/modal-probe.sh`): each
family's main window blocked by a modal dialog of its own (transient for it, `_NET_WM_STATE_MODAL`, both verified with
`xprop`), a front window of the probe's holding the focus, then a background input to the main window through the
engine before the fix; 3 controls with nothing sent, then 5 inputs, each from a fresh engine:

| family | input | no window manager | Openbox |
|---|---|---|---|
| Qt 5 (PyQt5) | `press_key` | **5 of 5** to the dialog | **5 of 5** (focus and active window) |
| Qt 6 (PyQt6) | `press_key` | **5 of 5** | **5 of 5** |
| GTK 3 (PyGObject) | `press_key` | 0 of 5 | 0 of 5 |
| GTK 4 (PyGObject) | element click (its only background input in shared mode) | 0 of 5 | 0 of 5 |
| Chrome (its own profile; its file chooser, a GTK dialog of another X client) | `press_key` | 0 of 5 | 0 of 5 |

Only Qt moves the focus, so the refusal is Qt's alone (`families.rs` `relays_focus_to_modal`), as ruled. Every
control kept the front window. The same probe on the fix (`modal-probe-after.txt`): Qt 5 and Qt 6 refused 10 of 10
each with the sentence, the focus kept; GTK 3, GTK 4 and Chrome sent 10 of 10 each, unchanged, the focus kept.

**The refusal.** Qt's `relayFocusToModalWindow`, called from `doFocusIn` and `doFocusOut`, asks for the modal window's
activation whenever the blocked window gets a focus event, so the session's synthetic `FocusIn` alone does it, for any
input kind. In shared mode, a Qt window (by its toolkit, or by its process's map, ruling B) with a shown modal
transient of its own X client is refused before anything is sent: "`<app>` window `<id>` is blocked by its modal
dialog, window `<dialog>`, which takes the desktop's focus on background input to the window; nothing was sent: send
the input to the dialog, or use a dedicated desktop". Dedicated mode is unchanged.

- *Which inputs.* The minimized refusal's set (`engine.rs` `input_window`), each of which opens the window's input
  session and so its `FocusIn`: `press_key`, `key_down`, `click` (coordinate and element), `move`, `scroll`, `drag`,
  `perform_secondary_action`, `type_text`, `type_characters`, `clipboard_write`, and `clipboard_read` (its Copy is an
  AT-SPI call, but a Copy that opened a context menu closes it with an Escape through the session). Releases are
  exempt and always run (`key_up`, `clipboard_release`, `drag_handle`'s end), as M3's rule has it; reads and
  `activate_window` are not input to refuse. Input to the dialog itself goes: it is not blocked.
- *How it is found, each request.* `X11::modal_transient_of`: the window manager's client list (one `GetProperty` on
  the root; with no window manager, the root's children), filtered to the target's own X client by its resource-id
  base (a Qt application's dialogs share its connection), then for those candidates `_NET_WM_STATE`, `WM_TRANSIENT_FOR`,
  the map state and `WM_STATE`, pipelined: two round trips, only for a Qt window in shared mode (the family is cached
  per window). A candidate counts when modal, transient for some window (its parent, or its group's leader for an
  application-modal dialog), and viewable or iconic (Qt still counts a minimized dialog as blocking). A dialog that
  blocks a sibling window of the same application counts too: X11 does not tell window-modal from application-modal,
  so this refuses more, never less; nested modal dialogs refuse input to the lower one as well.
- *A dialog that maps while a request runs* is not seen by that request: the check is at its start. When the request's
  own click opened the dialog, Qt itself asks for the new modal window's activation as it shows it
  (`QXcbWindow::show`, `requestActivateWindow` for the application's modal window): `opener.txt`
  (`scripts/opener-probe.sh`, a button that opens a modal dialog, clicked in the background through the fix) shows the
  dialog taking the focus and the active window 5 of 5 on Qt 5 and Qt 6, with and without Openbox. That is the
  application's own answer to the click, which no check before the click can know is coming, the same for any
  toolkit that activates a window it opens; it is a declared limit, not covered. The next request sees the dialog and
  is refused. A dialog mapped by the application between the check and the session's `FocusIn` (milliseconds) is the
  remaining race.

**On real applications** (`modal-apps-before.txt` for kate, whose Qt Creator lane failed on a probe-script bug, a
case pattern that ran the PyQt fixture for it, rerun as `modal-apps-before-qtcreator.txt`; `modal-apps-after.txt`;
`scripts/app-modal.py`): kate's and Qt Creator's Open dialog (Ctrl+O on the private display, before the front window
took the focus), Openbox:

| | kate (Qt 5) | Qt Creator (Qt 6) |
|---|---|---|
| before (c595f4f6) | 5 of 5 background keys activated the dialog | 5 of 5 |
| the fix (aa2c43d2) | 0 of 5, each refused with the sentence | 0 of 5, each refused |

## Ruling B: Qt with no accessibility tree (`sandbox/`, `props/`)

Built as ruled: a window no listed family names (so no `ToolkitName` was read) whose `_NET_WM_PID` process maps
`libQt5Core.so` or `libQt6Core.so` (`families::maps_qt`: the two names looked for, line by line; no line is kept,
logged or reported) is Qt; its presses in shared mode are refused ("`<app>` is a Qt application with no accessibility
tree on the bus, so cua cannot see it take the background focus, and a press could activate its window (turn its
accessibility on and restart it, or use a dedicated desktop); nothing was sent, so it is safe to retry"), and the modal
refusal covers it. Keys still go. An unreadable map leaves the toolkit unknown: allowed.

**What the measurement adds** (`sandbox/sandbox-proc.txt`, `scripts/sandbox-proc.mjs`): in service the engine runs
inside the trusted worker's sandbox, `codex-linux-sandbox`'s bubblewrap with its own PID namespace and its own `/proc`.
Run there as cua runs it (the worker role's profile, scoped and default), `/proc` lists 4 to 5 processes and the map of
a process outside the sandbox is unreadable. `_NET_WM_PID` names a host pid, so inside the sandbox every application's
map is unreadable, and the ruled detection always falls to "unknown": it works for an engine run outside the sandbox
(the harness, the live tests), not in a cua session. That is for the design session (the fix's report).

A candidate that reaches the sandbox, measured (`props/props.txt`, `scripts/props.sh`): Qt's xcb backend puts
`_XEMBED_INFO` (version 0, flags mapped) on every window it creates. Every Qt top-level surveyed carries it (PyQt5,
PyQt6, kate, keditbookmarks, qtcreator, designer's two windows: 7 windows, Qt 5 and Qt 6), and no other family's top-
level does (GTK 3, GTK 4, gedit, gnome-text-editor, xterm, Chrome, Writer's two windows, gnome-terminal: 10 windows).
Not built: it replaces the ruled mechanism, which is the design session's call.

## The wait still holds at twice the load (`load2/`)

The press now reads its recipient and the real focus between the session's `FocusIn` and the frame's wait, and every
window input to a Qt window looks for a modal dialog. The qt-activation experiment (harness c595f4f6, unchanged since;
the fix's musl build; `--load-factor 2`, 16 stress-ng workers on 8 cores), 30 independent runs a cell:

| | click | key-click | drag |
|---|---|---|---|
| kate, the fix | 30 consecutive, 0 activated, 0 refused; answered 30.1 ms median | 30 consecutive; 151.2 ms | 30 consecutive; 23.0 ms |
| kate, control (`--focus-ack-ms 0`) | activates 5 of 30 | 3 of 30 | 4 of 30 |
| qtcreator, the fix | 30 consecutive, 0 activated, 0 refused; 32.8 ms | 30 consecutive; 137.2 ms | 30 consecutive; 19.8 ms |
| qtcreator, control | activates 4 of 30 | 1 of 30 | 7 of 30 |

Against task 61's `final/load2` (click answered 30.1 and 35.2 ms median, key-click 143.8 and 138.8, drag 21.0 and
22.9) the added reads cost nothing beyond the sitting's spread. The focus wait's own maximum was 20.2 ms (25 ms
bound).

## The regressions (`tdd/`, `live/`)

`native/linux-engine/tests/live_focus_ack.rs`, each on Qt 5 and Qt 6 (`tests/support/qt-late.py` gained the `native`
and `modal` modes):

| test | before the fix (c595f4f6) | the fix |
|---|---|---|
| `a_background_press_onto_a_native_child_of_a_qt_window_is_refused_with_nothing_sent` (the review's reproducer; its control, the gate off, takes the focus) | the click answered success and took the X focus 10 of 10 | refused 10 of 10, nothing pressed; the control takes it |
| `a_click_on_a_held_session_the_real_focus_has_left_takes_a_fresh_focus_first` (the review's sequence) | took the X focus 5 of 5 | 0 of 5, every press reached the editor |
| `background_input_to_a_qt_window_its_modal_dialog_blocks_is_refused_in_shared_mode` (keys and clicks; input to the dialog goes; dedicated mode, the control, hands the focus to the dialog) | the first key handed the X focus to the dialog | refused 6 of 6 with the sentence, the focus kept |
| `a_background_press_to_a_qt_window_with_no_accessibility_tree_is_refused_in_shared_mode` | took the X focus 8 of 10 | refused 10 of 10, nothing pressed; a key goes |

`tdd/red-live.txt` is the four failing on c595f4f6 (`CUA_ENGINE_BIN`; each stops at its Qt 5 lane);
`tdd/green-live.txt` passing on the fix, both bindings; `live/live-focus-ack-musl.txt` all ten of the file on the
fix's musl build.

## The suites (`suites/`)

- Engine, cargo's live build as the gate runs it (`scripts/live.sh`, a private Xvfb and session bus): unit 366 (1
  ignored), live 19, live_device 24, live_focus_ack 10, live_focus_out 20, live_minimized 6, launcher_shim 15,
  send_boundary 5, no_text_mutators 3, identity_boundary 2, all passing. `cargo fmt --check` and clippy
  `--all-targets --features live -D warnings` clean.
- Harness, `npm run test:linux-engine-diff`: 736 of 736.
