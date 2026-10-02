# Standalone CUA MCP and secret substitution

## Purpose

Make the real OpenAI `cua_repl` usable as an independently installed macOS MCP server, without Codex/ChatGPT desktop installed or running. A user installs a pinned automation runtime, registers `cua serve` with their agent host, and asks it to operate native applications. They can store a credential with `cua secrets set work-password` through a hidden terminal prompt, then authorize their agent to type `{{secret:work-password}}`; trusted code substitutes the Keychain value without putting that value into the agent's source code or ordinary tool transcript.

The first delivery is native control plus secrets (approved phases A+B). Existing-profile Chrome through an extension bridge is the committed next phase; an adapter to a future MAWS in-app browser follows. The Chrome integration must use the user's real existing profiles, cookies, signed-in sessions, settings and browser password manager. A separate or newly created profile is not a substitute. MAWS itself owns its future browser UI and importing cookies, credentials and extensions; this repository will only supply the automation adapter. Do not change MAWS application code, specs, configuration or research files.

The intended source-checkout usage after this execution is:

```sh
npm test
npm run build:helper
npm run test:helper
node bin/cua.mjs install
node bin/cua.mjs doctor --json
node bin/cua.mjs secrets set work-password  # hidden input, human at a terminal
node bin/cua.mjs serve                    # MCP over stdin/stdout
```

After `npm link`, the same commands are available as `cua`. No package-registry publication is required to prove this work. Proposed `claude mcp add` registration is documented but the implementation must not silently replace the owner's existing MCP registration.

## Progress

- [x] (2026-10-02) User approved reusable MCP first, secure-prompt Keychain management, existing-profile Chrome first among browsers, MAWS-owned future profile import, and this phased architecture.
- [x] (2026-10-02) Isolated checkout `/Users/new/Developer/GitHub/cua`, branch `feat/standalone-runtime`, created from `SSFSKIM/cua` main at `54cf811`.
- [x] (2026-10-02) Existing `node verify.mjs` baseline passes: rmcp 1.5.0, `js`, `js_reset`, `turn_ended`, `problems: []`. This baseline still uses installed ChatGPT runtime.
- [x] (2026-10-02) Official feed returned the pinned release URL; local archive SHA-256 and byte length verified (Acquisition section).
- [x] (2026-10-02) Revised spec for verified buildability findings: terminal handling of uncertain completion, separate Node/actual-Swift test suites, and reproducible opt-in real-Keychain roundtrip. Documentation only; no execution acceptance claimed.
- [x] (2026-10-02) Independent technical spec and execution/buildability review reports received; both were dispatched as `astra-high` at the user's request.
- [x] (2026-10-02) Parent verified all three review corrections against lifecycle, interfaces, milestones and acceptance commands; `git diff --check` passes. No material finding remains. Execution/acceptance are not yet completed; the minor surfaces-setting documentation note is tracked in `tech-debt-tracker.md` for M2.
- [ ] M1 — Record relocation and trusted-wrapper feasibility.
- [ ] M2 — Install and diagnose the pinned standalone runtime.
- [ ] M3 — Serve MCP with coherent connection/task lifecycle.
- [ ] M4 — Secure-prompt Keychain helper and private broker.
- [ ] M5 — Native secret substitution through trusted wrappers.
- [ ] M6 — Integrate packaging, run acceptance, record release gates and review.
- [ ] Clean-machine desktop-absence, fresh-permission onboarding, stable release-signing acceptance (requires suitable environment/user participation).
- [ ] Later execution: existing-profile Chrome bridge and browser substitution; then MAWS-hosted in-app-browser adapter.

## Repository and evidence

At the baseline this is a small plugin repository: `cua-shim.mjs` is the stdio proxy, `verify.mjs` checks handshake and tools, `.claude-plugin/plugin.json` launches it, and `hooks/hooks.json` invokes upstream `turn_ended`. There is no package manifest or test suite. M1/M2 introduce the Node test runner and narrow modules; no Electron dependency is needed for the first delivery. Treat this standalone repository as the source of truth going forward; do not push a MAWS subtree over it.

Confirmed prior behavior: the shim hosts native CUA under Claude Code; the native service accepts a chain with the vendor-signed `node` above `node_repl`, without requiring a desktop-app ancestor. Its names and signatures matter. Browser APIs already exist in CUA. A separate fixture with its own socket and session ID was selected as an `iab` backend: `isError:false`, `selectedFixture:true`, backend methods `["getInfo"]`. The fixture used installed 26.928.31416 binaries while the desktop remained present; it proves selection, not browser operations or desktop absence.

Local research aids (not runtime/build prerequisites):

- `/Users/new/codex-app-src/readable/chatgpt-26.928.40906/MAP.md` and its `cua_node/@oai/` tree.
- `.../cua-repl/dist/lib/js/oai_js_cua_repl/src/launch.js:11-77`: configurable launcher and trusted-service override.
- `.../browser-desktop/scripts/browser-service.mjs:68041-68213`: exact session/turn match for completion and retention.
- `.../sky/dist/project/cua/sky_js/src/targets/mac/native-pipe.js:37-48,163-186,314-316`: fixed socket, LaunchServices fallback, strict IPC version.
- `/Users/new/Developer/GitHub/MAWS/research/codex-computer-use/README.md` section 7 and `spikes/computer-use-probe/findings.md` for prior native trust results; read-only.
- `/tmp/cua-own-backend-discovery.mjs` and `/var/folders/c1/l4z5k02n2779byvnymzxsvth0000gn/T/cua-owned-backend-SvWSIj/summary.json`: prior fixture; durable findings below preserve the conclusion if temporary files vanish.

