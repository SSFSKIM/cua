# node_repl embedded JavaScript — static recovery for cua #116

Source binary: `/Users/new/Library/Application Support/cua/runtimes/26.928.40906-darwin-arm64/cua_node/bin/node_repl`  
Size: 17,712,272 bytes. SHA-256: `aa594b78af268218f3cc60d74ff62e7a6eed819790fb028f7e391334ed969aba`.  
Output: `/Users/new/.claude/jobs/1ea561bc/tmp/116-node-repl-embedded/`. Extracted from raw binary bytes on 2026-10-14; no runtime was launched.

## Recovery and coordinate conventions

Nine distinct complete source files occur in the Rust string table, with a second byte-identical copy of each 256,202 bytes later. The apparent shipping filenames are retained; none is reformatted. Each file includes its original trailing LF. The total unique source size is 249,035 bytes. Original filename literals delimit most sources; the final `module.exports` / first trusted-worker comment delimit `tracing.js` and `trusted-worker.js`; `js expects non-empty JavaScript source` follows `worker-runtime.js`. Both copies, complete-file equality, full-file parse checks, and valid first/last statements corroborate the boundaries. No prefix/suffix was synthesized to make a candidate parse.

All **byte ranges** here and in sidecars are zero-based, end-exclusive offsets into the full Mach-O file. **Binary LF lines** are one-based counts of byte `0x0A` from binary byte zero; a source's terminating LF belongs to its last line. This deliberately avoids Unicode `splitlines()` behavior. The earlier `/Users/new/.claude/jobs/1ea561bc/tmp/node_repl.strings` is only a locator, not the extraction source: it has 45,581 literal LFs and drops short/nonprintable runs. Its kernel locator starts on LF line 20,970, whereas the original binary's kernel starts on LF line 55,276. Research A explicitly uses binary-LF citations: its 56,861–56,916 range points into the kernel RPC bridge and agrees with this extraction. Research B uses strings-dump locators such as 20,970–26,287. Keep those two coordinate spaces separate; byte ranges and explicit binary-LF coordinates below are authoritative.

## Recovered files and syntax checks

| File | Bytes | Primary byte range | Binary LF lines | Parse |
|---|---:|---|---|---|
| [kernel.js](kernel.js) | 56,208 | [9378773, 9434981) | 55276–57147 | PASS, exit 0 |
| [diagnostics.js](diagnostics.js) | 5,195 | [9434995, 9440190) | 57148–57352 | PASS, exit 0 |
| [privileged-node-repl.js](privileged-node-repl.js) | 19,589 | [9440213, 9459802) | 57353–58025 | PASS, exit 0 |
| [privileged-node-repl-config.js](privileged-node-repl-config.js) | 7,189 | [9459832, 9467021) | 58026–58279 | PASS, exit 0 |
| [realmChecks.js](realmChecks.js) | 640 | [9467035, 9467675) | 58280–58305 | PASS, exit 0 |
| [meriyah.umd.min.js](meriyah.umd.min.js) | 133,892 | [9467693, 9601585) | 58306–58311 | PASS, exit 0 |
| [tracing.js](tracing.js) | 6,446 | [9601595, 9608041) | 58312–58563 | PASS, exit 0 |
| [trusted-worker.js](trusted-worker.js) | 6,935 | [9608041, 9614976) | 58564–58793 | PASS, exit 0 |
| [worker-runtime.js](worker-runtime.js) | 12,941 | [9614993, 9627934) | 58794–59271 | PASS, exit 0 |

Every file has `<name>.provenance.txt` with primary/duplicate offsets, line ranges, SHA-256, boundary context and a role/message description. Checks used the non-vendor Node at `/Users/new/.nvm/versions/node/v22.23.2/bin/node`, invoking **only `--check`** on each file with `NODE_OPTIONS` and `NODE_PATH` removed. All returned exit 0 with no stdout/stderr. Parse success proves syntax only, not behavioral compatibility; neither `node_repl`, vendor Node, nor extracted JS was executed. The installed runtime was read-only and no secret/auth files or extension-token values were read.

