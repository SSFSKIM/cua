# M4 task 61: a background press activates a Qt window at twice the load

Task 60's fix found that at twice the gate's load a background click to kate or qtcreator made the front window lose
its active state (27 of 30 and 28 of 30 runs), never idle. In shared mode cua must never change the person's desktop,
and the active window is part of it. The design session ruled (2026-11-05): measure the pinned vendor build and 0.3.0
at twice the load with an idle control; if a Qt-only wait for the synthetic `FocusIn` before the press exists, take its
value by the wait rule; else refuse Qt's background clicks in shared mode; a declared limit only if neither holds.

**Outcome: the wait exists, and it is Qt's own state, not a time.** A background press to a Qt window waits, in shared
mode, until the window's AT-SPI frame reports `active`, at most 25 ms (`native/linux-engine/src/focus_ack.rs`). At twice
the load it held 30 consecutive runs of every pressing kind on both Qt apps with no activation and no refusal; with the
wait off, the same runs activated the window. The vendor's pinned build and 0.3.0 activate it too: it is inherent to
the X11 background route.

Development runs on the #171 VM (8 vCPU), 2026-11-05 UTC, not a release gate. Every sitting ran on a private Xvfb the
harness (or the probe) started itself, with Openbox (the live tests and the modal probe: no window manager) and the
run's own applications, homes and session bus; nothing ran on `:0`. `pgrep -x stress-ng` was empty before each sitting
(`scripts/sitting.sh` refuses otherwise); twice the load is the harness's 16 stress-ng workers on 8 cores
(`--load-factor 2`). Each harness is an export of its commit (`scripts/export-harness.sh`; the exports have no `.git`,
so `results.jsonl`'s `meta.commit` is null and the commit is the one named here). Engines:

| engine | `--version` | sha256 | used by |
|---|---|---|---|
| the pinned vendor build 26.928.40906, `sky_linux_x64` | – | `7ac3c2ae45a3dacc9209063e91d2df4ea9f206b814a9ffd976f5bcf90d73f1cd` | every `pinned` lane |
| cua's released 0.3.0, the pinned asset | `cua-engine 0.3.0 (cd4c929758ca)` | `5f4a1600e66b7f7b458948462fc4701942583af9674ad41798188d1312687b60` | every `released` lane |
| 6dbc0057, the branch before task 61, musl the release workflow's way (`scripts/build-musl.sh`) | `cua-engine 0.3.0 (6dbc0057603f)` | `8931fa108de6dcbcc2252709f9d58bf126486676a0c9ca291dc351e3df4d7c8c` | `compare/` (`shipped` there is this engine), `mechanism/`, `focus-timer/click-paste-load2-before/`, the live tests' RED |
| 98af352a, the wait with its bound set per lane | `cua-engine 0.3.0 (98af352a46aa)` | `4a270a3eef59665d8ac55d87f5e5312b56879323032a2d964e32c18d85294df9` | `wait-rule/` |
| c595f4f6, the wait at 25 ms (the engine sources the branch head ships) | `cua-engine 0.3.0 (c595f4f67c7b)` | `310341733f2801e1033ec78c5b3289c850b4753094eb612b3c873e8110d763a4` | `final/`, `focus-timer/click-paste-load2-final/` |

## The mechanism (`mechanism/`)

From Qt's source at the VM's versions (Qt 5.15 for kate, Qt 6.4 for qtcreator; the same code in both), detailed in
`mechanism/README.md`: Qt's press handler asks the window manager to activate the window when the window is not
`QGuiApplication::focusWindow()` (`QXcbWindow::handleButtonPressEvent`), and Qt makes it the focus window only when it
delivers the window-system event the `FocusIn` queued, after the whole batch of X events it read the `FocusIn` in. A
loaded Qt main thread reads the synthetic `FocusIn` and the press, a few milliseconds apart, in one batch: the press then
finds no focus window. The X trace of kate's own connection (`kate-x2.xtrace.gz`, twelve clicks of 6dbc0057 at twice
the load, `trace.md`) shows it in every activating run: Qt read `FocusIn`, `EnterNotify`, `MotionNotify` and the
`ButtonPress` with no request of its own between them, then sent `_NET_ACTIVE_WINDOW` (source 1) naming **no current
focus window**, and Openbox activated it. Keys never ask (`requestActivate` appears in no key or motion path); a wheel
press is excluded by the handler itself.

