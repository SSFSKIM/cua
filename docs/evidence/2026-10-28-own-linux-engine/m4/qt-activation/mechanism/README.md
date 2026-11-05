# Why a background press activates a Qt window

What Qt does, from its source at the versions the VM runs (kate: `libqt5gui5t64` 5.15.13+dfsg-1ubuntu1, read on the KDE
Qt 5.15 patch collection's `kde/5.15` branch, of which Ubuntu's 5.15.13 is a snapshot; qtcreator: `libqt6gui6t64`
6.4.2+dfsg, read on qtbase's `v6.4.2` tag), and what an X trace of kate's own connection shows it did.

## The source (the same in Qt 5.15 and Qt 6.4; lines 5.15 / 6.4)

1. **A press asks for activation unless the window is Qt's focus window.**
   `QXcbWindow::handleButtonPressEvent` (qxcbwindow.cpp 1944 / 1818) opens with
   `if (!isWheel && window() != QGuiApplication::focusWindow()) … w->requestActivate();`. A wheel step (buttons 4 to 7)
   is excluded. No other input handler asks: `requestActivate` appears only there, at a map of a modal window, at a
   deferred activation's map, and in `relayFocusToModalWindow` (below).
2. **The request.** `QXcbWindow::requestActivateWindow` (1469 / 1380) sends `_NET_ACTIVE_WINDOW` to the root with
   source 1 and, as its third word, the window Qt thinks is focused now (`current`, None when none), with the mask
   `StructureNotify | SubstructureRedirect`, when the window manager supports it; otherwise it sets the X input focus
   itself (`xcb_set_input_focus`, 1513 / 1419). Openbox grants the message.
3. **Qt's focus window comes later than the FocusIn.** `handleFocusInEvent` → `doFocusIn` (863 / 776) sets the
   connection's focus window and calls `QWindowSystemInterface::handleWindowActivated`, which only queues a window
   system event (asynchronous delivery, the default). `QGuiApplication::focusWindow()` changes only when that event is
   delivered (`processActivatedEvent`, qguiapplication.cpp 2467 / 2436: `focus_window = newFocus`), and that happens
   after `QXcbConnection::processXcbEvents` (1080 / 1068) has handled the whole batch of X events, which it keeps
   topping up from the reader thread (`flushBufferedEvents` after each event), in `xcbSourceDispatch`
   (qxcbeventdispatcher.cpp 99 / 51: `processXcbEvents`, then `sendWindowSystemEvents`).
4. **So**: when the synthetic `FocusIn` and the press are handled in one batch, the press finds the old focus window
   (none, for a background window) and asks for activation. Idle, Qt's main thread handles the `FocusIn` within the few
   milliseconds the engine takes to place the pointer, and delivers its activation before the press arrives; at twice
   the load the main thread runs late and reads both together.
5. **After a `FocusOut`**, Qt keeps the window its focus window for 100 ms (`focusInDelay`, qxcbconnection.cpp 126 / 92;
   `doFocusOut` starts the timer, a `FocusIn` stops it), then delivers a deactivation. A late timer can fire before Qt
   reads the next session's `FocusIn`, which leaves no focus window when that session's press is handled.
6. **A modal dialog**: `doFocusIn` and `doFocusOut` first call `relayFocusToModalWindow` (845 / 760), which, when
   the window is blocked by a modal window, calls that window's `requestActivate`. So a synthetic `FocusIn` alone, for
   any input kind, asks for the dialog's activation, idle too. `modal-probe.txt` (`scripts/qt-modal.py`,
   `scripts/probe-modal-inner.sh`, a private Xvfb with no window manager): a background `press_key` to a PyQt main
   window blocked by its own modal dialog moved the X input focus to the dialog 5 of 5 times on Qt 5 and 5 of 5 on Qt 6,
   idle; with the front window given the focus and nothing sent, the focus stayed 3 of 3. The press wait does not cover
   this (no press is involved).

## The trace (`kate-x2.xtrace.gz`, `trace.md`, `activating-run-0.xtrace.txt`, `plain-run-3.xtrace.txt`)

kate (Qt 5.15) behind an xtrace proxy of its own (`scripts/probe-trace.mjs`), so the trace shows the events Qt read, in
order, and every request it made; twelve background clicks of the engine as it stood before this task (6dbc0057), at
twice the load. In each of the six runs that activated the window:

- Qt read the engine's synthetic `FocusIn`, then `EnterNotify`, `MotionNotify` (twice: the click's place, then its
  place again before the press) and the `ButtonPress`, with no request of its own between them;
- its first requests after them are `ChangeProperty _NET_WM_USER_TIME` and `SendEvent` of a `ClientMessage`
  `_NET_ACTIVE_WINDOW` to the root, `data=0x01,…` (source 1), the press's own time, and **`0x00000000` as the current
  focus window**: Qt had read the `FocusIn` but not yet made the window its focus window;
- then Openbox's answer: a real `FocusIn` and two `PropertyNotify`s of `_NET_ACTIVE_WINDOW`.

In the runs that did not activate it, Qt either made requests (a repaint: its activation's `PutImage`) between the
`FocusIn` and the press, or read them together and still delivered the activation before handling the press (runs 4 and
11): what Qt reads in one go and what its main thread handles in one batch are not the same thing, and only the
request's third word shows Qt's own state at the press.

## The wait this supports

What the press needs is Qt's own focus state, not a time: the window must be `QGuiApplication::focusWindow()` when Qt
handles the press. Qt exposes it over AT-SPI: the window's frame reports `active` from `QWidget::isActiveWindow()`,
which Qt sets in the same delivery as the focus window (`processActivatedEvent` → `notifyActiveWindowChange` →
`QApplication::setActiveWindow`). The probe `signal-probe.txt` (`scripts/probe-signal.mjs`) measured it on kate: the frame
reads `active` 5.3 to 6.6 ms after a held key's answer idle and 11.0 to 22.5 ms at twice the load (busctl's own
latency included), never before the session's `FocusIn`, and inactive again 98 to 115 ms after the session's
`FocusOut`, which is Qt's 100 ms timer; its clicks with no wait lost the front window 0 of 10 times idle and 2 of 10 at
twice the load. A press sent after the frame reads `active` is
handled in a later batch than the `FocusIn`'s, with the window already Qt's focus window, so Qt does not ask. The read
is a D-Bus call to Qt's main thread; its answer is the state at that moment, whatever Qt's batches, so no ordering
between the X stream and the bus is assumed. The one `active` that is not the session's own is item 5's count-down,
which the engine waits out before the session's `FocusIn` (`focus_ack.rs`).