## Approved design

### Scope and reuse

Keep vendor runtime files unchanged. Replace desktop hosting, configuration discovery and, later, browser connection backends. Do not recreate the model loop or the full desktop application. macOS arm64 is the first supported target because it is the actual inspected artifact; other targets receive a clear unsupported-platform error, not a guessed download.

Use Node ESM and built-in libraries for CLI, installer, MCP proxy and tests, plus a small Swift/Security helper. Begin with the full dependency closure rather than prematurely pruning packages. Secret wrappers are plain JavaScript so vendor Node need not load our differently signed native addon. A generic MCP server is the primary interface; the Claude Code plugin is an adapter.

### Acquisition and runtime ownership

Pin the following release in `runtime/releases/26.928.40906-darwin-arm64.json`:

- Official archive: `https://persistent.oaistatic.com/codex-app-prod/ChatGPT-darwin-arm64-26.928.40906.zip`
- Length: `687457051` bytes.
- SHA-256: `93bf16b32c80c567e46141f87317ab48489f5b9b6454060ba694f1eed5fbf857`.
- Runtime: `0.0.27/20260927214556-b77d38801cca`; node `24.21.0-cua.1`; expected native IPC `CodexComputerUseIPC-5`.
- Extract `ChatGPT.app/Contents/Resources/cua_node/` and `ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/` only into the final runtime tree. The `cua_node` tree includes `@oai/sky/Codex Computer Use.app`. Do not run its lock-screen installer.
- Development archive already available at `/Users/new/codex-app-src/_dist/ChatGPT-darwin-arm64-26.928.40906.zip`; `install --archive PATH` must apply the same hash/signature checks, not grant an unchecked developer bypass.

`CUA_HOME` defaults to `~/Library/Application Support/cua`. Layout: `runtimes/<release>/` (immutable extracted components), `current.json` (active release pointer), `state/codex/` (runtime config/approvals), `run/` (private per-connection broker endpoints), and metadata-only diagnostics. Test/probe output uses an explicit scratch CUA_HOME outside the repository. No credentials or vendor binaries enter git or npm packages.

Verify the archive before extraction, extract in a staging directory owned by this operation, validate the expected manifest and vendor code signatures/team `2DC432GLL2`, then atomically activate. Preserve modes, symlinks, extended attributes and normal macOS provenance; do not strip quarantine, bypass Gatekeeper, re-sign vendor components or place them in our own signing pipeline. Partial extraction or validation failure leaves the old pointer intact. Install is idempotent for a verified release. `runtime use <installed-release>` selects a verified installed release; tests demonstrate failed activation and pointer rollback without fabricating a second real vendor version. New releases require explicit checked-in pins/compatibility work, not automatically selecting the feed's latest version.

Generate an allowlisted child environment. Retain required OS variables explicitly, set relocated `CUA_REPL_NODE_REPL_PATH`, `NODE_REPL_NODE_PATH`, `NODE_REPL_NODE_MODULE_DIRS`, `NODE_REPL_TRUSTED_CODE_PATHS`, `CODEX_CLI_PATH`, `SKY_CUA_SERVICE_PATH` and CUA-owned `CODEX_HOME`. Do not read `~/.codex/plugins/cache` or inherit ambient `NODE_REPL_*`, `BROWSER_USE_*`, `SKY_*` overrides. Keep the vendor CLI sandbox; no unsandboxed fallback. The native helper starts through the vendor LaunchServices/open mechanism, not an arbitrary direct child spawn.

The fixed native socket and some persistent approval state remain per-user vendor resources. A compatible running helper may be reusable; record which helper actually served a live probe. An incompatible helper is a diagnosed conflict, never killed or overwritten. This cannot demonstrate independent helper startup while an installed desktop's helper is serving requests. Runtime files in an app-independent location alone do not prove cold start or a desktop-free installation.

### MCP/task lifecycle

A task is the server's explicitly bounded sequence of tool calls; it is not a model conversation turn. One MCP stdio connection owns one runtime/JavaScript heap and a random connection session ID. Serialize `js`, `js_reset` and completion transitions. Independent workers should use separate connections. Do not infer caller identity from `toolUseId`; subagents sharing a connection share its state and approvals.

The model-visible tools are `js`, `js_reset`, `end_task` and `secrets_list` (labels only). Keep upstream `turn_ended` private to the proxy; callers cannot supply arbitrary runtime IDs. Preserve upstream descriptions/schema for `js` and `js_reset` with concise accurate host notes. Maintain image MIME correction and elicitation forwarding/persistence behavior. Do not auto-accept user prompts.

State and transitions:

