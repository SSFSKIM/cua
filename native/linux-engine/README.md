# cua-engine (Linux)

cua's own Linux native engine for #171, built against
`docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md` and the behaviour specification
`docs/doperpowers/research/2026-10-28-own-linux-engine/sky-linux-behaviour.md`. It speaks the vendor helper's wire: one
JSON request per line on stdin, `{id, command, input}`, one response per line on stdout,
`{id, ok, output, error, restart}`.

M1a builds it up from M0's spike. The observation side (M1a.1) answers `list_windows`, `list_apps`,
`get_window_state` (the tree, `query`, `include_screenshot`) and `get_screenshot` (the desktop); the spike's
`press_key` and `click` (coordinates or an element) answer on the background route until M1a.2 replaces the input
side. Every other command, and input without a window (the desktop route), answers `… is not available in this engine
build`.

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
- **Screenshots** (`x11.rs`, `capture.rs`, `readiness.rs`): a window's own drawable while it is retained through
  Composite, the desktop from the root, JPEG quality 80, 4:4:4. A capture of a freshly redirected (or resized, or
  remapped) window waits for the DAMAGE rule: the first damage on the new pixmap, then 10 ms with no more, capped at
  150 ms. Damage events are read on a second X connection by a thread of their own.
- **Applications** (`apps.rs`): the XDG desktop entries, filtered and matched to the listed windows as the vendor
  does.

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
| `--settle-ms` | 100 | the wait after a window's redirect before input to it |
| `--capture-wait` | `damage`, `fixed` | a capture of a fresh pixmap waits for the DAMAGE rule, or a fixed 100 ms once per pixmap (the fallback) |
| `--teardown-ms` | 100 | the wait before a background session's teardown |
| `--key-pace-ms` | 33 | the wait after each new key edge |
| `--stats` | off | one JSON line per request on stderr: bus calls by member, waits, waits with one call outstanding, the most calls in flight, reply bytes, the tree's admitted, discovered and wasted counts and its tables, and a capture's wait and the damage it saw |

## Dependencies

Only crates OpenAI's `sky_linux` links (R/A §2.2; the owner's ruling), with the vendor's version noted beside each in
`Cargo.toml`. `Cargo.lock` holds the vendor's exact versions of those crates, so the transitive set is the one the
vendor's helper links. x11rb's `damage` feature adds no crate.
