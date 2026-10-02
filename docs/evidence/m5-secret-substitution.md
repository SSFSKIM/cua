# M5 evidence: trusted native secret substitution

Spec: `docs/doperpowers/specs/2026-10-02-standalone-cua-design.md`, milestone M5. Run on 2026-10-02, macOS 26 arm64,
host Node 22.23.2, pinned runtime 26.928.40906. `$CUA_HOME` below is the M2 scratch install (`/tmp/cua-m2-archive.*`).
The Swift helper was not changed (the M4 ad-hoc build was used as is).

## What exists

- `src/secrets/reference.mjs`: only a whole argument equal to `{{secret:<label>}}` is a reference; a
  reference-shaped string (`{{secret:` … `}}`) whose label breaks the label rule is an invalid reference (refused, never
  typed or partly expanded); anything else, including near misses and substrings, is ordinary text.
- `src/services/sky.mjs`: the production trusted sky service. `cua serve` registers it for every connection through
  `buildLaunch` (`NODE_REPL_TRUSTED_SERVICES={"sky": <real path>}`), with secrets on or off. It delegates every request
  to the vendor `@oai/sky/service` named by `CUA_SKY_VENDOR_SERVICE`, and substitutes only in the pinned shapes
  `paste {app, text, format?="text"}`, `type_text {app, text}`, `set_value {app, element_index, value}` with one
  argument and no other request keys. Failure codes (all before anything is delivered, except the last):
  `invalid_secret_label`, `unsupported_secret_shape`, `secrets_disabled`, `secrets_unavailable (<reason>)`,
  `secret_not_found`, `secret_denied`, `secret_locked`, `secret_unsupported_value`, and `secret_input_failed (<kind>)`
  when the vendor fails after substitution, where `<kind>` is a pinned `SkyComputerUseError` name, `transport`,
  `not_approved`, `app_blocked` or `failed`, never vendor text.
- Launch: `NODE_REPL_TRUSTED_CODE_PATHS` = vendor module tree, `src/services`, `src/secrets` (the wrapper's import
  closure). `CODEX_HOME` (`state/codex`) is no longer trusted. Without a broker the launch sets
  `CUA_SECRETS_UNAVAILABLE=<code>` so references fail with the reason.
- `src/secrets/client.mjs` fix: it subscribed to an `end` event, which the real nativePipe stream rejects (below).

## The real nativePipe stream (open item from M4)

The pinned `node_repl` embeds the trusted worker's bridge (`privileged-node-repl.js`): `createConnection(path)`
resolves a frozen object with only `write(bytes)`, `on/off(event, fn)` and `end()`. `on`/`off` accept only `data`,
`close` and `error` and throw `unsupported native pipe event` for anything else; there is no `destroy`; writes after
close are dropped; data arrives as Buffers; bytes travel between the worker and `node_repl` as base64 inside JSON
lines, and `node_repl` (outside the sandbox) holds the socket. The M4 client called `on('end')`, so every read through
the real transport would have failed as `disconnected`. It now listens to `data`/`error`/`close` only; a Node test
double with exactly this surface (`test/fixtures/native-pipe.mjs`) reproduced the failure first. Live, the trusted
worker read sentinel values from the actual Swift broker through this transport (below).

## Trusted import roots (open item from M2/M4)

The trusted worker imports any file whose real path lies under `NODE_REPL_TRUSTED_CODE_PATHS`. Roots now: the vendor
module tree (installed, immutable, under `runtimes/`), `src/services` and `src/secrets` of the checkout (owned code,
the same trust as the server itself). `state/codex` was dropped: nothing imported from it (the vendor sky service
reads `CODEX_HOME` only as a path to look for a helper app), and `node_repl` and the vendor CLI write there
(`node_repl/active_execs`, `computer-use/sessions`, `tmp/arg0`). Live, a model cell trying to write
`cua-m5-planted-<uuid>.mjs` into each of `state/codex`, `src/services`, `src/secrets` and the vendor module tree got
`EPERM`; so did its own working directory and `nodeRepl.tmpDir` (the cell sandbox is read-only everywhere). Nothing
was created. `test/services-sky-trust.test.mjs` loads the production service in a child Node with a copy of the
pinned resolve hook and exactly the launch environment, and shows that dropping `src/secrets` makes it fail to load.