| State/event | Required result |
|---|---|
| Idle + `js` | Mint task ID; dispatch with stable `session_id` and `turn_id=taskId`, distinct call ID; become Active. |
| Active + `js` | Queue/dispatch within same task; new call ID only. |
| Idle + `end_task` | Return `{status:"noop",ended:false}`; no upstream completion. |
| Active + `end_task` | Become Ending at request admission; stop new work admission, finish/cancel outstanding work within the completion deadline; after confirmed quiescence call upstream `turn_ended` once with matching parameters AND metadata. Only quiescence plus a successful upstream acknowledgement permits `{status:"ended",ended:true}` and return to Idle. |
| Ending + new work | Reject clearly as task-ending; do not quietly attach it to another task. |
| Ending + deadline/error | If JS ignores cancellation, completion times out, or an error leaves cleanup uncertain, enter terminal Failed/Closing; reject all new work, fail pending callers once, and tear down owned resources. Never reuse this heap. |
| Repeated completion | Coalesce with the in-progress result; no-op only after successful completion in Idle. Never send mismatched IDs or turn a failed completion into success. |
| Failed/Closing + any work | Reject as connection-failed/closing, including reset and completion; no new task or return to Idle. Late replies cannot revive the connection. |
| `notifications/cancelled` | Forward cancellation for that request; not automatic task completion or proof of quiescence. |
| `js_reset` | Serialized upstream reset; it is not automatic task completion or recovery from Failed/Closing. Keep server task identity, report runtime errors. Browser cleanup tracker survival is a phase-C gate, not assumed. |
| EOF/SIGTERM | Enter terminal Closing and stop admission; bounded best-effort task completion, then bounded termination of owned runtime/broker resources and MCP close/exit. A racing completion cannot return to Idle. |
| Upstream exit/error | Enter terminal Failed/Closing, fail pending callers once and release only owned resources; do not hang or admit a replacement task. |

`end_task` distinguishes success (`status:"ended", ended:true`), an Idle no-op (`status:"noop", ended:false`), and failure (MCP `isError:true` with a value-free `status:"error"` and classified code such as `completion_timeout` or `completion_failed`). Failure is never reported as a successful no-op; if transport is already gone, settle each pending caller internally once without attempting duplicate replies.

Completion includes whatever side effects the vendor implements, not just tab cleanup. The initial completion deadline is 5 seconds total for quiescence and upstream acknowledgement, adjustable internally for tests, not an idle timer. Cancellation acknowledgement alone does not prove JS stopped. On uncertainty, fail closed: bounded termination/reaping of owned runtime and broker processes/endpoints precedes MCP close, with a separate finite teardown budget (initially 5 seconds, internally adjustable). Never kill an unowned process, including a shared native helper. Terminating the owned runtime does not undo already submitted native actions; report native cleanup as unconfirmed on this failure path. A new task requires a new connection/runtime heap after failure; late success cannot clear the terminal state. Cancellation/control replies must not be serialized behind the JS call they must unblock. Preserve client/server JSON-RPC ID namespaces; internal requests must not consume a caller's response. End-task and state transitions need deterministic fake-server tests including concurrent calls and elicitations.

No default `Stop` or `SubagentStop` hook on a shared connection. A future host adapter may call `end_task` when it actually owns the task boundary. Server instructions tell agents to use it when finished. Do not claim cleanup after SIGKILL or immediate user-handback semantics not yet observed; native cancellation behavior is recorded now and full browser handback is tested in phase C.

### Secrets: simple trusted-side substitution

User-approved model: trust the agent to use credentials only when authorized. This is input substitution, not a destination firewall or a defense against deliberate secret extraction. Later screenshots, app output or page reads may expose a value. Do not add destination policy, credential-observation lockdown or a separate redaction platform.

`secrets set <label>` reads hidden input from a controlling terminal and confirms it without echoing; no raw secret argv, environment variable, CLI value flag or MCP form field. Use a dedicated Swift helper with Security `SecItem*` APIs, service namespace `cua.secrets`, account=label. Labels follow `[A-Za-z0-9][A-Za-z0-9._-]{0,127}`. `list` returns labels, `remove` deletes only the named item after explicit CLI confirmation. Do not add public `get`, export or print-value methods. Keychain storage and stable helper signing/access prompts must be tested; ad-hoc development results do not prove stable release ACL behavior. A missing signing identity is reported, not solved by changing system permissions or trusting a generic `security`/Node binary.

A private per-connection broker returns secrets only to the trusted wrapper over a private endpoint. Its capability token identifies that connection; it is not the credential value. Credentials never go through the untrusted REPL. Broker endpoints are private, bounded, authenticated and closed at connection end; the server owns their paths. Use test-injected storage for ordinary tests, never silently fall back to plaintext storage. Explicit real-Keychain tests create uniquely named disposable sentinel entries only and stop/report any user approval prompt.

Only an entire recognized text argument equal to `{{secret:<label>}}` expands. No substring interpolation or recursive expansion. Missing label, invalid label, locked/denied vault, broker disconnect or unsupported runtime shape fails before input with a value-free error. Nonsecret operations remain unchanged. Unsupported operations do not expand anything and are documented; arbitrary JavaScript/evaluate/CDP strings are never scanned or rewritten.

Trusted-service override: `NODE_REPL_TRUSTED_SERVICES` maps `sky` and (in phase C) `browser` to our plain-JS modules exporting `handleRpc`. Their realpaths and vendor modules are explicitly trusted. Import and delegate vendor exports to retain hooks; never modify vendor packages.

