# cua's own REPL host and a vendor-compatible cua JS API (#116; child 3 of #114)

## Purpose

The owner and other people installing cua on Macs and Linux should be able to use its computer and browser APIs without the vendor's REPL implementation, with no capability or performance regression. This child replaces the JavaScript execution host and model-facing facade, not
the native engine or sandbox launcher. The API learned from the first call, the skills, MAWS adapter and remote-device protocol remain compatible. A user sees the change in `cua doctor`'s `repl.host` row, then uses the same `cua` calls; the differential harness proves that the
selected host actually answered and reports `0 unexpected differences`.

The approved migration is per surface: Linux sessions and browser-only macOS sessions use cua's host after M5 when any enabled browser surface resolves to cua's browser service; vendor-browser routes retain the vendor host; macOS sessions containing `computer` keep the vendor
host until #117 replaces the native helper. This is a step toward full independence, not a claim that #116 removes every vendor component. `CUA_REPL_HOST=cua|vendor` makes selection explicit. The owner approved this design on 2026-10-14; the sections below record it for
execution, not reopen it.

## Progress

- [x] (2026-10-14) Owner approved scope, vendor-shaped ports, document rule, retained sandbox and per-surface migration.
- [x] (2026-10-14) Research inputs originally committed at `92b279c`, over main `018f3c6`, now rebased as `67a6363` onto main `fae28d6` (#133); recovered-source index and surface inventory read alongside the retained code.
- [x] (2026-10-14) Living spec authored and self-reviewed for acceptance coverage, interface dependencies and load-bearing declarations.
- [x] (2026-10-14) Two independent reviews completed; five verified findings folded into the spec, with self-review repeated. Execution has not begun.
- [x] (2026-10-14T22:30Z) M0 — Differential harness, complete inventory, host selector (vendor default), Linux native baseline. Five tasks reviewed clean; whole-branch reviewer-high "correct" at ad21892. Evidence: mini and cua-linux vendor `cells` pairs at harness 88970a0 (0 differences; Linux records the declared sandbox fail-open defect), three Linux vendor native-baseline runs.
- [x] (2026-10-15T00:23Z) M1 — Kernel and supervisor; raw cell semantics on the mini (and cua-linux). Two tasks reviewed clean; whole-branch reviewer-high "correct" at dc7a86d. Own-host `cells --through M1` at 8f56fb5: mini 111/111 and cua-linux 112/112, 0 unexpected differences against the M0 vendor controls; serverInfo `cua-repl-host 0.2.0` attested on every connection.
- [x] (2026-10-15T07:04Z) M2 — Trusted worker and privileged API; owned browser service and MAWS on the own host. Three tasks reviewed clean; whole-branch reviewer-high "correct" at bb3d59a. Mini, browser-only: services 41 cases 0 differences; tools contract 0 (Table 2 transform only); browser corpus 59/59 per host at e4ea7eb, 0 unexpected, 7 expected trace counts; MAWS live probe PASS with the own host attested. EOF drain bound for a suspended request deferred to M3.
- [ ] M3 — Owned cua API and documentation; complete facade coverage and profiles listing.
- [ ] M4 — Linux native path, approvals and native baseline comparison.
- [ ] M5 — Per-surface defaults, final parity/performance/remote proofs, documentation and plugin release.

## Scope, inheritance and evidence

This is child 3, board #116, of independence composite #114. The parent contract is full independence with no regression, preserving the model-facing API; siblings are the browser service #113, sandbox/app-server removal #115, native engine #117 and pre-distribution clean-room
rewrite #120. The composite is recorded on the board rather than a checked-in parent spec. Code parent pin is main `fae28d6` (merged #133 native baseline, following #113 M5); research pin is rebased `67a6363` (original `92b279c`). This owner-requested standalone living spec lives
under `specs/`; it does not edit the shared composite or main checkout.

Authoritative inputs under `docs/doperpowers/research/2026-10-14-own-repl-host/`:

- `surface-inventory.md`, Tables 1–3: included contracts, explicit exclusions and exact document edits. Do not replace it with a shorter guessed inventory.
- `research-B-node-repl-host.txt`, Questions 1–6: process model, three wires, cell semantics, trust boundary, retained dependencies and consumer seams.
- `node-repl-embedded-INDEX.md`: nine recovered sources, inner messages, base MCP schemas/descriptions, 23 `NODE_REPL_*` settings, sandbox template and Rust-only gaps.
- `research-A-js-api.txt`, Q2/Q3/Q4/Q7 (including the explicit-parse addendum): document construction, service delegation and observable client behavior.
- `07-ordinary-node.txt`, `08-vendor-node.txt`: both direct Node peers connected to the native socket and received `socket closed before response`; vendor Node alone does not solve the peer requirement.

Citations use build **chatgpt-26.928.40906**. `NR:<file>:<line>` means the recovered source at `~/codex-app-src/readable/chatgpt-26.928.40906/node_repl-embedded/`, with its `.provenance.txt` sidecar. `R/cua_node/@oai/cua/...:<line>` means the readable package under that same
build root, not an installed/minified line. Research B's strings-dump coordinates and research A's binary-LF coordinates are not NR line numbers. The index supplies the conversion; do not mix them.

The scope is the whole first-call-declared computer/browser API for macOS and Linux, plus the whole browser manifest: **22 interfaces, 147 members, 66 named types**, including capabilities. Table 1 totals **222 included member-contract rows and 103 type rows**; Table 2 has **16
excluded member-contract rows**, with separate provider, package and document exclusions. There are zero excluded browser-manifest members. A disabled or undocumented member remains implemented and is exposed only when the service advertises support. Browser management `windows`,
browserAuth/OTP, history, botDetection, CDP, WebMCP and generic DOM-only tabs remain included.

Excluded: `iab`, `mcpapps`, the Windows OS binder, vendor cloud/account APIs, legacy package-root export, telemetry/Statsig/Sentry and cloud-browser instruction files, exactly as Table 2 enumerates. Audio and the hidden `js_add_node_module_dir` tool are not enabled cua surfaces.
Exclusion is not permission to delete similarly named included capabilities, confirmations-policy user-data categories or extension tab mentions. Keeping the entire dormant package would be simpler to copy but would retain the vendor dependencies this child exists to remove.

## Design

### Keep the proxy; replace the host below it

`src/mcp/server.mjs`, `upstream.mjs`, `lazy-runtime.mjs`, `connection.mjs`, `task.mjs` and `surface.mjs` retain their responsibilities: client protocol, task queue, metadata, cancellation forwarding, elicitation forwarding, local tools, idle restart, process-group ownership and
output redaction. `src/profiles/inventory.mjs` remains the separate bounded browser-only client. Sandbox metadata is in **`src/runtime/sandbox.mjs`**, not `src/mcp/sandbox.mjs`.

`src/repl-host/supervisor.mjs` is a Node process selected by `buildLaunch` in place of vendor Node → `cua-repl.mjs` → Rust `node_repl`. The existing anchor still owns its process group. The supervisor speaks MCP JSON-RPC 2.0, newline-delimited on stdio, and owns kernel/worker
children; stdout is protocol-only. It implements `initialize`, `ping`, `tools/list`, `tools/call` and the tools `js`, `js_reset`, `turn_ended`. `end_task`, secrets/profiles/devices tools remain cua-proxy tools. Rebuilding that proxy would duplicate already-proven ownership and
remote behavior without advancing independence.

Use the recovered schemas and verbatim base descriptions in the embedded index, including omitted versus present fields, title length 1–80, timeout minimum 1, no schema `default`, reset annotations and private turn metadata. The existing effective cua tool text and
`src/mcp/surface.mjs` host rules still layer above the base tools; the vendor launcher currently supplies overrides and cannot simply disappear with its effective text. M0 records both base and effective contracts; M1 reproduces the effective retained tool surface, documenting
only approved branding/exclusion departures. The core API document is a different output, not a replacement for MCP instructions.

The own host uses the user's Node **≥24**, resolved to an absolute executable before constructing the allowlisted environment, with `--experimental-vm-modules` for the kernel. Vendor-routed sessions keep the pinned vendor Node. Do not infer a patched JavaScript engine from the
vendor distribution's `24.21.0-cua.1` name: its binary identifies as `24.21.0`. Keeping vendor Node for the own host would preserve distribution coupling and, as the peer spike shows, would not restore native socket authorization.

### Selection is a connection fact, not an opportunistic fallback

`replHostFor(session)` in `src/runtime/launch.mjs` consumes the resolved browser-service selection **with its provenance**, not a value already copied into CUA_BROWSER_SERVICE. Resolve service and host once per connection, including idle relaunches; the independent browser-only
launch in `src/profiles/inventory.mjs` uses the same rule. Preserve whether each setting was explicit from the original ambient environment before `connection.mjs` fixes resolved values. Doctor’s `repl.host` row names the browser route and the registration (or absence of one)
that decided it. MAWS client mode does not override an enabled macOS computer surface.

| Session / condition | M0–M4 default | M5 default | Reason at M5 |
|---|---|---|---|
| Browser enabled, resolved browser service vendor (no registration or active ChatGPT route, absent MAWS override) | vendor | vendor | `vendor_browser_route` |
| Linux, no browser or resolved browser service cua | vendor | cua | `linux` |
| macOS, browser only with resolved browser service cua (including MAWS/profiles listing) | vendor | cua | `browser_only` |
| macOS, computer enabled, otherwise eligible browser route | vendor | vendor | `macos_native_peer_requires_vendor` |
| Explicit host vendor | vendor | vendor | `explicit` |
| Explicit host cua, eligible surface/service combination | cua | cua | `explicit` |

Reject invalid nonempty settings before launch. An explicitly contradictory pair `CUA_REPL_HOST=cua` and `CUA_BROWSER_SERVICE=vendor` refuses with a migration diagnostic. An implicitly resolved vendor browser service with no host override selects vendor host with `vendor_browser_route`. An explicit
`CUA_REPL_HOST=cua` on such a home refuses before launch with a diagnostic naming the route and the registration that decided it (and how to move the home to the cua route); an explicit choice is never silently downgraded, as with macOS computer below. With a cua browser route, explicitly selecting own host for macOS computer remains unsupported until #117 and refuses before input. For
eligible sessions without an override, M0–M4 retain `staged_vendor_default`; only M5 activates the defaults above.

The macOS helper's code-signing/ancestry authorization (`parentIdentity`, `ancestorIdentities`, `trustedProcessRequirement`, `allowedRelayRequirement`, `parentProcessIsCodex`) accepts the existing vendor node_repl peer path, not an arbitrary direct Node socket peer. Browser
sockets have a different same-user/ancestry contract and must remain in the existing owning process tree. A single immediate global cutover was the strongest simpler alternative; it loses macOS computer use and is rejected.

The own route uses cua's browser service, not the vendor browser service's cloud/config/telemetry paths. Keep the unmodified vendor route available for rollback and macOS native staging; do not broaden the own privileged API to run the legacy browser service. Only the explicit
contradictory pair above fails; implicit vendor homes continue working. `CUA_REPL_HOST=vendor` remains the rollback on a cua-browser route. README's older promise that #116 removes all vendor modules is superseded by this bounded staging, not by editing installed files.

Handshake cache identity includes selected host **and host/API version**, in addition to runtime release, surfaces and requested protocol version. A cached vendor handshake must never answer for cua, or an old cua version for a new one. `initialize.serverInfo` names
`cua-repl-host` with its version; own tool results carry `_meta['cua/replHost'] = {host:'cua', version}`. Live runners verify both, not just environment variables; the vendor control records its actual serverInfo and absence of the cua marker. This deliberate difference is
enumerated, never normalized away before attestation.

### Kernel and sandbox

`src/repl-host/kernel.mjs` ports `NR:kernel.js:120-740,742-1492,1501-1872`: Meriyah parsing, synthetic `@prev` modules (modules supplying prior cell bindings), `vm.SourceTextModule` evaluation and committing redeclarable persistent bindings. Preserve top-level await and dynamic
import, refusal of static imports and `process`/`node:process`, the built-ins used by the API, and disabled string/Wasm code generation. An async-function wrapper is not equivalent: it loses top-level lexical persistence and ordinary-error partial bindings.

Immutable `nodeRepl` and `tmpDir` cell globals expose only `cwd`, `homeDir`, `tmpDir`, frozen allowlisted `env`, per-execution `requestMeta`, `write`, `emitImage` and configured `rpc` (`NR:kernel.js:1586-1642`; `NR:worker-runtime.js:230-332`). The first successful banner import
runs cua's owned bootstrap rather than `await import("@oai/cua/tinyskyAlt")`; reset/timeout produces a fresh bootstrap. M1 has no production services/banner; M2 temporarily uses the unmodified vendor facade as a testable intermediate; M3 switches that import to
`src/cua-api/bootstrap.mjs`.

Keep `codex sandbox` from the relocated CodexCLI.app (Linux: relocated codex) for both confined children until #115. The recovered argv template is the contract, not a shell command to interpolate:

```text
$CODEX_CLI_PATH sandbox
  -c 'shell_environment_policy.inherit="all"'
  -c 'default_permissions="node_repl"'
  -c 'permissions.node_repl={filesystem={...},network={enabled=false}}'
  [-c 'features.use_legacy_landlock=true']
  [--allow-unix-socket <path>]...
  -- <user-node> --experimental-vm-modules <script> <args>...
```

The `...` is the policy derived from cua's existing `codex/sandbox-state-meta`, not a literal argument or an unspecified new policy. Kernel arguments remain session id and working directory; trusted worker receives cwd. Scoped means account-readable filesystem, writes only run
directory and valid absolute TMPDIR, no child network; default denies writes and network; disabled is the existing unconfined path. Linux computer sessions retain disabled by default for X11/AT-SPI. Both children follow the same policy; trusted does not mean unsandboxed.

`src/runtime/sandbox.mjs` must validate the selected host's trusted roots when names change, including the own code roots, and continue refusing write-root overlap and unavailable Linux confinement before launch. Client sandbox overrides remain replaced by the proxy's metadata.
No silent unsandboxed fallback. The sandbox does not hide the secret store from authorized cell reads; retain the established trust model rather than claim a new secrecy boundary.

### Supervisor, execution order and lifecycle

The supervisor supplies the Rust-only behavior listed in the embedded index: child launch/reset, execution timers, MCP result assembly, service routing, socket bridge, elicitation and turn deduplication. Internal messages retain the recovered names and shapes; the worker/kernel
JSONL is distinct from both MCP JSON-RPC and native service framing. `trusted_service_request` routes to worker `service`, `trusted_service_hooks` to `run_hooks`; replies correlate by execution and request id.

Default execution budget is **30,000 ms**. `suspend_timeout`/`resume_timeout` exclude trusted approval/startup waits and resume the remaining budget, including nested suspension. Track background privileged work, then run after-submitted-code hooks on success **and ordinary
error**, then settle the cell. Preserve `submitted_code_complete`'s phase boundary and positive per-hook timeouts rather than ending the execution at the first returned promise. The recovered kernel drains submitted-code background work before sending that phase-complete message
and running separately budgeted hooks; use the vendor probe to pin the supervisor timer transition. A killed/timed-out execution cannot run code in its dead kernel; reset and stale-reply handling must not let its late work complete a new execution.

The host state and linearization points (the single moments at which ownership changes) are:

| State / event | Transition and observable result |
|---|---|
| ready + valid js | Allocate execution id and generation, enter running; start budget before submitted code. |
| running + output/image/service/elicitation | Route under that execution id; MCP control replies stay live. |
| running + submitted_code_complete | Submitted-code/background phase has drained; enter hook phase under hook budgets, retaining success or error outcome. |
| running/draining + exec_result | Assemble ordered result once; clear timer and pending execution; ready. |
| running + cancellation notification | Record/forward control, do not claim the cell stopped; its eventual result still settles. |
| running/draining + timeout | Invalidate generation before terminating/recreating execution children; return timeout result once, bindings gone. |
| ready + js_reset | Invalidate heap generation, reset children/state as parity requires, acknowledge; task id unchanged. |
| ready + turn_ended | Reserve session/turn dedup key before handlers start; await one completion, repeated requests share/receive its acknowledgement. |
| any + EOF/termination/unexpected child exit | Stop admission, settle pending work honestly, close owned sockets/children; uncertain execution is not replayed. |

The outer task queue already serializes js/reset and waits before turn end; do not add a competing task state machine. After-code hooks are sequential; turn-ended handlers are concurrent and best-effort under their own positive timeouts, with one acknowledged completion per
session/turn (`NR:privileged-node-repl.js:14-55,639-647`; `NR:trusted-worker.js:197-230`). Browser hooks currently use 12,000 ms after code and 4,000 ms at turn end. Keep cua's outer 5-second completion deadline, terminal failure behavior, 15-minute idle stop and owned-group
teardown.

`write` contributes `{kind:'write',text,item_id?}` and console contributes line events; named-item grouping and newline normalization follow `NR:kernel.js:1542-1584`. `emit_image` is an acknowledged inner request, not a new MCP streaming extension. Package text, named documents,
images and `emitContentItem` output as the vendor's Rust-side assembly orders them (revised 2026-10-14 from M0's vendor evidence): text is grouped per write name, names ordered by first appearance and concatenated within a name, and the text items precede images and content items; order within each group is preserved, for awaited and unawaited tracked emissions alike; preserve isError, structured content and response meta. Compare the Rust-side assembly against the vendor in M0/M1: extraction alone does not establish every ordering/error sentence.

