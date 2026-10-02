# Technical debt

## Open

- **2026-10-02 — Stale node_repl active-exec records after a forced teardown (minor, M3).** When the server has to
  signal the runtime while a cell runs (the uncertain-completion path), node_repl leaves
  `$CUA_HOME/state/codex/node_repl/active_execs/<exec>.json` behind. No reader was found in node_repl; the files are
  small and private to CUA_HOME. Revisit if a vendor component turns out to act on them (they name pids). Evidence:
  `docs/evidence/m3-mcp-lifecycle.md`.

- **2026-10-02 — Wall-clock bounds in lifecycle/broker tests flake under heavy load (minor, M3/M4; seen in M6).**
  With three `npm test` runs at once, `a stalled group enumeration is bounded…` (teardown < 1500 ms), `a helper that
  refuses, never answers…` (< 3000 ms) and `close is bounded against a helper that ignores EOF and SIGTERM…` (< 2000
  ms) failed on their elapsed-time assertions; six sequential runs passed, and one sequential acceptance run saw a
  single failure (name not captured; the runner now records failing test names). The bounds assert boundedness with
  little headroom. Widen them (e.g. budget × 3) or measure against the injected budget rather than absolute times.
  Evidence: `docs/evidence/m6-acceptance.md`.

## Resolved

- **2026-10-02 — Per-connection approval files accumulated (minor, M3; observed and resolved in M6).** Observed live
  with the M6 TextEdit fixture: every connection has its own random session id, the vendor asks for app approval again
  on each new connection, and an accepted `session` approval makes node_repl write
  `$CUA_HOME/state/codex/computer-use/sessions/<session id>.toml`, which nothing read afterwards and nothing removed.
  Resolved: `cua serve` removes the connection's own file at close (never another session's); `test/serve-cli.test.mjs`
  covers it and the live fixture records written-while-open / removed-after-close per connection. Evidence:
  `docs/evidence/m6-acceptance.md`.
- **2026-10-02 — Explicit native surfaces setting in the launch contract (minor).** The standalone spec's environment enumeration did not explicitly list `CUA_REPL_ENABLED_SURFACES=computer`, although the pinned launcher requires the variable. Resolved in M2: `src/runtime/launch.mjs` sets it in the allowlisted launch environment, documents it in the module's environment contract alongside the other variables, and `test/runtime-launch.test.mjs` asserts it (and that no browser variable or `NODE_REPL_TRUSTED_SERVICES` default is configured for native-only launches). Source: pinned `@oai/cua-repl` `launch.js:16–29`; governing spec: `docs/doperpowers/specs/2026-10-02-standalone-cua-design.md`.