| Service | Structured command | Field eligible for full-reference expansion |
|---|---|---|
| sky | `{type:"execute",method:"paste",args:[input]}` | `input.text` |
| sky | `type:"execute",method:"type_text"` | `input.text` |
| sky | `type:"execute",method:"set_value"` | `input.value` |
| browser, later | `method:"execute"` or `"executeWithRecovery"`, `params.type:"playwright_locator_fill"` | `params.value` |
| browser, later | `params.type:"tab_ax_action"`, action kind paste/type_text/set_value | `params.action.text` or `.value` by kind |

Confirm exact pinned shapes in M1 before hardening. Wrapper substitutions occur inside the trusted worker after model code and MCP arguments have passed through. Console output there can be returned to the model: wrappers never log values. On a substituted command failure return a bounded value-free diagnostic instead of raw vendor exception/stack. Use sentinel tests to inspect observable upstream errors/traces; do not claim control over unobservable vendor telemetry. Native paste retains its documented system-clipboard behavior (restores prior content; clipboard managers may capture it). Preserve it rather than making keyboard typing silently corrupt non-ASCII secrets.

### Chrome and future embedded browser (retained design, later execution)

Phase C must attach through an authorized extension to the selected existing Chrome profile. Chrome keeps cookies, settings and its password manager in place. Test the existing Playwright extension transport as a backend-adapter seam first; if not usable through a stable interface, implement our own minimal extension/native host speaking the known CUA browser protocol. No borrowed Codex thread, copied live-profile directory, exported credentials or separate-profile replacement. Reusing the existing OpenAI extension/host is not assumed impossible, but is not the app-independent default because its registry/install/update path is desktop-coupled.

Preserve vendor browser-specific APIs. Backend protocol: explicit socket discovery, length-prefixed JSON-RPC; getInfo, tabs/create/attach/detach, executeCdp (Chrome DevTools Protocol commands), browser events, task completion and tab retention. Keep user tabs; exercise frames, dialogs, downloads, screenshots, autofill/user-required unlock, disconnect and takeover. Secret browser wrappers use the shared broker. Actual browser actions, authentication/network dependencies and secure-form capabilities remain to be measured; never use testing/security-bypass flags as a substitute for integration.

Phase D consumes tabs owned by MAWS's future browser and presents the same backend interface. Profile import, extension compatibility and migration guarantees are MAWS's work, not prerequisites of A+B or C. No implementation milestones for C/D are dispatched by this A+B execution; extend this living spec's execution after A+B, using the approved design and empirical seam results rather than restarting product design.

## Acceptance

Automated acceptance is necessary but not sufficient for a standalone release. Record each item as PASS, FAIL or BLOCKED with evidence. A test blocked on a clean VM, signing identity or human permission is not a pass, and does not prevent independent coding/tests from continuing.

1. `npm test` is Node-only and passes without Swift, ChatGPT installation, GUI access, real credentials or network. It includes installed-layout resolution, corrupt/wrong-platform archive handling, atomic activation/rollback, controlled environments, JSON-RPC forwarding, lifecycle races and wrapper failure cases. Separately, `npm run build:helper` builds the actual Swift helper and `npm run test:helper` tests that helper's production logic with injected in-memory/test storage and pseudo-TTY fixtures; no Keychain access, GUI or user prompts are required. A JavaScript imitation is not helper-test evidence. Both suites are required for M4 and M6; real Keychain/signing tests are separate opt-in evidence.
2. `install --archive <pinned.zip>` creates a verified private runtime tree. Running it again does not mutate verified files. Bad hash/manifest/signature cannot activate. Download mode obtains the same pin directly from the official URL.
3. `doctor --json` names the active release, required paths/signatures and compatibility status, and distinguishes installed-runtime health from live-helper/permission evidence. Missing runtime gives actionable install guidance; unsupported platform, incompatible helper, missing helper signing or permission requirements are explicit, nonzero when required capability is unavailable.
4. `serve` and `verify.mjs` expose the new four-tool surface and use relocated binaries/own configuration. Recorded process/path evidence contains no resolved installed-desktop runtime path. This proves relocated execution, not desktop absence while that app remains present.
5. A live native fixture creates/uses only its own disposable TextEdit document, types a benign marker, observes it through CUA and records a screenshot/AX result. Never edit user documents or other app state. Record whether the helper was existing or independently launched; test cold start only in an authorized suitable environment, not by quitting the owner's desktop process.
6. `secrets set` requires a TTY and uses hidden input; `list` and MCP `secrets_list` return labels only. The opt-in `node scripts/accept-native.mjs --live-keychain --report "$CUA_HOME/acceptance-keychain.json"` scenario creates a uniquely labelled disposable Keychain entry from a generated sentinel, replaces it with a second generated sentinel, and verifies each value through the actual Keychain helper → private broker → trusted wrapper → controlled target path. A test-owned native fixture/private channel seeds the values; no public raw-value CLI flag, environment variable, scripted `secrets set` stdin or public secret-get route is added. Assert correct substitution at the controlled fake target and absence of both values from normal MCP transport, agent code, logs, reports and failure output, including an induced substituted-command failure. Delete only the scenario-owned entry in `finally`, and explicitly report any cleanup failure. No real user credentials are read or used. Fake-target confidentiality evidence is distinct from intentional plaintext native readback: an optional combined `--live-keychain --live-textedit` run may verify UI delivery in its own disposable document, but readback/screenshot/AX content is target observation, not protected readback or a hidden-password guarantee. Prompt/signing/unavailable-runtime outcomes are BLOCKED, behavioral failures (including cleanup failures) are FAIL, and only an actual successful roundtrip with successful cleanup is PASS.
7. Every listed native input method is tested for exact reference expansion, ordinary input preservation, invalid/missing/denied secret rejection before dispatch, delegation, value-free errors and unsupported-shape failure. No generic code substitution. Broker unauthenticated/wrong-token requests do not retrieve secrets, and connection close releases its owned resources.
8. Session/task IDs remain stable where required; call IDs differ; end_task forwards a matching completion and distinguishes success/no-op/error. Only confirmed quiescence plus acknowledged upstream completion returns to Idle. Unresponsive JS, completion timeout/error and uncertain cleanup terminally reject work, settle pending callers once, and boundedly terminate only owned resources before MCP close; late old-task replies cannot start/revive a task. Repeats, reset, cancel, in-flight finish, elicitation, deadlines and EOF races do not deadlock or misroute replies. Per-connection approvals and native end-task/cancel behavior are observed and reported rather than assumed from browser source; terminating the owned runtime is not proof of native-action rollback or confirmed native cleanup.
9. Final native release gate: a clean macOS machine/VM with no desktop installation completes install, normal user-granted Accessibility/Screen Recording, native fixture and real Keychain substitution. A fresh account on this host only proves fresh-account permissions. Stable helper signing/access across upgrade is a separate required release result.
10. Packaging/plugin README reflects standalone requirements, approved limitations and exact commands. Existing direct-MCP registration is untouched. A clean temporary checkout can build/test without the author's research trees. No runtime archive, secret, credential log or machine-specific token is tracked.