## Sources, bootstrap, and trust boundary

- `kernel.js`: `parseKernelBootstrapArgs` at local lines 120–161; persistent-binding model at 167 onward; allowlisted environment at 224–263; package/module resolution at 265–740; Meriyah/AST rewriting at 742–1492; immutable `nodeRepl`/`tmpDir` at 1639–1642. Cell execution at 1644–1850 uses `SourceTextModule` plus synthetic `@prev` exports. Completed bindings can survive ordinary errors.
- **No independent bootstrap-*.js is present.** Bootstrap and banner handling are part of `kernel.js`: it reads/deletes `NODE_REPL_JS_BANNER` at 177–179 and constructs the once-successful-banner prelude at 1673–1676. The vendor-specific `await import("@oai/cua/tinyskyAlt");` banner is supplied externally by cua-repl, not stored here as another source. Runtime-generated cell modules and synthetic previous-binding modules are not separate embedded files; `node-repl-trusted.js` is a synthetic createRequire resolution anchor, not an embedded asset. A full-binary scan found no `require(`, `module.exports`, `globalThis.`, or line-start function/import/export source markers outside the 18 recovered source spans.
- `trusted-worker.js`: process cwd at 15; service/env/root config at 19–34; trusted resolver hook at 46–60; privileged globals at 83–99; lazy `handleRpc` import at 134–153; service/hook result envelope at 155–189; turn lifecycle at 197–230. It inherits full env; ordinary cells receive only the explicit allowlist snapshot. Do not confuse its trust with absence of an OS sandbox: Rust's launcher confines both child processes.
- `worker-runtime.js` at 230–332 defines basic `nodeRepl`: `cwd`, `env`, `homeDir`, `tmpDir`, `requestMeta`, `write`, `emitImage`, optional `emitAudio`. Kernel adds `rpc` only when enabled (1608–1637). No cell `nativePipe`/config/LaunchServices access is installed.
- `privileged-node-repl.js` at 373–601 adds privileged APIs. Hook registration returns an unregister function; after-code hooks run sequentially and turn-ended hooks concurrently, each with a positive per-hook timeout (14–55, 639–647). Errors in hooks are swallowed as best-effort. `emitContentItem` appends strings to the current execution's content list, not a separate MCP streaming transport. Most privileged promises are drained; authenticated fetch explicitly is not (190–193).

## Internal messages and Rust supervisor counterparts

These are **inner JSONL** between Rust and its Node children, not MCP JSON-RPC messages or native socket framing. The shared runtime serializes each message as `JSON.stringify(message)+"\n"` (`worker-runtime.js`:346–348) and settles pending requests by `id` (395–403).

