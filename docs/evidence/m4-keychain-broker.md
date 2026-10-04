# M4 evidence: Keychain helper, secure CLI routes and the per-connection broker

Spec: `docs/doperpowers/specs/2026-10-02-standalone-cua-design.md`, milestone M4. Run on 2026-10-02, macOS 26 arm64,
Swift 6.3.3, host Node 22.23.2. `$CUA_HOME` below is the M2 scratch install (`/tmp/cua-m2-archive.*`).

## What exists

- `native/keychain/` (Swift package). Production product `cua-keychain` = `CuaKeychainCore` (labels, hidden terminal
  input, command routes, broker) + `CuaKeychainStore` (Security `SecItem*`, service `cua.secrets`, account = label).
  Test-owned products `cua-keychain-testhost` (same router and broker over in-memory storage) and `cua-keychain-pty`
  (pseudo-terminal driver) link `CuaKeychainTestSupport`; the production product does not, and cua never locates them.
- Helper routes: `set <label>` (stdin must be a terminal; reads `/dev/tty` hidden, twice), `list` (label JSON),
  `remove <label> [--yes]`, `broker` (configured on stdin). No get/export/print route; no value argument, flag or
  environment variable.
- `cua secrets set|list|remove` (`src/secrets/commands.mjs`) route to the helper with only the label (and `--yes`).
- Broker wire (protocol 1): one request and one reply per connection, 4-byte big-endian length + UTF-8 JSON;
  request ≤ 1024 bytes (refused from the header otherwise), reply ≤ 256 KiB, 2 s to deliver a request, ≤ 16
  connections, same-uid peers only, token compared (constant time) before anything else is examined. Typed outcomes:
  `unauthorized malformed oversized invalid_label not_found denied locked unavailable unsupported_value
  response_too_large`.
- Per connection, `cua serve` starts `cua-keychain broker` before the runtime: endpoint `$CUA_HOME/run/<session>.sock`
  (0600, never replacing an existing path), 32-byte random token written with the endpoint to the helper's stdin;
  the same pair goes only into the runtime's launch environment (`CUA_SECRETS_BROKER_ENDPOINT/_TOKEN`), which the M3
  anchor receives over IPC. The helper's stdin is its lease (EOF or server death stops it and removes the socket);
  close is EOF, SIGTERM, SIGKILL within the teardown budget, concurrently with the runtime's teardown.
- `secrets_list` returns `{status:"ok", labels}` through that broker, or `unavailable`/`error` with a code
  (`secrets_disabled`, `helper_not_built`, `broker_failed`, `locked`, ...). Secrets being unavailable never fails the
  connection.
- `cua doctor` adds `secrets.helper` (built? broker protocol marker read from the binary, never executed) and
  `secrets.signing` (from `codesign`): not built or no stable identity is `blocked`, a stale protocol or invalid
  signature is `fail`.
- `src/secrets/client.mjs`: the trusted-side client M5's wrapper uses (`brokerClientFromEnv`, default transport
  `nodeRepl.nativePipe.createConnection`, never `node:net` inside the worker).

## Suites

| Suite | Result | Notes |
|---|---|---|
| `npm test` | PASS, 145 tests (after review fix wave 1) | Node only. Proof it never runs the helper: with the built helper replaced by a script that records any execution, the whole suite passed and nothing was recorded (doctor reads the file and runs `codesign` only; served processes run with `CUA_SHIM_SECRETS=off`; in-process serve tests inject a JavaScript stand-in for the broker lifecycle). |
| `npm run build:helper` | PASS | release `cua-keychain`, linker ad-hoc signature; doctor: `secrets.helper` PASS, `secrets.signing` BLOCKED (ad-hoc). |
| `npm run test:helper` | PASS, 55 Swift tests + 7 Node-driven executable tests (after review fix wave 1) | No Keychain access, no prompts. Swift: hidden input on real ptys (no echo, editing, ^C/^D cancel, too long, invalid UTF-8, empty; modes restored each time; an overlong 4500-byte paste and input typed after ^C leave nothing queued for the next reader and nothing echoed), command routes on in-memory storage, broker over real sockets (token first, malformed/oversized/stalled clients, 0600 endpoint, no replacement of existing paths, removal only of its own socket), executables: production `set` refuses without a terminal and refuses argv values without echoing them; production `set` on a pty cancels and mismatches with the terminal restored and nothing echoed; SIGTERM/SIGHUP during the hidden prompt restore the terminal before the process dies; test host broker stops on stdin EOF or SIGTERM and removes its socket; pty driver seeds and times out cleanly. Node-driven: `src/secrets/broker.mjs` + `client.mjs` against the actual broker; the production broker refuses forged/malformed/oversized requests before any storage call. |

## Opt-in live Keychain roundtrip (`npm run test:keychain-live`): PASS

One disposable item (`cua-live-<uuid>`, generated sentinels, removed in `finally`), ad-hoc signed production helper:
create through the hidden prompt via the pty seeding fixture (terminal restored, value not echoed), label listed,
broker → trusted client returned exactly sentinel 1, replace with sentinel 2, broker returned exactly sentinel 2, a
forged token got `unauthorized`, broker closed after EOF with its endpoint removed, item removed and no longer listed.
No prompt appeared. The report (metadata only) was checked for both values before it was written.

## Signing diagnostics (no prompt at any step)

- `security find-identity -p codesigning` lists an Apple Development identity and no Developer ID Application identity.
- Signing a copy of the helper with the Apple Development identity (`codesign --force --sign …`) completed without a
  prompt; `npm run build:helper -- --sign "<identity>"` did the same on the build output (restored to ad-hoc after).
  Doctor reports it `blocked`: stable on this machine, not a distribution signature.
- Trust across rebuilds with a stable identity: an item created by copy A (Apple Development) was read without any
  prompt by copy B, signed with the same identity but with a different CDHash (`--options runtime`), i.e. the same
  designated requirement. Both reads returned the exact generated value; the item was removed afterwards.
- Not tested: an ad-hoc rebuild reading an item created by a previous ad-hoc build. It is expected to raise a Keychain
  access prompt, which this run must not cause. Stable release signing (Developer ID) and its behavior across upgrades
  remain a release gate (acceptance 9): BLOCKED, no identity.

## Live runtime check (`node verify.mjs`, `$CUA_HOME` scratch install): PASS

Four tools; `secrets_list` `{status:"ok"}` with 0 labels through the actual broker; the broker ran as the server's
second child (`native/keychain/.build/release/cua-keychain`), beside the anchor; the relocated runtime ran normally
with the broker variables in its environment; after EOF the server exited 0, the broker process was gone and nothing
new was left under `$CUA_HOME/run/`.

## Not yet shown (M5)

The trusted worker reaching this Swift broker through `nodeRepl.nativePipe` (M1 proved nativePipe reaches a probe
socket), the shape of nativePipe's stream with the 4-byte framing, and sentinel confidentiality on the substituted
input path.