Later Chrome acceptance: existing profile sessions/settings retained in place; live CUA actions and observations work; saved-credential/autofill interactions including user prompts are exercised; handoff/deliverable/task cleanup preserves user tabs; reset/disconnect/user takeover are tested. Backend selection alone is not acceptance.

## Interfaces and Dependencies

Use these module responsibilities; small internal helpers may be split without changing contracts.

- `bin/cua.mjs`: CLI entry, routes install/doctor/serve/runtime use/secrets commands. Node >=22 host; vendor runtime uses its own pinned Node.
- `src/runtime/manifest.mjs`: parse/validate the checked-in release pin and selected installed record; reject unknown/unsupported fields affecting execution. `resolveRuntime({home, release?})` returns relocated executable/module/helper paths plus the checked manifest or throws a classified error.
- `src/runtime/install.mjs`: `installRuntime({home, manifest, archivePath?})`, returns the validated installed record; does not run GUI code.
- `src/runtime/doctor.mjs`: `inspectRuntime({home, live:false})` returns `{ok, checks:[{name,status,detail}], runtime?}` with statuses pass/fail/blocked; passive by default, never opens apps or requests grants. Live probes are separate explicit scripts.
- `src/runtime/launch.mjs`: `buildLaunch({runtime,home,sessionId,services?,broker?})` returns `{command,args,env}`. Only relocatable manifest data and owned paths enter it; no cached desktop recipe.
- `src/mcp/server.mjs` and `src/mcp/task.mjs`: stdio proxy, internal request routing and above state machine. Existing `cua-shim.mjs` becomes a thin compatibility entry delegating to `serve`, not an independent fallback implementation. Keep settings overrides only when compatible with this spec; document removed desktop-recipe override.
- `src/secrets/reference.mjs`: exact marker/label parsing, pure and independently testable.
- `src/secrets/client.mjs`: trusted-only broker client, handles missing/denied/disconnected responses without values in errors.
- `src/services/sky.mjs`: `export async function handleRpc(request)` delegates pinned vendor service with supported structured input substitution. Vendor service module path is supplied by verified launcher configuration, not agent input. Wrapper helpers can accept test doubles without expanding the public tool surface.
- `native/keychain/`: Swift package/executable with terminal management and private broker service, built by `npm run build:helper`. `npm run test:helper` runs tests against actual Swift production code/the executable with injected in-memory/test storage, including pseudo-TTY tests of no-TTY refusal and hidden-input/terminal restoration. Test storage is private test wiring, not a production plaintext fallback. This suite does not access Keychain or require signing prompts; do not substitute a JavaScript helper imitation. Public CLI never prints values. The real helper identity/signing must be documented and diagnosed; do not silently use generic `security -w`.
- `scripts/probe-runtime.mjs`: reproducible read-only handshake/wrapper/path probe, optional explicitly selected TextEdit scenario; outputs sanitized evidence under the specified scratch directory. No broad desktop actions by default.
- `scripts/accept-native.mjs`: runs automated local acceptance and inventories blocked manual gates, writes per-item PASS/FAIL/BLOCKED reports. `--live-keychain` implements acceptance 6 with the real helper, generated disposable sentinels, a test-owned native fixture/private seeding channel, controlled-target assertions and finally cleanup; `--live-textedit` explicitly enables only its owned native document and may be combined. No real-user secret input or public get/seed-value API; normal reports contain metadata only, never generated values. Real Keychain/signing scenarios are opt-in and separate from both ordinary suites.
- `test/`: Node-only `node:test` unit/protocol/integration fixtures exposed by `npm test`, with no Swift build/execution, GUI, network or real credentials. Swift/helper fixtures live with `native/keychain/` and run only under `test:helper`; a Node pseudo-TTY driver there is allowed only if it exercises the actual helper. Signed-vendor tests explicitly opt in and are not default `npm test` dependencies. `runtime/releases/` pins are data; generated/downloaded artifacts ignored.

