# Technical debt

## Open

- **2026-10-04 — Narrow races left after the PR #1 panel-review fixes (minor).** (a) `bindProfile`'s compare-and-set is read-compare-rename with no registry lock, so a millisecond window remains between the comparison and the write (the multi-second discovery window is closed). (b) Breaking a stale `chrome/registration.lock` can race when three processes hit it within the same microseconds. (c) A dead lock holder whose pid is reused looks live; the refusal names the lock file to remove. Revisit if any is observed; a registry lock reusing the registration lock's pattern would close (a).

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

- **2026-10-02 — Acceptance session teardown has no final reap deadline after SIGKILL (minor, M6 review).**
  `scripts/accept/mcp-session.mjs:57-58` awaits the child's exit after SIGKILL without a final deadline; describe the
  timeout as an escalation budget and report unconfirmed if exit is never observed. Test-harness only; normal local
  SIGKILL makes it a narrow edge.

- **2026-10-02 — M7 vendor-layer `synthetic-only` check is constant (minor, M7 review).**
  `scripts/probe/chrome/vendor-layer.mjs` (`synthetic-only` scenario) records answered/refused CDP per run but its check
  passes unconditionally. The restrictive fake (`NEUTRAL_CDP` in `fake-extension.mjs`) supports the conclusion today;
  make the check assert that every answered `executeCdp` method is in `NEUTRAL_CDP` at the next pertinent probe change.

- **2026-10-02 — M7 stale-attach diagnostic overstates release (minor, M7 fix review).**
  `scripts/probe/chrome/adapter.mjs` (`attachDebugger`) says "control was released" after a stale attachment even if
  its compensating detach failed. Task completion correctly reports release unconfirmed, so the ownership finding
  is resolved. Make the individual attach error equally accurate at the next relevant prototype/production edit;
  do not treat this text as evidence of successful release.

- **2026-10-03 — Two copies of the helper-suite verdict and the step runner in the acceptance runners (minor, M13).**
  `scripts/accept/chrome-all-lib.mjs` (`helperSuiteVerdict`) and `scripts/accept/chrome-all.mjs` (`run`) repeat the
  logic of `scripts/accept-native.mjs` (`helperSuite`, `run`) rather than sharing it, to leave the M6 runner untouched
  during M13. Move both into `scripts/accept/lib.mjs` and have both runners import them at the next edit of either.

- **2026-10-04 — `accept-chrome --all` cannot bind a supplied live report to a commit (minor, M13).** The `--live`
  report records its time but no commit or runtime-tree identity, and the `--c6-report` is assembled by hand, so
  `--all` records each supplied file's length and sha256 and trusts its contents. Have `--live` record `git rev-parse
  HEAD` and the release, and have `--all` report (or refuse) a report from another commit.

- **2026-10-04 — `verify.mjs`'s leftover check sees other connections in the same home (minor, M13).** It compares
  `$CUA_HOME/run/` before and after its own connection, so a concurrent `cua serve` in that home (another client, or a
  live acceptance run) appears as a leftover and fails verify, and with it `accept-chrome --all` C1. Compare against
  the connection's own session id instead.

## Resolved

- **2026-10-03 — The bind listing called a backend "other-profile" when the comparison was unknown (minor, M11
  review; resolved in M13).** `src/profiles/commands.mjs` labelled every labelled backend that did not match as
  `other-profile`, including when the registered profile's own display name was unknown (Local State unreadable or
  silent about the directory), so nothing was actually compared. Resolved: such a backend is listed as
  `comparison-unknown` (the CLI says the label exists but cannot be compared with this profile); the bind decision
  itself was already right (an explicit pick stands against an unknown name). `test/profiles-commands.test.mjs`
  covers it beside the unreadable-Local-State test.

- **2026-10-02 — Per-connection approval files accumulated (minor, M3; observed and resolved in M6).** Observed live
  with the M6 TextEdit fixture: every connection has its own random session id, the vendor asks for app approval again
  on each new connection, and an accepted `session` approval makes node_repl write
  `$CUA_HOME/state/codex/computer-use/sessions/<session id>.toml`, which nothing read afterwards and nothing removed.
  Resolved: `cua serve` removes the connection's own file at close (never another session's); `test/serve-cli.test.mjs`
  covers it and the live fixture records written-while-open / removed-after-close per connection. Evidence:
  `docs/evidence/m6-acceptance.md`.
- **2026-10-02 — Explicit native surfaces setting in the launch contract (minor).** The standalone spec's environment enumeration did not explicitly list `CUA_REPL_ENABLED_SURFACES=computer`, although the pinned launcher requires the variable. Resolved in M2: `src/runtime/launch.mjs` sets it in the allowlisted launch environment, documents it in the module's environment contract alongside the other variables, and `test/runtime-launch.test.mjs` asserts it (and that no browser variable or `NODE_REPL_TRUSTED_SERVICES` default is configured for native-only launches). Source: pinned `@oai/cua-repl` `launch.js:16–29`; governing spec: `docs/doperpowers/specs/2026-10-02-standalone-cua-design.md`.