## Suites

| Suite | Result | Notes |
|---|---|---|
| `npm test` | PASS, 168 tests | Node only; output has no warnings. New: `secrets-reference`, `services-sky`, `services-sky-trust`; nativePipe-surface client tests; launch/serve registration and trusted-path tests. |
| `npm run build:helper`, `npm run test:helper` | not rerun | no Swift change in M5. |

## Live sentinel probe (`node scripts/probe-secrets.mjs`, opt-in): PASS, 26/26 steps

Path: MCP client → `cua serve` → vendor cua-repl → `node_repl` → sandboxed cell `nodeRepl.rpc("sky")` → trusted
worker → `src/services/sky.mjs` → `nodeRepl.nativePipe` → `node_repl` → production `cua-keychain broker` (real
Keychain) → substitution → a controlled fake target module in place of the vendor sky service (via
`scripts/probe/serve-fake-sky-target.mjs`, which runs the production `serve` with only `CUA_SKY_VENDOR_SERVICE` and
one extra trusted directory changed). The fake target forwards what it receives over nativePipe to a socket owned by
the probe, the only place a value may arrive. One disposable item `cua-m5-probe-<uuid>` held generated sentinels,
created and replaced through the M4 pty seeding fixture and removed in `finally`; no other item was read. No GUI, no
native delivery, no Keychain prompt.

| Step | Result |
|---|---|
| paste / type_text / set_value with `{{secret:<label>}}` | target received exactly sentinel 1 in the eligible field, other fields unchanged; the cell got no value |
| ordinary text; marker in `press_key` | delivered unchanged; marker not expanded |
| unknown label, invalid label, extra input key | `secret_not_found`, `invalid_secret_label`, `unsupported_secret_shape`; target not called |
| induced failure: target throws an error whose message and properties carry the request | target received the value; the cell got only the fixed `secret_input_failed (failed)` diagnostic |
| cell timeout (1.5 s) while the target held a substituted request | timed out; `node_repl` logged the cell source to stderr with all string literals redacted |
| replace with sentinel 2, new connection | target received exactly sentinel 2 |
| real `cua serve`, vendor sky: reference to a nonexistent app | `secret_input_failed (invalidApp)`, value-free |
| real `cua serve`: unknown label | `secret_not_found` |
| real `cua serve`: cells planting modules in trusted roots | `EPERM` ×4 (also own cwd and tmpDir) |
| real `cua serve` with `CUA_SHIM_SECRETS=off` | `secrets_disabled` |
| every connection closed | exit 0 |
| cleanup | the scenario's item removed; listing shows no `cua-m5-*` item |
| scanner self-check | each sentinel is found raw and as base64 at every byte offset |
| sentinel scan | neither sentinel, raw or base64, in 15 channels: MCP transport both directions ×4 connections, served-process stderr ×4 (serve, anchor, cua-repl, `node_repl`, kernel, trusted worker and broker all inherit it), 7 files left under `$CUA_HOME/state` and `run`; the report is checked before it is written |

The live `node verify.mjs` on the same home also passed with the wrapper registered (four tools, `secrets_list` ok,
banner `setup`/`list_apps` delegated through the wrapper to the real vendor).

## Limits of this evidence

- The fake target replaces the vendor sky service, so native delivery and the vendor's own handling of a substituted
  value were not exercised; the real vendor path was exercised only up to a failure before input (nonexistent app).
  Native delivery in a disposable TextEdit document is M6's.
- The vendor's paste/type/set-value commands return nothing in the pinned source, so no success result carries
  input; the wrapper passes the vendor's result through unchanged.
- Unobservable channels (vendor telemetry, the native helper's own logs) are not claimed; M1 found sky's per-call
  telemetry records no input text.
