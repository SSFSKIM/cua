## Report: can a CODEX_CLI_PATH launcher that implements only `sandbox` work for macOS computer use?

Everything below is static: I read files, ran `strings`, `nm -u`, `otool -L`/`-tv` and `ps`, and executed nothing. I did not open auth.json, tokens or keys. `[V]` means verified from a file, disassembly or string. `[I]` means inferred.

Path abbreviations:
- R = `~/Library/Application Support/cua/runtimes/26.928.40906-darwin-arm64`
- O = `R/cua_node/lib/node_modules/@oai`
- T = `/Users/new/.claude/jobs/1ea561bc/tmp`
- NR = `T/116-node-repl-embedded` (JavaScript recovered from node_repl's binary)
- SS = `O/sky/dist/project/cua/sky_js/src`
- H = `O/sky/Codex Computer Use.app/Contents`

### Bottom line
- **The JavaScript side is clean.** On the macOS computer route (vendor node_repl + vendor sky through cua's wrapper, with cua's own browser service or no browser surface), no JavaScript reaches an app-server-backed call. This holds because cua sets `NODE_REPL_DISABLE_ANALYTICS=1`.
- **The browser-surface calls that do reach the app-server** come only from the vendor browser service. That service is in use only with `CUA_BROWSER_SERVICE=vendor` or on the ChatGPT-extension route.
- **node_repl fails per call, not per runtime.** A launcher that refuses `app-server` costs one call, and node_repl retries the spawn on the next call. It never verifies the CLI's code signature.
- **The native helper is the open risk.** `SkyComputerUseService` and `SkyComputerUseClient` contain their own Codex app-server clients. Their policy provider reads `configRequirements/read`, and their CLI locator honours `CODEX_CLI_PATH`. A `sandbox`-only launcher may therefore break or degrade native calls, and static analysis cannot tell which. Section 4 has the details.

### 1. Which JavaScript reaches the app-server-backed APIs

**Where the privileged APIs live [V].**
- `trusted-worker.js:83-99` sets `globalThis.nodeRepl` to the privileged runtime.
- That runtime exposes `config` (`readToml`, `writeToml`, `read`, `readRequirements`, `writeValue`, `batchWrite`), `fetch`, `nativePipe`, `launchServices`, `createElicitation`, `env` and more (`NR/privileged-node-repl.js:440-673`; `NR/privileged-node-repl-config.js:131-254`).
- Model cells get only the basic API plus `rpc` (`NR/INDEX.md`, "Sources, bootstrap, and trust boundary").
- Each config call becomes a `config_action` message. `read_toml` and `write_toml` are served locally by node_repl. `read_config`, `read_config_requirements`, `write_config_value` and `batch_write_config` go to the app-server (`NR/INDEX.md:51`; `privileged-node-repl-config.js:154-240`).
- `nodeRepl.fetch` becomes an `authenticated_fetch` message (`NR/privileged-node-repl.js:132-196`). Rust attaches a ChatGPT account header and originator `codex_browser_use` (`T/node_repl.strings:32056`) and gets the token through `getAuthStatus` (`T/auth-request-disassembly.txt`).
- Which URLs `authenticated_fetch` authenticates is not statically known [I].

**Scan result [V].** I searched all of O (`sky`, `cua-repl`, `cua`, `browser-desktop`) and `R/chrome-plugin` for `readRequirements`, `config.read`, `config.write*`, `batchWrite`, `writeValue`, `readToml`, `writeToml`, `getAuthStatus`, `accessToken`, `authenticated_fetch` and `.fetch(`. Every hit is in one of three copies of the same vendor browser-service module:
- `O/browser-desktop/scripts/browser-service.mjs`
- `O/cua/dist/lib/js/oai_js_browser/dist/skill/scripts/browser-service.mjs`
- `R/chrome-plugin/scripts/browser-service.mjs`

Besides those, one other file touches the APIs: sky's `computer-use-telemetry.js`. No JavaScript anywhere uses `config.writeValue`, `config.batchWrite`, `getAuthStatus` or an access token. Those exist only in node_repl's Rust and the helper.

| Hit | Route |
|---|---|
| `SS/targets/mac/computer-use-telemetry.js` (minified, one line): `g()` needs `nodeRepl.config` and `nodeRepl.fetch`, then Statsig `networkOverrideFunc:(e,t)=>n.fetch(e,t)` and `n.fetch("https://chatgpt.com/backend-api/me")`. `m()` returns early when `_(n)` is true, i.e. `NODE_REPL_DISABLE_ANALYTICS==="1"` or `BROWSER_USE_DISABLE_AMBIENT_NETWORK==="1"`. | Computer route, **inert on cua's launch**: `src/runtime/launch.mjs:202` sets `NODE_REPL_DISABLE_ANALYTICS='1'` [V]. The trusted worker's `env` is the full process env (`trusted-worker.js:~68-74`) [V]. |
| Other sky mac files (`computer-use-policy.js`, `native-pipe.js`, `client.js`, `audio_recording.js`) | They use only `createElicitation`, `withSuspendedTimeout`, `setResponseMeta`, `requestMeta`, `nativePipe`, `launchServices` and `env`. None is app-server-backed [V]. |
| Sky windows files (`helper_transport.js`: `nodeRepl.config` presence check only) | Windows only. |
| `src/services/sky.mjs` (cua's trusted wrapper) | No hit [V]. It delegates `handleRpc` and does secret substitution only. |
| `src/services/browser.mjs` and `src/browser-service/**` | No hit [V]. Only `nativePipe`, `requestMeta`, `env`, `addTurnEndedHandler`, `addAfterSubmittedCodeHook` and `emitContentItem` are used. `test/browser-service/no-network.test.mjs:20` makes `fetch`, `config`, `telemetry` and `createElicitation` throw on any use. |
| `O/cua-repl/**` (vendor launcher) | No `nodeRepl` use and no hit. It only registers `@oai/sky/service` and `@oai/browser-desktop/service` in `NODE_REPL_TRUSTED_SERVICES` (`dist/lib/js/oai_js_cua_repl/src/launch.js`) [V]. |
| Vendor `browser-desktop/scripts/browser-service.mjs:9826`: `config.readRequirements()` and `readAll()` in history permission, auto-review and full-CDP policy checks | **Vendor browser service only**: `CUA_BROWSER_SERVICE=vendor` or the ChatGPT-extension route [V]. |
| Same file `:9845`: `t.config.read({cwd,includeLayers:false})`, `t.config.readRequirements()`, plus `config.readToml`/`writeToml` for `browser/config.toml` and `browser/sessions/*.toml` | Vendor browser service only. `readToml`/`writeToml` are local to node_repl, not app-server calls [V]. |
| Same file `:6432` (Statsig with `networkOverrideFunc`; `DB` fetches `https://chatgpt.com/backend-api/aura/identity`), `:6498` (site-status `t.fetch(e,r)`), `:9870` (Sentry transport `t.fetch`) | Vendor browser service only. It does not read `NODE_REPL_DISABLE_ANALYTICS`; its suppressor `cn` reads only `BROWSER_USE_DISABLE_AMBIENT_NETWORK` (`:6429`, `:6432`), which cua does not set [V]. |

The computer route also reaches no app-server-backed call from the kernel/cell side [V].

### 2. What node_repl does when the app-server cannot start or errors

**Spawn [V].** `CodexAppServerConnection::spawn` (`T/app-server-spawn-disassembly.txt`, 0x1002348e4):
- It checks the runtime mode, which can end in "Codex app-server is unavailable in gaas-browser runtime mode".
- It reads `CODEX_CLI_PATH` with `std::env::var`.
- It builds `Command::new(...)` with three `arg` calls, which are `app-server --listen stdio://` per the strings (`T/node_repl.strings:32078`).
- It sets stdin, stdout and stderr, then calls `spawn` and `build_child`.
- No Security, code-signing or path-validation call appears in this function.

**Request path [V for the structure, I for the exact tag meaning].** `CodexAppServerClient::send_request` is at `T/app-server-request-disassembly.txt` 0x1002162b4 and later. It takes a tokio semaphore, which serializes callers, and keeps an `Option<Connection>` slot (value 2 means empty).
- **Empty slot.** It calls `spawn` at 0x1002164e0. If spawn returns Err (`cmp x25,#2; b.eq 0x100216ba0`), it releases the lock, stores no connection, and returns Err for this call only. The next call tries to spawn again.
- **Post-spawn initialize fails.** The new connection is dropped (0x100216b98) and Err is returned.
- **A request on a live connection returns Err (tag 0xff).** The slot is reset to empty (0x100216a8c-0x100216aa8). The next call respawns the process. There is no retry inside the call.
- **Panics.** There is no abort path beyond an `expect` on a slot just filled.

**Error strings [V].**
- Spawn/initialize: `failed to start codex app-server: ` (`T/node_repl.strings:40179`).
- Dead child: `codex app-server exited before returning <method>` (`:40065`).
- Hung child: `timed out waiting for <method> from codex app-server` (`:40049-40061`). The timeout duration is not determined.
- JSON-RPC error reply: `codex app-server rejected …` (`:40182`).
- Bad output: `codex app-server returned invalid JSON` (`:40066`).
- I/O: `failed to write/flush/read codex app-server …` (`:40060-40067`).
- Auth: `codex app-server auth fetch failed` (`:32012`) and `Codex auth token is unavailable` (`:32146`).

Whether a JSON-RPC rejection also drops the connection depends on where "rejected" is raised, which I did not trace [I].

**JavaScript side [V].**
- A failed config action rejects with `res.error` (`NR/privileged-node-repl.js:395-421`).
- A failed `nodeRepl.fetch` rejects with `result.error || "nodeRepl.fetch failed"` (`privileged-node-repl.js:165-168`).
- The vendor browser service swallows config failures with `try/catch` (`browser-service.mjs:9826`) and the identity fetch errors (research notes).
- Background fetches are not awaited: `void operation.catch(()=>{})` (`privileged-node-repl.js:190-193`).
- The reject is returned to the caller as an error message. Nothing marks the runtime as failed.

**Verdict.** Failure fails the one call and caches nothing. A launcher that exits immediately yields "exited before returning initialize" per attempt. A launcher that stays alive and silent hangs each call until the timeout. For `app-server`, a launcher should exit non-zero at once with a clear message on stderr. Stderr is inherited by node_repl, so the message goes to node_repl's stderr [I].

### 3. Does node_repl verify the CODEX_CLI_PATH executable's signature?

**No evidence of any check [V].**
- `otool -L` on `R/cua_node/bin/node_repl` lists Security, CoreFoundation, libiconv and libSystem.
- `nm -u` shows the only Security symbols are `SecCertificateCopyData`, `SecCertificateCopySubjectSummary`, `SecCertificateCreateWithData`, `SecCopyErrorMessageString`, `SecPolicyCreateSSL`, `SecTrustCreateWithCertificates`, `SecTrustEvaluateWithError`, `SecTrustSetAnchorCertificates(Only)`, `SecTrustSetOCSPResponse`, `SecTrustSetVerifyDate`, `SecTrustSettingsCopyCertificates` and `SecTrustSettingsCopyTrustSettings`. This is the TLS trust verifier for network requests.
- None of these appear in the imports: `SecStaticCode*`, `SecCode*`, `SecRequirement*`, `kSecCS*`, `csops`, `proc_pidpath`, `getpeereid`, `audit_token`.
- `strings -a` on the binary finds none of: "anchor apple", "certificate leaf", `identifier "com.openai`, "codesign", "csops". The only team-id hit is the path `…/Library/Group Containers/2DC432GLL2.com.openai.sky.CUAService/Library/Application Support/Software/ComputerUseAppApprovals.json` (`T/node_repl.strings:32132`). `codeSigning` at `:41468` is an X.509 EKU name in webpki.
- The sandbox builder (`T/sandbox-disassembly.txt`, `build_command_spec`) makes no code-signing call. node_repl checks only the Node version (`failed to read Node version`, `Node runtime too old`) and the sandbox profile.
- `getsockopt` and `getpeername` are imported, but that does not show a peer-credential check. I did not disassemble them [I].

**Where signature and ancestry checks actually live: the native helper, not node_repl [V strings, I semantics].**
- `SkyComputerUseService` strings include `trustedProcessRequirement`, `allowedRelayRequirement`, `parentIdentity`, `ancestorIdentities`, `senderAncestorIdentities`, `teamIdentifiers`, `identifiers`, `executableNames`, `senderProcessNotAuthenticated`, `relay_without_trusted_ancestor`, `untrusted_parent`, and `cua_ipc_sender_{parent,responsible}_{team_id,signing_id,bundle_id,executable}`.
- Nearby literals are the team ids `2DC432GLL2`, `HX7739G8FX` and `MQ55VZLNZQ`, and the executable names `node` and `node_repl`.
- The socket peer is node_repl (the relay). The Codex CLI is a child of node_repl, not an ancestor of the socket client (`docs/evidence/m1-runtime-portability.md` lines 24-33).
- So a launcher that replaces the CLI should not affect the helper's sender check [I]. The launcher sits between node_repl and the sandboxed Node, and the socket is opened by node_repl itself (`NR/INDEX.md`, "native_pipe_request … Rust opens/closes/writes real sockets outside child sandbox").
- The helper may also look at "responsible" and ancestor identities of its client. Whether a launcher in the chain matters for that is untested [I].

### 4. Does the sky service or the native helper need anything from the CLI or app-server?

**Vendor sky JavaScript: no CLI or app-server dependency [V].**
- It reads `CODEX_HOME` only to find an optional app copy at `$CODEX_HOME/computer-use/Codex Computer Use.app` (`SS/targets/mac/native-pipe.js`).
- The helper start order is: `SKY_CUA_SERVICE_PATH` first, then `$CODEX_HOME/computer-use/Codex Computer Use.app` if it exists, then bundle id `com.openai.sky.CUAService`, started through `/usr/bin/open` (`T/node_repl.strings:26466`).
- cua sets `SKY_CUA_SERVICE_PATH` (`src/runtime/launch.mjs:205`), so the second step is never needed here.

**The native helper has its own Codex app-server client [V strings, I behaviour].** Strings in `SkyComputerUseService` (`/tmp/h_SkyComputerUseService.strings`, which I extracted from the binary):
- `CodexAppServerJSONRPCConnection`, `CodexCLILaunchConfiguration`, `CodexCLIExecutableLocator` and `CodexHomeDirectory` (lines 26853-26862).
- `CodexAppServerAuthCache` (`cachedAuth`, "unsupported Codex auth method") at 28425.
- `CodexAppServerComputerUsePolicyProvider` (`cachedPolicy`, `cachedAt`, literal `configRequirements/read`, `featureRequirements`, `allowBrowserAndComputerUse`, `allowPersistentApproval`, `defaultAppAccess`) at 28553-28564.
- `CodexAppServerIdentityConnection` with a hard-coded fallback `/Applications/Codex.app/Contents/Resources/codex` and "codex app-server exited before returning auth status" (31167-31183).
- The message "Computer Use is disabled by your configuration." (28844).
- `SkyComputerUseClient` carries similar strings, plus a "Handles a Codex turn-ended notification" subcommand (`turn-ended`, `agent-turn-complete`).
- The disassembly (`/tmp/h_svc.dis`, from `otool -tv`) references the `configRequirements/read` literal at 0x10009e22c.

**CLI discovery [V].** At 0x100d18c20-0x100d18d1c the helper builds the string "CODEX_CLI_PATH", looks it up in its environment dictionary, and tests it with `NSFileManager`. Fallback candidates are `Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex` and `Contents/Resources/codex`. That I believe this function is the locator is an inference.

**What I could not determine statically:**
- The helper's behaviour when the app-server fails or the CLI is missing.
- Whether the helper's environment contains `CODEX_CLI_PATH` or cua's `CODEX_HOME` when node_repl starts it through `/usr/bin/open`. I could not find an `--env` literal in node_repl.
- cua's own docs say a helper started by cua's runtime reads cua's `CODEX_HOME` (`docs/evidence/2026-10-14-native-baseline/README.md:52`). That suggests the environment, or at least `CODEX_HOME`, does reach the helper [I].

**One prior failure fits an app-server dependency [I].**
- `docs/evidence/2026-10-14-native-baseline/README.md:52` records `Computer Use server error -10005: invalid configuration: invalid type: map, expected a boolean in features` on every native call.
- It occurred while a helper started by another client ran against a `~/.codex/config.toml` that the pinned `codex` CLI also rejects.
- The text is a serde-style Rust error, and it is not in the helper's strings. So the helper appears to relay an error from the CLI, probably the policy read, and that error failed the native call.

**Other helper dependencies:**
- `CODEX_HOME/config.toml` is 247 bytes and contains only a `notify = [<SkyComputerUseClient path>, "turn-ended"]` line, which I read. The helper binary contains `CodexConfig`/`EncodedConfig`/`NotifyComparisonItem` types and a `--previous-notify` option. It most likely wrote this file itself, on 2026-10-03 [I].
- `notify` fires only when a Codex agent turn completes. node_repl never starts one; `turn_ended` is an MCP tool [I]. The `notify` command is not needed on cua's route.
- The helper also uses `codex exec --sandbox read-only …` and app-server thread/model calls for the optional event-stream/Record & Replay evaluator (strings near 28592-28594, 50-ish `--ephemeral`, `--thread-source`). That is a separate optional feature [I].
- The helper's telemetry reads auth through its own `CodexAppServerIdentityConnection` [I]. I found no `NODE_REPL_DISABLE_ANALYTICS` or `DISABLE_ANALYTICS` literal in the helper, so cua's env flag likely does not suppress that [I].

**`<CUA_HOME>/state/codex/computer-use` by names (CUA_HOME defaults to `~/Library/Application Support/cua`):** only `sessions`, an empty directory. There is no `Codex Computer Use.app` there.

### Recommendations
1. Treat `app-server` as unused for node_repl's own JavaScript on the macOS computer route. For the helper, I could not establish static behaviour.
2. Settle the helper dependency with a disposable-home live test, which this task forbade. Run a cua session with `CODEX_CLI_PATH` pointing at a stub that logs its argv and exits non-zero on `app-server`. Then check whether the stub is invoked with `app-server`, and whether native `getState`, `getApp` and click calls succeed.
3. Make the launcher fail fast on `app-server`. Exit non-zero immediately and write a one-line explanation to stderr. Do not hang.
4. If the helper turns out to require `configRequirements/read`, the cheapest fix is a minimal app-server that answers `initialize` and `configRequirements/read` with permissive `featureRequirements` and `getAuthStatus` with "no auth". That is a separate project from the `sandbox` launcher.
5. The vendor browser service is the other consumer of the app-server (config, requirements, identity). Keeping `CUA_BROWSER_SERVICE=cua` avoids it (`README.md:609`).

Derived artifacts I wrote, not part of any repo:
- `/tmp/h_SkyComputerUseService.strings`
- `/tmp/h_SkyComputerUseClient.strings`
- `/tmp/h_svc.dis`
- `/tmp/h_svc_codexcl.txt`