**Why the wait is sound.** What the press needs is that Qt has made the window its focus window. Qt reports that over
AT-SPI: the frame's `active` follows `QApplication::activeWindow()`, which Qt sets in the same delivery as the focus
window. The probe (`signal-probe.txt`) read it `active` 5 to 7 ms after a held key's answer idle and 11 to 23 ms at
twice the load, and inactive again 98 to 115 ms after the `FocusOut`, Qt's 100 ms `focusInTimer`. The engine reads the
state itself, one `GetState` at a time, so nothing depends on how Qt orders the X stream against the bus. The one
`active` that is not the session's own is that timer's count-down after an earlier session's `FocusOut`, which can still
fire before Qt reads the next `FocusIn`: a press to a frame already active before its session opens first waits for it
to read inactive (at most 100 ms plus the bound), then sends the `FocusIn` and waits for `active`. The bound is a time
only in what happens at it: a press whose focus is not reported in time is refused with nothing sent ("`<app>` did not
take the background focus within 25 ms, so a press could have activated its window; nothing was sent, so it is safe to
retry"), never sent.

## Ruling 1: the vendor and 0.3.0 at twice the load, with the idle control

`compare/load2-before` (harness 749df01e, kind `click`), `final/idle` and `final/load2` (harness c595f4f6). The front
window lost its active state after this many background clicks:

| engine | kate, 2x (`compare/`) | kate, 2x (`final/`) | qtcreator, 2x (`compare/`) | qtcreator, 2x (`final/`) | idle, both |
|---|---|---|---|---|---|
| the pinned vendor build | 11 of 30 | 5 of 30 | 8 of 30 | 3 of 30 | 0 of 30 |
| 0.3.0 | 8 of 30 | 7 of 30 | 5 of 30 | 4 of 30 | 0 of 30 |
| cua before task 61 (6dbc0057; `final/`'s `control`, the same code with `--focus-ack-ms 0`) | 10 of 60 | 7 of 30 | 13 of 60 | 7 of 30 | 0 of 30 |
| cua with the wait (c595f4f6) | – | **0 of 30** | – | **0 of 30** | **0 of 30** |

So the activation is the X11 route's, not this engine's: the vendor's 100 ms wait before its input does not cover the
`FocusIn`-to-press gap that matters. (`compare/` predates the witness's StructureNotify fix, below: its activations
were seen as changes of the active window and the stacking, its activation-request column reads 0.)

## Ruling 2: the wait's value, by the wait rule at twice the load (`wait-rule/load2`)

Harness and engine 98af352a, kind `click`, each bound by `--focus-ack-ms`:

| bound | kate | qtcreator | the wait, median / max ms (kate; qtcreator) |
|---|---|---|---|
| 25 | 30 consecutive, no miss | 30 consecutive, no miss | 7.4 / 16.7; 4.1 / 17.5 |
| 50 | 30 consecutive | 30 consecutive | 7.2 / 15.3; 4.5 / 20.5 |
| 100 | 30 consecutive | 30 consecutive | 7.9 / 15.6; 6.4 / 23.6 |
| 200 | 30 consecutive | 30 consecutive | 7.5 / 20.3; 6.3 / 17.5 |
| control (no wait) | **activates: 9 of 30** | **activates: 5 of 30** | – |

Every bound held with no activation and no refusal, so **25 ms**, the smallest step, is the bound
(`focus_ack::FOCUS_ACK`). The margin is thin: the longest wait at a larger bound was 23.6 ms, and in `final/load2` one
`key-click` wait was 25.8 ms (a read begun before the bound counts with its answer). A wait past the bound refuses the
press, safe to retry; it never sends one, so the bound trades refusals under heavier load against time, not safety. The control shows the witness sees an activation in a click lane at twice the load: every
control activation was caught by the span (a change of the active window, the stacking and the focus) and, with the
witness fix, as Qt's own activation request.

## Other inputs, and what the remedy covers (`final/load2`, harness and engine c595f4f6)

Twice the load, 30 runs a lane; activations counted by the witness span and the front window after it:

| kind | pinned | 0.3.0 | control (no wait) | shipped (the wait) | the wait's cost |
|---|---|---|---|---|---|
| `click` | kate 5, qtcreator 3 | 7, 4 | 7, 7 | **0, 0**, 30 consecutive | waited median 6.5 / 7.3 ms (max 19.3 / 24.5); answered 18.9 → 30.1 / 22.4 → 35.2 ms median |
| `key-click` (a key, then a click, pipelined) | 17, 9 | 0, 0 | 3, 5 | **0, 0**, 30 consecutive | the earlier focus let go first: median 103 / 94 ms; answered 23.4 → 143.8 / 22.1 → 138.8 ms |
| `drag` | 3, 9 | 8, 8 | 4, 7 | **0, 0**, 30 consecutive | waited median 6.3 / 3.3 ms; answered 12.5 → 21.0 / 11.0 → 22.9 ms |
| `press_key` | 0, 0 | 0, 0 | 0, 0 | 0, 0 | none: keys do not ask, and no wait applies |
| `scroll` | 0, 0 (sent, ignored) | refused | refused | refused | none: Qt ignores synthetic wheel events, so shared mode refuses them (`families.rs`) |

Idle (`final/idle`) the wait cost a click 0.7 / 1.5 ms median (answered 16.4 → 19.5 and 16.6 → 23.3 ms, the
association included).

The wait covers every background press cua sends a Qt window: a coordinate click (its chord included), a drag, an
element's right click (button 3) and a paste's focusing click; the element's primary click is its AT-SPI action, with no
press. It does not cover: dedicated mode (unchanged, as ruled); a Qt window the engine cannot know is Qt (no
accessibility bus, so no `ToolkitName`; Qt's family is found by toolkit only); and the modal dialog below.

## The click-then-paste lanes judge the desktop now (`focus-timer/`)

Task 60's fix recorded `front_active` on each click run, but its judge passed a run on its text and answers alone: the
27 of 30 kate runs that activated the window passed. That judge was itself the finding. Every focus-timer run now runs
its requests and the reads of their effect inside a witness span and fails, with the miss cause `desktop`, when the
span saw a change or an activation request or the front window is not active after it (`runPasses`; the test that
failed on the old judge: `tdd/red-focus-timer-judge.txt`). The audit judges its runs the same way, so an audit whose run
activated fails too. Click-then-paste on kate and qtcreator at twice the load, harness c595f4f6:

| engine | kate | qtcreator | the audit |
|---|---|---|---|
| before task 61 (`click-paste-load2-before`) | **not reached**: 14 of 60 runs failed, all `desktop` | **not reached**: 19 of 60, all `desktop` | kate **not clean** (its run activated: the window took the real focus, so no `FocusOut` and the session never closed); qtcreator clean (its one run did not activate) |
| the wait (`click-paste-load2-final`) | 30 consecutive, no miss | 30 consecutive, no miss | clean, clean |

## The witness's own gap, fixed

`xprobe witness` selected SubstructureNotify on the root, and Qt sends its activation request with StructureNotify and
SubstructureRedirect, so its focus record never listed Qt's requests: an activation the window manager granted still
showed as a change, but one it ignored would not have. It now selects both (`compare/` is from before, `wait-rule/` and
`final/` after: every activation there has its request).

## A modal dialog: a second path the wait does not cover (`mechanism/modal-probe.txt`)

Qt relays a `FocusIn` and a `FocusOut` on a window blocked by a modal window to that window
(`relayFocusToModalWindow`), which asks for its activation. A background `press_key` to a PyQt main window blocked by
its own modal dialog moved the X focus to the dialog 5 of 5 times on Qt 5 and on Qt 6, idle, with no window manager;
with nothing sent the focus stayed (3 of 3). Any background input with a synthetic `FocusIn` does it, keys included,
in every engine that sends one. It is outside this task's ruling and goes to the design session (task 61's report).

## The tests

- Engine (`native/linux-engine/tests/live_focus_ack.rs`, a PyQt window whose main thread is blocked 35 ms in every 40,
  `tests/support/qt-late.py`, Qt 5 and Qt 6, no window manager, where Qt's activation is its own `SetInputFocus`): on
  the engine before task 61, the click took the X focus in 9 of 10 runs (Qt 5), the drag in 8 of 10 (Qt 6), a click
  after a key in 9 of 10 (Qt 5) (`tdd/red-live-focus-ack.txt`); with the wait none did, every press reached the editor,
  the control with no wait took it, at a 1 ms bound a click was either refused with the sentence and pressed nothing
  or sent with the focus taken (the bound's expiry is unit-tested: whether Qt answers in time is not something a test
  can force), and dedicated
  mode is unchanged (`tdd/green-live-focus-ack.txt`).
- Harness: `test/linux-engine-diff/qt-activation.test.mjs` (the lanes, kinds, effects, the span's judge, the verdict)
  and `focus-timer.test.mjs`'s desktop judge.

## Files

- Each sitting's `results.jsonl`, `summary.md`, `watchdog.jsonl`, stdout and the applications' stderr, home paths
  labelled (`scripts/copy-evidence.py`).
- `mechanism/`: the source reading, the trace and its table, the signal and modal probes.
- `tdd/`: the failing-first and passing runs.
- `scripts/`: the builds, exports, sittings, probes (`probe-signal.mjs`, `probe-trace.mjs`, `qt-modal.py`,
  `probe-modal-inner.sh`), the trace table (`trace-segments.py`) and the copy.
