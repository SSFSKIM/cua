# Technical debt

## Open

(none)

## Resolved

- **2026-10-02 — Explicit native surfaces setting in the launch contract (minor).** The standalone spec's environment enumeration did not explicitly list `CUA_REPL_ENABLED_SURFACES=computer`, although the pinned launcher requires the variable. Resolved in M2: `src/runtime/launch.mjs` sets it in the allowlisted launch environment, documents it in the module's environment contract alongside the other variables, and `test/runtime-launch.test.mjs` asserts it (and that no browser variable or `NODE_REPL_TRUSTED_SERVICES` default is configured for native-only launches). Source: pinned `@oai/cua-repl` `launch.js:16–29`; governing spec: `docs/doperpowers/specs/2026-10-02-standalone-cua-design.md`.
