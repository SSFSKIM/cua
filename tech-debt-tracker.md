# Technical debt

## Open

- **2026-10-02 — Stale node_repl active-exec records after a forced teardown (minor, M3).** When the server has to
  signal the runtime while a cell runs (the uncertain-completion path), node_repl leaves
  `$CUA_HOME/state/codex/node_repl/active_execs/<exec>.json` behind. No reader was found in node_repl; the files are
  small and private to CUA_HOME. Revisit if a vendor component turns out to act on them (they name pids). Evidence:
  `docs/evidence/m3-mcp-lifecycle.md`.
- **2026-10-02 — Per-connection approval files may accumulate (minor, M3, unobserved).** Each connection has a random
  session id, and `CUA_SHIM_PERSIST=session` makes node_repl write
  `$CUA_HOME/state/codex/computer-use/sessions/<session id>.toml` per approved connection; nothing removes them. Not
  observed yet (no app was bound in M3 runs); confirm in M6's TextEdit fixture and decide whether close should remove
  the connection's own file.

## Resolved

- **2026-10-02 — Explicit native surfaces setting in the launch contract (minor).** The standalone spec's environment enumeration did not explicitly list `CUA_REPL_ENABLED_SURFACES=computer`, although the pinned launcher requires the variable. Resolved in M2: `src/runtime/launch.mjs` sets it in the allowlisted launch environment, documents it in the module's environment contract alongside the other variables, and `test/runtime-launch.test.mjs` asserts it (and that no browser variable or `NODE_REPL_TRUSTED_SERVICES` default is configured for native-only launches). Source: pinned `@oai/cua-repl` `launch.js:16–29`; governing spec: `docs/doperpowers/specs/2026-10-02-standalone-cua-design.md`.