### Trusted services and privileged APIs

`src/repl-host/trusted-worker.mjs`, `worker-runtime.mjs` and `privileged-node-repl.mjs` port the corresponding NR files. `CUA_REPL_TRUSTED_SERVICES` maps enabled services to their absolute real paths; `CUA_REPL_TRUSTED_CODE_PATHS` lists trusted real roots. Replace the host's
`NODE_REPL_*` configuration with owned names, not ambient inheritance. The worker installs privileged `nodeRepl` before lazily importing and caching `handleRpc`; `registerHooks` realpaths every file dependency and rejects escapes (`NR:trusted-worker.js:19-60,83-99,134-189`).

Keep `src/services/sky.mjs`, `browser.mjs`, `secret-input.mjs` and `src/secrets/` as the trusted substitution boundary. Native requests remain `rpc('sky',{type:'setup'|'execute',method?,args?})`; browser requests remain
`rpc('browser',{method:'setup'|'execute'|'executeWithRecovery',params})`. Only `error.message` (or String of a non-Error) crosses worker → kernel; the kernel creates a plain Error. Rich error serialization was rejected because it changes the existing contract and can expose a
substituted secret through stack/cause/custom fields.

The privileged API retained is `createElicitation`, `withSuspendedTimeout`, `setResponseMeta`, `requestMeta`, `env`, `nativePipe`, `launchServices.openApplication`, `addTurnEndedHandler`, `addAfterSubmittedCodeHook`, `emitContentItem`, and base output/context methods. Cells get
none of these privileges merely by importing a module. `NR:privileged-node-repl.js:65-129,200-472,528-601` and the browser service's hook registrations are the port anchors.

The supervisor opens nativePipe Unix sockets **outside** the child sandbox and relays bytes as base64 JSONL. The worker sees the frozen `{write,on,off,end}` interface, only data/close/error events; no invented `destroy` or end-event contract. Validate absolute socket paths,
connect timeout (cua sets 1,000 ms), correlation and close/error propagation. This preserves scoped browser access and MAWS ancestry; letting the worker open sockets directly does neither.

`createElicitation` forwards `elicitation/create` to the MCP client and returns accept/decline/cancel with content/meta intact; unsupported client form capability and malformed replies fail without granting approval. Preserve proxy-owned accepted-response persistence.
`launchServices.openApplication` stays implemented and boundary-tested on macOS; native production use remains vendor-routed until #117. Do not launch shared helpers for unit tests or kill them during teardown.

M4 reads the retained Linux Sky path and approval persistence callers before deciding whether `config`, `readToml`, `writeToml` are needed. Implement only reachable storage operations, preserving session cleanup and safe path rules from
`NR:privileged-node-repl-config.js:133-240`; if no caller exists, record that evidence and omit them. No speculative Codex config client. Drop privileged fetch, telemetry, app-server and CODEX_HOME RPCs with no retained caller; a required local approval store is not an
account/config RPC. The retained Sky analytics-disable flag may remain as a vendor-service input even though own-host configuration is renamed.

### Owned facade and first-call documentation

`src/cua-api/` ports the tinyskyAlt facade and browser client, not Sky's native engine. `bootstrap.mjs` installs global `cua`, aliases `initialize` to `getState`, installs browser `agent` when enabled, and initializes only enabled surfaces. `create-tinysky-alt.mjs`,
`bootstrap-emitter.mjs`, platform binders, browser facade, `sky.mjs` and `browser-client.mjs` keep the vendor concerns separate. Table 1 is the contract for signatures, returns, validation, absence, capabilities and errors; internal filenames may follow these concerns without
recreating dormant exports.

Port anchors: `R/cua_node/@oai/cua/dist/lib/js/oai_js_cua/src/tinysky_alt/globals.js:3-27`, `create_tinysky_alt.js:16-141`, `create_bootstrap_emitter.js:10-101`, `create_browser_api.js:26-289`; the Sky facade is `R/cua_node/@oai/cua/dist/project/cua/sky_js/src/sky.js:6-127`.
Browser client below means `R/cua_node/@oai/cua/dist/lib/js/oai_js_browser/dist/skill/scripts/browser-client.js`.

Retain FunctionAgentTransport and Command.toJSON (browser client:495-509,10013-10046); string evaluate uses `return (${text});` (6717-6764), not statement-list evaluation. Keep recovery-envelope validation and its exact invalid-response sentence (189-242,10272-10284), locator
same-tab checks/diagnostics and collection caches (6685-6715,6777-7628), initial snapshot before returning a created/bound tab, and manifest/disabled-member proxies across get/has/ownKeys/descriptors (10061-10212). Preserve screenshot Uint8Array and emit:false, allSettled
inventory failures, Linux window binding, platform input guards and DOM-only Tab behavior; do not invent downscaling, client-wide 3-second timers or visible-DOM options.

Zod is either replaced with explicit equivalent validation at **actual parse sites** or vendored, executor's choice in M3, recorded with parity proof and no runtime dependency. The sites are tabs.content, DOM node IDs, botDetection and browserAuth request/results, user tab
context, CDP/assets/WebMCP/management/visibility/viewport results and the side-effect envelope, enumerated by research A's Q7 addendum. Command.toJSON stores a schema but does not parse it; validating every command would introduce refusals the vendor does not make. Blanket schema
generation was rejected for that reason.

`docs/cua-api/core.md` contains the first-call document. Keep surviving vendor prose verbatim, replace product names ChatGPT/Codex/Orbit with cua **in prose only**, and remove only the excluded sentences/clauses in Tables 2–3. Keep “Computer Use Confirmations Policy”, its valid
requestMeta override and the auxiliary “Other Browser APIs” document; do not replace policy with newly authored guidance. Protocol keys, JS identifiers, URLs and service name `sky` are not automatic rename targets. The core document is not pruned merely because one surface is
disabled.

Bootstrap writes `cua.core`, `cua.browser.<id>`, `cua.state` in the vendor order; core once, selected-browser docs once per browser, state automatically unless emit:false. `rewriteDocumentation` re-emits cached documents but suppresses duplicate emission for the same requestMeta
object. Selected-browser docs stay generated by `src/browser-service/docs.mjs`; preserve #113's approved service guidance and Table 3's retained lookup/capability documents, without reintroducing the vendor limits or cloud catalogs. Own MCP host notes stay in
`src/mcp/surface.mjs`. Freely rewriting the prose was rejected by the owner because the first-call document is a model-facing compatibility surface.

### Ports, parser and distribution

Every port opens with `// Ported from readable chatgpt-26.928.40906 NR:<file>:<a>-<b> (...)` or the corresponding full `R/...:<a>-<b>` citation, naming this spec. Document ports carry an equivalent source comment. Read the source and sidecar; do not cite inferred string-dump
lines as source. This port joins #120's clean-room scope: internal research preview copying is permitted by the owner, distribution waits for that rewrite. No claim of distribution rights is made here.

Vendor **Meriyah 7.0.0**, identified by `NR:meriyah.umd.min.js:1-5`, like the existing injected-script pipeline: exact devDependency pin, `scripts/extract-meriyah.mjs`, committed `src/repl-host/vendor/meriyah/` asset, sibling `VERSION`, license and mismatch refusal. The recovered
header specifies **ISC**; retain that actual license (and any MIT-licensed dependencies if used), not a guessed license for the proprietary ports. No new runtime dependency. A hand-written parser or a newer unpinned parser would change the hardest cell semantics without advancing
this milestone's goal.

## Verification and acceptance

The oracle is the same-cell differential run through real `cua serve` sessions: vendor host plus vendor facade versus own host plus owned facade, **both using cua's browser service**. It isolates the host/API change from #113's intentional service changes.
`scripts/repl-parity.mjs` reuses browser-parity topology, MCP, runner and compare modules, extending rather than cloning them. A raw-cell mode is required: the existing runner's async-function envelope cannot prove lexical persistence, top-level imports or a real thrown-cell
error.

`test/repl-parity/inventory.json` has one stable row per Table 1 included member, linked type contracts, and rows for every cell behavior and secret substitution below. `test/repl-parity/inventory.test.mjs` checks exact membership against the committed surface inventory, unique
IDs, due milestone, executable cases and final M5 completeness. Types are checked by the cases that consume/return them. Disabled capabilities need executable hidden-member assertions plus advertised-capability cases through the existing capability host, not skips masquerading as
implementation. Computer behavior runs live on Linux; macOS-only binder behavior uses source-grounded service doubles, with macOS native production explicitly deferred to #117.

Raw evidence retains ordered MCP content, isError, structuredContent and meta when present; text/error sentences, named write grouping and document bytes compare exactly, with ms excluded. Live screenshot similarity alone uses the existing 64-bit average hash with exact
dimensions/MIME. It is not a host-transport oracle: black and white images can share that hash. Deterministic emitImage fixtures compare SHA-256 of bytes and exact decoded dimensions/MIME; if a vendor transformation is demonstrated, compare exact decoded pixels against that
recorded transformation instead of weakening the hash tolerance.

Cover PNG/JPEG/WebP and each included form (data URL, file URL, byte arrays and `{bytes,mimeType}`, including promised inputs) from inventory Table 1 and `NR:worker-runtime.js:129-163`. M0 provides deterministic fixtures, format-aware dimensions/pixel decoding where needed and
mutation tests rejecting brightness/colour corruption and a WebP mismatch; M1 proves real host emission. The existing PNG/JPEG average-hash decoder must not reject or skip the WebP transport cases. Preserve field absence, map schema-known dynamic IDs by creation order and mask
only declared volatile fields. Store hashes/counts, not screenshot bytes or owner window text, bookmarks or credentials; compare scratch observations in memory and persist safe projections only.

`test/repl-parity/expected-differences.json` lists each deliberate branding/exclusion/identity departure with reason and exact case/field scope. It cannot waive missing rows, failed independent assertions or arbitrary document differences. Document comparison is byte-for-byte
against a deterministic **Table 3 transformation of the vendor document**, with that transformation separately checked against the pinned source; compare generated selected-browser docs on the same service/backend and normalize only declared identity slots. Vendor-versus-vendor
determinism uses no allowances. Fake output is labeled fake and cannot satisfy live parity.

The harness records commit, Node, runtime release, host and API versions, platform, surfaces, sandbox, service, backend, profile, serverInfo and result attestation per connection; mismatch fails before counting coverage. Every live runner, including native baseline, Linux
acceptance, MAWS and remote acceptance, must attest the answering host. Instrument wrappers/metadata capture, not consumer assertions or skill behavior. Cached initialization alone is insufficient: require the marker on a real own-host call.

Acceptance, using the Concrete Steps commands and harness-owned scratch fixtures:

1. On the mini, consecutive raw cells persist/redeclare bindings, await at top level and dynamically import; static imports and process access refuse with vendor sentences. A thrown error leaves the task usable and completed bindings behave like the vendor. Both runs have the
same ordered outputs, isError and error sentences; the cell suite reports `0 unexpected differences`. **M1; final M5.**
2. A default-budget cell times out at the vendor's 30,000 ms behavior; a shortened timeout is tested too. The next cell has fresh bindings/bootstrap, js_reset clears bindings but preserves `cua/taskId`, running cancellation does not pretend to stop work, and end_task acknowledges
once after hooks. Elicitation accept/decline/cancel, suspended budgets, success/error hooks, write IDs, image ordering and emit:false match; deterministic emitImage cases satisfy the exact byte/pixel oracle for every included format/input form, including WebP. **M1 host half, M2
service half, M3 facade half; final M5.**
3. Every included member/type contract has its executable proof; capability-hidden members are absent under get/in/keys/descriptors and work when advertised. The whole browser corpus (currently 59 cases) runs through the own host on mini/ssfs with `0 unexpected differences`;
browser API rows also run on Linux. The inventory test fails if a row/case is removed. **M0 inventory, M2 browser baseline, M3 facade, M4 Linux; final M5.**
4. A fresh first call emits the transformed vendor core bytes and confirmations policy; selecting a browser emits its generated docs before state. emit:false does not suppress first-use docs; rewriteDocumentation suppresses same-requestMeta duplicates and rewrites on a later
request. `profiles_list` works through the own browser-only host without tab titles/URLs in its output. **M3; final M5.**
5. In the cua-linux VM, the own worker drives pinned `sky_linux` over stdio against a scratch gedit window: bind, observe AX, act, verify, screenshot and end_task succeed. Native inventory rows, approval/persistence paths that exist on Linux, and `linux-native.mjs` pass; Linux
Chrome and feature runners print `status: PASS`. **M4; final M5.**
6. Trusted services refuse an import outside real roots; cells cannot obtain privileged APIs through the bridge. Scoped/default/disabled behavior and Linux fail-closed preflight remain unchanged. Whole-field secret references substitute only inside the existing wrappers; errors
and reports contain labels, never values, including worker rejection paths. No own-route telemetry/account/app-server call occurs. **M1 confinement, M2 trust, M3 browser substitution, M4 native substitution; final M5.**
7. The unchanged MAWS live probe passes against the own host: profile identity, popup adoption, cursor, raised-budget human takeover, cleanup and isolation. MAWS's unchanged `pnpm e2e:browser-cua` remains green but is not treated as own-host evidence. Remote selection, js/reset,
elicitation and end_task work with the existing cua-remote skill against M5’s throwaway Linux and browser-only mini agents; killing the client mid-cell leaves the fixture execution count exactly one after reconnect, with no replay. **M2 MAWS; M5 remote and repeat.**
8. The three own-host browser benchmark runs in browser-only mode have equal-or-better outcomes and satisfy #113's tool-time rule against its M5 cua-service result: each judged task's median within max(10%, 500 ms), or faster. Report wall time separately and #130's
scripted-outcome check separately; do not relabel that as model performance. Linux native before/after runs retain outcomes, sample counts and report latency medians/p95/max; apply the same per-operation median tolerance, separating approval wait and SSH overhead. **M0 baseline,
M4 native comparison, M5 browser benchmark.**
9. Doctor and real calls agree with the selection table across no registration, ChatGPT active, cua active, both registration orderings and MAWS client mode, for ordinary and independent profiles-listing connections. Implicit vendor-browser homes remain usable on vendor host;
only explicit contradictory pairs refuse. Doctor names route/deciding registration, caches cannot cross host/version, and eligible own calls attest both markers. An installed agent honors explicit `CUA_REPL_HOST=vendor` after reinstall; unset installation omits the setting and
resolves defaults afresh. **M0 selector/cache/job tests, M5 live switch/rollback.**
10. `HOME=<scratch> npm test`, `npm run test:mods`, `claude plugin validate .` pass; README describes ownership, Node floor, sandbox and staged macOS limitation, plugin version is one minor above main's at M5, shipped package contains the owned document/parser, and Outcomes
records #117/#120 residue. **Every PR gates; M5 final acceptance.**