The private broker wire is a bounded local request/reply protocol using a per-connection random authorization capability, label-based reads and typed missing/denied/error outcomes. Its implementation details belong to M4; enforce exact framing/size limits and never emit a credential on public stdout. Native helper stdout may only carry management metadata or controlled parent-only protocol if chosen; it is never inherited as MCP output. Socket and helper lifetime are owned by the server.

## Plan of Work

Constraints binding every milestone: work only in this CUA checkout/branch; maintain this spec and evidence status; preserve unmodified vendor bytes/sandbox; use disposable test values; do not operate other apps, quit ChatGPT, change TCC/settings, install lock-screen components, handle account credentials, publish packages or merge/push without the parent session's explicit instruction. Commit completed changes on the feature branch, no attribution footers. Changes to product scope return to the parent; ordinary implementation choices are the executor's.

### M1 — Prototyping: runtime portability and wrapper seam

Question: can relocated signed runtime binaries serve MCP and load a delegating trusted sky wrapper without the desktop hosting path? Add `scripts/probe-runtime.mjs` and minimal test/harness infrastructure where needed; use the pinned local archive or its verified extracted components in a scratch directory. Record paths, handshake, process ancestry, helper actually contacted, wrapper load/delegation and whether broker socket access needs an explicit sandbox socket allowance. Probe only the current documented APIs; first call may be `cua.getState()` for read-only inventory. Do not unlock Keychain or bypass an unavailable permission.

Promote if signatures remain valid, MCP/native read-only request works from relocated paths, and a no-op wrapper delegates without vendor edits; M2/M5 harden those parts with tests. If any fails, record exact error and source-supported next test; continue independent work, but do not fabricate a portable runtime claim. A cold-start/TCC limitation caused by the owner's running desktop is an environment gate, not a reason to terminate it. Persist concise sanitized findings under `docs/evidence/`, not raw private inventories. Consumes known manifest/signatures, produces confirmed launch/wrapper facts for M2–M5. No test that merely restates the spike verdict.

### M2 — Pinned installer, resolver and doctor

Implement CLI/package scripts, checked release data, installed layout, verification, download/local-archive acquisition, atomic activation and diagnosed failures in `src/runtime/`, `bin/cua.mjs` and `runtime/releases/`. Fold ignore rules/build setup into this milestone. Expose `resolveRuntime`, `installRuntime`, `inspectRuntime`, `buildLaunch` to M3/M5. Test mechanics using harmless fixture archives/checkers; the real archive is opt-in evidence, not a 687 MB dependency per test. Preserve signature checks in production; fixture injection is not a public verification-bypass option. Covers acceptance 1–3 and acquisition portion of 10. No MCP lifecycle or secret storage implementation here.

### M3 — Standalone MCP and explicit tasks

Refactor the proxy into its small modules, consume M2's launch record, implement tool surface/state machine and preserve elicitation/MIME handling. Rewrite `cua-shim.mjs` as the standalone entry wrapper, update `verify.mjs` to test task IDs and non-GUI handshake through the actual launcher. Remove mismatched automatic Stop/SubagentStop hooks from the plugin while preserving its installability. Deterministic fake-upstream tests exercise concurrent requests, cancellation during JS, elicitation round trips, internal request IDs, errors, reset, finish and bounded shutdown. Include JS that ignores cancellation, `turn_ended` that never answers, an upstream completion error, new work attempted after the deadline, a late old-task result after the deadline, and completion/deadline races with EOF. Assert success/no-op/error distinction, exactly-once settlement, terminal rejection rather than new-task dispatch after uncertainty, bounded teardown of owned resources only, and no revival from late replies; cancellation acknowledgement is not quiescence evidence. Covers acceptance 4/8 and lifecycle part of 10. No browser transport or per-agent routing; `secrets_list` reports unavailable/not-configured until M4 wires the provider, never stub success with invented labels.

### M4 — Native Keychain management and private broker

Implement the Swift helper and secure CLI routes, label rules and authenticated per-connection broker, with injected in-memory/test storage in the actual Swift code and opt-in disposable Keychain integration. Wire helper discovery/build/signing diagnostics and `secrets_list` to real label enumeration. No public value-returning route; actual values only cross private broker transport. Expose the broker client interface and launcher service configuration needed by M5, plus a test-owned native fixture/private channel for M6's generated-sentinel creation/replacement without any public raw-value input API. Require both `npm test` (Node-only protocol/client tests) and `npm run build:helper` followed by `npm run test:helper` (actual Swift helper). The helper suite tests no-TTY refusal and hidden-input restoration on success/cancel/error through pseudo-TTY fixtures, CRUD outcomes with injected storage, wrong-token/malformed/oversized requests and orderly endpoint cleanup without Keychain or user prompts. JavaScript helper doubles cannot discharge these Swift/terminal obligations. Real access/signing tests remain separate opt-ins; prompts require human action and are recorded BLOCKED instead of auto-clicked. Covers storage/broker portions of 6/7 and Keychain part of 10. No fake plaintext fallback and no browser capabilities.

