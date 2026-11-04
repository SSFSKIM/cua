# cua-engine (Linux)

cua's own Linux native engine for #171, built against
`docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md` and the behaviour specification
`docs/doperpowers/research/2026-10-28-own-linux-engine/sky-linux-behaviour.md`. It speaks the vendor helper's wire: one
JSON request per line on stdin, `{id, command, input}`, one response per line on stdout,
`{id, ok, output, error, restart}`.

M1a builds it up from M0's spike. It answers every command of the pinned helper but text and clipboard:
`list_windows`, `list_apps`, `get_window_state` (the tree, `query`, `include_screenshot`) and `get_screenshot` (the
desktop) on the observation side (M1a.1); `press_key`, `key_down`, `key_up`, `click`, `move`, `move_relative`,
`scroll`, `drag`, `drag_handle`, `perform_secondary_action`, `activate_window` and `launch_app` on the input side
(M1a.2). M2.1 adds the clipboard core and `clipboard_read` and `clipboard_release`; M2.2 the paste route for
`type_text` and `clipboard_write`, and `type_characters`. M3.1 adds `capabilities` (`caps.rs`: the X11 backend's
fixed capabilities, the device mode, the version and the commit) and applies the device mode to every input kind a
family ignores on the background route (below). M3's review adds `preflight`, a request that acts and sends nothing
(below).

```bash
cargo build --release
printf '%s\n' '{"id":1,"command":"list_windows","input":{}}' | target/release/cua-engine server
target/release/cua-engine --version   # cua-engine <version> (<git sha>)
cargo test
# the live tests (an X display, a session bus with AT-SPI, yad for a GTK 3 window), as the engine-linux gate runs them
xvfb-run -a dbus-run-session --dbus-daemon="$PWD/tests/dbus-daemon-quiet" -- cargo test --features live -- --test-threads 1
```

Releases are built, tested and attested by `.github/workflows/linux-engine.yml` from the version in `Cargo.toml`
(`linux-engine-v<version>`, static musl for x64 and arm64), and pinned in `runtime/engine/linux-engine.json` by
`node scripts/linux-engine-pin.mjs linux-engine-v<version>`.

## How it observes

- **The tree read** (`tree.rs`) sends the vendor's per-element calls for the vendor's field set along the preorder
  frontier, at most W calls and R bytes of replies outstanding, and admits nodes by the vendor's preorder with one
  shared counter (5,000 nodes, depths 0–63). M0 chose W 32, R 4 MiB, 4 KiB reserved per call in flight; slack 8.
  A node's `GetChildren` goes out once its role is known, and a table's once its child count says it is listed.
- **The visible-table path** (`table.rs`): a `table` with more than 5,000 children is not listed; its visible cells
  are found by the vendor's hit-test scan across its on-screen bounds and read as leaves. A scan that fails lists the
  children instead.
- **Element resolution** (`resolve.rs`): the vendor's two walks, the second reading roles and sampling large tables,
  so a cell the tree read returned resolves.
- **Screenshots** (`x11.rs`, `capture.rs`, `readiness.rs`, `shm.rs`): a window's own drawable while it is retained
  through Composite, the desktop from the root, JPEG quality 80, 4:4:4. The desktop's pixels come through MIT-SHM
  (a memfd segment the server writes into, attached by descriptor) on a local display whose server answers
  `ShmQueryVersion` 1.2, else through `GetImage`; the segment is made after the first desktop screenshot's answer, so
  that one is `GetImage`'s, and any failure turns MIT-SHM off for the engine's life. A capture of a freshly redirected (or resized, or
  remapped) window waits for the DAMAGE rule: the first damage on the new pixmap, then 10 ms with no more, capped at
  150 ms; a window fully unobscured at the redirect (`cover.rs`) needs no first damage, only the 10 ms quiet.
  Damage and structure events are read on a second X connection by a thread of their own.
- **Applications** (`apps.rs`): the XDG desktop entries, filtered and matched to the listed windows as the vendor
  does.

