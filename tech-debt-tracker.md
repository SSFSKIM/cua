# Technical debt

## Open

- **2026-10-07 — `assertModelSeesText` is opt-in and has two latent false-fail shapes (minor, issue #72 review).**
  It runs at eight call sites (`test/mcp-*.test.mjs`), so a new successful result with text-only guidance is caught
  only where a test calls it, and a routed `profiles_list` with guidance on a fresh device session (`guidance` plus
  `cua/note`) works by construction but is not pinned. Its JSON-line branch also compares a JSON array line key by key
  and a JSON object line inside free text as top-level fields; no current result has either. Calling it from the
  harness client on every tools/call response, with the JSON branch limited to the last line, would close both.

- **2026-10-07 — Phase G task-review minors left (minor, issue #70).** (a) `src/cli.mjs` is past 700 lines with the
  `devices` handler; a split by command family (as `src/secrets/commands.mjs` did) would keep it readable. (b)
  `test/remote-devices.test.mjs`: the test named "unsafe or unreadable" exercises only an insecure-mode file. (c) A
  device `end_task` that fails because the session was lost reads both "the next call opens a new session" and "the
  device session is closed; devices_use still works" (redundant, accurate). (d) A connection that closes while a
  `devices_use` re-awaits in-flight calls answers that switch `task_open` rather than `connection_closing` (the client
  is leaving). (e) The Linux `computer,browser` host notes measure 2,045 of the 2,048-character budget with the vendor's
  63-character first line, so the next rule needs another tightening.

- **2026-10-07 — Secret fixtures leave their temporary store home behind when interrupted (minor, issue #66).**
  `scripts/accept/secret-seed.mjs` users (`textedit.mjs`, `probe-secrets.mjs`, `accept-chrome.mjs`) remove the temporary
  `$HOME` holding a generated sentinel in `finally`, which a SIGINT or SIGTERM skips: the 0600 file stays under
  `$TMPDIR` (`cua-*`). A signal handler that runs the same cleanup, or a sweep of stale `cua-*` store homes at the next
  run, would close it.

- **2026-10-07 — `accept-native` reads BLOCKED on a healthy macOS checkout (minor, predates issue #66).** Item 1 counts
  the one Linux-only skip of `npm test` as coverage that did not run (so every item citing a unit suite inherits
  BLOCKED), and the clean clone (item 10) runs `npm test` without `npm ci`, so the relay tests that need `ws` skip there.
  A list of platform skips the verdict expects, and `npm ci` in the clone (or a `ws`-free relay test double), would let
  a healthy run read PASS. Evidence `docs/evidence/2026-10-07-file-secrets-acceptance.md`.

- **2026-10-07 — `hooks/cua-approve.sh`'s jq branch adds nothing to a fixed answer (minor, plugin bundle review).** With
  jq present, empty or invalid stdin yields no answer or exit 2 (a deny), where the printf fallback always accepts.
  Claude Code always sends a JSON payload, so nothing breaks; the jq branch earns its place only when the script is
  narrowed to test `.message` (README, App approvals). Printing the answer unconditionally, with the whitelist as a
  commented jq variant, would remove the asymmetry.

- **2026-10-07 — Linux agent unit: what doctor reads is the unit file (minor, issue #58).** (a) A `systemctl --user
  edit cua-agent` drop-in or an unreloaded edit can change what runs while `agent.installed` describes the file; showing
  `DropInPaths` and `NeedDaemonReload` in doctor's rows would close it (`agent status` already shows a pending reload).
  (b) `agent status` and doctor read "not installed" for an agent still running after its file was deleted and the
  manager reloaded (`uninstall` stops it). (c) `agent install` pins the installing session's `DISPLAY` and `XAUTHORITY`:
  under `ssh -X` that is a forwarded display that dies with the session, and under XWayland the cookie path changes at
  each login; a warning for a display with a host part, and a README line, would cover both.

- **2026-10-06 — The hosted relay's Caddy advertises HTTP/3 with UDP 443 closed (minor, issue #53).** Caddy's default
  `Alt-Svc: h3` points browsers at UDP 443, which the `cua-relay` firewall does not admit; MCP clients and agents use
  HTTP/1.1 or 2 and are unaffected. Either `servers { protocols h1 h2 }` in `relay/deploy/Caddyfile` or a UDP 443 rule
  in `create-server.sh` would close it at the next rebuild or Caddyfile change.

- **2026-10-06 — Claude Code 2.1.292 probes MCP `2026-07-28` before `initialize` (minor, issue #53).** Its first
  request is `POST` with `MCP-Protocol-Version: 2026-07-28` and `Mcp-Method: server/discover`; the agent's version gate
  answers `400` and the client falls back to `initialize` at `2025-11-25`, so nothing breaks today. When the pinned
  runtime negotiates the newer revision, the gate's fixed list (`PROTOCOL_VERSIONS` in `src/mcp/http.mjs`) and the agent's
  handling of `server/discover` need revisiting. Evidence `docs/evidence/2026-10-06-hosted-relay-acceptance.md`.

- **2026-10-06 — The vendor helper's text input crashes GTK3 text views on Linux (vendor, Phase F, issue #51).** On
  the pinned 26.928.40906 arm64 runtime, `typeText` and `paste` SIGSEGV gedit 46.2 and mousepad 0.6.1 (in
  `gtk_text_buffer_get_iter_at_offset`); in GTK4 they insert and then throw `SetCaretOffset NotSupported`. Nothing cua
  can fix without patching the vendor runtime; the Linux host notes steer the model to `pressKey`. On x64 (#58, same
  gedit and GTK builds) `typeText` does not crash but throws "editable Paste did not insert text", so the notes' word
  "crash" is exact for arm64 only; their advice holds on both. Revisit at the next pin bump, evidence
  `docs/evidence/2026-10-06-linux-acceptance.md` and `docs/evidence/2026-10-06-linux-agent-and-x64.md`.

- **2026-10-06 — Two F1 review leftovers on Linux (minor, Phase F, issue #51).** (a) `countLiveHosts` on Linux
  (`src/profiles/chrome.mjs`) reads `ps -eo pid=,args=` with no parent check, as the spec specified, so a wrapper
  started by absolute path (`/usr/bin/strace /…/extension-host`) is counted as a live host; reading `ppid` and requiring
  a Chrome parent, as on darwin, would close it. (b) `install` of a deb peaks at about 2.6 GB of scratch (the staged deb,
  `data.tar.xz`, and the whole 1.7 GB payload unpacked); streaming `ar p … data.tar.xz | tar -xJf -` and extracting only
  the three pinned resource paths would cut it. Revisit if a miscount or a small VM disk is seen. (c) `procTable` in
  `scripts/probe/lib.mjs` drops a process that exits between the `ps` snapshot and its `/proc` read, but the snapshot's
  children still name it as parent, so that subtree drops out of verify's walk for that read; the window is
  milliseconds, and a `<gone>` row would trade it for false failures.
  (d) `CUA_SHIM_SANDBOX=default` on Linux is unmeasured: if node_repl's own default sandbox also runs through `codex`
  and bwrap there, it fails open under Ubuntu's userns restriction like `scoped` did, while doctor's `sandbox` row
  claims node_repl denies every write and connection and the launch refusal covers `scoped` only. A rarely used
  diagnostic mode; measure it on the VM before extending the refusal to it.

- **2026-10-06 — Phase E relay leftovers (minor, issue #11).** (a) The agent's relay adapter logs one "unknown
  channel" line per later `body` frame after it refuses an oversized body (the shipped relay stops at the same 4 MB
  first, so only a relay with a larger limit shows it); marking the channel done until its `end`/`abort` would silence
  it. (b) `ws` `maxPayload` stays at its 100 MiB default: one SSE event over about 75 MB (base64) would close the device
  link with 1009 and every replay would close it again. (c) The LAN path (`node:http`) and the relay's WebSocket sends
  ignore write backpressure; only credential holders reach either, and the relay cuts a client whose unsent buffer
  passes 32 MB. (d) SSE keepalive comments are probably dropped by SSE-normalising proxies such as ngrok's edge (they
  still keep the proxy's upstream leg busy); a named keepalive event would survive if a proxy's idle timeout ever cuts
  a long call. Revisit if any is observed.

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

- **2026-10-04 — `accept-chrome --all` cannot bind a supplied live report to a commit (minor, M13).** The `--live`
  report records its time but no commit or runtime-tree identity, and the `--c6-report` is assembled by hand, so
  `--all` records each supplied file's length and sha256 and trusts its contents. Have `--live` record `git rev-parse
  HEAD` and the release, and have `--all` report (or refuse) a report from another commit.

## Resolved

- **2026-10-07 — A success result's text is invisible in Claude Code when it has structured content (minor, issue
  #70 G4; resolved 2026-10-07, issue #72).** Resolved: `profiles_list` puts its not-ready guidance in a `guidance`
  field of the structured content too; the audit found no other successful result whose text says more than its
  structured content, and `assertModelSeesText` (`test/fixtures/mcp-harness.mjs`) pins that at eight call sites.

- **2026-10-03 — Two copies of the helper-suite verdict and the step runner in the acceptance runners (minor, M13; obsolete 2026-10-07).** Obsolete: issue #66 removed the Swift helper and its suites, so `helperSuiteVerdict` and `helperSuite` are gone; the duplicated step runner, if it remains, is ordinary duplication.
  `scripts/accept/chrome-all-lib.mjs` (`helperSuiteVerdict`) and `scripts/accept/chrome-all.mjs` (`run`) repeat the
  logic of `scripts/accept-native.mjs` (`helperSuite`, `run`) rather than sharing it, to leave the M6 runner untouched
  during M13. Move both into `scripts/accept/lib.mjs` and have both runners import them at the next edit of either.

- **2026-10-04 — `verify.mjs`'s leftover check saw other connections in the same home (minor, M13; resolved
  2026-10-05).** Resolved: verify identifies its connection as the session whose `run/<session>.pid` record names the
  `cua serve` pid it spawned (read once initialize is answered; no new server surface) and fails only if that session's
  record, directory or socket, or any record naming that pid, remains after the orderly EOF; other entries that appear
  meanwhile go to an informational `runNote`.

- **2026-10-02 — Wall-clock bounds in lifecycle/broker tests flaked under heavy load (minor, M3/M4; resolved
  2026-10-05; the broker tests themselves went with the broker in issue #66).** Resolved: the three named bounds (`a stalled group enumeration…`, `a helper that refuses…`, `close is
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