| Direction / handler | Inner message(s) | Rust-side responsibility / JS evidence |
|---|---|---|
| Rust → kernel | `exec`, `add_node_module_dir` | Queue cells, set request meta/elicitation support/browser config; extend package bases. `kernel.js`:1644,1862–1872. |
| Kernel → Rust | `exec_redacted_source`, `submitted_code_complete`, `exec_result` | Retain redacted diagnostics, end submitted-code timeout phase and collect text/named outputs/content/error. `kernel.js`:1501–1516,1571–1584,1681–1685,1761–1770,1839–1848. |
| Kernel → Rust → trusted process | `trusted_service_request` → `service`; `trusted_service_hooks` → `run_hooks` | Rust routes request/exec context and correlates replies. Kernel:1586–1636; trusted worker:155–189,212–229. |
| Trusted process → Rust → kernel | `trusted_service_response` | Carries `id`, `output`, `content_items`, `ok`, `value` or string `error`; kernel appends output before resolving/rejecting. Only `error.message` crosses, no stack/cause/custom error properties. |
| Rust → trusted process → Rust | `turn_ended` → `turn_ended_result` | Lifecycle hook dispatch with frozen event and acknowledgement. Worker:197–211. MCP deduplication belongs to Rust, not this hook set. |
| Either child → Rust | `emit_image`, optional `emit_audio` | Host decodes data URLs, builds MCP content, returns id-correlated `emit_image_result` / `emit_audio_result`. Shared runtime:265–332. |
| Trusted process → Rust | `elicit` | Rust issues MCP `elicitation/create`; reply `elicitation_result` includes `ok`, action/content/_meta or error. Privileged bridge:65–129. |
| Trusted process → Rust | `authenticated_fetch` | Host-side fetch/auth bridge; reply `authenticated_fetch_result`; JS constructs a `Response`. Bridge:132–193. |
| Trusted process → Rust | `config_action` | Action `read_toml`/`write_toml` (host-local storage), `read_config`/`read_config_requirements`/`write_config_value`/`batch_write_config` (app-server). Reply `privileged_result`. Config helper:133–240. |
| Trusted process → Rust | `launch_services_action` (`open_application`) | Host opens application/bundle using macOS LaunchServices; reply `privileged_result`. Bridge:455–472. |
| Trusted process → Rust | `suspend_timeout`, `resume_timeout` | Execution timer control around awaited privileged operations, not a cell-side timer. Bridge:423–449. |
| Trusted process → Rust | `response_meta`, `response_meta_trace`, `otel_log` | Merge response meta, attach/persist trace and export audit records; bridge:528–570, worker:166–173. |
| Trusted process → Rust | `native_pipe_request`, op `connect`/`write`/`close` | Rust opens/closes/writes real sockets outside child sandbox. JS sends bytes as base64; socket API is frozen `write/on/off/end`. Bridge:200–371. |
| Rust → trusted process | `native_pipe_response`, `native_pipe_data`, `native_pipe_closed` | Correlated connect/write/close result and unsolicited data/terminal events. Bridge:335–368. |

`nodeRepl.write` records `{kind:"write",text,item_id?}`; captured console records `{kind:"line",text}`. These arrays are accumulated and returned through result envelopes, not evidence of an MCP write-streaming extension. Named writes are grouped by item ID; ordinary console lines receive newline normalization (`kernel.js`:1542–1561). Image emission is a request/ack bridge and is background-tracked, so an unawaited image can delay execution completion.

Compiled Rust serde strings independently name the protocol: `exec_resultresponse_metaresponse_meta_traceexec_redacted_sourceemit_imageemit_audioelicitauthenticated_fetchconfig_actionlaunch_services_actionsuspend_timeoutresume_timeoutsubmitted_code_completenative_pipe_requesttrusted_service_requesttrusted_service_hooks` — byte [9897765, 9898023), binary LF 63288. Rust host-to-child strings include `emit_audio_resultElicitationResultelicitation_resultAuthenticatedFetchResultauthenticated_fetch_resultprivileged_resultadd_node_module_dir` — byte [9897241, 9897379), binary LF 63288 and `native_pipe_responseClosednative_pipe_closed` — byte [9896971, 9897015), binary LF 63288. Source code remains the clearest evidence for field shapes.

## Compiled MCP tool definitions (base values, reconstructed statically)

The following JSON reproduces the compiled base descriptions and input-schema **values**; it is not an extracted contiguous JSON string. Rust builds `serde_json::Value`/`BTreeMap` objects in native code. Object-key ordering is normalized below. Descriptions are copied directly from the binary byte spans listed afterward. No `tools/list` call was made, and the definitions are not assertions about a live process whose `NODE_REPL_TOOL_OVERRIDES` may replace descriptions/instructions/field descriptions.

### js