## How it sends input

- **Routes** (`route.rs`): a request naming a window goes through that window's background session (`input.rs`):
  synthetic `FocusIn` unless the focus is already within it, key and pointer events by `SendEvent` (pointer events
  to the deepest child under the point), and `FocusOut` the vendor's 100 ms after the window's last input; nothing on
  it activates, raises, focuses or moves the pointer. A request without a window uses the desktop route (`desktop.rs`,
  XTEST). The window is redirected (retained) before its first targeted input, with no wait after it; keys are not
  paced.
- **The `FocusOut` timer** (`focus_timer.rs`, M4): the 100 ms is not slept on the request path. A request answers as
  soon as its input is sent, and its window's session waits, still open, for its `FocusOut`, due 100 ms after that
  input; more background input to the same window takes the session back (no `FocusOut` and no new `FocusIn` between),
  so a burst pays the 100 ms once. Any other input (to another window, through the desktop or the foreground route),
  a paste's observation (its own window's timer included) and `activate_window` first flush every pending timer: each
  is waited out to its full 100 ms since its window's last input, then its `FocusOut` sent, then the request goes on,
  so no `FocusOut` ever comes sooner than 100 ms after a burst (Chromium cuts and reorders the last keys of a burst a
  sooner `FocusOut` follows). A late drag-and-drop's Escape (`dnd.rs`) is not delayed by a timer; on its own window it
  restarts the timer, and no `FocusOut` can fall between the two: the watch sends the Escape under a lock the timers
  hold whenever they end a session, its instant recorded first (`focus_timer::Gate`). With `--stats`, each `FocusOut` is reported (`focus_out`: window, cause `timer`, `flush` or
  `exit`, the time since the window's last input, and the request whose input last started the timer): on the line of
  the request it went out in, or on a line of its own (`"id": null`) when it went out between requests.
- **Exit** (`serve.rs`): stdin closing, SIGTERM, SIGINT or SIGHUP end the engine through its orderly exit: a
  `drag_handle` still between its start and its end ends first as its own end would (the family's release dwell, then
  button 1 up where the pointer is), then held keys are released, so no wait of the exit keeps one down; then an armed
  after-release drag-and-drop watch runs out its lifetime (at most 300 ms after its drag's release), so a late
  take is still cancelled with its Escape before any of the exit's `FocusOut`s; then every
  pending `FocusOut` waited out (at most 100 ms, the Escape's window's counted from the Escape) and sent, then the
  exit's settle: the engine waits until `--exit-settle-ms` (300 ms) has passed since the last background key input to
  a window whose redirect it still holds, the watch's Escape included (keys only: the unredirect cut no click in the
  measured steps). At its longest, a stop right after a watched drag whose late take comes at the end of the watch,
  that is about 300 + 300 ms after the drag's release, inside the 1 s backstop. Its exit drops those redirects (the X connection closes), and a covered Chromium window whose redirect goes
  while it still has input queued cuts that input and delivers it only with its next `FocusIn`, which at twice the
  gate's load the 100 ms alone did not prevent. So a burst answered just before the signal still arrives in order, and
  its window gets its `FocusOut`; an exit with no such input in the last 300 ms waits for nothing. The declared limits
  are SIGKILL and load beyond twice the gate's. A request already running finishes first; requests
  queued behind the signal are not run. The exit code is 0 for stdin closing and 128 plus the signal's number
  otherwise. A second SIGINT, or an exit still not done 1 s after the first signal (the backstop), ends the process at
  once, a request still running included, but first releases every key and button still down over a connection of its
  own, waiting at most 200 ms for it (`pressed.rs`, the record kept beside the bookkeeping), and so does a panic, from
  a copy the panicking thread keeps of that record, before its diagnostics are written; a second SIGTERM or SIGHUP
  changes nothing, since a supervisor may send its own after another's. A drag's button released there (a `drag` cut
  by the forced exit, a `drag_handle` before its end) ends the drag where the pointer is. SIGKILL cuts the
  drain and the release: the last burst's window keeps its synthetic focus until it next gets a `FocusOut`, and a key
  held at the server stays down. The stop signals are
  blocked in every thread and taken by one thread with `sigwait`; a program `launch_app` starts gets them unblocked.
  The drain reads nothing from stdin and writes nothing to stdout, and an answer that cannot go out does not hold it
  back: answers are written by a thread of their own, and the loop, waiting for each, also watches for the stop. That is
  how cua's REPL host stops the engine on Linux: it freezes the trusted worker's whole tree, which stops the engine's
  reader, sends the engine alone SIGTERM and SIGCONT, waits for its exit (at most 1.25 s, the backstop and the forced release's 200 ms with 50 ms to spare), then SIGKILLs everything it
  froze (`src/repl-host/kernel-child.mjs` `stopProcessTree`), so an answer may sit in a full pipe for good.
- **Keys** (`keys.rs`, `engine/keyboard.rs`): the vendor's chord grammar and Shift rule (`Z` is z without Shift, so
  `Ctrl+Z` stays undo), and its held-key bookkeeping: counts per target and keycode shared by `press_key`, `key_down`
  and every command's `key` chord; a window with held keys keeps its session across requests until the last hold is
  released; whatever is still held at exit is released, each release with the state that was held.
- **`type_characters`** (`engine/keyboard.rs`, `keys.rs`): the newest build's command, with its events. The window's
  session opens, then the whole text is resolved: each character's keysym (its code point below 0x100, else 0x1000000
  plus it) at level 1 of a key, or at level 2 with Shift_L held (letters included); the first character it cannot
  produce that way (a control character, a keysym on no key, one only at AltGr's level) refuses the text with
  `Character '<c>' is not on the keyboard layout` before any key is sent. Each character is then pressed and
  released in turn, and the answer is the number sent. A family that ignores synthetic keys (GTK 4, xterm) is refused
  in `--desktop shared` mode and typed through the foreground route in `dedicated` mode; the route taken is the
  `--stats` line's `route`.
- **The pointer** (`engine/pointer.rs`): clicks, moves, the desktop's interpolated path, wheel steps of 100 pixels held
  36 ms, drags sampled per pixel, `drag_handle` and `move_relative` on the desktop, in the vendor's order of placing,
  pressing the chord and pressing the button. A drag waits after each sample only where its target's family needs it
  (`families.rs`, keyed by `Application.ToolkitName` or the X11 class: 500 µs for Chromium, 300 µs and 30 ms before
  the release for Gecko, nothing for the rest); the vendor waits 1 ms everywhere. A `drag_handle`'s held moves wait
  as the family of the window under its start asks, in place of the vendor's 8 ms between their points.
- **Elements and windows** (`engine/elements.rs`, `engine/windows.rs`): element clicks through action 0 or a right
  click at the visible point, named actions, the element scroll, `activate_window` and `launch_app`.
- **The device mode** (`engine/way.rs`, `families.rs`, `route.rs`): a family lists, per input kind, whether it ignores
  the background route always or unless its window is fully unobscured (`cover.rs`): the paste chord, keys
  (`press_key`, `key_down`, `key_up`, `type_characters`), clicks (a coordinate `click` into a window and an element's
  right click), scroll (at a point, the window's centre or an element), `drag` and `move`. GTK 4 ignores all of these
  always; Gecko its clicks, scrolls, moves and drags unless unobscured; Chromium its drags unless every point and
  segment of the drag's path is unobscured (`cover.rs`' `points_unobscured`); Qt its scrolls; xterm its keys (and has
  no verified paste route). Element actions through AT-SPI are never listed. For a listed kind and condition, `--desktop shared`
  refuses with `<app> does not accept background input; use a dedicated desktop or activate the window first`
  before anything is sent; `--desktop dedicated` activates the window (`_NET_ACTIVE_WINDOW`, a raise, the input
  focus), waits for it to hold the focus, and sends the input through XTEST at the same window-relative points (the
  foreground route); a request whose input is refused for itself (a bad key or chord, a scroll of no pixels, a drag
  of fewer than two points, characters the layout cannot type) activates nothing. A hold made on the
  foreground route is released on it, the window activated again first. Every request that consults the table
  records its route on the `--stats` line (`route`: `background`, `foreground` or `desktop`).
- **Drag and drop into Chrome** (`dnd.rs`): Chrome's HTML5 drop activates, focuses and raises its window (the
  Chromium toolkit's other applications, Electron among them, change nothing). In shared mode a background drag into
  Chrome watches `XdndSelection` through XFixes, from the drag's start, unless
  Chrome's window is already the active window, holds the focus and is fully unobscured (any doubt counts as not),
  where the drop goes ahead. The answer follows the order of what the engine saw and sent:
  - Chrome's own client takes the selection (a drag and drop has begun) before the release: Escape is pressed and
    released on the background route, then the button, and the drag is refused: `… it was cancelled before the drop,
    so nothing was dropped. Use a dedicated desktop, or activate the window first`; unless within 300 ms Chrome's
    window newly becomes active, focused or top of the stacking order (the cross-check), when the answer is that the
    drop may have happened and the desktop changed;
  - no take by the release: the drag answers at once as a plain drag (it claims nothing about drops). A watch on its
    own X connection, subscribed before the drag began and told the instant the button went up, goes on off the
    request path for 300 ms from the release, or until a request that acts stops it. A take then gets the cancel's
    Escape at once (synthetic, to Chrome's window, never XTEST). The first request that sends input or changes state
    (`press_key`, `key_down`, `click`, `move`, `move_relative`, `scroll`, `drag`, `drag_handle`'s start and moves,
    `perform_secondary_action`, `activate_window`, `launch_app`, `clipboard_write`, `type_text`, `type_characters`,
    `preflight`) is answered, not run, with `<app> started a drag and drop after your drag ended; it may have dropped
    and changed the desktop; this request was not run, so read the window before sending it again` (`--stats`
    `late_dnd`). Reads
    (`list_windows`, `list_apps`, `get_screenshot`, `get_window_state`, `clipboard_read`, `capabilities`) and releases
    of what is held (`key_up`, `clipboard_release`, `drag_handle`'s end) run meanwhile, so no key or button stays down
    at the server. A watch that failed (its connection lost, a round trip failed) is reported the same way: `the
    drag-and-drop watch after your drag into <app> failed (<why>), so a drop may have happened unseen and changed the
    desktop; …`; a panicking watch ends the engine (the release profile aborts on a panic). The live tests inject both
    through `CUA_ENGINE_FAULT`, honoured only in a build with the `live` feature, never a release asset. `preflight`
    (no input, answers null) is for a caller about to change the desktop by a route the engine never sees: cua's
    service sends it just before its wrapper launches an application through the supervisor, so that launch gets the
    notice, and does not happen, as an engine request would. Known limit: a take later than 300 ms after the release,
    or after an acting request has begun, is not seen; M3.1 measured none after the release in 240 takes, idle and
    under load;
  - a take whose cancel could not be sent: `… it was cancelled, but whether the drop landed cannot be confirmed. …`.

  Where the engine lets the drop happen (Chrome already in front, or a dedicated desktop; every Chromium window,
  whose drop changes nothing; and a drag that names no window, through the window under its start), it watches the
  take too, and once that window's client takes `XdndSelection` it spaces
  the path's remaining steps so the release comes no sooner than 350 ms after the take, no step shorter than the
  family's own (`dnd.rs` `RELEASE_AFTER_TAKE`; `--stats` `after_take`). Chromium sends XdndDrop at the release only if
  its target has accepted by then, and the target accepts only after the renderer has answered an earlier position. A
  browser that stalls just after its drag starts (task 18: 16 and 21 stalls in two full verdict runs) accepted 148 to
  275 ms after the take, so a fast release dropped nothing, and a short drop (40 px) released within about 50 ms of the
  take dropped nothing even without a stall. The steps after the take come at most 12 ms apart, and what they leave
  of the 350 ms is filled with motions that re-visit the path's second-to-last sample and its last, ending on the last
  (`dnd.rs` `KEEPALIVE`, `keepalive`; task 22): Chrome's drag loop sends its target a position only on a motion, and a
  floor waited out without one dropped nothing after a take on the path's last sample or after it. These keepalives
  come only after a take, only on such a Chromium drag.

  A short path can end before the take (task 22, evidence `m3/drop-misses/task22/`): under a load of Chrome windows
  the renderer gets the drag's first moves a frame or a stall late and starts the drag and drop after a 40 px path has
  ended, and a release before the take drops nothing while the drag answers success (`m3-gate-final`'s three cold
  misses). So when no take came by the path's end the button stays down for it until 250 ms after the press (`dnd.rs`
  `TAKE_HOLD_AFTER_PRESS`; takes came 4 to 93 ms after the press over 195 drags of the gate's sequence), and a take then,
  or one seen at the path's last look, gets the same floor; with no take by then the drag is released and answers as
  before. `--stats` `hold` has one shape on every drag the hold watches: `bound_ms`, `path_ms` (the press to the path's
  end), `held` (no take by the path's end, so the hold ran), `waited_ms` (0 when it did not), `taken` (a take by the
  release), `take_after_press_ms` (null without one) and `keepalives`; the bound and the take's time count from the
  button's press itself. Known limits, for M4:
  - an accept later than 350 ms after the take still misses, unseen (the latest seen was 275 ms), and so does a take
    later than 250 ms after the press: the drag answers success;
  - a speed gap: a Chromium drag that never takes (a text selection, a range, a short thumb drag) holds its button
    until 250 ms after the press, paying 250 ms less its path's time: a 40 px Chrome selection goes from about 134 ms
    to about 355, a 40 px range from about 130 to about 350; a drag whose path lasts 250 ms or more pays nothing;
  - a speed gap: the short Chrome drop (40 px, in front) takes 469 ms, against the newest vendor build's 258 and the
    pinned build's 280 (which lands 11 of 12). A lead: release when Chrome's accept cursor shows, with the take plus
    350 ms as the ceiling, which helps only if reading the accept cursor has no false positives (task 18's replay of it
    matched Chrome's accept in 85 to 100% of drags by condition, without saying which way the rest failed).

  Every drag into a Chromium-family window (Chrome by its classes, the Chromium toolkit) presses atomically and is
  watched (`stray.rs`; task 20, evidence `m3/drop-misses/task20/`). Blink resets its press on any mouse move that
  carries no button, and Chrome turns real pointer events into such moves: a crossing of its window, its own capture
  grab's included when the real pointer is outside the window, and the real pointer's motion. One that lands after the
  press and before the first motion past Blink's 4 px drag threshold kills the drag, and the release becomes a click.
  - The press and every sample through that motion go out under one server grab (`GrabServer`), with the real pointer's
    place read (`QueryPointer`) inside it, so no other client's request falls between them. The grab holds every other
    client, the window manager included, so it sends at most 8 samples (`PRESS_SAMPLES_MAX`): a straight path crosses
    the threshold by its seventh sample, and a path given in 1 px steps by its eighth. Task 20 measured the grab at
    p50 0.742 ms, p99 1.688 ms and max 4.078 ms over 480 drags whose press sent 5 to 7 samples; the cap keeps a long or
    jittering path that has not crossed from holding the server for a time its length decides. Such a path goes on
    with the grab released, and the watch below covers the rest. `--stats` `press` records the grab's duration
    (`grab_ms`), the samples sent under it, whether the last of them crossed the threshold (`crossed`) and whether the
    pointer was in the window.
  - A watch on a connection of the engine's own (opened by the first such drag, kept for its life) selects XInput 2 raw
    motion on the root, which reaches every client whoever holds a grab, and the target window's crossings, from just
    before the grab to just after the release. The drag's own events are never among them (the background route's are
    synthetic; on the XTEST routes the XTEST pointer's motion is left out), nor is a crossing that ends a grab (the
    target's release of its capture).
  - When the watch saw such an event and the target took no drag and drop by the release, the drag answers `<app> may
    not have started the drag, and the page may have taken the press as a click: the desktop pointer was outside the
    window, or entered or moved in it during the press. Read the window to see what happened before dragging again`,
    never success. A take means the drag started, after which a stray event changes nothing.
  - In shared mode a drag with the real pointer outside the window is sent; Chrome's capture grab crosses in and the
    answer is that error. Declared: a drag the page tracks itself (mousedown/mousemove/mouseup listeners, or pointer
    capture) lands with the pointer outside as with it inside, and still answers the error. In dedicated mode a pointer
    outside the window takes the foreground route, which puts the pointer there (`--stats` `pointer_outside`).

  The watch keeps every selection report the connection reads meanwhile, so the input session's server-time probe
  cannot lose one. The `--stats` line's `dnd` records whether the window was in front, the watch saw a start, the
  outcome (`in_time`, `late` for the measurement option's Escape after the release, `no_start`, `undecided`), whether the signature already held at the start, and the
  cross-check and its wait.

## How it uses the clipboard

- **The lock** (`clipboard/lock.rs`): the display's private selections `CUA_CLIPBOARD_LOCK`, then the vendor's
  `SKY_CLIPBOARD_LOCK`, each taken by a compare-and-set under a server grab (`GrabServer`, the owner must be None,
  `SetSelectionOwner`, the owner read again, `UngrabServer`) and retried every 5 ms for at most 5 s, else
  `clipboard busy`. Every engine on the display shares them; a paste and `clipboard_read` hold both throughout.
- **The snapshot** (`clipboard/reader.rs`): the current CLIPBOARD's formats as the vendor captures them (`TARGETS`,
  then each target it does not skip, INCR included, 64 MiB in all, the owner unchanged throughout), within 500 ms for
  `TARGETS`, 500 ms for each format's first answer, 2 s between INCR chunks and 5 s overall.
- **The owner** (`clipboard/owner.rs`, `clipboard/serving.rs`): one connection and thread that serve CLIPBOARD for
  as long as the engine lives or another client takes it: text as `UTF8_STRING`, `text/plain`,
  `text/plain;charset=utf-8` and, when Latin-1 only, `STRING`; a snapshot format by format; INCR above 64 KiB, a
  transfer dropped when it stalls 2 s between chunks or runs past 10 s. A paste takes CLIPBOARD once; its cleanup,
  on every exit path, never takes it again: while the engine still owns CLIPBOARD it serves the snapshot taken before
  the paste instead, and after a `SelectionClear` it does nothing. Once cleaned up, a conversion stamped from the
  paste's ownership to its cleanup (or with the Ctrl+V's own time), and a `CurrentTime` one within 10 s of a paste
  that did not confirm, is refused, so a late requestor never receives the restored snapshot as the paste.
  The take is checked against the snapshot atomically: under a server grab, the owner thread counts every XFIXES
  report of CLIPBOARD's owner being set (re-assertions by the same owner included) and refuses, leaving CLIPBOARD
  alone, if any came after the snapshot.
- **The window after an unconfirmed paste** (`clipboard/quarantine.rs`) is the display's, not the engine's: a root
  window property, `CUA_CLIPBOARD_QUARANTINE`, holds its end in server time and the target's X client, written by
  the cleanup and read before a paste or a Copy, under the lock. While it runs, every cua engine on the display
  refuses to paste, `clipboard_write` or Copy, also after the engine that opened it has exited. A vendor engine does
  not read it.
- **`clipboard_read`** (`engine/clipboard.rs`, `copy.rs`): under the lock, the window's focused element (the first
  focused node in a post-order walk of its frame, siblings fetched together) copies by the vendor's route choice:
  `EditableText.CopyText` of its one selection, else its context menu's Copy item; then CLIPBOARD's new contents are
  snapshotted under a handle (`<pid>-<nanoseconds>-<n>`, at most 32 and 256 MiB). The application's copy stays on
  CLIPBOARD. `clipboard_release` frees a handle, an unknown one without error. A context menu the Copy opened and
  found no Copy in is closed with Escape through the background route, so the request leaves no menu open.
- **The paste route** (`engine/paste.rs`, `paste.rs`, `field.rs`): `type_text` and `clipboard_write` (a handle's
  snapshot into the window's focused element). In order: text over 64 MiB is refused; while an earlier unconfirmed
  paste's `CurrentTime` refusal runs, a new paste is refused (`a previous paste could not be confirmed and may still
  be read; nothing was sent; retry after <n> s`); the window's family (`families.rs`) gives the paste chord (Ctrl+V,
  Ctrl+Shift+V for VTE terminals) or refuses text (xterm: no verified route), and a family that ignores the chord on
  the background route (GTK 4) is refused in `--desktop shared` mode and, in `dedicated` mode, activated and pasted
  through the desktop route. Inside the input session the field is observed (the named element, else the window's
  focused one: its focus, editability, character count, caret and selection); a named element without the focus is
  clicked at its visible point (once more if the focus has not shown 500 ms later: background Chrome drops a first
  click in some states; `paste.clicks` and `paste.focus_ms` on the `--stats` line) and its caret or selection put back
  (`AddSelection`, `SetCaretOffset`; a refusal is no failure). Then the lock, the snapshot and CLIPBOARD taken; the
  target's `TARGETS` answered before the chord (a client that keeps CLIPBOARD's targets, as gnome-terminal does,
  drops a paste chord that comes before the new owner's: task 56, fix 3): the owner thread handles every request the
  server has given it and makes a round trip, so an answer to a `TARGETS` request from the target's X client (its
  window's resource range) since the take is delivered before the chord, in every family; a family that asks at every
  owner change (`refreshes_targets`: GTK 3, GTK 4, VTE) is waited for, every 2 ms, at most 25 ms
  (`paste::TARGETS_REFRESH_WAIT`; `paste.targets` on the `--stats` line: answered, waited, the bound;
  `--targets-wait-ms` sets the wait for every family, measurement only); then the field and the desktop focus
  revalidated, after the wait (`requested field or selection changed before dispatch; nothing was sent`); the chord
  sent once; the field read
  every 20 ms for up to 2 s for the inserted segment where the caret or selection was (for Gecko, without the U+FEFF
  it adds after each character beyond the BMP), each read bounded by that deadline and counted only if it ends
  before it, while the target's selection transfer is followed, counting only requests from the target's X client
  (its window's resource-id base); and the cleanup. In a family whose text scrolls away at its start (VTE: a full
  screen's first row leaves as text wraps its last), the field is also observed whole, its text and its lines
  (`GetTextAtOffset` at `LINE_START`, the terminal's rows, soft wraps included), and a field that has lost text since
  confirms only when the whole of it reads as the observed text with the paste at the caret less a prefix ending where
  an observed line starts, the paste whole after it, and no reading short of the whole paste (none of it, or only its
  first characters, at the caret, less a prefix ending where an observed line starts) is the same; anything else
  stays unconfirmed (`paste.confirm_rule` `segment` or `scrolled` on the `--stats` line). A whole read that reads
  the same as one the rule left unconfirmed is not judged again (`paste.scrolled` `checks`, `unchanged`, `check_ms`;
  `paste.confirm_looks`): one judging at the limits, a field of 65,536 characters in 512 lines and a 64 KiB paste, takes
  about 3 ms, the readings compared in place as bytes, with nothing of the paste's size allocated; a read too short to
  hold the paste whole is refused from its length alone. The field is not observed whole past those limits, and then
  only the segment confirms. The answer is
  success when the segment is read back, or the scrolled field confirms, else
  `Paste was sent once and could not be confirmed; read the field before retrying`. Only a refusal before dispatch, or
  a chord press the X server answered with an X error naming it (so the chord's last key never arrived), says that
  nothing was sent or pasted; a press whose acknowledgement never came may have arrived, and is answered as sent. The
  chord's keys are pressed one at a time and every key that may be down is released (a failed release tried once
  more, no press sent again); a key that still could not be released is reported in the answer, success included. An
  unconfirmed paste whose target was not served in full opens the 10 s `CurrentTime` refusal. `PasteText`,
  `InsertText` and `SetTextContents` are never called.

## Flags

| Flag | Values (default first) | What it changes |
|---|---|---|
| `--mouse-size-px` | 0 | a positive value stamps the pointer into desktop screenshots (the XFixes cursor at its native size; the value sizes the fallback arrow drawn without XFixes) |
| `--desktop` | `shared`, `dedicated` | the device mode: whether input of a kind the window's family ignores on the background route is refused, or sent through the foreground route (above); `capabilities` reports it |
| `--window-calls` | 32 | W: calls in flight at most |
| `--window-bytes` | 4194304 | R: reply bytes received and not consumed, plus the reservation per call in flight, stay under it; a larger reply is still read whole |
| `--call-reservation` | 4096 | bytes reserved per call in flight |
| `--slack-nodes` | 8 | where preorder admission is not yet certain, a node starts only while fewer than this many such started nodes precede it |
| `--retention` | `session`, `per-request`, `none` | when the target window is redirected through Composite: once until destroyed, per request as the vendor does, or never |
| `--settle-ms` | 0 | the wait after a window's redirect before input to it |
| `--capture-wait` | `damage`, `fixed` | a capture of a fresh pixmap waits for the DAMAGE rule, or a fixed 100 ms once per pixmap (the fallback) |
| `--exit-settle-ms` | 300 | the exit's wait after the last background key input to a window whose redirect it still holds (Exit, above); the measured value, set lower or higher only to measure it |
| `--teardown-ms` | 100 | the delay from a window's last background input to its session's `FocusOut`, on the timer (above); 0 sends each request's `FocusOut` as its input ends, before its answer (the harness's control lane) |
| `--key-pace-ms` | 0 | the wait after each new key edge (the pinned build's is 33) |
| `--drag-step-ms`, `--drag-step-us` | by family | the wait after each drag sample, fixed for every target (the vendor's is 1 ms; measurement only) |
| `--drag-press-dwell-ms`, `--drag-release-dwell-ms` | by family | the wait after a drag's press and before its release, fixed for every target (measurement only); any drag flag sets the others to 0 |
| `--drag-dnd-after-take-ms` | 350 | how long after a Chromium drag source's take a drag the engine lets drop is released at the soonest, its remaining steps spaced to it (measurement only; 0 turns the spacing off) |
| `--drag-dnd-hold-ms` | 250 | how long after the press a Chromium drag the engine lets drop keeps its button down for its source's take when none came by the path's end (measurement only; 0 turns the hold off; `--stats` `hold`) |
| `--dnd-cancel-after-release` | off | a drag and drop the engine cancels is cancelled only after the release, too late (measurement only: the harness's check of the honest answer) |
| `--dnd-defer-take` | off | a drag and drop that begins during a watched drag is left unseen until after the release, so the after-release watch finds it and the next request carries the notice (measurement only: Acceptance 8's late-take case) |
| `--stats` | off | one JSON line per request on stderr: bus calls by member, waits, waits with one call outstanding, the most calls in flight, reply bytes, the tree's admitted, discovered and wasted counts and its tables, a capture's wait and the damage it saw, how a desktop screenshot was read (`shm` or `get_image`), and each `FocusOut` (`focus_out`, above), a `FocusOut` sent between requests on a line of its own |

## Dependencies

Only crates OpenAI's `sky_linux` links (R/A §2.2; the owner's ruling), with the vendor's version noted beside each in
`Cargo.toml`. `Cargo.lock` holds the vendor's exact versions of those crates, so the transitive set is the one the
vendor's helper links. x11rb's `damage` feature adds no crate.
