# Technical debt

## Open

- **2026-10-06 — Two E1 review leftovers in the Streamable HTTP handler (minor, Phase E, issue #11).** (a) A POST
  stream that drops and is never resumed keeps every event it carried (including `js` results with screenshots) until
  its session ends; these retained events sit outside the 16 MB server-message buffer cap. The idle close bounds them;
  a byte cap on retained events (dropping the oldest stream's) would close it. (b) `src/mcp/server.mjs` and
  `src/mcp/connection.mjs` import each other (documented in both headers, safe because no top-level code crosses the
  cycle); moving `createServer` into its own module would remove it. Revisit if memory growth or an evaluation-order
  bug is seen.

- **2026-10-05 — What the concurrency-flake fixes gave up (minor, review P3s).** (a) `a stalled group enumeration…`
  checks that no enumerator is left running only for listings that recorded their pid; one killed earlier is not
  checked (process-name matching was ruled out). (b) The clean-EOF upstream test checks the runtime's exit code only
  when the report arrives before the anchor's release. (c) verify would count as its own leftover a record written by
  a new `cua serve` that reused the exited server's pid between its exit and the final read. Revisit if any is seen.

- **2026-10-05 — Two narrow gaps in bind's directory mapping (minor, issue #21, PR #45).** (a) `placements` sees only the extension stores that were read. When the mapping is `partial` and an unreadable store (in practice a cloned profile directory) records the same instance id as the registered directory's store, a directory bind does not see `instance_in_several_directories`; the bound id is still one the registered directory's own store records. Treating an id as uniquely placed only under a `complete` mapping would close it. (b) The mapping walks `chrome.displayNames()`, so a `profile.info_cache` entry without a string `name` is never scanned and its backend shows `profile directory unknown`. Revisit if either is seen.

- **2026-10-05 — Residual shapes the js-result URL redaction does not cover (minor, issue #24, PR #28).** The redactor in `src/mcp/surface.mjs` is a pattern list. After two review rounds it still lets through: names encoded three or more times; a credential containing an unbalanced `)` or `]` (the value stops there and the rest stays visible); and a parameter after whitespace (`text &token=v`). It also rewrites URL-like non-URLs such as `x?key=1` in code or prose (README states this). Revisit if a real result shows one of these; URL-span detection would trade them for missed relative references.

- **2026-10-04 — Narrow races left after the PR #1 panel-review fixes (minor).** (a) `bindProfile`'s compare-and-set is read-compare-rename with no registry lock, so a millisecond window remains between the comparison and the write (the multi-second discovery window is closed). (b) Breaking a stale `chrome/registration.lock` can race when three processes hit it within the same microseconds. (c) A dead lock holder whose pid is reused looks live; the refusal names the lock file to remove. Revisit if any is observed; a registry lock reusing the registration lock's pattern would close (a).

- **2026-10-02 — Stale node_repl active-exec records after a forced teardown (minor, M3).** When the server has to
  signal the runtime while a cell runs (the uncertain-completion path), node_repl leaves
  `$CUA_HOME/state/codex/node_repl/active_execs/<exec>.json` behind. No reader was found in node_repl; the files are
  small and private to CUA_HOME. Revisit if a vendor component turns out to act on them (they name pids). Evidence:
  `docs/evidence/m3-mcp-lifecycle.md`.

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

## Resolved

- **2026-10-04 — `verify.mjs`'s leftover check saw other connections in the same home (minor, M13; resolved
  2026-10-05).** Resolved: verify identifies its connection as the session whose `run/<session>.pid` record names the
  `cua serve` pid it spawned (read once initialize is answered; no new server surface) and fails only if that session's
  record, directory or socket, or any record naming that pid, remains after the orderly EOF; other entries that appear
  meanwhile go to an informational `runNote`.

- **2026-10-02 — Wall-clock bounds in lifecycle/broker tests flaked under heavy load (minor, M3/M4; resolved
  2026-10-05).** Resolved: the three named bounds (`a stalled group enumeration…`, `a helper that refuses…`, `close is
  bounded against a helper that ignores EOF and SIGTERM…`) and `a runtime that ignores EOF and SIGTERM…` now assert
  against their injected budget × 3 instead of absolute times (see the next entry for the budgets themselves).

- **2026-10-05 — Flaky `npm test` beside another node/cua process (resolved 2026-10-05).** Concurrent `npm test` triples
  captured these failures. Tight timing: `redaction stays linear on long runs of adjacent token-bearing links` (now
  best of three runs against 200 ms × 3; the quadratic case it guards cost 5.2 s), and `an unexpected runtime exit is
  reported once…`, `the anchor leads the group…`, `owned descendants … are reaped` and `a runtime that ignores EOF and
  SIGTERM…` (a confirmed teardown inside 0.5–1 s; every teardown a test expects to confirm now gets a shared 3 s
  budget), and `a helper that refuses, never answers…` (`protocol-2` must answer within the 300 ms ready timeout; only
  `silent` keeps it). A real bug the
  `mcp-upstream` tests caught: `once the group's identity cannot be established…` and `a runtime surviving teardown
  (its anchor was killed from outside)…` read a teardown as confirmed while the runtime survived, because Node's
  `execFile` timeout discards the output of a `pgrep` that has already exited 0 and reports success with nothing
  listed. `listGroup` in `src/mcp/upstream.mjs` now keeps its own deadline and treats an exit-0 listing with no pids as
  failed; a deterministic test covers it. And `relays JSON-RPC both ways…` awaited the runtime's exit report after an
  orderly teardown, which the anchor's release can cut off (the server ignores it then), so the file's event loop
  drained and all 18 tests were cancelled; that wait is now bounded. `a stalled group enumeration…` required the stalled
  listing to have recorded its pid, which a listing killed at its deadline first cannot. `a signal that arrives while
  the connection is still starting…` caught a gap in `serve()`: the session was claimed before the signal handlers
  were installed, so a SIGTERM in between ended the process with its run entries left for the next sweep; the handlers
  now come first. No test reaped another run's processes: every
  enumeration is `pgrep -g <own pgid>`.

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