```json
{
  "name": "js",
  "description": "Execute JavaScript in a persistent `node_repl` with top-level await. Top-level bindings persist until `js_reset` and can be redeclared. Use `const` for stable values and `let` for changing values. Use dynamic imports such as `await import(\"playwright\")`; top-level static imports and `node:process` are unavailable. Use `nodeRepl.write(value)` for output and `await nodeRepl.emitImage(image)` for images. Execution context is available through `nodeRepl.cwd`, `nodeRepl.homeDir`, `nodeRepl.tmpDir`, and `nodeRepl.requestMeta`. The default timeout is 30000 ms (30 seconds); increase `timeout_ms` for longer operations. Use `js_add_node_module_dir` when an additional package directory is required.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "code": {
        "type": "string",
        "description": "JavaScript code to execute with top-level await."
      },
      "timeout_ms": {
        "type": "integer",
        "minimum": 1,
        "description": "Optional execution timeout in milliseconds. Defaults to 30000 (30 seconds) when omitted."
      },
      "title": {
        "type": "string",
        "minLength": 1,
        "maxLength": 80,
        "description": "Short user-facing description of what the code does."
      }
    },
    "required": [
      "code"
    ],
    "additionalProperties": false
  }
}
```

Only `code` is required. The code field has no schema `minLength` or `maxLength`; the host separately has the diagnostic `js expects non-empty JavaScript source`. `timeout_ms` has no schema maximum and **no `default` keyword**: the omission default of 30000 is advertised in the description. `title` is optional and is constrained to 1–80 characters. No `$schema`, `$defs`, pattern or enum is constructed.

### js_reset

```json
{
  "name": "js_reset",
  "description": "Reset the JavaScript kernel and clear all bindings.",
  "inputSchema": {
    "type": "object",
    "properties": {},
    "additionalProperties": false
  },
  "annotations": {
    "readOnlyHint": true,
    "destructiveHint": false,
    "openWorldHint": false
  }
}
```

The `required` key is absent, not an explicit empty array. The annotations shown are unconditionally included in this base tool.

### turn_ended

```json
{
  "name": "turn_ended",
  "description": "Notify trusted libraries that a Codex turn ended. Repeated notifications for the same session and turn are ignored.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "hook_event_name": {
        "type": "string",
        "minLength": 1
      },
      "session_id": {
        "type": "string",
        "minLength": 1
      },
      "turn_id": {
        "type": "string",
        "minLength": 1
      }
    },
    "required": [
      "hook_event_name",
      "session_id",
      "turn_id"
    ],
    "additionalProperties": false
  },
  "annotations": {
    "idempotentHint": true
  },
  "_meta": {
    "ui": {
      "visibility": []
    }
  }
}
```

All three arguments are required nonempty strings. `hook_event_name` is not restricted to an event-name enum. There are no property descriptions, defaults, maximum lengths or patterns. The hidden UI metadata is part of the compiled base tool; `turn_ended` is not the cua-local `end_task` tool.

### Conditional variants and native anchors

- **Sandbox-dependent js annotations:** if the builder's `Option<SandboxConfig>` is present, `js` includes exactly `{"readOnlyHint":true,"destructiveHint":false,"openWorldHint":false}`; otherwise its `annotations` field is omitted. `idempotentHint` is absent for `js`/`js_reset`; only `turn_ended` sets it true.
- **Audio variant:** `NODE_REPL_ENABLE_AUDIO` exactly `"1"` appends the following exact 78-byte suffix to both `js.description` and `js.inputSchema.properties.code.description` (including the leading space):

```text
 Use `await nodeRepl.emitAudio(audioDataUrl)` to return an `audio/*` data URL.