### M5 — Trusted native substitution

Implement the exact-reference parser and sky wrapper, register it through M2/M3 launch configuration, consume M4's broker, and validate pinned vendor service shapes. Ensure ordinary calls and lifecycle hooks still delegate. Test all three native text operations with sentinel fixtures and failures including vendor exceptions that contain the value, unavailable broker, unknown label, multiple simultaneous references and unsupported operation pass-through. Nonsecret errors may retain ordinary detail; secret-operation diagnostics must not include vendor payloads. Run an opt-in real wrapper/native sentinel probe when permissions allow. Covers 6/7 and wrapper portion of 4/10. Browser command mapping is documented but not advertised as working or implemented against a nonexistent Chrome backend in this delivery.

### M6 — Package and prove the native+secret slice

Complete README/install/plugin configuration, explicit helper build/signing requirements, acceptance runner and metadata-only diagnostic output. Require both the Node-only `npm test` suite and the actual Swift `npm run test:helper` suite after `npm run build:helper`, with clean-checkout tests separate from this worktree; neither suite substitutes for the other. Implement and run the explicit `--live-keychain` acceptance 6 roundtrip and finally cleanup using M4's private test fixture and M5's trusted wrapper. Record prompts/signing/unavailable runtime as BLOCKED, behavior/cleanup errors as FAIL, and a successful real roundtrip with cleanup as PASS, separately from the optional TextEdit observation. Run all acceptance items exactly as Concrete Steps describes. Record each blocked native cold-start, TCC, signing or clean-machine item individually and the user action/environment needed; continue every unaffected test. Native no-account behavior is explicitly measured using an owned empty CODEX_HOME; no secret auth file is copied from the owner's configuration. Do not claim whole-project completion because Chrome/MAWS adapters remain future approved phases.

After the milestone/frontier reviews and full branch review, update Outcomes & Retrospective and leave the branch ready for inspection. Parent session decides public push/PR/integration. No MAWS changes and no change to the owner's installed MCP registration.

## Concrete Steps

Working directory for all package commands: `/Users/new/Developer/GitHub/cua` (or a fresh clone of this branch). The executor maintains these commands as interfaces settle, without silently changing the promised behavior.

```sh
# Existing baseline (already passed, uses installed desktop runtime):
node verify.mjs

# Required ordinary suites, in order (repeat in a clean checkout for M6):
npm test                  # Node only; no Swift, GUI, network or real credentials
npm run build:helper      # macOS Swift toolchain; builds actual helper
npm run test:helper       # actual Swift + injected storage + pseudo-TTY; no Keychain/prompts

# Local pinned install; override isolates tests from any existing CUA install:
export CUA_HOME="$(mktemp -d /tmp/cua-accept.XXXXXX)"
node bin/cua.mjs install --archive /Users/new/codex-app-src/_dist/ChatGPT-darwin-arm64-26.928.40906.zip
node bin/cua.mjs doctor --json
node verify.mjs
node scripts/accept-native.mjs --report "$CUA_HOME/acceptance.json"

# Opt-in real Keychain roundtrip, generated disposable sentinels, owned-entry cleanup:
node scripts/accept-native.mjs --live-keychain --report "$CUA_HOME/acceptance-keychain.json"

# Opt-in native fixture (only its own throwaway TextEdit document):
node scripts/accept-native.mjs --live-textedit --report "$CUA_HOME/acceptance-live.json"

# Optional combined UI delivery; plaintext readback is not protected readback:
node scripts/accept-native.mjs --live-keychain --live-textedit --report "$CUA_HOME/acceptance-keychain-ui.json"

# Optional human-only management demonstration, not the automated roundtrip proof.
# Choose a unique disposable label; set requires a TTY, never pipe/script secret stdin:
LABEL="cua-manual-$(uuidgen)"
node bin/cua.mjs secrets set "$LABEL"    # human enters a disposable value, not a credential
node bin/cua.mjs secrets set "$LABEL"    # human replaces it with another disposable value
node bin/cua.mjs secrets list
node bin/cua.mjs secrets remove "$LABEL" # confirm removal of only this owned entry

# Production acquisition test in a separate empty CUA_HOME uses the official pinned URL:
CUA_HOME="$(mktemp -d /tmp/cua-download.XXXXXX)" node bin/cua.mjs install
```

Expected observations: install names the verified pinned release; doctor gives structured checks without opening an app; verify lists `js`, `js_reset`, `end_task`, `secrets_list`; the Node suite passes without Swift/GUI/network, and the separately built actual-helper suite passes with injected storage/pseudo-TTYs without Keychain or prompts. Acceptance reports PASS/FAIL/BLOCKED separately and never converts a skipped live check into PASS. `--live-keychain` records metadata for create, first substitution, replacement, second substitution, failure-output confidentiality and finally cleanup; it never records generated values. A cleanup failure is reported explicitly even when an earlier phase was blocked. Stop on a user access/signing prompt and report the required human action; do not auto-approve it. The TextEdit fixture visibly contains its benign marker and records whether an existing helper was reused; intentional target readback is separately labelled, not confidentiality evidence. Secret management never echoes/prints the value. A host may register `node /absolute/checkout/bin/cua.mjs serve` or installed `cua serve`; do not execute registration as part of acceptance on the owner's current setup.

