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
(M1a.2). `type_text`, the clipboard commands and `type_characters` (M2) and `capabilities` (M3) answer
`<command> is not available in this engine build`.

```bash
cargo build --release
printf '%s\n' '{"id":1,"command":"list_windows","input":{}}' | target/release/cua-engine server
target/release/cua-engine --version   # cua-engine <version> (<git sha>)
cargo test
```

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
  to the deepest child under the point), the vendor's 100 ms before `FocusOut`; nothing on it activates, raises,
  focuses or moves the pointer. A request without a window uses the desktop route (`desktop.rs`, XTEST). The window
  is redirected (retained) before its first targeted input, with no wait after it; keys are not paced.
- **Keys** (`keys.rs`, `engine/keyboard.rs`): the vendor's chord grammar and Shift rule (`Z` is z without Shift, so
  `Ctrl+Z` stays undo), and its held-key bookkeeping: counts per target and keycode shared by `press_key`, `key_down`
  and every command's `key` chord; a window with held keys keeps its session across requests until the last hold is
  released; whatever is still held at exit is released, each release with the state that was held.
- **The pointer** (`engine/pointer.rs`): clicks, moves, the desktop's interpolated path, wheel steps of 100 pixels held
  36 ms, drags sampled per pixel, `drag_handle` and `move_relative` on the desktop, in the vendor's order of placing,
  pressing the chord and pressing the button. A drag waits after each sample only where its target's family needs it
  (`families.rs`, keyed by `Application.ToolkitName` or the X11 class: 500 µs for Chromium, 300 µs and 30 ms before
  the release for Gecko, nothing for the rest); the vendor waits 1 ms everywhere. A `drag_handle`'s held moves wait
  as the family of the window under its start asks, in place of the vendor's 8 ms between their points.
- **Elements and windows** (`engine/elements.rs`, `engine/windows.rs`): element clicks through action 0 or a right
  click at the visible point, named actions, the element scroll, `activate_window` and `launch_app`.

## Flags

| Flag | Values (default first) | What it changes |
|---|---|---|
| `--mouse-size-px` | 0 | a positive value stamps the pointer into desktop screenshots (the XFixes cursor at its native size; the value sizes the fallback arrow drawn without XFixes) |
| `--desktop` | `shared`, `dedicated` | accepted for the spec's CLI; read from M3 |
| `--window-calls` | 32 | W: calls in flight at most |
| `--window-bytes` | 4194304 | R: reply bytes received and not consumed, plus the reservation per call in flight, stay under it; a larger reply is still read whole |
| `--call-reservation` | 4096 | bytes reserved per call in flight |
| `--slack-nodes` | 8 | where preorder admission is not yet certain, a node starts only while fewer than this many such started nodes precede it |
| `--retention` | `session`, `per-request`, `none` | when the target window is redirected through Composite: once until destroyed, per request as the vendor does, or never |
| `--settle-ms` | 0 | the wait after a window's redirect before input to it |
| `--capture-wait` | `damage`, `fixed` | a capture of a fresh pixmap waits for the DAMAGE rule, or a fixed 100 ms once per pixmap (the fallback) |
| `--teardown-ms` | 100 | the wait before a background session's teardown |
| `--key-pace-ms` | 0 | the wait after each new key edge (the pinned build's is 33) |
| `--drag-step-ms`, `--drag-step-us` | by family | the wait after each drag sample, fixed for every target (the vendor's is 1 ms; measurement only) |
| `--drag-press-dwell-ms`, `--drag-release-dwell-ms` | by family | the wait after a drag's press and before its release, fixed for every target (measurement only); any drag flag sets the others to 0 |
| `--stats` | off | one JSON line per request on stderr: bus calls by member, waits, waits with one call outstanding, the most calls in flight, reply bytes, the tree's admitted, discovered and wasted counts and its tables, a capture's wait and the damage it saw, and how a desktop screenshot was read (`shm` or `get_image`) |

## Dependencies

Only crates OpenAI's `sky_linux` links (R/A §2.2; the owner's ruling), with the vendor's version noted beside each in
`Cargo.toml`. `Cargo.lock` holds the vendor's exact versions of those crates, so the transitive set is the one the
vendor's helper links. x11rb's `damage` feature adds no crate.