```

- A later stage applies `NODE_REPL_TOOL_OVERRIDES`. Thus base text and externally configured effective tool text must not be conflated.
- All three base tools omit tool-level `title`, `icons`, `outputSchema` and `execution`. `js`/`js_reset` omit `_meta`. None of these base input schemas constructs a `default` keyword.
- Native builder: `NodeReplServer::with_server_options_app_server_client_and_authenticated_fetcher`, unslid VA `0x10022de1c`.
- `js` schema construction: VA `0x10022e9ec`–`0x10022f378`. Number payloads at file offsets `0xa4fac0` (1) and `0xa4fd80` (80) establish title limits; timeout minimum reuses 1. Required code array insertion at `0x10022f2c4`, closed properties at `0x10022f33c`.
- `js_reset` schema construction: VA `0x10022f998`–`0x10022fb28`. `turn_ended` schema construction: VA `0x10022fbd4`–`0x10023035c`; hidden UI metadata at `0x100230404`–`0x10023051c`.
- `Tool` serialization at `0x1001b1068`, `ToolAnnotations` at `0x1001b1954` and optional-boolean serialization at `0x1001b3ed8` establish annotation field names, omitted-field sentinels and boolean interpretation.
- Description byte spans: `js` `[0x97488f,0x974b47)` (696 bytes); code `[0x974b47,0x974b77)` (48); title `[0x974b80,0x974bb4)` (52); timeout `[0x974bb4,0x974c0c)` (88); reset `[0x97450e,0x974541)` (51); turn-ended `[0x9745a0,0x974613)` (115); audio suffix `[0x9740d0,0x97411e)` (78). Audio branch VA `0x10022e8f8`–`0x10022e9ec`.

## NODE_REPL_* environment inventory

Literal offsets identify names, not environment values. **JS** meanings are directly implemented in the extracted sources. **Rust/inferred** meanings are supported by names, compiled diagnostics/symbols and the prior static launch analysis; exact parsers/default values are not claimed unless stated. Concatenated uppercase Rust strings were split at independently recognizable names, not treated as one environment variable.

| Name | Meaning and evidence | Literal byte offset |
|---|---|---:|
| `NODE_REPL_NODE_PATH` | Rust: selected Node executable; diagnostic says install Node or set this when runtime is absent. | 9376767 |
| `NODE_REPL_TRUSTED_SERVICES` | JS: JSON object mapping service names to module/package specifiers; worker lazily imports `handleRpc`. | 9376983 |
| `NODE_REPL_NODE_MODULE_DIRS` | JS: platform-path-delimited package resolution directories; kernel normalizes node_modules to its parent; trusted worker constrains package resolution to explicit roots. | 9377009 |
| `NODE_REPL_TRUSTED_CODE_PATHS` | JS: platform-path-delimited absolute code roots, realpathed before enforcing file imports via `registerHooks`. | 9377035 |
| `NODE_REPL_ENABLE_AUDIO` | JS: exactly `"1"` installs `emitAudio`; Rust also adds audio-related tool instructions/capability behavior. | 9378319 |
| `NODE_REPL_JS_BANNER` | JS: source prepended until successfully marked executed, then skipped for later cells; removed from kernel process.env after capture. | 9378387 |
| `NODE_REPL_UNTRUSTED_ENV_ALLOWLIST` | JS: comma-delimited environment names visible to cells through frozen `nodeRepl.env`; not a full-env inheritance switch. | 9378406 |
| `NODE_REPL_TRUSTED_RPC_ENABLED` | JS: exactly `"1"` installs `nodeRepl.rpc` and requests after-code trusted hooks. | 9378439 |
| `NODE_REPL_TRACE_META` | JS: exactly `"1"` enables response-meta tracing/telemetry in trusted worker; Rust attaches trace under `codex/nodeReplTrace` and can persist it. | 9610501 |
| `NODE_REPL_DISABLE_ANALYTICS` | Rust/inferred: disables optional analytics; also a retained native-service suppression flag. Flag name is embedded; full Rust boolean parser not recovered. | 9904311 |
| `NODE_REPL_SENTRY_USER_ID` | Rust/inferred: diagnostic/Sentry user identity override; no value read. | 9904506 |
| `NODE_REPL_ACTIVE_EXEC_REGISTRY_DIR` | Rust: directory override for active-execution records; nearby create/write/publish registry diagnostics. | 9911673 |
| `NODE_REPL_TOOL_OVERRIDES` | Rust: JSON overrides for server instructions/tool descriptions/field descriptions, as configured by external cua-repl launcher. Not a JS-cell evaluator setting. | 9913371 |
| `NODE_REPL_DISABLE_STRICT_AUTO_REVIEW` | Rust/inferred: suppress strict JS auto-review approval policy. | 9914297 |
| `NODE_REPL_FORCE_STRICT_AUTO_REVIEW` | Rust/inferred: force strict JS auto-review approval policy. | 9914333 |
| `NODE_REPL_ENFORCE_MODEL_CHECK` | Rust/inferred: enable model-access check (`model_access_is_restricted` symbol; turn metadata supplies model). | 9914367 |
| `NODE_REPL_RUNTIME_MODE` | Rust: runtime-mode selection, including special `gaas-browser` behavior; complete accepted-value set not recovered. | 9915432 |
| `NODE_REPL_ENABLE_NETWORK_ISOLATION` | Rust/inferred: control network-isolation setup; sandbox policy code remains Rust. Exact parser/default not recovered. | 9915456 |
| `NODE_REPL_WORKER_WRAPPER` | Rust: additional worker-launch command array; must be UTF-8 and a nonempty command array according to embedded diagnostics. | 9915846 |
| `NODE_REPL_DENIED_PATHS` | Rust: filesystem denial configuration; explicit diagnostic requires available Codex sandbox and forbids disabling a denied-path sandbox. Encoding not established here. | 9915973 |
| `NODE_REPL_SANDBOX_ALLOWED_UNIX_SOCKETS` | Rust/inferred: permitted child-sandbox Unix-socket paths used for repeated `--allow-unix-socket` launch flags; does not implement privileged nativePipe. | 9915995 |
| `NODE_REPL_NATIVE_PIPE_CONNECT_TIMEOUT_MS` | Rust: initial nativePipe socket-connect timeout in milliseconds; do not confuse with `js.timeout_ms`. Exact built-in default not established here. | 9918344 |
| `NODE_REPL_REQUEST_META` | Rust: default request metadata from environment (`default_request_meta_from_env` symbol); per-execution JS state receives `request_meta` in messages, not by rereading this variable. | 9924230 |

Related non-prefixed inputs are `CODEX_CLI_PATH` (sandbox and lazy app-server launcher), `CODEX_HOME`/`HOME`/`USERPROFILE` (config/state/home resolution), `TMPDIR`/`TMP`/`TEMP` (Node temporary directory), and `NODE_OPTIONS`/`NODE_PATH` plus dynamic-loader environment names (host sanitization/resolution). `BROWSER_CONFIG_AUTH_READ`/`BROWSER_CONFIG_AUTH_TOKEN` and `BROWSER_USE_SECURITY_MODE` belong to special GAAS/browser configuration. `NODE_REPL_HOST_SERVICES_PIPE_PATH` does **not** occur in this binary: it is an external native-sky/desktop service setting, not another recovered host source.

## Default timeout and launch templates

**Default JS execution timeout: 30,000 ms (30 seconds)**; embedded tool description and field description both state it. `Optional execution timeout in milliseconds. Defaults to 30000 (30 seconds) when omitted.` — byte [9915316, 9915404), binary LF 63301. Timer/reset/kill ownership is in Rust, not the VM module evaluator. `suspend_timeout`/`resume_timeout` let trusted code exclude approval/startup waits. A timeout/reset discards the kernel heap; exact process lifecycle/timeout failure behavior cannot be proven by syntax checks.

Static command template (reconstructed argv, not one contiguous embedded shell script):

```text
$CODEX_CLI_PATH sandbox
  -c 'shell_environment_policy.inherit="all"'
  -c 'default_permissions="node_repl"'
  -c 'permissions.node_repl={filesystem={...},network={enabled=false}}'
  [-c 'features.use_legacy_landlock=true']
  [--allow-unix-socket <path>]...
  -- $NODE_REPL_NODE_PATH --experimental-vm-modules <script> <args>...
