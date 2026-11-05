# Task 61, fix 2: the Qt marker, and the bounded re-review's two findings

The design session's ruling (2026-11-05): a window with no AT-SPI tree is Qt's when `_XEMBED_INFO` is set on it, or,
where `/proc` is readable, when its process maps a Qt core library; the survey of the common families comes first, and
a common non-Qt family carrying the property stops the build. The bounded re-review's P1 (a multi-click checks the
focus once) and P2 (a dialog's modal ancestor counts as its blocker) are fixed in the same wave.

Everything here ran on private Xvfb displays (`xvfb-run -a`), never on `:0`.

## The survey (`survey/`)

`scripts/survey.sh` starts each application alone on its own Xvfb with Openbox, a session bus of its own and a home
and XDG directories of its own (browsers on a profile of the run's), waits for its windows, and runs
`scripts/dump-xembed.py`, which lists every window of the application's X client in the whole root tree (by
resource-id base) with its place and its `_XEMBED_INFO`. `scripts/summarize.py` makes `survey/table.md` from
`survey/survey.jsonl`. "Top-levels" are the windows the window manager lists; "children" are the windows under them;
"other" are the client's remaining windows (Qt's client leader and clipboard windows, GTK's leader, popups, helpers).

| Family (application) | Version | Top-levels with it | Children with it | Other windows of the client with it | Value |
|---|---|---|---|---|---|
| Qt 5 (PyQt5, native child) | 5.15.13 | 1 of 1 | 4 of 4 | 0 of 2 | 0x0, 0x1 |
| Qt 6 (PyQt6, native child) | 6.4.2 | 1 of 1 | 4 of 4 | 0 of 2 | 0x0, 0x1 |
| Qt 5 (kate) | 5.15.13 | 1 of 1 | - | 0 of 2 | 0x0, 0x1 |
| Qt 6 (qtcreator) | 6.4.2 | 1 of 1 | - | 0 of 2 | 0x0, 0x1 |
| Qt 6 (designer) | 6.4.2 | 2 of 2 | - | 0 of 2 | 0x0, 0x1 |
| GTK 3 (window and modal dialog) | 3.24.41 | 0 of 2 | 0 of 2 | 0 of 2 | - |
| GTK 4 (window and modal dialog) | 4.14.5 | 0 of 2 | 0 of 2 | 0 of 2 | - |
| GTK 3 (gedit) | 3.24.41 | 0 of 1 | 0 of 1 | 0 of 3 | - |
| GTK 4 (gnome-text-editor) | 4.14.5 | 0 of 1 | 0 of 1 | 0 of 3 | - |
| VTE (gnome-terminal) | 3.52.0-1ubuntu2 | 0 of 1 | 0 of 1 | 0 of 3 | - |
| Firefox (Mozilla deb) | 159.0 | 0 of 1 | 0 of 2 | 0 of 1 | - |
| Chrome | 156.0.8078.73 | 0 of 1 | - | 0 of 2 | - |
| Electron (cua page app) | 44.9.0 | 0 of 1 | - | 0 of 2 | - |
| Java Swing (OpenJDK) | 21.0.12.1 | 0 of 2 | 0 of 4 | 0 of 1 | - |
| Java AWT (OpenJDK) | 21.0.12.1 | 0 of 2 | 0 of 7 | 0 of 1 | - |
| Tk (wish) | 8.6.14 | 0 of 2 | 0 of 6 | 0 of 7 | - |
| LibreOffice Writer (gtk3 VCL) | 24.2.7.2 | 0 of 2 | 0 of 2 | 0 of 7 | - |
| LibreOffice Writer (gen VCL, X11) | 24.2.7.2 | 0 of 2 | - | 0 of 10 | - |
| xterm (Xaw) | XTerm(390) | 0 of 1 | 0 of 1 | - | - |

- Every Qt window, top-level or native child, Qt 5 and Qt 6, carries `{XEMBED_VERSION 0, XEMBED_MAPPED}`: Qt's xcb
  backend sets it unconditionally in `QXcbWindow::create` ("Add XEMBED info; this operation doesn't initiate the
  embedding", qtbase 6.4.2 `src/plugins/platforms/xcb/qxcbwindow.cpp`, and the same in the Qt 5.15 KDE branch). A
  Qt window that is not native (kate's and qtcreator's widgets) has no X window of its own, so "-".
- No window of any other family carries it: 0 of 94 (21 of them top-levels) across GTK 3, GTK 4, VTE, Firefox, Chrome, Electron, Java Swing
  and AWT, Tk, LibreOffice on both its VCL plugins, and xterm. So no common non-Qt family carries it, and the build
  went ahead.
- What can carry it outside Qt, not met here: an XEmbed plug of another toolkit (a GTK 3 `GtkPlug`, a tray icon), a
  window embedded into another application's socket rather than a listed top-level. A false mark refuses only a press
  to a window with no tree, the safe direction (the ruling).
- Firefox is the Mozilla deb task 59 unpacked (the system Firefox is a snap that cannot start on the harness's bus);
  Java's AWT needed the non-headless JRE (`openjdk-21-jre`), installed for the survey. Java ran `Survey.java` (a frame
  and a dialog each), Tk `survey.tcl` (two toplevels and a menu).

## The fixes

- **The Qt marker** (`families.rs` `qt_mark`, `x11.rs` `xembed_marked`, `engine.rs` `qt_without_toolkit`): a window
  no listed family names is Qt's by its `_XEMBED_INFO`, else by its process's map where readable. Its presses are
  refused in shared mode with the fix wave's sentence; keys still go; the modal refusal covers it. `--stats` carries
  `qt_without_tree: "xembed" | "map"`.
- **P1** (`engine/pointer.rs` `click`): the press's checks run before every press of a multi-click. A press refused
  after earlier clicks went says so: "…; the request's next click was not sent, but `<n>` of its `<count>` clicks
  already reached the window, so read the window before retrying" (`focus_ack.rs` `refused_press`).
- **P2** (`x11.rs` `blocking_dialog`, `modal_transient_of`): a shown modal transient blocks the target only when it is
  not one of the target's ancestors along `WM_TRANSIENT_FOR`; the target's own `WM_TRANSIENT_FOR` is read in the same
  pipeline, so the lookup's cost is unchanged (two round trips).

## TDD (`tdd/`)

- RED, `red-live.txt`: the three new live tests on the base commit's musl build (e45a1f45, built the release
  workflow's way, `build-base-e45a1f45.txt`) through `CUA_ENGINE_BIN`; each fails at its Qt 5 lane:
  - the double click on a held session: the second press took the X focus 5 of 5 (`left: 5, right: 0`);
  - the nested dialogs: input to D2, the topmost dialog, refused as "blocked by its modal dialog, window" D1;
  - the sandbox: inside its own PID namespace and `/proc` the engine sent every click to the Qt window with no tree,
    and 9 of 10 took the X focus.
- GREEN, `green-live-focus-ack.txt`: the whole `live_focus_ack` file on the fix, 13 of 13, nothing skipped.
- Unit tests (`qt_mark`, `blocking_dialog`, `refused_press`) were written before their functions; RED was a compile
  failure (`red-unit-*.txt`).

## Suites (`suites/`)

On d1ea56ce, on a private Xvfb and session bus (`scripts/suite.sh`):

- `cargo fmt --check` and clippy (`--all-targets --features live -D warnings`): clean.
- `cargo test --release --features live`: unit 369 (1 ignored), live 19, live_device 24, live_focus_ack 13,
  live_focus_out 20, live_minimized 6, launcher_shim 15, send_boundary 5, no_text_mutators 3, identity_boundary 2, all
  passing (`live.txt`). A first sitting run in the dev profile failed `live_device`'s watch-panic case, which needs the
  release profile's `panic = "abort"` (the profile the gate and earlier sittings use); it was the sitting's mistake,
  and the release-profile rerun is the one recorded.
- `npm run test:linux-engine-diff`: 736 of 736 (`harness.txt`).
- `live_focus_ack` on the fix's musl build, made the release workflow's way (`build-d1ea56ce.txt`, sha256
  `efd8a403…419e`) through `CUA_ENGINE_BIN`: 13 of 13 (`live-focus-ack-musl.txt`).
