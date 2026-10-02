# Technical debt

## Open

- **2026-10-02 — Explicit native surfaces setting in the launch contract (minor).** The standalone spec's environment enumeration does not explicitly list `CUA_REPL_ENABLED_SURFACES=computer`, although the pinned launcher requires the variable and the existing shim already supplies it. M2 should set it in the allowlisted launch environment, document it alongside the other variables, and cover it in launch tests. Native-only A+B must not silently advertise browser support. This is a nonblocking spec clarification, not a new review cycle. Source: pinned `@oai/cua-repl` `launch.js:16–29`; governing spec: `docs/doperpowers/specs/2026-10-02-standalone-cua-design.md`.