```

Scripts/args: `kernel.js --session-id <id> --working-dir <cwd>` and `trusted-worker.js <cwd>`. Policy is dynamic, not the literal `...`; disabled mode is an unconfined launch path, not proof the sandbox command is always used. Both confined Node children sit below the Rust supervisor. The privileged nativePipe connects in Rust outside those child sandboxes.

Evidence: `shell_environment_policy.inherit="all"` — byte [9919090, 9919128), binary LF 63303; `features.use_legacy_landlock=true` — byte [9919137, 9919170), binary LF 63303; `--allow-unix-socket` — byte [9915622, 9915641), binary LF 63301; `default_permissions=` — byte [10841125, 10841145), binary LF 67245; `permissions.` — byte [10841148, 10841160), binary LF 67245. Generated network/filesystem fields require code evidence: prior disassembly `/Users/new/.claude/jobs/1ea561bc/tmp/sandbox-disassembly.txt` (`SandboxConfig::build_command_spec`, VA `0x1002331fc`) and `sandbox-config-disassembly.txt` (`SandboxState::config_overrides`, VA `0x100259578`, network false at `0x10025991c`–`0x10025998c`), summarized by `codex-dependency-research.md` in the same directory. The raw binary contains no contiguous `permissions.node_repl=...` or `enabled=false` source string.

Lazy app-server template: `$CODEX_CLI_PATH app-server --listen stdio://` (fallback `codex`), JSONL pipes, not desktop socket RPC. Evidence: `app-server` — byte [9630117, 9630127), binary LF 59277; `--listen` — byte [10822880, 10822888), binary LF 67223; `stdio://` — byte [10822888, 10822896), binary LF 67223. Prior static spawn disassembly lives at `/Users/new/.claude/jobs/1ea561bc/tmp/app-server-spawn-disassembly.txt`, VA `0x1002348e4`.