## Constraints binding every milestone

Repository SSFSKIM/cua; authoring branch `feat/own-repl-host`, worktree `/Users/new/Developer/GitHub/cua-wt-repl-host`, base main `fae28d6`, research commit `67a6363`. The authoring branch’s research/spec commits were rebased onto this base; M0 consumes #133 from main. Do not
touch `/Users/new/Developer/GitHub/cua`. M0 uses this branch; later milestones branch from main after the preceding PR merges, `feat/own-repl-host-m1` through `-m5`, re-pointing the same worktree. No attribution footers. Each milestone is one PR against main, reviewed at
`doperpowers:reviewer-high` and merged by the session. Board writes only through issue-tracker scripts. Executors follow the owner's temporary routing note: GPT routes for bounded work, opus for ports; no implied change to persistent agent configuration.

Inherited binding contracts: #114 no capability/performance regression and vendor-compatible API; #113 owned browser-service/extension-host/MAWS contracts unchanged; #115 owns replacement of the retained sandbox launcher; #117 owns macOS native migration; #120 owns clean-room
replacement before distribution. The standalone Phase A/B invariant “vendor runtime files unchanged” remains literal: selection replaces a host, never patches installed files. Trusted substitution, scoped/disabled semantics and accepted-approval persistence stay as described
above; obsolete Keychain/broker designs are not restored.

Never read or print `~/.config/claude-secrets`, any `auth.json`, `PLAYWRIGHT_MCP_EXTENSION_TOKEN`, `~/.config/hcloud` or secret values. Never launch or kill the owner's Chrome, helpers or hosts, read the owner's local Chrome profile, click TCC consent or answer a password prompt.
Nothing logs AX text of the owner's windows, bookmark names/URLs, pictures or page credentials. Secret tests use synthetic sentinels in temporary HOME only and emit labels/counts/booleans. Terminate only harness-owned processes; shared native helpers remain untouched.

Live proof is only through harness-owned runs on mini/ssfs, the parity clone over `ssh -o BatchMode=yes mini`, and cua-linux Tart VM (`192.168.64.3`, `ssh cua-linux`), inside its X session environment. No executor restarts/reconfigures the mini's resident agent or touches its
resident checkout; the M5 update is the session's step. Local tests use doubles, never the installed runtime, real Chrome or external network. Optional vendor-dependent checks skip visibly when absent and do not count as live evidence; loopback harness fixtures follow #113's
existing convention.

Every port carries its provenance header. Meriyah and any vendored validator follow the exact-pin/extractor/VERSION/mismatch-refusal rule; no new runtime dependency. Gates before every PR are the three acceptance-10 commands. Update implementation-coupled argv/env tests
(`test/runtime-launch.test.mjs`, `test/services-sky-trust.test.mjs`, `test/fixtures/installed-home.mjs`) for the intentional replacement; keep consumer suites, skills, MAWS e2e and remote acceptance behavior unchanged. Fake-upstream and fake-browser facades are lifecycle doubles,
never proof of REPL semantics.

## Plan of Work

### M0 — Establish the oracle and the pre-switch Linux baseline

At the end, the existing vendor route can be measured twice with identical coverage, and no default session has switched. Add `scripts/repl-parity.mjs`, support under `scripts/repl-parity/`, `test/repl-parity/inventory.json`, scenarios, comparator/inventory tests and
expected-differences file. Reuse `scripts/browser-parity/{topology,mcp,runner,compare,normalize,image-hash,resources,capability-home}.mjs` and the existing fixture/capability host; extend MCP capture for raw results, controllable elicitation responses and cancellation. Make
raw-cell execution bypass the existing async envelope. Add `test/repl-parity/serve-cells.mjs`, the isolated launch fixture defined in M1, before that milestone consumes it. Produce interface **ParityRun** and the complete case inventory, including all semantics listed in
acceptance 1–2 and secret boundary rows. Each case has a due milestone; `--through M1` selects only cases due by M1 in both run and diff. A later row remains visibly pending, never counted as covered.

Add **HostSelection** and **HostIdentity** in launch/connection/lazy-runtime and profiles listing, retaining vendor defaults before M5. Resolve browser service with original-setting provenance, and extend `test/runtime-launch.test.mjs`’s existing route matrix to both launch
consumers and doctor: no registration, ChatGPT active, cua active, both orderings and MAWS client mode, plus explicit pairs. Add `CUA_REPL_HOST` validation/persistence in `src/remote/job.mjs`, explicit nonempty values only, never a resolved default; launchd and systemd job tests
cover cua/vendor, unset/empty omission and invalid-setting refusal before job installation. Cache keys must distinguish future own identity already; schema/version tests prove stale entries miss. `CUA_REPL_HOST=cua` may name an unavailable implementation until M1 but must fail
clearly rather than invoke vendor. Pin Node floor/launch validation and metadata capture without changing defaults. Production override becomes useful as each supported stage lands. Add host-axis comparison to `scripts/bench-summary.mjs` and `scripts/bench-scripted-summary.mjs`:
`--axis host` groups by attested REPL host while retaining actual browser service metadata. Their existing service axis remains unchanged; never relabel cua-service evidence as vendor-service evidence to satisfy an old schema. Extend `test/browser-parity/bench-recorder.js` and
`bench-controller-brief.md` with **BenchmarkRun**: experiment id, attested host and run number form the journal namespace, while service remains independently `cua`. Test that different experiments/hosts cannot resume each other’s journals and that the same tuple still recovers
interrupted snapshots without replaying completed actions.