`npm test` prerequisites are Node >=22 only. `npm run build:helper` and `npm run test:helper` require macOS Swift/Xcode command-line tooling and pseudo-TTY support, but no real Keychain entries, signing identity or user approval; this host has Swift 6.3.3 and the macOS SDK. Both suites are required at M4/M6; unavailable Swift tooling blocks helper evidence, not the independent Node suite. Opt-in real Keychain/runtime tests require their installed runtime/helper and usable Keychain/signing environment. Stable distribution signing, a clean-machine environment and first-run permission approvals may require the owner; absence blocks those release claims, not ordinary tests. The parent reports an available Apple Development identity and a local signing identity, but no Developer ID Application identity: local signing experiments may be possible, while stable release signing remains separate and unverified. Any key-access prompt stops for human action.

## Surprises & Discoveries

- Observation: an independently owned browser socket and session ID are accepted by unmodified CUA; Codex's conversation route is a property of its server, not a universal requirement. Evidence: prior metadata fixture returned `selectedFixture:true`, methods `["getInfo"]`; no browser action or relocation was tested.
- Observation: current shim per-call turn IDs cannot match hook prompt IDs, and generic MCP has no turn lifecycle. Evidence: baseline `cua-shim.mjs:80-82` versus `hooks/hooks.json`; browser tracker matches exact session/task IDs. Server-owned tasks replace the earlier proposed mandatory orchestrator channel.
- Observation: a direct appcast GET without required query fields returned HTTP 400, but a request with a new installation UUID, arch, platform and version returned the pinned public archive URL without using an account or installed bootstrap identity. Evidence: archive URL/length above, SHA-256 computed from the local official archive. Production uses the explicit pin, not runtime feed scraping.
- Observation: trusted-service replacement is source-supported for both native structured input and browser locator input. It has not yet been exercised with the secret helper; M1/M5 must distinguish source support from live evidence.
- Observation (2026-10-02, review): recording a completion outcome did not specify whether uncertain cleanup could reuse the heap, and the original test/acceptance commands did not separately prove actual Swift behavior or a reproducible real-Keychain replacement roundtrip. The revised lifecycle, suite split and opt-in fixture specify those proofs; none has been executed by this documentation revision.

## Decision Log

- Decision: one independent technical spec review and a separate execution/buildability review before handing the multi-milestone plan to its executor; milestone dependency-frontier reviews during execution; whole-branch correctness/security review at `doperpowers:reviewer-high` through `doperpowers:review-code` before completion. Rationale: process lifecycle, signed-runtime installation and credentials warrant independent verification, while one bounded review/fix cycle per frontier avoids indefinite polishing. Date/Author: 2026-10-02, design session.
- Revision: at the user's request, both initial technical spec and execution/buildability reviews were dispatched as `astra-high` rather than `doperpowers:adversarial-reviewer`; both reports are received and their substantive findings are resolved by the verified corrections below. The planned whole-branch `doperpowers:reviewer-high` rung is unchanged. Date/Author: 2026-10-02, review fix wave.
- Revision: only confirmed quiescence plus acknowledged upstream completion returns to Idle; timeout/error with uncertain cleanup terminally closes the connection after bounded owned-resource teardown, with native cleanup unconfirmed. Reject returning to Idle on any recorded outcome because it could overlap a new task with old work on the same heap. Split Node-only `npm test` from `build:helper`/`test:helper` against actual Swift with injected storage and pseudo-TTYs, both required at M4/M6; reject Swift prerequisites in the Node suite and JavaScript stand-ins as helper proof. Add explicit `--live-keychain` generated-sentinel create/replace/substitute/cleanup acceptance over private test wiring; reject manual CRUD alone as roundtrip evidence and public raw-value interfaces as fixture shortcuts. Real Keychain/signing remains opt-in, and plaintext native readback is not confidentiality proof. These are specification corrections only, not completed implementation or acceptance. Date/Author: 2026-10-02, review fix wave.

- Decision (pre-flight): the generated launch environment sets `CUA_REPL_ENABLED_SURFACES=computer` explicitly (the pinned `@oai/cua-repl` `launch.js:16-29` requires it); M2 builds and tests it with the other allowlisted variables, and native-only A+B never advertises the browser surface. Closes the `tech-debt-tracker.md` entry when M2 lands. Date/Author: 2026-10-02, execution controller.
- Decision (pre-flight): milestones run strictly in order with a frontier review after each (M2 consumes M1's launch facts, M3 consumes M2's `buildLaunch`, M4 wires `secrets_list` into M3's server, M5 consumes M2-M4, M6 the whole branch). Per-milestone reviews run on `astra-high` agents using the `doperpowers:task-reviewer` rubric, at the user's explicit request for astra-high independent review; executors are opus (`doperpowers:task-executor`). The whole-branch review stays `doperpowers:reviewer-high`. Date/Author: 2026-10-02, execution controller.

## Outcomes & Retrospective

Pending — written at finish.