## Gaps — code that remains only in Rust/native dependencies

The recovered JavaScript is complete as embedded **but is not a runnable replacement for the host**. These behaviors are delegated, not missing JS tails. Each evidence quote below is read directly from binary bytes; positions are reproducible without launching the binary.

1. **MCP server/transport/capability negotiation, tools/list/tools/call and approval review.** JS only speaks inner JSONL. Rust owns JSON-RPC framing, request correlation, tool metadata/overrides, initialize/elicitation negotiation, control traffic, turn deduplication, result/content assembly and approval policy. Evidence: `initialize requestsending pre-init ping responsesending initialize responsesending error response` — byte [9376213, 9376310), binary LF 55276; `JavaScript execution requires an approval elicitation` — byte [9377183, 9377236), binary LF 55276; `JavaScript execution was denied` — byte [9378126, 9378157), binary LF 55276; `NodeReplServer::list_tools` symbol at VA `0x100237e8c`.
2. **Process supervisor, asset materialization, child environment, sandbox spawn and reset/timeout.** No JS implementation of manager, queues across processes, OS sandbox or killing/recreating a child. Evidence: `node_repl kernel missing stdout` — byte [9376449, 9376480), binary LF 55276; `trusted Node process has no stdin` — byte [9376381, 9376414), binary LF 55276; `sandbox_changedjs sandbox changed; kernel reset, rerun your request` — byte [9378486, 9378553), binary LF 55276; `timed out waiting for node_repl kernel to exit after kill` — byte [9378676, 9378733), binary LF 55276. Sandbox strings/template above. `package.json` asset content is the embedded non-JS `{"type":"commonjs"}` directly before the first kernel source.
3. **Trusted routing and execution budget ownership.** Kernel's `trusted_service_request`/`trusted_service_hooks` need rewriting to trusted `service`/`run_hooks`; responses need forwarding; timeout suspension needs a host timer. Evidence: `trusted_service_responsetrusted Node process exited unexpectedlyrun_hooks` — byte [9629905, 9629978), binary LF 59277; `failed to reply to trusted hook requestfailed to forward trusted RPC response` — byte [9630203, 9630280), binary LF 59277; `No trusted RPC services are configured` — byte [9630553, 9630591), binary LF 59277.
4. **Real nativePipe socket opening and I/O.** JS exposes a proxy, not a socket constructor. Rust validates/open/connects sockets, enforces connect timeout, writes bytes and publishes data/close events. Evidence: `native pipe initial connect timed out` — byte [9376310, 9376347), binary LF 55276; `native pipe path must be absolutenative pipe path is not a socket` — byte [9919170, 9919235), binary LF 63303; `native_pipe_responseClosednative_pipe_closed` — byte [9896971, 9897015), binary LF 63288; `native pipe write failed: ` — byte [10830681, 10830707), binary LF 67234. Base64 framing between JS/Rust is distinct from whatever length framing native services use.
5. **LaunchServices native application startup.** Only normalized targets and action messages are JS. Evidence: `LaunchServices application path must be absolute` — byte [9920338, 9920386), binary LF 63305; `LaunchServices open application expected exactly one of application_path or bundle_identifier` — byte [9920496, 9920589), binary LF 63305; `failed to dispatch LaunchServices open: ` — byte [10831029, 10831069), binary LF 67234.
6. **MCP image/audio decode/content packaging.** JS normalizes/sniffs bytes and emits data URLs; Rust validates/decode data and turns them into MCP image/audio objects, returning acknowledgements. Evidence: `nodeRepl.emitImage only accepts data URLs` — byte [9918527, 9918568), binary LF 63303; `nodeRepl.emitImage received an invalid base64 data URL` — byte [9918568, 9918622), binary LF 63303; `codex/imageDetailoriginal` — byte [9914272, 9914297), binary LF 63301.
7. **Elicitation and computer-use approval state.** JS validates request shape but Rust validates requested schema, calls MCP peer/interceptor, stores approval state and returns action/content/meta. Evidence: `nodeRepl.createElicitation requested_schema is invalid: ` — byte [10838226, 10838282), binary LF 67239; `MCP elicitation request returned an unexpected response` — byte [9913118, 9913173), binary LF 63301; `unable to locate HOME for macOS computer-use approvals` — byte [9924252, 9924306), binary LF 63307.
8. **Authenticated HTTP and lazy app-server config/auth client.** `nodeRepl.fetch` sends a request to Rust; Rust owns HTTP/auth status/token refresh and app-server subprocess lifecycle. App-server methods include `initialize`, `getAuthStatus`, `config/read`, `configRequirements/read`, `config/value/write`, `config/batchWrite`. Evidence: `Codex auth token is unavailable` — byte [9925533, 9925564), binary LF 63311; `getAuthStatusauthTokenauthMethod` — byte [9925843, 9925875), binary LF 63311; `config/readconfigRequirements/readmergeStrategyexpectedVersionconfig/value/write` — byte [9629807, 9629887), binary LF 59277; `config/batchWrite` — byte [9629888, 9629905), binary LF 59277; `Codex app-server is unavailable in gaas-browser runtime mode` — byte [9630111, 9630171), binary LF 59277. Presence is capability, not evidence current cua/native usage exercises every path.
9. **readToml/writeToml host-local CODEX_HOME storage.** JS emits config actions; Rust resolves storage, performs safe filesystem/TOML I/O and protects config.toml. This is separate from app-server config RPC. Evidence: `failed to resolve CODEX_HOME for Codex TOML storage` — byte [9925778, 9925829), binary LF 63311; `Codex TOML path must not be a symlink` — byte [9926112, 9926149), binary LF 63311; `Codex TOML path must be a relative .toml path` — byte [9926201, 9926246), binary LF 63311; `writing ~/.codex/config.toml via config.writeToml is not allowed; use nodeRepl.config.writeValue or nodeRepl.config.batchWrite` — byte [9925952, 9926078), binary LF 63311.
10. **Response metadata/trace persistence, OTEL/Sentry/analytics, active-exec registry.** `tracing.js` builds spans and privileged JS submits meta/log messages, but Rust attaches response metadata, exports audit records, writes trace/active-exec files and runs diagnostics. Evidence: `codex/nodeReplTrace` — byte [9630300, 9630319), binary LF 59277; `failed to write response meta trace output` — byte [9920024, 9920066), binary LF 63305; `unable to locate CODEX_HOME or HOME for response meta trace output` — byte [9920189, 9920255), binary LF 63305; `failed to create node_repl active exec registry` — byte [9911707, 9911754), binary LF 63299; `unsupported OTLP protocol` — byte [9924362, 9924387), binary LF 63307.

## Verification limits and next useful input

All recovered bytes match both full embedded copies and parse. No execution, MCP round-trip, sandbox containment, signature/ancestor acceptance or performance equivalence has been tested in this task. To design the owned host, use the exact JS as a reference for cell/result semantics, but implement only required retained Rust services under cua's existing lifecycle/MCP ownership. The unresolved native-helper ancestry acceptance and missing native performance baseline in `116-research-B.txt` remain empirical prerequisites; no static source extraction resolves them.