Reuse `scripts/native-baseline.mjs` and its support already on main at `fae28d6` (merged PR #133); no external branch/cherry-pick is now needed. Extend its Mac/TextEdit assumptions to Linux/gedit and host selection, and add `compare <vendor-dir> <cua-dir>` using acceptance 8’s
verdict, retaining journals, cold hit/miss labeling, warm samples, tool/in-cell timing, approval wait, helper attestation and owned cleanup. Existing `docs/evidence/2026-10-14-native-baseline/summary.md` is a Mac baseline, not a Linux substitute.

Record three Linux vendor-host runs **before the switch**, using pinned sky_linux and scratch gedit, under `docs/evidence/2026-10-14-own-repl-host-native/vendor/`. No owner windows or screenshot bytes in reports. The Linux runner's known GTK3 typeText/paste problem is a baseline
fact, not an excuse to fake parity: keep its safe pressKey outcome task and add explicit method cases/errors for the included API. Preserve a comparable environment for M4.

Consumes existing browser-parity and native-baseline tooling; produces ParityRun, HostSelection/Identity and baseline artifacts for all later milestones. Does not implement host/API or change browser/native engines. Proves acceptance 3's inventory, 8's baseline and 9's
selection/cache groundwork. Vendor-versus-vendor runs on mini and Linux, no allowances, must pass cardinality and independent assertions; comparator mutation tests must reject reordered/missing content, changed error/isError/meta/document, missing case and failed outcome, plus
equal-average-hash brightness/colour corruption and WebP transport errors. Produces BenchmarkRun and the exact image-fixture oracle before downstream runs consume them.

M0 also makes the capability-host lane remote-capable: scratch homes and fake backend sockets live on the mini or VM, with the real selected REPL host there. The existing local capability-home helper must not copy this Mac’s installed runtime or reach its profile. Local unit runs
use doubles only. M3 consumes this lane to prove advertised optional APIs as well as the real Chrome lane’s hidden-member behavior.

### M1 — Execute real persistent cells without services

At the end, an explicitly selected own host evaluates raw cells and resets correctly under the same confinement policy, while defaults still select vendor. Add supervisor, kernel, base worker-runtime, tool-contract module and parser vendoring under `src/repl-host/`; wire
`buildLaunch` to the owned supervisor on user Node. Implement protocol negotiation/correlation, image assembly, execution timers/generation fencing and EOF/group lifecycle. Port the kernel rather than imitating it with eval or async IIFEs. Produce **HostMcp**, **KernelWire** and
**CellRuntime** for M2.

Update runtime launch, sandbox root validation and implementation fixtures so real own-host tests exercise the new code with spawn/sandbox doubles, not the fake echo process. Add Node floor checks and extraction mismatch tests. Test default/scoped/disabled argv construction and
refusal paths without executing the vendor sandbox in unit tests. The real mini raw-cell run uses M0’s isolated `test/repl-parity/serve-cells.mjs` launch fixture around the real cua proxy. It supplies a no-op banner and no services to each supervisor; on the vendor side it
invokes the pinned node_repl directly rather than the thin launcher that overwrites its banner. Browser-only outer settings remain valid. This is a labeled no-services parity lane, not an empty-surface production setting or a new user override. M2 service-hook cases use isolated
trusted fixture services; M3 document cases use normal production bootstrap.

Consumes M0 ParityRun and HostSelection/Identity. Does not ship services, facade, native socket bridge or defaults. Proves acceptance 1, host portions of 2/6/9; timeout resets, ordinary errors preserve usable task, raw declarations/redeclarations and output/image ordering compare
with `0 unexpected differences` on mini. The actual 30,000 ms default is exercised, not inferred from schema alone. The first-cell production facade remains deferred, visibly excluded from this milestone's case subset.

### M2 — Put the owned browser service behind the trusted worker

At the end, the own supervisor runs real browser sessions and MAWS through the retained trusted wrapper/service, still using the vendor facade as the temporary banner import. Port trusted-worker and privileged-node-repl; complete base runtime shared with the kernel. Implement
**TrustedServiceWire**, **PrivilegedRuntime**, nativePipe, elicitation, timeout suspension, response meta, hooks and turn deduplication. The transient vendor facade import is explicit test-stage coupling removed by M3, not a second shipped API promise.

Touch `src/repl-host/`, `src/runtime/launch.mjs`, `src/runtime/sandbox.mjs` and trust/lifecycle tests; use `src/services/browser.mjs` and `src/browser-service/index.mjs` unchanged at their public seams. Assert hook unregister behavior, after-code execution after throws,
sequential/concurrent ordering and hook deadlines; drain unawaited privileged operations. Test malicious realpath/symlink escapes, plain-message-only errors, accept/decline/cancel, nested budget suspension and socket terminal events. LaunchServices is implemented through a mocked
OS boundary; no macOS helper attempt is needed.

Consumes HostMcp, KernelWire, CellRuntime and ParityRun; produces PrivilegedRuntime/TrustedServiceWire consumed by M3/M4. Does not add app-server, telemetry, legacy browser service support or native rollout. Proves service halves of acceptance 2/6, the 59-case browser corpus
against vendor-host plus cua-service, and acceptance 7's MAWS live probe and unchanged MAWS regression suite. Both mini and MAWS sessions must attest the own host, not only `cua browser service`.

### M3 — Own the facade and the document the model learns

At the end, the own route imports no vendor REPL facade; ordinary `cua`/`agent` calls, bootstrap documents and bounded profiles listing use the owned code. Add the modules under `src/cua-api/` and `docs/cua-api/` described in Design, switching the banner to **CuaBootstrap**. Port
every included inventory member, both platform binders and the browser manifest runtime, not just the 59 service cases. M3 may run as two tasks in this one PR, like #113’s M1b/M1c: browser-client port produces **BrowserClientRuntime**, then facade/bootstrap/documents consumes it.
The interface is `setupBrowserRuntime({environment,undocumentedApiMembers,excludedDocumentation,decorateTab} = {}) -> Promise<Agent>` at the existing setup/transport seam, returning the agent and manifest-aware wrapped browser objects; review that boundary before facade integration. Shared signatures and parity requirements stay those of Table 1, not newly generated
stubs. Preserve source-specific validation and conditional members; record the Zod choice with parse-site tests.

Implement **CoreDocumentation** and byte fixtures derived from Table 3, including confirmations override, auxiliary document and selected-browser lookups. Include docs in package files so an installed plugin works without the source tree. `src/profiles/inventory.mjs` must use
HostSelection and return the same bounded `CUABACKENDS` inventory; instrument its answering-host proof without exposing tab titles/URLs. Preserve secret wrapper request shapes, version pin checks and the RPC error boundary.

Consumes PrivilegedRuntime/TrustedServiceWire and ParityRun; produces CuaBootstrap/CoreDocumentation for Linux integration. Does not redesign browser service guidance, add APIs/caps, rewrite skills or implement native Sky. Proves acceptance 3–4 and browser portions of 6 through
the real own client: full inventory assertions, advertised and hidden capabilities, locator diagnostics/caches, evaluate/recovery validation, initial snapshots, doc order/bytes and profiles_list. macOS binder-only cases run against doubles; native Linux rows become live in M4.

### M4 — Make the Linux native route real

At the end, Linux computer-only and combined sessions explicitly selecting cua run the unchanged Sky service and `sky_linux` helper through the owned worker. Trace the retained Sky module's Linux calls and approval persistence; record the config/readToml/writeToml caller audit
and implement only the needed **ApprovalStorage** subset. Preserve session cleanup on close/idle semantics and ensure the helper is a supervised stdio child, not an unowned daemon. Keep platform default sandbox disabled for Linux computer and scoped for browser-only.

Touch own privileged storage/launch code, Linux parity cases and the native-baseline adapter; no Sky binary patches or new native engine. Existing `scripts/accept/linux-native.mjs`, `linux-chrome.mjs` and `linux-chrome-features.mjs` run unchanged in behavior under host-attesting
wrappers. Use the cua-linux VM inside its X environment. Compare all native rows, including unsupported platform operations and observable vendor errors, not only successful screenshot capture; never “fix” a vendor failure by weakening the oracle.

Consumes CuaBootstrap, PrivilegedRuntime, ParityRun and the M0 Linux baseline. Produces Linux native evidence and ApprovalStorage (or an explicit no-callers verdict). Proves acceptance 5, native portions of 3/6, and 8's native comparison with three matched own-host runs and the
same sample plan. Run browser inventory rows on Linux too. Does not switch defaults, exercise macOS native via the own host or replace Codex sandbox. Failure of parity/performance holds M5; record a real blocker rather than substituting the Mac baseline.

### M5 — Switch supported sessions and prove the whole feature

At the end, the default table is live, doctor explains it, installed clients find all owned assets, and all acceptance results are recorded. Change absent/empty override selection only now; finish `src/runtime/doctor.mjs`'s `repl.host` row, README
runtime/sandbox/Chrome/configuration/licensing sections, package Node floor and assets, `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` one minor above current main. Add the dated Phase A/B revision to
`docs/doperpowers/specs/2026-10-02-standalone-cua-design.md`; do not imply vendor runtime deletion.

The session, not an executor, updates the mini resident checkout/agent to the reviewed M5 head, retaining its `computer,browser` surfaces and therefore vendor host on macOS. During that update the session proves installed-agent rollback with `CUA_REPL_HOST=vendor node bin/cua.mjs
agent install --surfaces computer,browser`, verifies the stored explicit setting and answering vendor host, then restores with `env -u CUA_REPL_HOST node bin/cua.mjs agent install --surfaces computer,browser`; M0’s job tests cover both service managers. A shell-only override is not this proof. Browser benchmarks must run through a
**browser-only own-host** session; an unchanged computer,browser resident configuration on macOS still selects vendor. Reuse the model controller brief and M5 cua-service evidence from #113, three serial unattended runs, then #130's scripted outcomes. Attest the runtime actually
serving each connection. If the resident route cannot provide browser-only sessions, use the harness-owned browser-only route and remeasure its vendor-host control rather than compare unlike routes.

M5 produces **RemoteProofEndpoints** in `scripts/repl-parity/remote.mjs` before using them: harness-owned foreground `agent run --relay` processes on the cua-linux VM (`computer,browser`) and mini (`browser`), each with a fresh installed scratch CUA_HOME, throwaway relay/device
identity and recorded owned PID. Reuse enrollment/import flows; do not overwrite singleton launchd/systemd jobs to create these instances. Add the kill-client/count-one probe and bounded cleanup described in Concrete Steps.

Consumes every prior interface and evidence set. Execute acceptance 1–10 as written, not merely unit tests: full mini and Linux parity/inventory, docs/profiles, MAWS probe and unchanged e2e, native before/after, browser tool-time benchmark, scripted outcomes, remote skill
acceptance, both selector lanes/cache/doctor, package contents and three gates. `test/repl-parity/inventory.test.mjs` now rejects every uncovered row. Record which macOS computer sessions remain vendor, #117's switch work, #120's provenance list, measured results and lessons in
Outcomes. No macOS native bypass, sandbox replacement or clean-room implementation is bundled into this release.

## Concrete Steps

Authoring/execution worktree is `/Users/new/Developer/GitHub/cua-wt-repl-host`. These are execution commands, not claims they have run at authoring. `$SHA` is the reviewed milestone head; `$E` is `docs/evidence/2026-10-14-own-repl-host-parity`; run directories must be new. M0
implements the repl-parity flags below and records the prepared Linux profile as `$LINUX_PROFILE` (selected from readiness output, never guessed).

```sh
cd /Users/new/Developer/GitHub/cua-wt-repl-host
HOME=/tmp/cua-repl-test-home npm test
npm run test:mods
claude plugin validate .
# all pass; only declared platform/vendor-absent skips and the known CLAUDE.md warning
node --test test/repl-parity/                         # inventory and comparator, no live runtime
node scripts/extract-meriyah.mjs                    # M1: exact 7.0.0 asset/version; mismatch fails
```

M0 prepares remote parity clones, preserving existing profile bindings; subsequent milestones prepare the new SHA, never the resident checkout. `--suite` and `--through` restrict both runs and diff to the same milestone's exact case set; no missing case within that set may be
ignored.

```sh
node scripts/repl-parity.mjs prepare --device mini --commit "$SHA" --profile ssfs
node scripts/repl-parity.mjs prepare --device cua-linux --commit "$SHA" --profile "$LINUX_PROFILE"
node scripts/repl-parity.mjs run --host vendor --device mini --suite cells --out "$E/m0/vendor-1"
node scripts/repl-parity.mjs run --host vendor --device mini --suite cells --out "$E/m0/vendor-2"
node scripts/repl-parity.mjs diff "$E/m0/vendor-1" "$E/m0/vendor-2"
# 0 differences; no expected-differences file allowed for vendor determinism
node scripts/repl-parity.mjs run --host cua --device mini --suite cells --through M1 --out "$E/m1/cua"
node scripts/repl-parity.mjs diff "$E/m0/vendor-1" "$E/m1/cua" --through M1 --expected test/repl-parity/expected-differences.json
# attested cua-repl-host + cua/replHost, then 0 unexpected differences
```

M2 adds `--repl-host` to the existing browser harness without changing its corpus or service selector. Both sides below use `--service cua`; `vendor` means the REPL host, not browser service. M3 repeats with owned bootstrap; M5 repeats full acceptance.

```sh
node scripts/browser-parity.mjs prepare --device mini --commit "$SHA" --profile ssfs
node scripts/browser-parity.mjs run --device mini --service cua --repl-host vendor --out "$E/m2/browser-vendor-host"
node scripts/browser-parity.mjs run --device mini --service cua --repl-host cua --out "$E/m2/browser-cua-host"
node scripts/browser-parity.mjs diff "$E/m2/browser-vendor-host" "$E/m2/browser-cua-host"
# 0 differences over all 59 existing cases; host identity is attested separately
node scripts/repl-parity.mjs run --host vendor --device mini --suite api --out "$E/m3/vendor"
node scripts/repl-parity.mjs run --host cua --device mini --suite api --out "$E/m3/cua"
node scripts/repl-parity.mjs diff "$E/m3/vendor" "$E/m3/cua" --expected test/repl-parity/expected-differences.json
node scripts/repl-parity.mjs run --host cua --device mini --suite docs-profiles --out "$E/m3/docs-profiles"
# independent document byte assertions, profiles inventory and host attestation all pass
```

M0's Linux native baseline and M4's comparison use the same reviewed script with its M0 Linux extension. `prepare` records the VM's checkout, Node, X environment, profile and display; do not paste desktop credentials into shell commands. M0 records `vendor`, M4 records `cua`,
each with three runs at the default 5 cold/30 warm/10 task sample plan.

```sh
for n in 1 2 3; do
  node scripts/native-baseline.mjs run --device cua-linux --host vendor --out "docs/evidence/2026-10-14-own-repl-host-native/vendor/run-$n"
done
# M4 repeats with --host cua and /cua/run-$n
node scripts/native-baseline.mjs compare docs/evidence/2026-10-14-own-repl-host-native/vendor docs/evidence/2026-10-14-own-repl-host-native/cua
node scripts/repl-parity.mjs run --host vendor --device cua-linux --suite all --out "$E/m4/vendor"
node scripts/repl-parity.mjs run --host cua --device cua-linux --suite all --out "$E/m4/cua"
node scripts/repl-parity.mjs diff "$E/m4/vendor" "$E/m4/cua" --expected test/repl-parity/expected-differences.json
```

On the VM, working directory is the prepared `~/Developer/GitHub/cua-parity` clone, inside its X session environment. Run through the harness runner wrapper so host attestation is captured, with these unchanged inner commands:

```sh
CUA_REPL_HOST=cua CUA_SHIM_SURFACES=computer node scripts/accept/linux-native.mjs
CUA_REPL_HOST=cua CUA_BROWSER_SERVICE=cua CUA_SHIM_SURFACES=browser node scripts/accept/linux-chrome.mjs "$LINUX_PROFILE"
CUA_REPL_HOST=cua CUA_BROWSER_SERVICE=cua CUA_SHIM_SURFACES=browser node scripts/accept/linux-chrome-features.mjs
# each prints status PASS and exits 0; no screenshot file requested
```

On the mini parity clone, `$MAWS_CHECKOUT` is a prepared MAWS worktree and `$CUA_HOME` a scratch installed home outside TMPDIR; only harness-owned MAWS is started. M2 and M5 run:

```sh
CUA_REPL_HOST=cua CUA_SHIM_SURFACES=browser CUA_BROWSER_SERVICE=cua MAWS_CHECKOUT="$MAWS_CHECKOUT" CUA_HOME="$CUA_HOME" \
  node docs/evidence/2026-10-13-own-browser-service-parity/m4/maws-live/run.mjs --out /tmp/cua-repl-maws.json
# verdict passes, own host and service attested
# In that MAWS worktree: pnpm e2e:browser-cua   (unchanged fake-host regression, not host proof)
```

M5 runs `node scripts/repl-parity/remote.mjs --experiment "$EXPERIMENT" --relay "$RELAY_WS" --out "$E/m5/remote"` from this worktree. Its M5-produced wrapper owns endpoint preparation/start/cleanup, separate from the mini resident agent. For each device, in its prepared parity clone, it creates a private scratch CUA_HOME outside TMPDIR and installs the verified runtime there. `$REMOTE_HOME` and
`$EXPERIMENT` are generated and journaled by the harness; `$RELAY_WS` is the existing authorized relay URL, `$RELAY_ORIGIN` its HTTPS origin. The Linux process retains the prepared X-session environment. These are the inner commands the wrapper runs, with
`$SURFACES=computer,browser` on cua-linux and `browser` on mini:

```sh
CUA_HOME="$REMOTE_HOME" node bin/cua.mjs install
(umask 077; set -C; CUA_HOME="$REMOTE_HOME" node bin/cua.mjs remote enroll --relay "$RELAY_WS" --json > "$REMOTE_HOME/enroll.json")
jq -r '.deviceId, .relayEndpoint, .clientSecretKey, .devicesEntry' "$REMOTE_HOME/enroll.json"
CUA_HOME="$REMOTE_HOME" CUA_REPL_HOST=cua CUA_BROWSER_SERVICE=cua CUA_SHIM_SURFACES="$SURFACES" CUA_SHIM_SECRETS=off node bin/cua.mjs agent run --relay
# tracked foreground child; wrapper records its PID and waits for relay readiness, never daemonizes unowned work
```

Follow `skills/cua-remote/SKILL.md` enrollment exactly: only the safe fields above may enter reports. The authorized relay operator merges each new `devicesEntry` into its current table and applies `relay/deploy/update.sh --devices "$MERGED_TABLE"`, preserving other devices; no
cloud credential files are read. The owner transfers the enrollment credential into `/secret <clientSecretKey>`, or supplies a private prepared client config to `cua devices import "$CLIENT_CONFIG" --name "$REMOTE_NAME"`; never print/read the credential in the session. With the
owner-stored key, use `node bin/cua.mjs devices add "$REMOTE_NAME" --relay "$RELAY_ORIGIN" --device "$DEVICE_ID"`. Names are `repl-$EXPERIMENT-linux` and `repl-$EXPERIMENT-mini-browser`; record endpoint/identity/host attestation, not credentials. Missing enrollment/owner handoff
holds live acceptance, not a fabricated pass.

The mini scratch home discovers only the already-authorized cua-route ssfs backend through harness-supplied discovery/registry data, never profile contents; install no extension and rebind no profile. `devices_list` then `devices_use "$REMOTE_NAME"` must reach each prepared agent
with the declared surfaces. Run js observe/act/verify, js_reset, elicitation, end_task and switch local; active-task switching still refuses `task_open`. Both initialize and a real result must attest own host. The resident mini endpoint is separately checked as vendor-routed, not
counted as own-host proof.

For disconnect/no-replay, a cell appends one increment to a harness-owned counter file under the device’s writable TMPDIR, signals “started”, then waits on a bounded release file; neither file belongs to an owner app or secret store. After the started signal the harness sends SIGKILL to its own MCP client PID, not the agent or helper. Reconnect a fresh client without
resubmitting the cell, release/observe the fixture, and assert counter exactly 1; a possibly-executed reply is not represented as success or retried. Journal request id, disruption point and count only. At cleanup end surviving tasks, run `node bin/cua.mjs devices remove
"$REMOTE_NAME"`, `kill -TERM "$AGENT_PID"; wait "$AGENT_PID"` for each recorded child only, remove only these relay table entries through the same merge/update flow, and delete the owned scratch homes/enrollment/config files. Owner removes any temporary stored key through the existing secret UI; no raw store
edits. Existing remote consumer suites remain unchanged.

M5 benchmark outputs use the existing controller brief `test/browser-parity/bench-controller-brief.md`, fixture task set and MiniWoB pin, with experiment/host/surfaces attestation added to run metadata. Initialize M0’s recorder with `await
bench.init({experimentId,host,service:"cua",run})`; journal under `${os.tmpdir()}/cua-bench/<experimentId>/<host>/<service>/run-<n>/`, keyed by the entire tuple. New comparisons get a new experiment id; same-run recovery reuses exactly its tuple. `$BENCH` holds the three #113 M5
cua-service/vendor-host control runs in `vendor/` and the three own-host runs in `cua/`; M0’s `--axis host` reads those as host groups and validates `service:cua` on both. Archive source evidence remains unchanged. Old baseline host identity must be established from its recorded
commit/runtime route; if it cannot be attested, remeasure the matched control instead of inventing a marker.

```sh
node scripts/bench-summary.mjs "$BENCH" --axis host     # verdict: no regression (tool time)
for host in vendor cua; do
  for n in 1 2 3; do
    node scripts/browser-parity.mjs run --device mini --service cua --repl-host "$host" --corpus bench --out "$E/m5/scripted/$host/ep-$n"
  done
done
node scripts/bench-scripted-summary.mjs "$E/m5/scripted" --axis host
# #130 scripted outcome verdict reported separately, equal episode counts and actual host attestation
node scripts/repl-parity.mjs run --host cua --device mini --suite all --out "$E/m5/mini"
node scripts/repl-parity.mjs run --host cua --device cua-linux --suite all --out "$E/m5/linux"
# compare each with a matched vendor-host all-suite run, then rerun the three PR gates above
```

M5 additionally runs `node bin/cua.mjs doctor --json` in each prepared session environment with override unset, `cua`, `vendor` and an invalid value; checks `repl.host` against real answered calls, repeats a cached handshake across selections/version and inspects `npm pack
--dry-run --json` for core docs and parser assets. Record commands, commit and safe verdicts in the evidence directories and Progress; never report a pending or fake run as completed live proof.

## Interfaces and Dependencies

These names are the milestone boundaries, not a demand for one class per name. Their producer/consumer order is binding.

| Interface | Producer → consumers | Contract |
|---|---|---|
| HostSelection | M0 → M1–M5 | `replHostFor({platform,surfaces,ambient,browserSelection}) -> {host:'cua'\|'vendor',reason}`; Design’s route eligibility/defaults/refusal rules, frozen per connection; browserSelection carries service, reason, route, deciding registration and original explicitness for both launch consumers. `buildLaunch` retains `{command,args,env,cwd}`. |
| BenchmarkRun | M0 → M5 | `bench.init({experimentId,host,service,run})`; exact-tuple journal/recovery isolation, independent browser-service identity; summary host axis validates host attestation. |
| HostIdentity | M0 → M1–M5 | Owned host/API version plus selected host in cache identity; M1 emits `serverInfo:{name:'cua-repl-host',version}` and result `_meta['cua/replHost']:{host:'cua',version}`. |
| ParityRun | M0 → M1–M5 | `prepare/run/diff`; `--host vendor\|cua`, `--device mini\|cua-linux\|local`, `--suite cells\|api\|docs-profiles\|all`, `--through M0\|M1\|M2\|M3\|M4\|M5`, `--out`, `--expected`; local means doubles only. `all` is platform-applicable cases, not silent platform skips. |
| HostMcp | M1 → M2–M5 | JSON-RPC 2.0 over stdio, exact recovered tool schemas/effective retained text, ordered MCP content, bidirectional control traffic and correlation; no local cua tool duplication. |
| KernelWire | M1 → M2 | Inner JSONL with execution/generation ownership: exec, submitted_code_complete, exec_result, emit_image and image replies; M2 adds service/hooks, elicitation, timer and native-pipe routing from the NR index. |
| CellRuntime | M1 → M2/M3 | Frozen/immutable cell-facing nodeRepl and tmpDir, persistent cell semantics; rpc only when configured, no privileged globals. |
| TrustedServiceWire | M2 → M3/M4 | Existing sky/browser handleRpc shapes, JSON serialization, string-only error boundary; service/result output merged before caller settles. |
| PrivilegedRuntime | M2 → M3/M4 | Privileged methods listed in Design, frozen nativePipe socket contract, unregister-returning hooks and per-execution requestMeta; full allowlisted launch env only in worker. |
| BrowserClientRuntime | M3 browser-client task → M3 facade task | `setupBrowserRuntime({environment,undocumentedApiMembers,excludedDocumentation,decorateTab} = {}) -> Promise<Agent>` ports the vendor setup/transport seam into `src/cua-api/browser-client.mjs`, exposing agent/browser objects with manifest-aware wrapping; Table 1 defines methods and behavior. |
| CuaBootstrap | M3 → M4/M5 | `src/cua-api/bootstrap.mjs` imports/installs cua and optional agent; Table 1 object/return/absence contracts and enabled-surface checks. |
| CoreDocumentation | M3 → M4/M5 | `docs/cua-api/core.md` plus retained auxiliary/policy text; Table 3 bytes, named output order and requestMeta-identity suppression. |
| ApprovalStorage | M4 → M5 | Only the audited Linux/approval caller-required config/TOML subset; no app-server/account bridge; no-callers verdict is an allowed complete result. |
| RemoteProofEndpoints | M5 setup → M5 device acceptance | `scripts/repl-parity/remote.mjs --experiment <id> --relay <wss-url> --out <dir>` produces two journaled throwaway device endpoints, surfaces, owned PIDs, relay readiness and host attestation before dispatch; cleanup owns only those resources. |

Parity inventory rows carry `{id,kind,source,platforms,milestone,cases}`; member IDs derive from Table 1 object/member, type links use its named types. Cell semantics include persistent/redeclared bindings, awaits/imports, process denial, timeouts/reset, thrown-cell recovery,
ordered output/images, emit:false, write IDs, rewriteDocumentation, three elicitation actions, running cancellation, task identity and turn hooks. Secret rows cover native text methods and browser fill/AX actions at their existing supported shapes, refusal-before-read and
sanitized post-read errors; unsupported fields/evaluate strings never substitute.

Parity result rows add `{content,isError,structuredContent?,meta?}` to the existing case/cell/assertion journal; omitted fields stay omitted. Run metadata has requested and observed HostIdentity, service/backend and complete flag; incomplete/mixed-host runs refuse comparison.
`browser-parity --repl-host` and native-baseline `--host` are independent of browser-service selection. Reuse the 64-bit hash for live screenshots only, the exact byte/pixel oracle for deterministic emissions, fixture state assertions and lifecycle helpers, but never reduce raw
results to the old `CUA_PARITY_RESULT` marker alone.

Owned environment names start with `CUA_REPL_`: trusted services/roots, node path/module directories, banner, untrusted env allowlist, RPC enablement and native-pipe connect budget. Only retained settings get an owned counterpart; do not mechanically recreate all 23 vendor
variables. Existing surface/browser/secret variables retain their wrapper meanings. Vendor launches retain vendor names. Launch passes only owned/allowlisted values and protects both host-specific trusted-root sets; ambient NODE_OPTIONS/NODE_REPL overrides cannot redirect it.

Dependencies retained: Node ≥24 for own execution; built-in vm/modules, filesystem, child processes and sockets; existing `ws`; pinned Meriyah 7.0.0 dev-only extraction; optional dev-only vendored validator; unchanged Codex sandbox, sky.js/sky_linux until siblings replace them;
owned browser service/extension host. The new docs directory must be included in package files. This is not an installer-pruning milestone: runtime resolution still supplies retained sandbox/native artifacts.

## Decision Log

- Decision: Three M3 task 4 findings are settled as follows.
  - **`REPL_HOST_VERSION` stays 0.3.0 through M3.** M4 bumps it once, since M4 changes the host again (ApprovalStorage, the Linux native path), and records all M4 evidence at the bumped version. M3's evidence tells the M2 and M3 0.3.0 hosts apart by attested source commit. Nothing ships to users before M5's default switch.
  - **Browser numbering race (M4 oracle input).** The browser service numbers browsers in the order backends answer, so with two bound mini profiles (ssfs, school) `browser-docs-before-state` can flip on either host. The harness will map browser ids by backend/profile identity, as a declared schema-known dynamic id, rather than by creation order. Until then, M3 records docs-profiles first and keeps the race runs as labelled diagnostics.
  - **`actions/locators` polling counts (M4/M5 oracle input).** These drift by one or two between vendor runs, and no vendor-against-vendor calibration pair covers the case. The derived tolerance will be recalibrated from at least two vendor-against-vendor pairs, taking the union of spreads, before M5's repeat runs.
  Rationale: One version bump per host change avoids recording all the evidence twice. The two oracle issues are vendor-side nondeterminism that the oracle must absorb mechanically, never with hand allowances.
  Date/Author: 2026-10-15, plan-executor rulings on M3 task 4's concerns.
- Decision: M3 task 1, the oracle, as built.
  - **Suites:** `api`, with 290 cases and 1,072 cells; `secrets-live`, 25 cases; and `docs-profiles`, 12 cases. The M0 double rows stay in `secrets`, labelled fake.
  - **Proof classes**, recorded per case: Chrome-live, real-service, mixed, boundary-double, hidden-boundary and binder-double.
  - **Fail-closed rules:** host trace comparison needs a target trace of the right schema (array entries matching the producer's request/notification kinds) wherever the control has one. Tolerances are derived from recorded vendor-against-vendor pairs, and the M2 replay still reports 7 derived differences.
  - **Downloads:** cleaned by an outer, harness-owned helper given a private proof over stdin.
  - **WebMCP:** registration ids are projected only after the real service issues them, scoped by browser and tab; unknown references are rejected.
  - **Locator diagnostics:** the expectation is the RPC-sorted payload (Rust serde order).
  - **Download filenames:** after many downloads, Chrome's collision filenames take the form `parity - YYYY-MM-DDTdddddd.ddd.txt`. The REPL chooser case accepts that observed grammar. The #113 corpus download cases do not yet, and need the same narrow grammar if they hit it.
  - **Completeness:** 491 of the 491 obligations due at M3 are linked; 51 M4 obligations are pending.
  - **Vendor controls** at d75a105: all three pairs show 0 differences with no allowances.
  Rationale: This is the oracle that task 4 and later milestones are graded by.
  Date/Author: 2026-10-15, M3 task 1 executor and its reviews, folded by the plan-executor.
- Decision: Table 3 gains a dated amendment, recorded in `surface-inventory.md` under "Table 3 amendment (2026-10-15)". It repairs the two sentences that the literal Windows deletions made ungrammatical: "Linux always returns full accessibility state." and "Linux app `paste` supports only `text` and uses the platform's native text input." The oracle derives these bytes independently, and the facade's `core.md` applies the same repair. The principle stays as before: vendor wording verbatim, the name changed to cua, exclusions explicit. The amendment covers only sentences the exclusion itself broke.
  Rationale: The owner's ruling, relayed by the session. A deletion that breaks a sentence's grammar is not "verbatim" in any useful sense.
  Date/Author: 2026-10-15, owner ruling, recorded by the plan-executor.
- Decision: M3 task 3 as built.
  - **Documents.** They are committed already edited. Their provenance lives in `docs/cua-api/PROVENANCE.md`, because the files are emitted byte for byte. A test applies the 14 Table 3 edits to SHA-pinned vendor copies and requires byte equality.
  - **Module layout.** One module per vendor concern. That includes `linux-accessibility-tree.mjs`, which Linux `getAXState` text depends on.
  - **Sky.** The facade's no-nodeRepl branch, Sky's native client, is native-engine code and is not ported. Its refusal sentence is kept verbatim.
  - **Dropped vendor switches.** `CUA_REPL_BROWSER_ENV` modes and `TINYSKY_ALT_INITIALIZE_DOCS` are gone (Table 2). The core confirmations policy, its valid requestMeta override and the bundled fallback stay. Only the duplicate browser emission of that policy is excluded (Table 3).
  - **Paths.** `src/cua-api` and `docs/cua-api` join the kernel's read paths, the own host's trusted code paths and doctor's protected paths. That gives read access and write-overlap protection, and no new cell-accessible service.
  - **Banner.** The banner now imports `src/cua-api/bootstrap.mjs`; the M2 vendor-facade banner is removed.
  - **Profiles listing.** It also returns `hostAttestation` and is otherwise unchanged.
  Rationale: Follows Design "Owned facade and first-call documentation" and the owner's document ruling.
  Date/Author: 2026-10-15, M3 task 3 executor and its review, folded by the plan-executor.
- Decision: `exportGsuite` and `exportYouTubeTranscript` are covered at two levels.
  - Real-service cases on a scratch page assert the source-defined rejection and error contracts.
  - Source-boundary success-marshalling cases under the capability case are labelled boundary-double and cite vendor source lines.
  - Authenticated live export success is an explicit external-fixture limitation: no authenticated Workspace or stable captioned-YouTube fixture exists, the same as #113's corpus. It is not claimed.
  Rationale: Acceptance 3 requires an executable proof of every member's contract. A rejection-only case leaves the success shape untested, and the owner's accounts are never used as fixtures.
  Date/Author: 2026-10-15, plan-executor ruling on M3 task 1's question.
- Decision: `--suite all` selects live-lane cases only, and fake rows are never compared live. The inventory completeness gate counts a row as covered when it has live coverage, or when its obligation is a unit/double proof and the row names a unit test, checked to exist and run under `npm test`. A row whose acceptance requires live proof must point at a live-lane case. This is implemented in M3, not deferred to M5.
  Rationale: Otherwise the final M5 `all` diff could never pass while fake secret rows remain, and silently exempting fake rows in the comparator would weaken the oracle.
  Date/Author: 2026-10-15, plan-executor ruling on M3 task 1's question.
- Decision: Acceptance 6's M3 slice (browser substitution) is proven through the real client in the remote capability-host lane.
  - The rows are browser fill/AX actions at their supported shapes, refusal before read, and sanitized post-read errors. They run with the real selected host and client, a synthetic sentinel store in the lane's scratch HOME, and a fake backend that records only booleans, labels and hashes.
  - M0's 27 source/service-double secret rows move to `--suite secrets` and stay labelled fake. They are never counted as live proof.
  - Native text-method substitution is M4.
  - The live seam runs the real selected host, the real client, the real imported secret wrapper and a real scratch fileStore, with a recorder below the wrapper, labelled boundary-double at the service boundary. Wrapper-malformation rows the client cannot emit (coerced method, extra fields) stay as named unit-only proofs under the completeness-gate rule. Fill into real Chrome is #113's concern (amended 2026-10-15).
  Rationale: The comparator rightly refuses fake rows as live evidence. The capability lane is the only place where real-client substitution can run without touching the owner's secret store.
  Date/Author: 2026-10-15, plan-executor assignment to M3 task 1.
- Decision: M3 task 2 as built.
  - **EOF drain.** At EOF the host withdraws unanswered elicitations with `notifications/cancelled`. The worker gets an honest error sentence rather than a fabricated `cancel` action, and nothing is granted. Budget suspensions end, so a silent worker's cell times out on its remaining budget. Each admitted execution gets a drain deadline (remaining budget + after-code hook bound + turn margin + 2 s) and then takes the forced-shutdown path.
  - **Browser client.** Ported mechanically into one file, `src/cua-api/browser-client.mjs`, keeping the bundle's local names until #120.
    - Zod is vendored at 3.25.76 (v3 API) under the exact-pin rule (`scripts/extract-zod.mjs`); the bundled copy's literal strings match that release exactly.
    - Dropped per Table 2: `iab`, `mcpapps`, `codexSessionId` and the Orbit rewrite.
    - What stays in the vendor's facade files for task 3: initial snapshot, allSettled inventory, Linux window binding, platform input guards, DOM-only Tab input wrappers, emit:false.
  - **Task 3 inherits:** adding `src/cua-api` to the kernel's sandbox read paths for restricted profiles.
  Rationale: Vendor parse sites rely on Zod's stripping, refinements and error text, so a hand-written validator would change refusals. The facade concerns follow the vendor's own file split.
  Date/Author: 2026-10-15, M3 task 2 executor, folded by the plan-executor.
- Decision: Case scheduling splits by platform for native-paired members.
  - Their `api/` binder-double cases are darwin-only and due M3, because the doubles are grounded in macOS source.
  - On Linux the same members are proven by their `native/` live cases, due M4.
  - Platform-independent decorated-tab behaviour is proven by real-browser `api/` cases on both platforms.
  - A Linux selection never demands darwin doubles, and a native-paired member with no `native/` case still fails the M4 gate.
  Rationale: Verification "Computer behavior runs live on Linux; macOS-only binder behavior uses source-grounded service doubles".
  Date/Author: 2026-10-15, plan-executor ruling on M3 task 1's question.
- Decision: Some included APIs (certain AX, management and content members) are proven at the facade only, because the retained cua browser service cannot advertise them.
  - Those members run in M0's remote capability-host lane against the real selected host and the real vendor or owned client. A source-grounded command-transport fixture replies, and each reply cites its vendor source lines.
  - The inventory rows and cases are labelled boundary-double, and the evidence states that they prove the facade only and add no new service capability.
  - Members the real service does advertise must run against that real service.
  - Hidden-member cases use an absent or disabled manifest.
  - The macOS binder-double seam is unchanged.
  Rationale: Table 1 requires every member's executable proof, including members the service never advertises. A facade-level proof at the transport seam is the most that is honest, and it must not read as service coverage.
  Date/Author: 2026-10-15, session ruling relayed by M3 task 1's executor, recorded by the plan-executor.
- Decision: M3 runs as four tasks in one PR.
  - **Task 1 (astra, sibling worktree, in parallel): the M3 oracle.**
    - Executable cases for every Table 1 member and type due M3. Browser members run live. macOS binder members use source-grounded doubles, with native Linux rows staying M4. Capability-gated members get both hidden-member assertions and advertised cases through the remote capability-host lane.
    - The `docs-profiles` suite. Its expected first-call bytes are derived independently: Table 3 applied to the pinned vendor document, never copied from the port. It also covers named output order, `rewriteDocumentation` same-requestMeta suppression, and `profiles_list` with no titles or URLs.
    - Trace-count tolerance derived from a recorded vendor-against-vendor pair. The comparator tolerates, per case, cell and method, the delta the vendor shows against itself. This replaces the four hand-written M2 allowances, which become its first fixture.
    - Vendor controls recorded on the mini, browser-only.
  - **Task 2 (opus): the bounded EOF drain, then the browser client.**
    - First, the bounded EOF drain for a suspended request: at drain start, cancel pending client requests and resume the budget, under a drain deadline.
    - Then the browser-client port producing **BrowserClientRuntime** in `src/cua-api/browser-client.mjs`, with its Zod-site decision.
  - **Task 3 (opus, after task 2 is reviewed): the facade, CuaBootstrap and CoreDocumentation.**
    - The facade, bootstrap, platform binders, Sky facade, `docs/cua-api/core.md` with the confirmations policy and the auxiliary document, package files, `profiles/inventory.mjs` on HostSelection, and switching the banner to `src/cua-api/bootstrap.mjs`.
  - **Task 4 (task 3 resumed): the live runs.**
    - `api` and `docs-profiles` suites, own against vendor; the browser corpus repeated with the owned bootstrap; MAWS repeated.
  - All macOS live sessions stay browser-only.
  - Documents follow the owner's ruling: vendor wording verbatim, with the product name changed to cua in prose only, and only the exclusions Tables 2–3 list.
  Rationale: Same oracle/subject separation as M0–M2. BrowserClientRuntime is the spec's named review frontier. Both binding M3 inputs from M2 are scheduled first in their tasks.
  Date/Author: 2026-10-15, plan-executor M3 pre-flight, with the session's post-merge instruction.
- Decision: Two more host-comparison trace allowances are approved on the same basis as `actions/wait-for` and `actions/slow-budget`: `input/coordinates` (drag, maxDelta 1) and `waits/networkidle` (`Page.lifecycleEvent`, maxDelta 4). Each is scoped to its case, cell and methods; maxDelta equals the vendor's own spread; each cites committed, attested vendor-against-vendor runs. The final M2 corpus pair at e4ea7eb runs 59/59 on each host with 0 unexpected differences and 7 expected trace counts.
  Rationale: Variance the vendor shows against itself is not a host difference.
  Date/Author: 2026-10-14, session ruling, recorded by the plan-executor.
- Decision (M3 input): Trace-count allowances for host comparison are derived from a recorded vendor-against-vendor pair. The comparator tolerates, per case, cell and method, the delta the vendor shows against itself, instead of allowances being added one pair at a time. The four hand-written M2 allowances become the first fixture of that rule; no new hand-written trace allowances after M3. M3 also implements the deferred EOF/suspended-request drain bound (fd45380), following the M2 task 3 sketch: at drain start, cancel pending client requests and resume the budget, under a drain deadline.
  Rationale: A per-pair allowance list grows with every flaky count and invites hand-tuned tolerances; deriving the tolerance from recorded vendor variance keeps the oracle mechanical.
  Date/Author: 2026-10-14, session ruling, recorded by the plan-executor.
- Decision: The remaining EOF-drain gap moves to M3. A ready worker that suspends the execution budget during an ordinary service request (or an unanswered elicitation) and then stops responding can keep the EOF drain open indefinitely. The fix is a bounded EOF escape that settles unresolved work honestly and stops the children, while normal approval suspension still works on a live connection. M3 implements it first, test-first; M2's PR carries it under Unresolved Review Findings. M2 bounded only unanswered hooks and `turn_ended`.
  Rationale: The gap predates M2 task 3 and nothing observed hits it. Fixing it in M2 would force the services, MAWS and corpus evidence to be re-recorded again; the session ruled that a non-small bound goes to M3 rather than holding the PR.
  Date/Author: 2026-10-14, plan-executor, applying the session's ruling to the task review's finding.
- Decision: M2's host comparison of the browser corpus allows two exactly scoped differences, both in the new host-only file `test/browser-parity/repl-host-expected-differences.json`.
  - The allowances cover polling-count variance in `actions/wait-for` and `actions/slow-budget`. Each is limited to the `Runtime.evaluate`/`Runtime.releaseObject` trace methods with a stated maximum delta, which the comparator enforces, and each cites committed vendor-against-vendor reruns that show the variance.
  - `dialogs/paused-response`'s start cell is lengthened so that it outlasts the response pause it traces. Without that, `Fetch.requestPaused` could land between cells on either host. This changes one case's timing, not its assertions, and so departs narrowly from "without changing its corpus". It was justified by host traces showing the event at the same offset on both hosts.
  Rationale: Timing-only variance that the vendor shows against itself is not a host difference. Fixing the cell boundary race keeps the oracle deterministic without an allowance.
  Date/Author: 2026-10-14, M2 task 3 executor, accepted and recorded by the plan-executor (task review pending).
- Decision: the own host warms the time zone at load. `worker-runtime.mjs`, loaded first by both the kernel and the trusted worker, makes one `getTimezoneOffset()` as it loads. This is a deliberate departure in cua's favour from a vendor hang. The browser-corpus oracle stays strict: a vendor-side hang is answered by re-running the vendor control until it answers, never by an allowance, and the hung runs are committed as labelled evidence.
  Rationale: the hang is a macOS sandbox/launchd interaction that can strike any first local-time use (see Surprises). Warming at startup removes it without touching the vendor. An intermittent allowance would weaken the oracle for every other cause of the same symptom.
  Date/Author: 2026-10-14, plan-executor ruling on M2 task 3's diagnosis.
- Decision: M2 tasks 1 and 2 as built.
  - The oracle adds `--suite services`, which covers 41 cases, the two staged worker-secret cases among them, through isolated fixture trusted services. A fixture-only host-tap reaches the host's private `turn_ended`. Turn acknowledgements are timed on the device clock against hook-completion witnesses; controller wall time across ssh varies by seconds and is never asserted.
  - Identity allowances use `versionFrom:'attested-source'`, the host version read from the evidence's recorded commit. The effective-tools comparison applies the four exact Table 2 `browser.md` removals to a hash-pinned vendor fixture.
  - The port's trusted worker starts on the first service request and survives kernel resets and timeouts. A sandbox-policy change, its own exit or shutdown ends it.
  - Every live child, kernel or worker, is protected through the reaper's `own(pid)` while it lives. Ancestors of the supervisor are spared. Values crossing the host between children and client get sorted object keys.
  - `REPL_HOST_VERSION` is 0.3.0, and effective tool text travels in `CUA_REPL_TOOL_OVERRIDES`, which only production launches set.
  - Not ported: package-name service resolution, `config`, `fetch`, `otel`, `telemetry`, `gaasBrowserConfig`.
  - `sandbox.mjs` refuses with `trusted_service_untrusted` any trusted service whose real path lies outside the trusted roots.
  Rationale: Recorded so task 3 and later milestones consume the same contracts. M2 task 3 must change the port where the vendor evidence contradicts it: suspend the budget during elicitation, merge response meta.
  Date/Author: 2026-10-14, M2 task 1 and task 2 executors and their reviews, folded by the plan-executor.
- Decision: nativePipe transport-error delivery is proven at the bridge, not over a live macOS transport.
  - Across real Darwin peer failures (an abort during a large write, an SO_LINGER=0 abort, SHUT_RD), the vendor reports only close and a late close. Rust's EOF close wins and the bridge suppresses the later write error.
  - The live case records that close-only outcome, and the own host must match it.
  - Error-before-close and late-error replay are proven by injecting a labelled synthetic `native_pipe_closed` error, keyed to the observed connection id, into the selected host's own trusted worker. The fixture service does the injection at the worker's stdin parsing, so each host's real worker-side bridge runs, vendor in the controls and own in task 3. The proof uses mutation tests and is labelled boundary-injection proof. How the own supervisor emits `native_pipe_closed` stays covered by the live close-only observation and the port's unit tests (amended 2026-10-14).
  Rationale: Same rule as the timeout branch. Claim live only what the OS lets the vendor exhibit, and prove the rest at the narrowest grounded boundary.
  Date/Author: 2026-10-14, plan-executor ruling on M2 task 1's experiments.
- Decision: The nativePipe connect-timeout case records only what macOS can show. On the mini, the vendor case records the explicit 1,000 ms configuration and bounded refusal against a saturated, owned AF_UNIX peer. There, a full backlog refuses immediately, so the timer-expiry branch is not claimed live, and no allowance is added. M2 task 2 proves expiry with a socket-double unit test: the vendor sentence, the pending socket destroyed, and no late delivery. A Linux variant due M4 exercises real expiry on cua-linux, where a full backlog leaves connect pending.
  Rationale: An honest oracle over a claimed-but-unreachable branch; the branch is proven where the OS allows it.
  Date/Author: 2026-10-14, plan-executor ruling on M2 task 1's report.
- Decision: The M2 tools oracle compares against an **effective** vendor control, not M0's base `tools.json`.
  - `m0/vendor-1/tools.json` is the base, no-services surface and stays as it is.
  - M2 task 1 records the vendor's effective `tools/list` through a production-shaped, browser-only vendor launch and commits it as the M2 vendor control.
  - The own host's tools are compared field by field against that control.
  - Each base-versus-effective delta is reported with its launcher source.
  - Approved branding/exclusion departures need scoped expected-differences entries; any other delta is a defect.
  - Task 1 owns the harness and the effective vendor recording; task 3 runs the own-side comparison.
  Rationale: The serve-cells lane bypasses the launcher overrides, so M0 recorded base text only, and a literal match against it would be a false oracle for production tool text.
  Date/Author: 2026-10-14, session ruling relayed by M2 task 1's executor, recorded by the plan-executor.
- Decision: M2 runs as three tasks in one PR.
  - Task 1 (astra) is the M2 oracle: vendor-side scenarios for every case due M2 (isolated trusted fixture services for service hooks, elicitation accept/decline/cancel, suspended budgets, hook order and deadlines, turn deduplication, response meta, trust-boundary refusals and worker secret rejection paths); `browser-parity --repl-host vendor|cua`, independent of `--service`; and a tools-contract comparison against M0's recorded effective contract. It records vendor controls on the mini, browser-only.
  - Task 2 (opus) is the port: trusted-worker, worker-runtime completion and privileged-node-repl, **TrustedServiceWire** and **PrivilegedRuntime**; nativePipe relayed by the supervisor; the effective retained tool text; registering the trusted worker through the reaper's `own(pid)`; the unmodified vendor facade as temporary banner.
  - Task 1 runs in a sibling worktree in parallel with task 2 (disjoint files), so the subject never writes its oracle.
  - Task 3 (opus, task 2's executor resumed) covers the live runs once both are reviewed: the M2 service cases on the own host, the 59-case browser corpus (vendor host versus cua host, both with `--service cua`), the MAWS live probe and unchanged `pnpm e2e:browser-cua`.
  - Binding for every macOS live session in M2: browser-only (`CUA_SHIM_SURFACES=browser`), so the own host never meets the native helper before #117. MAWS runs only from a MAWS worktree the executor creates, never the MAWS main checkout, through `/tmp/maws-review/waitload20.sh` and `with-slot.sh` with `MAWS_E2E_QUIET=1`, one e2e group at a time.
  Rationale: Same separation of oracle and subject as M0/M1. The interfaces TrustedServiceWire and PrivilegedRuntime are the review frontier before live use. The session's reminders on the native helper and MAWS hygiene are recorded where executors read them.
  Date/Author: 2026-10-14, plan-executor M2 pre-flight, with the session's post-merge reminders.
- Decision: Executors must not change device-global configuration. The marked `CUA_NODE` block M1 task 2 added to cua-linux's `~/.bashrc` is removed and restored from its backup. The checksum-verified Node 24.18.0 under `~/.local/share/cua-parity-node` stays as a harness-owned asset. The parity harness passes `CUA_NODE` in its own remote command environment, recorded by `prepare`. The own host's fail-closed departures stand as recorded under M1 task 2: missing sandbox `_meta` defaults to read-only, and a sandboxed call without `CODEX_CLI_PATH` refuses. Any parity case that exercises them gets a scoped expected-differences entry.
  Rationale: A shell-profile export reaches every cua checkout on the VM, and after M5 it would silently choose the Node for the resident agent.
  Date/Author: 2026-10-14, dispatching session ruling, recorded by the plan-executor.
- Decision: M1 task 2 as built:
  - Vendor behaviour was measured by probing the pinned node_repl on the mini, not inferred. That covers result ordering, error sentences, the exact `codex sandbox` argv, the exit diagnostic and the image rules.
  - The own host fails closed where the vendor fails open. A call with no sandbox `_meta` defaults to read-only, and with no `CODEX_CLI_PATH` sandboxed calls refuse.
  - Kernel stdio uses FIFOs on Linux, where the sandbox blocks Node's socketpairs. macOS keeps Node's own pipes, because a FIFO there never reports EOF.
  - `compare.mjs` accepts a `security-departure` entry scoped to one case and one platform. The vendor side must match the declared defect and the own side the exact refusal; the entry names the assertion, `refused` and `boundary` rows.
  - `REPL_HOST_VERSION` is 0.2.0.
  - On cua-linux, a harness-installed Node v24.18.0 lives under `~/.local/share/cua-parity-node`.
  - The own host serves the recovered **base** tool text in M1. The effective retained text, the launcher overrides that describe the cua API facade, lands in M2. M2 is the first production-shaped own-host session, with the vendor facade as banner, and its evidence must include a tools-contract comparison against the M0-recorded effective contract. This revises Design's "M1 reproduces the effective retained tool surface". In M1's no-services lane both sides serve base text, so the cells oracle is unaffected.
  Rationale: The overrides describe a facade M1 does not load, so serving them over a no-services host would document an API that is absent. M2 is where the effective surface becomes true.
  Date/Author: 2026-10-14, M1 task 2 executor, with the tool-text deferral ruled by the plan-executor.
- Decision: M1 task 1 as built: the kernel reads only owned names (`CUA_REPL_JS_BANNER`, `CUA_REPL_UNTRUSTED_ENV_ALLOWLIST`, `CUA_REPL_NODE_MODULE_DIRS`, `CUA_REPL_TRUSTED_RPC_ENABLED`), and vendor `NODE_REPL_*` names have no effect. Not ported: `exec_redacted_source`/`diagnostics.js` (vendor telemetry only), `add_node_module_dir`, audio, GAAS config. `formElicitationSupported` and `responseMeta` stay for M2. The ports are mechanical transforms of the whole NR files; `realmChecks.js` is folded into `worker-runtime.mjs`. npm Meriyah 7.0.0's `meriyah.umd.min.js` is byte-identical to the embedded copy, and the extractor refuses any other SHA-256 or pin. Kernel tests resolve Node through the production `ownHostNode` and skip visibly without Node ≥24. On a Mac whose PATH node is older, the local gate is therefore `CUA_NODE=/opt/homebrew/bin/node HOME=<scratch> npm test`, and both forms must pass.
  Rationale: Owned configuration names (Interfaces, last paragraph), excluded vendor surfaces (Scope), and a gate that actually runs the kernel.
  Date/Author: 2026-10-14, M1 task 1 executor, folded by the plan-executor.
- Decision: Execute M1 as two opus tasks in one PR. (1) The kernel port with vendored Meriyah 7.0.0 (exact-pin devDependency, `scripts/extract-meriyah.mjs`, committed asset, `VERSION`, ISC license, mismatch refusal) and the base worker runtime/cell globals: **KernelWire** and **CellRuntime**, tested against a real kernel child on Node ≥24 (`CUA_NODE=/opt/homebrew/bin/node` locally). (2) The supervisor and tool-contract module (**HostMcp**): timers and generation fencing, the vendor's grouped content assembly (text per write name before images/content items), EOF/group lifecycle, `buildLaunch` wiring to the supervisor on the resolved user Node, the sandbox argv template and owned trusted-root validation in `src/runtime/sandbox.mjs`, a refusal when the sandbox launcher fails on every platform, removal of `repl_host_unavailable`, the `REPL_HOST_VERSION` bump, then the live runs. M1 runs the own host's `cells --through M1` on the mini against `m0/vendor-1`, and also on cua-linux against `m0/linux-vendor-1` with `CUA_NODE` set in the device environment. The Linux run proves the refusal on both platforms, and the #135 difference enters `expected-differences.json` as a security departure scoped to `cells/confinement/no-unsandboxed-fallback`, Linux, assertion field.
  Rationale: KernelWire is the natural review frontier between the two halves. The session asked that the injected launcher failure be a refusal on the own host on both platforms; M0's Linux vendor control already exists, so the Linux run is cheap and closes the departure where it arises instead of deferring it to M4.
  Date/Author: 2026-10-14, plan-executor M1 pre-flight, following the session's post-merge reminders.
- Decision: M0 task 3 as built: an unqualified run records the currently executable suite and lists pending cases; an explicit `--through Mx` is a fail-closed completeness gate, never a silent subset; diff resolves the requested suite/through subset once and applies it to evidence checks and comparison, with exact cell-manifest membership. Raw evidence keeps all metadata; comparison excludes exactly `meta['codex/nodeReplExecutionDurationMs']` and normalizes only explicitly named proxy IDs by creation order. Image projection touches only real MCP image-item `data`, preserving every sibling field and leaving structured content opaque. Each run's remote startup reports the actual checkout, runtime and Node, and stale preparation is refused. M1 boundary cases run through `test/repl-parity/probe-boundary.mjs` against real no-services host sessions, with host-aware kernel identification (`kernel.js` for the vendor, `src/repl-host/kernel.mjs` for the own host, matched by ancestry, interpreter and cwd). Declared vendor defects live in `test/repl-parity/vendor-defects.json`, scoped by case, platform and runtime, and never count as covered. `expected-differences.json` is empty at M0, and M3 adds the source-checked Table 3 document transformation rather than a document waiver. Synthetic secret-wrapper tests are labelled fake.
  Rationale: Three task-review waves on the oracle (field-dropping normalization, subset selection, stale provenance, vendor-only kernel targeting, capability cleanup); the harness the later milestones are graded by must not be able to pass a wrong host.
  Date/Author: 2026-10-14, M0 task 3 executor and its reviews, folded by the plan-executor.
- Decision: The Linux no-unsandboxed-fallback case records the vendor's observed fail-open as it is, and the own host must refuse. The case keeps its independent assertion (a failed sandbox launch is refused, nothing written outside the policy). On the vendor side for Linux it is recorded as a named, expected vendor-defect observation, never normalized or skipped. Vendor-versus-vendor determinism still requires both runs to show the identical fail-open. From M1 on, the cua side must pass the assertion, and the resulting difference is one `expected-differences.json` entry scoped to that case, platform and field, marked as a security departure in cua's favour. cua's existing fail-closed preflight remains the only guard on the vendor route; this child does not patch the vendor.
  Rationale: Design's "No silent unsandboxed fallback" binds the own host; weakening the assertion to match the vendor would encode a security defect in the oracle. #113 handled departures in cua's favour the same way, with a case plus an expected-differences entry.
  Date/Author: 2026-10-14, plan-executor ruling on M0 task 3's Linux finding.
- Decision: M0 task 5 as built: `native-baseline.mjs run` requires `--host` (sets `CUA_REPL_HOST` explicitly, Mac included); the resolved sandbox is recorded from the clone's own resolver and must match in comparison. The Linux outcome task types a lowercase sentence with `pressKey`, verifies it, clears it (ctrl+a, BackSpace; no save dialog), bound by X11 window id; `typeText` and `paste` each run on their own gedit window because they crash it, and the binder refusals (`setValue`, `selectText`, page scroll, non-text paste) run on the scratch window. Linux requests no approvals; any request is declined and recorded. `compare` judges per operation on the wall-time median within max(10%, 500 ms) and reports median/p95/max; cold initialize and total are judged net of each side's ssh round-trip median; ssh, approval, guard and setup are reported, not judged; method cases are tallied per sample (the candidate matches or strictly improves, and an improvement needs a surviving window with observed inserted text) and timed by the same rule; exactly three attested runs per side with every planned sample and every cold connection's phases present, else NO VERDICT; baseline attests vendor and candidate cua.
  Rationale: Acceptance 8's verdict made enforceable after two task-review waves (sandbox identity, cardinality, method multiplicity/latency, read-back failure, per-phase cold coverage).
  Date/Author: 2026-10-14, M0 task 5 executor and its reviews, folded by the plan-executor.
- Decision: M0 owns the vendor-side scenarios for every case due by M1, including the twelve process-control and confinement cases task 3 first left pending (late-reply and reset generation fencing with a fresh banner, EOF/no-replay, child-exit settlement, owned-group teardown, default/scoped/disabled confinement, trusted-root overlap, Linux fail-closed, no unsandboxed fallback). Task 3 completes them and re-records the vendor pairs on mini and cua-linux, so `--through M1` runs against a complete vendor control and M1's executor builds the subject, never its own oracle. Worker-error secret cases and M2+ service/elicitation/document/facade cases stay visibly pending until their milestones.
  Rationale: M0 "establishes the oracle"; letting M1 write the scenarios it is graded by would weaken the differential, and Concrete Steps diff M1 against `m0/vendor-1`.
  Date/Author: 2026-10-14, plan-executor ruling on M0 task 3's DONE_WITH_CONCERNS.
- Decision: Revise Design's output-assembly sentence from "execution order" to the vendor's observed grouping: text grouped per write name (names by first appearance, concatenated within a name) and placed before images/content items, order within each group preserved, awaited or not. M1's supervisor reproduces it and the M1 diff against `m0/vendor-1` enforces it through `cells/output/write-ids`, `cells/output/ordered-images` and `cells/output/unawaited-emissions` (all due M1; `cells/output/ordered-content` asserts the console/write grouping).
  Rationale: Spec text predated the vendor probe; the Design itself asked M0/M1 to compare the Rust-side assembly rather than trust extraction.
  Date/Author: 2026-10-14, dispatching session ruling from M0 task 3's raw vendor evidence, recorded by the plan-executor.
- Decision: M0 task 4 as built: `experimentId` is a lowercase ASCII path-safe slug (no traversal, no case-insensitive aliasing on macOS); journals have no migration or fallback to pre-tuple paths. Run metadata carries requested `meta.host` and observed `hostAttestations:[{host,serverInfo,_meta}]`, `_meta:null` meaning the tool result had none; cua requires `serverInfo.name` `cua-repl-host` and matching `serverInfo.version`/`_meta['cua/replHost'].version`, vendor requires recorded serverInfo and no `cua/replHost` key. `--axis host` requires actual `service:cua` on both sides; the service axes' archived #113 outputs are byte-identical.
  Rationale: BenchmarkRun's exact-tuple isolation and the hostAttestation ruling; old evidence lacking host observations is remeasured, not relabelled.
  Date/Author: 2026-10-14, M0 task 4 executor, folded by the plan-executor.
- Decision: M0 task 2 as built: the inventory has 542 rows (222 members, 103 types, 169 cell/trust/document behaviours, 48 secret boundaries) and 520 case ids under the prefixes `api/` (facade and source-grounded binder doubles), `native/` (Linux live), `hidden/` and `capability-host/` (paired for 64 capability-gated members), `cells/`, `secrets/`. Host rows are due M1, facade rows M3, full native/shared-Target contracts M4; a type row inherits its latest consumer's milestone. The stage gate is `--through Mx`, `--through=Mx` or `CUA_REPL_PARITY_THROUGH=Mx`; M0 reports every row pending, M5 requires every row's executable linkage, which task 3 adds by resolving case ids to scenarios.
  Rationale: Verification's inventory rules (stable rows, due milestone, visibly pending later rows, cases consume types).
  Date/Author: 2026-10-14, M0 task 2 executor, folded by the plan-executor.
- Decision: M0 task 1 as built: before M5, sessions that cannot use the own host already report their real reason (`vendor_browser_route`, `macos_native_peer_requires_vendor`); only eligible sessions report `staged_vendor_default`, so M5 flips one branch. `CUA_BROWSER_SERVICE` is ignored when the browser surface is off (the contradictory-pair rule needs browser on). Error codes: `repl_host_refused` (the three explicit-cua refusals, distinguished by message), `repl_host_unavailable` (until M1), `repl_host_node` (floor), `invalid_repl_host`/`invalid_setting`, `invalid_host_identity`. Agent jobs and `settingsFrom` validate only the value; route/platform refusals run when a connection or listing opens, so an install may persist `cua`. `CUA_NODE` is not persisted into jobs. `REPL_HOST_VERSION` is a hand-maintained constant (like #113's `SERVICE_VERSION`); the vendor host's version is its runtime release. Handshake records live at `<release>/<host>@<version>/<surfaces>@<protocol>.json`, schema 2, host recorded inside; old records miss. A connection passes its once-resolved selections to every launch rather than writing them back into the environment; the profiles listing resolves independently through the same rule. Doctor reports `repl_host_unavailable` for explicit cua at M0 without probing Node.
  Rationale: Executor decisions in the spirit of Design "Selection is a connection fact" and the cache-identity rule; recorded so M1–M5 consume the same names.
  Date/Author: 2026-10-14, M0 task 1 executor, folded by the plan-executor.
- Decision: The HostIdentity observation is a per-connection record `hostAttestation` (a run carries `hostAttestations`): `serverInfo` exactly as `initialize` returned it (cua `{name:'cua-repl-host',version}`; vendor recorded as-is) and the tool-result `_meta['cua/replHost']` (cua `{host:'cua',version}`; vendor absence recorded explicitly). Run metadata carries requested and observed host; a mismatched or mixed-host run is invalid for summary and comparison. Service identity stays `meta.service:'cua'`; existing browser attestation fields are untouched. Tasks 1, 3 and 4 of M0 use these names.
  Rationale: Three M0 tasks produce or consume the observation; one name set avoids a rename wave at review (Design "Handshake cache identity", Verification "The harness records", Interfaces HostIdentity/BenchmarkRun).
  Date/Author: 2026-10-14, dispatching session ruling, recorded by the plan-executor.
- Decision: The own host resolves its Node in this order, taking the first candidate whose `--version` is ≥24: (1) an explicit `CUA_NODE` (absolute path to a Node executable); (2) `process.execPath` of the running cua process; (3) `node` on PATH. If none qualifies, selection of the own host refuses before launch with a diagnostic naming the floor, each candidate tried with its version, and the `CUA_NODE` override. Never the vendor Node, never a silent downgrade to the vendor host. Local own-host runs on this Mac use `CUA_NODE=/opt/homebrew/bin/node` (v26); the mini's PATH node (v24.18.0) needs no override.
  Rationale: Design says "the user's Node ≥24, resolved to an absolute executable" without an order; this Mac's PATH node is v22. Same no-downgrade rule as the explicit route refusal.
  Date/Author: 2026-10-14, dispatching session ruling, recorded by the plan-executor.
- Decision: Execute M0 as five tasks in one PR: (1) HostSelection/HostIdentity, job persistence, cache identity and Node-floor validation; (2) the case inventory and its test; (3) the ParityRun harness (raw cells, MCP capture, comparator, exact image oracle, `serve-cells.mjs`, remote capability-host lane); (4) BenchmarkRun and the host axis; (5) the Linux native-baseline extension and M0's live runs. (Amended 2026-10-14 before task 3's dispatch: task 3 also owns the repl-parity `prepare` and the committed vendor-versus-vendor `cells` evidence on mini and cua-linux, since those runs validate its harness; task 5 owns the native-baseline Linux extension, `compare`, and the three Linux vendor baseline runs. Task 3 schedules each case by its own due milestone, not only its row's: `api/` binder-double cases are due M3 even where the row completes at M4.) Tasks 2 and 4 touch disjoint files and may run in sibling worktrees merged back before review; task 3 consumes 1 and 2, task 5 consumes 1 and 3.
  Rationale: M0 spans production selection code, a large declarative inventory, harness code and live evidence; one executor cannot hold all of it, and the interfaces (HostIdentity, inventory rows, ParityRun) are the natural review frontiers.
  Date/Author: 2026-10-14, plan-executor pre-flight.
- Decision: M0's vendor `cells` runs (mini and Linux) run in the same isolated no-services lane (`test/repl-parity/serve-cells.mjs`, no-op banner, pinned node_repl invoked directly) that M1's own-host `cells` run uses, so `diff $E/m0/vendor-1 $E/m1/cua --through M1` compares like with like.
  Rationale: Concrete Steps diff M1's own-host run against M0's vendor-1; a production-banner vendor run would differ by the facade, which M1 does not ship.
  Date/Author: 2026-10-14, plan-executor pre-flight.
- Decision: Executor routing follows the dispatching session's brief: opus `doperpowers:task-executor` for ports and production selection code; `astra`/`sol-xhigh` for bounded harness, inventory and documentation work, holding the task-executor contract; task reviews `doperpowers:task-reviewer`; each milestone PR `doperpowers:reviewer-high`.
  Rationale: Owner's temporary routing note, carried by the brief; the Agent tool here has no effort parameter, so agents run at their defaults.
  Date/Author: 2026-10-14, plan-executor pre-flight.
- Decision: Gate own-host selection on the resolved browser service with original-setting provenance, including independent profiles listing; implicit vendor routes with no override select vendor with `vendor_browser_route`; an explicit `CUA_REPL_HOST=cua` there refuses with a route diagnostic (session ruling 2026-10-14: an explicit choice is never silently downgraded), as does the explicit contradictory pair.
  Rationale: Connection launch currently stamps a resolved value as if explicit. Blind per-platform defaults break unregistered/ChatGPT homes; the shared route matrix and doctor provenance preserve compatibility instead of adding cloud support.
  Date/Author: 2026-10-14, verified review finding 1, execution-spec revision.
- Decision: Separate live-screenshot average-hash similarity from deterministic emitImage byte/pixel conformance, including WebP and all input forms.
  Rationale: Average hash can equate black and white and its current decoder rejects WebP. Exact hashes/dimensions/MIME and transformed-pixel checks reject corruption without overconstraining live screenshots.
  Date/Author: 2026-10-14, verified review finding 2, execution-spec revision.
- Decision: Persist only an explicitly supplied CUA_REPL_HOST in agent job configuration; prove installed-agent rollback at M5 and both service-manager serializers in M0.
  Rationale: A client shell override cannot change a fixed installed job. Persisting resolved defaults instead would freeze obsolete routing decisions across later registrations.
  Date/Author: 2026-10-14, verified review finding 3, execution-spec revision.
- Decision: M5 creates throwaway relay-enrolled foreground agents on Linux and browser-only mini before device acceptance, retaining the resident mini’s computer/browser vendor lane; kill the test client mid-cell and verify an execution count of one.
  Rationale: Device proof needs a real producer for each endpoint and a concrete disconnect. Overwriting singleton resident jobs or assuming device selection changes surfaces would test the wrong host.
  Date/Author: 2026-10-14, verified review finding 4, execution-spec revision.
- Decision: Namespace benchmark journals by experiment, host, service and run; keep service cua independent of the compared host and test isolated versus same-run recovery.
  Rationale: Existing service/run journals resume prior work and can contaminate a new host comparison. Deleting old journals or relabeling service metadata is not evidence isolation.
  Date/Author: 2026-10-14, verified review finding 5, execution-spec revision.
- Decision: Rebase this branch’s two authoring commits onto main fae28d6 and consume native-baseline tooling there.
  Rationale: PR #133 is merged; an external dependency branch or cherry-pick is obsolete.
  Date/Author: 2026-10-14, coordinator’s post-review base update.
- Decision: Permit M3’s browser-client and facade/document halves as two tasks in one PR at BrowserClientRuntime.
  Rationale: A named reviewed intra-milestone boundary supports bounded workers, as in #113, without another PR or an unbuildable intermediate feature.
  Date/Author: 2026-10-14, coordinator’s post-review task-boundary update.
- Decision: Technical spec and execution section receive an independent `doperpowers:adversarial-reviewer` buildability review before handoff; each milestone PR receives `doperpowers:reviewer-high`, with the session merging after verified findings are resolved.
  Rationale: The ports cross execution, trust and lifecycle boundaries; tests against a fake echo host cannot establish compatibility. A code-only review at the end misses unbuildable milestone seams. Review is selected, not claimed completed.
  Date/Author: 2026-10-14, spec author under the owner's approved verification call.
- Decision: Record the owner's 2026-10-14 rulings as binding: enabled computer/browser scope, whole manifest/capabilities, explicit Table 2 exclusions, verbatim surviving document prose with product rebranding, confirmations retained, sandbox kept until #115 and per-surface default migration.
  Rationale: Preserve what users and models actually use while removing dormant vendor dependencies. Broad package copying and newly authored docs were rejected; the authoritative inventory makes the narrower boundary complete rather than approximate.
  Date/Author: 2026-10-14, owner; transcribed at authoring.
- Decision: Mac computer sessions stay on vendor node_repl until #117; own host uses user Node, vendor Node stays only in vendor-routed sessions.
  Rationale: Both direct ordinary and vendor-Node socket probes closed before a response; vendor Node alone is not the authorized supervisor ancestry. A global switch would break native use; re-signing, relay impersonation or patching the helper is not this design.
  Date/Author: 2026-10-14, owner following peer-authorization spike.
- Decision: Port Meriyah 7.0.0 through an exact-pin extractor (actual recovered license ISC); M3 may use explicit validation at enumerated parse sites or a vendored validator, never a new runtime dependency.
  Rationale: Preserve parser/client behavior without binding installations to a package tree. Generic schema validation and an unpinned parser change semantics; Table 1 and differential tests govern the implementation choice.
  Date/Author: 2026-10-14, approved design, version/license grounded during authoring.
- Decision: Interpret byte-for-byte documentation parity against the explicitly transformed vendor text, and keep #113's already-approved service guidance; keep vendor browser behavior only on the vendor-host lane during staging.
  Rationale: Literal equality to unedited vendor branding contradicts the owner's edits; importing cloud/config bridges contradicts the own-route exclusions. Narrow transformed-byte fixtures and recorded departures preserve both requirements, unlike ignoring document diffs or broadening the host.
  Date/Author: 2026-10-14, authoring reconciliation of the approved inputs.
- Decision: Use browser-only raw-host probes in M1, the real `src/runtime/sandbox.mjs` path, and a Linux adapter/baseline in M0; do not treat the Mac baseline or async-wrapped browser cells as these proofs.
  Rationale: Current launch rejects empty surfaces, the requested mcp sandbox path does not exist, existing runner cells are async-function bodies and #133's evidence is Mac/TextEdit. These are execution corrections, not changes to the approved architecture.
  Date/Author: 2026-10-14, source inspection during self-review.

## Surprises & Discoveries

- Observation (2026-10-14): under the `codex sandbox` policy on macOS, a first local-time use made a few seconds into a Node process can block indefinitely.
  - Where it blocks: in ICU `detectHostTimeZone` → `tzset` → `notify_register_tz` → `bootstrap_look_up2`, waiting in `mach_msg` for launchd.
  - Rates: the vendor host hangs `capabilities/history` (the facade's from/to `toISOString`) in 4 of 30 runs at its 60 s timeout. The own host hung at about 11% before the fix. A sandboxed probe hung 15 of 80 times on a late first use and 0 of 280 times when the zone was warmed at startup. Setting `TZ` does not help.
  - Consequences: the vendor route has this latent hang today. The clean-room rewrite (#120) must keep the startup warm.
  Evidence: M2 task 3's `sample` of a hung kernel and its repro, recorded in its report and in the evidence README under `docs/evidence/2026-10-14-own-repl-host-parity/m2/`.
- Observation (2026-10-14): the vendor's Rust host itself does two things the recovered JS doesn't show.
  - It suspends the cell budget during a bare `createElicitation`: a 650 ms delayed answer succeeds under `timeout_ms=300`.
  - It merges response meta across RPCs and after-code hooks; keys from the first and second RPC and from the hook all survive.
  - Duplicate `turn_ended` acknowledgements arrive only after the shared completion, about 2 ms later.
  - A peer that aborts mid-stream yields close only, because reader EOF wins the write-error race.
  Evidence: control runs `docs/evidence/2026-10-14-own-repl-host-parity/m2/vendor-1` and `vendor-2` (mini, browser-only, at edab6af), cases `cells/budget/approval-and-startup-waits`, `cells/trusted/response-meta`, the turn-dedup case and the nativePipe terminal case. None of these behaviours appears in the recovered JS, so the clean-room rewrite (#120) relies on this oracle to carry them. M2 task 2's host did neither the suspension nor the merge, so task 3 changes both to match the vendor.
- Observation (2026-10-14): when a trusted-service RPC response crosses the vendor's Rust host (a serde map), its object keys reach the cell sorted: a service returning `{value,meta}` prints `{meta,value}`. Proxy-side elicitation persistence is conditional. An accept without content becomes `{}`. `_meta.persist:'session'` is added only when the client supplied no `_meta` at all; an existing client `_meta` survives without it. Sub-second budget cases need a warm call first, because vendor child startup consumes the first cell's budget.
  Evidence: M2 task 1's vendor probes on the mini; the own route must reproduce the sorted-key boundary (relayed to M2 task 2).
- Observation (M2 input, 2026-10-14): `buildLaunch` sets `CUA_REPL_OWNED_GROUP=1`. When the supervisor really is in the anchor's process group, every kernel end, expected or not, freezes and kills the group's other members, sparing the supervisor, the anchor and the supervisor's direct children. This kills reparented descendants of a dead or reset kernel. M2 must exclude the trusted worker's tree from this reaper.
  Evidence: M1 task 2 review fix c6cd0d9, with a real-process regression through `spawnUpstream`.
- Observation (M5 input, 2026-10-14): the cua-linux VM's system Node is 22.23.3, and its sshd accepts no user environment. Once Linux defaults to the own host at M5, how the resident agent resolves Node becomes a product question: an install-time check plus a `CUA_NODE` setting in the agent's own launcher or job environment, never a shell profile.
  Evidence: M1 task 2 report; session ruling recorded in the Decision Log the same day.
- Observation (2026-10-14): the parity fixtures carry `CUA_NODE` through `serve-cells.mjs`, the boundary probe's child serves and the capability lane only when it is already set in the device's ssh environment; the controller Mac's value is deliberately not forwarded (it names a Mac path).
  Evidence: M0 whole-branch fix ad21892 (`test/repl-parity/fixture-launch.mjs`). M1 on the mini needs no override (PATH Node 24.18.0); M4 on cua-linux (Node 22.23.3) must set `CUA_NODE` in the remote command environment.
- Observation (2026-10-14): on Linux the vendor node_repl fails open when its sandbox launcher fails at runtime. With a harness-owned `CODEX_CLI_PATH` whose `sandbox` exits 73, the vendor host returned `isError:false` and wrote a sentinel outside cwd and TMPDIR (inside the harness-owned directory). On the mini the same injected failure is refused.
  Evidence: M0 task 3's Linux boundary probe at c46050b (`cells/confinement/no-unsandboxed-fallback`, Linux vendor runs under `docs/evidence/2026-10-14-own-repl-host-parity/m0/`). On the vendor route only cua's pre-launch preflight guards this.
- Observation (2026-10-14): on the cua-linux VM, gedit 46.2 now fails `typeText`/`paste` with a D-Bus `NoReply` error and the window exits (the 2026-10-06 acceptance evidence recorded `os error 11` for the same crash); the display is 1440x900, not the 1024x768 that evidence records; the vendor host answers `initialize` as `rmcp 1.5.0`; the VM's Node is v22.23.3, so M4's own host there needs `CUA_NODE` (keep the proxy on the same Node for comparability).
  Evidence: M0 task 5 smoke run at 58d42b6 (not evidence; report in the SDE workspace), carried into `docs/evidence/2026-10-14-own-repl-host-native/vendor/README.md`.
- Observation (2026-10-14): the vendor does not interleave writes and images in emission order. Named writes A(same), B(other), C(same) yield text items `['AC','B']`; `write('before')`, `emitImage(...)`, `write('after')` yields one text item `'beforeafter'` followed by the image, in awaited and unawaited forms.
  Evidence: `docs/evidence/2026-10-14-own-repl-host-parity/m0/vendor-1/results.jsonl` (M0 task 3's mini vendor run).
- Observation: `REPL_HOST_VERSION` is bumped by hand, and own-host Node resolution makes up to three synchronous `--version` probes (5 s timeout each) per launch.
  Evidence: M0 task 1 report. M1 bumps the version when the own host first answers (else a developer's cached handshake goes stale) and should resolve Node once per connection.
- Observation: `scripts/native-baseline/remote.mjs` reads the vendor handshake record path, which M0 task 1 moved under `<host>@<version>/`.
  Evidence: M0 task 1 updated it for vendor; M0 task 5 parametrises it by host.
- Observation: Direct vendor Node is rejected by the macOS native helper just like ordinary Node.
  Evidence: `07-ordinary-node.txt` and `08-vendor-node.txt` both show connect, ping, socket-end and `socket closed before response`; the code-signing/ancestry findings explain the staged default, not a new universal claim about every possible peer.
- Observation: Existing local parity and fake-upstream success cannot prove persistent REPL compatibility.
  Evidence: `scripts/browser-parity/runner.mjs` wraps code in async functions; `test/fixtures/fake-upstream-process.mjs` echoes most js source. M0 adds raw-cell capture and M1 executes the real owned kernel.
- Observation: Native baseline evidence exists, but only for the mini's Mac helper.
  Evidence: `docs/evidence/2026-10-14-native-baseline/summary.md` on PR #133 records Mac14,12/macOS 27, three vendor runs with no errors; `scripts/native-baseline.mjs` assumes TextEdit. Linux/gedit measurement remains M0 work.
- Observation: Renaming trusted-root variables also changes a security check's input.
  Evidence: `src/runtime/sandbox.mjs` currently reads `launch.env.NODE_REPL_TRUSTED_CODE_PATHS` in `assertSandboxFits`; M1 must preserve that overlap check for the owned key rather than merely rename the worker parser.
- Observation: Both existing benchmark summaries bind directory names to browser-service attestation.
  Evidence: `scripts/bench-summary.mjs` and `scripts/bench-scripted-summary.mjs` reject service mismatches. M0 adds an explicit host comparison axis; M5 never rewrites the service identity to make old tooling accept a host comparison.

## Outcomes & Retrospective

- M0 (2026-10-14T22:30Z): the oracle exists and the vendor route measures identically twice. Mini `cells --through M1`: 111 cases, 145 cells, 0 differences, all assertions pass. cua-linux: 112 recorded, 111 passing, 146 cells, 0 differences, with the vendor's runtime sandbox fail-open recorded as a declared defect (hardening is #135). Linux native baseline: three vendor runs, 18 attested connections, no errors; typeText/paste crash gedit 46.2. Defaults unchanged (vendor). Lessons: the harness needed four review waves before it could not pass a wrong host (field-dropping normalization, subset selection, stale provenance, case-wide exemptions), so later milestones should treat any oracle change as review-critical; M0 had to own the whole M1 vendor control so M1 never writes its own oracle. Final outcomes are written at M5.
- M1 (2026-10-15T00:23Z): an explicitly selected own host runs raw persistent cells on user Node 24 under the retained sandbox, with zero unexpected differences on both platforms. The accepted entries are 134 identity slots, plus the #135 security departure on Linux, where the own host refuses a failed sandbox launch and the vendor runs unconfined. Defaults remain vendor. Lessons: lifecycle edges (dead-launch descendants, drain against forced shutdown, policy-change races) took three review waves and none of them is reachable by the cells suite, so M2's trusted worker should get real-process lifecycle tests from the start. Device-global configuration is off-limits to executors; harness-owned environments carry device settings.
- M2 (2026-10-15T07:04Z): the own host now runs the retained trusted services and MAWS browser-only on macOS. On the mini, the services suite, the effective tools and the 59-case browser corpus all match the vendor host, apart from exact identity slots, the approved Table 2 tool-text transform and vendor-spread trace counts. The vendor oracle surfaced behaviours the recovered JS does not show: elicitation suspends the budget, response meta merges, duplicate acks wait for the shared completion, and a peer abort is close-only. The port now matches all four. It also found a macOS sandboxed time-zone lookup hang that affects the vendor route today (#138). The own host avoids it by warming the zone at load and replacing a child that fails to start. Lessons: writing the oracle in a separate worktree in parallel with the port worked, and the oracle's vendor probes corrected the port twice. Hand-written trace allowances do not scale, so M3 derives them from recorded vendor variance. Environment interruptions (TCC consent, a closed Chrome window) cost more wall time than any code defect.
