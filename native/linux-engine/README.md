# cua-engine (Linux)

cua's own Linux native engine for #171, built against
`docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md` and the behaviour specification
`docs/doperpowers/research/2026-10-28-own-linux-engine/sky-linux-behaviour.md`. It speaks the vendor helper's wire: one
JSON request per line on stdin, `{id, command, input}`, one response per line on stdout,
`{id, ok, output, error, restart}`.

This is M0's spike. It answers `list_windows`, `get_window_state` (the tree, `query`, `include_screenshot`), and
`press_key` and `click` (coordinates or an element) on the background route. Every other command, and input without a
window (the desktop route), answers `… is not available in this engine build`.

```bash
cargo build --release
printf '%s\n' '{"id":1,"command":"list_windows","input":{}}' | target/release/cua-engine server
cargo test
```

## The variants M0.3 measures

| Flag | Values (default first) | What it changes |
|---|---|---|
| `--tree` | `frontier`, `sequential`, `cache` | `sequential` sends the vendor's per-element calls one by one; `frontier` sends the same calls along the preorder frontier; `cache` seeds the frontier from `Cache.GetItems` |
| `--window-calls` | 64 | W: calls in flight at most |
| `--window-bytes` | 4194304 | R: reply bytes received and not consumed, plus the reservation per call in flight, stay under it; a larger reply is still read whole |
| `--call-reservation` | 4096 | bytes reserved per call in flight |
| `--slack-nodes` | 16 | where preorder admission is not yet certain, a node starts only while fewer than this many such started nodes precede it |
| `--retention` | `session`, `per-request`, `none` | when the target window is redirected through Composite: once until destroyed, per request as the vendor does, or never |
| `--settle-ms` | 100 | the wait after `RedirectWindow` |
| `--teardown-ms` | 100 | the wait before a background session's teardown |
| `--key-pace-ms` | 33 | the wait after each new key edge |
| `--bus` | `persistent`, `per-request` | one accessibility-bus connection for the engine's life, or a fresh one per request as the vendor's |
| `--stats` | off | one JSON line per request on stderr: bus calls by member, waits, waits with one call outstanding (calls awaited one after another), the most calls in flight, reply bytes, the tree's admitted, discovered and wasted counts, and the `cache` variant's report |

`--mouse-size-px` and `--desktop shared|dedicated` are accepted for the vendor's and the spec's CLI; the spike reads
neither.

## Dependencies

Only crates OpenAI's `sky_linux` links (R/A §2.2; the owner's ruling), with the vendor's version noted beside each in
`Cargo.toml`. `Cargo.lock` holds the vendor's exact versions of those crates, so the transitive set is the one the
vendor's helper links.
