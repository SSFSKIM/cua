# #117 research A: the `sky` contract cua depends on

Static reading only, 2026-10-16. No helper, runtime or `cua serve` was launched or signalled; no auth file, token or secret store was read; no accessibility text of the owner's windows is reproduced. `strings` and `codesign -dv` were run on the pinned binaries (they read the files; nothing executes them).

## Citation aliases

| alias | path |
|---|---|
| `C` | `/Users/new/Developer/GitHub/cua` (main checkout, `76c3b84`) |
| `P` | `$HOME/Library/Application Support/cua/runtimes/26.928.40906-darwin-arm64/cua_node/lib/node_modules/@oai/sky` (the pinned `@oai/sky` 0.7.5; its `dist/**/*.js` are one-line minified files) |
| `S` | `~/codex-app-src/readable/chatgpt-26.928.40906/cua_node/@oai/sky/dist/project/cua/sky_js/src` (the same 0.7.5 release, prettified; all JS line numbers below are here) |
| `H` | line numbers in `strings -a -n 4 "P/Codex Computer Use.app/Contents/MacOS/SkyComputerUseService"` (53,615 lines) |
| `HC` | the same for `.../SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient` |
| `NRs` | `strings -a -n 6 <runtime>/cua_node/bin/node_repl` |

The pin uses `@oai/sky`'s own service, not the copy inside `@oai/cua`: `C/runtime/releases/26.928.40906-darwin-arm64.json:27-31` (`skyServiceApp`, `skyVendorService = .../@oai/sky/dist/project/cua/sky_js/src/service.js`, `ipcClient = .../targets/mac/client.js`), with `runtime.ipc = "CodexComputerUseIPC-5"` (`:19`) and signing team `2DC432GLL2` (`:34`). The readable `@oai/cua` copy of `sky_js` differs from `@oai/sky`'s only in `targets/mac/computer-use-telemetry.js` and lacks `service.js` (diff of the two trees).

**Inference** is marked as such. Where a fact comes only from binary strings, the strings prove the vocabulary exists, not how it is assembled.

---

## 1. The service contract

### 1.1 The layering

```
model cell ── cua facade (C/src/cua-api/*.mjs, port of @oai/cua tinysky_alt) ──► nodeRepl.rpc("sky", msg)
   ──► host (vendor Rust node_repl, or cua's own supervisor) ──► trusted worker
   ──► C/src/services/sky.mjs (secret substitution) ──► vendor S/service.js handleRpc ──► S/create_client.js
   ──► mac: S/targets/mac/* ──► JSON-RPC over a Unix socket ──► SkyComputerUseService
   ──► linux: S/targets/linux/* ──► JSON lines over stdio ──► sky_linux_<arch> server
```

- cua's trusted service delegates every request to the vendor module named by `CUA_SKY_VENDOR_SERVICE`; the vendor service "exports only handleRpc and registers no lifecycle hooks" (`C/src/services/sky.mjs:1-4,134-149`). The launcher sets `CUA_SKY_VENDOR_SERVICE` and, per platform, `SKY_CUA_SERVICE_PATH` (darwin) or `OAI_SKY_LINUX_BIN` (linux) (`C/src/runtime/launch.mjs:32-36,205`), and drops every ambient `SKY_*` variable (`:5-6`). So `SKY_ENABLE_AUDIO`, `SKY_CUA_SERVICE_NATIVE_PIPE_PATH` and `OAI_SKY_CONFIG_PATH` are never set (`:72-74`).
- The facade asks once, at import, `rpc("sky", {type: "setup"})`, then builds one function per advertised method that sends `{type: "execute", method, args}` (`C/src/cua-api/sky.mjs:15-63`, port of `S/sky.js:10-93`). A failed setup is kept and every unadvertised member then rejects with it (`C/src/cua-api/sky.mjs:27-34`).
- Only `error.message` crosses worker → kernel; the kernel makes a plain `Error` (`C/docs/doperpowers/specs/2026-10-14-own-repl-host-design.md:160`). So `SkyComputerUseError.code`/`errorName` never reach model code; the **message text is the model-visible error contract**. Through the vendor Rust host, result object keys arrive sorted (spec `:1077`).

### 1.2 `handleRpc` message types (`S/service.js`)

| `type` | input | result | errors |
|---|---|---|---|
| `setup` | – | `{target, methods}`: `target` from the client; `methods` = own enumerable keys whose value is a function (`:16-23`) | – |
| `execute` | `{method, args: [...]}` | the client method's result; post-processing: `get_screenshot` → each capture `{filepath, data_url}`; Linux `get_window_state` → `screenshots` mapped the same (bytes stripped); `stop_audio_recording` → `{filepath, data_url}` (`:24-47,78-83`) | `Sky runtime method is not available: <method>` when the key is not an own function (`:27-31`) |
| `drag_start` | `{handle_id, point}` | undefined; creates `client.drag_handle()` on first start, keeps it in a module `Map` | `Sky drag handles require the Linux runtime` (`:48-56`) |
| `drag_move` | `{handle_id, point}` | `move_to(point)` | `Sky drag handle has not been started` (`:57-63`) |
| `drag_end` | `{handle_id}` | `end()`, then deletes the handle | same (`:64-72`) |
| other | – | – | `UnreachableCaseError(msg)` (`:73-74`) |

The client is a module singleton built on first request from `load_options()`: `OAI_SKY_CONFIG_PATH` JSON if set, else `{target: "mac"|"linux"|"windows"}` by `process.platform` (`S/service.js:9-14`, `S/load_options.js:3-27`, `S/create_client.js:8-20`). The facade re-decodes `data_url` to `bytes` for `get_screenshot`, Linux `get_window_state` and `stop_audio_recording`, and gives a Linux `ax_tree` its `to_string` (`C/src/cua-api/sky.mjs:65-81`).

### 1.3 Which API generation the pinned path uses

| vendor doc | target | used by cua? |
|---|---|---|
| `P/docs/sky-window-api.md` ("Window API", `target: "mac"`, `:12-25`) | macOS | **yes**: `S/targets/mac/create_client.js:16-44` implements exactly its 11 methods |
| `P/docs/sky-full-desktop-api.md` (`target: "linux"`, `:20-42`) | Linux | **yes**: `S/targets/linux/create_client.js:25-58` |
| `P/docs/sky-window2-api.md` (`target: "windows"`, `:15-30`) | Windows | no: cua drops the Windows target (`C/src/cua-api/create-tinysky-alt.mjs:10-12,79-80`) |

### 1.4 macOS `setup` and `execute` methods

`setup` → `{target: "mac", methods: ["list_apps","get_app_state","click","drag","paste","perform_secondary_action","press_key","scroll","select_text","set_value","type_text"]}`, plus `start_audio_recording`, `stop_audio_recording` only when `SKY_ENABLE_AUDIO === "1"` (`S/targets/mac/create_client.js:19-44`). There is **no** `launch_app`, `list_windows`, `get_screenshot` or `drag_handle` on macOS.

Every app-scoped method runs inside `withComputerUsePolicy(toolName, input, fn)` (§2.6), so each one costs a policy IPC round trip plus the action's.

| method | input (snake_case, from the facade) | wire request (`requestType`, `request`) | result |
|---|---|---|---|
| `list_apps()` | – | `ComputerUseIPCListAppsRequest`, `{}` (`S/targets/mac/client.js:9,19-21`) | `[{id: bundleIdentifier ?? displayName ?? "unknown", displayName, isRunning, lastUsedDate?, useCount?}]` (`S/targets/mac/list_apps.js:8-25`); server rows are `SkyDiscoveredApp {appPath?, bundleIdentifier?, displayName?, isFrontmost?, isRunning?, lastUsedDate?, useCount?}` (`S/targets/mac/client.d.ts:4-12`). Not policy-wrapped; sets response meta `app: null`. |
| `get_app_state({app, disableDiff?})` | `disableDiff` only when the caller passed it | `ComputerUseIPCAppGetSkyshotRequest`, `{app, disableDiff}` (`client.js:8,34-48`) | `{app, screenshot: {url} \| null, text}` (`S/targets/mac/window_result.js:4-34`); see §3 |
| `click({app, element_index? \| x?,y?, mouse_button?, click_count?})` | | `ComputerUseIPCAppPerformActionRequest`, `{app, action: {click: {at, clickCount (default 1), mouseButton (0 left,1 right,2 middle)}}}` (`client.js:49-67,190-198,305-325`) | undefined |
| `drag({app, from_x, from_y, to_x, to_y})` | | `{action: {drag: {from: [x,y], to: [x,y]}}}` (`client.js:68-91`) | undefined |
| `paste({app, text, format})` | facade defaults `format: "text"` (`C/src/cua-api/bind-mac-app.mjs:34-37`) | `{action: {paste: {text, format}}}` (`client.js:92-103`) | undefined |
| `perform_secondary_action({app, element_index, action})` | | `{action: {performSecondaryAction: {action, elementID: "<n>"}}}` (`client.js:104-115`) | undefined |
| `press_key({app, key})` | | `{action: {pressKey: {_0: key}}}`; empty key → `TypeError("key is required")` (`client.js:116-129`) | undefined |
| `scroll({app, direction, element_index? \| x?,y?, pages?})` | facade refuses an object distance (`bind-mac-app.mjs:56-67`) | `{action: {scroll: {at, direction: up/down/left/right, pages (default 1)}}}`; `pages` must be finite > 0 (`client.js:130-150,326-343`) | undefined |
| `select_text({app, element_index, text, prefix?, suffix?, selection_type?})` | | `{action: {selectText: {elementID, text, prefix, suffix, selection (default "text")}}}` (`client.js:163-178`; `select_text.js:10-17` maps `selection_type` → `selection`) | undefined |
| `set_value({app, element_index, value})` | | `{action: {setValue: {elementID, value}}}` (`client.js:151-162`) | undefined |
| `type_text({app, text})` | | `{action: {type: {_0: text}}}` (`client.js:179-189`) | undefined |
| `start_audio_recording({max_duration_ms?})` | dormant | `ComputerUseIPCStartAudioRecordingRequest`, `{maxDurationMilliseconds}` (100–300000, default 60000), after its own elicitation (`S/targets/mac/audio_recording.js:13-32`, `computer-use-policy.js:140-174`) | undefined |
| `stop_audio_recording()` | dormant | `ComputerUseIPCStopAudioRecordingRequest`; expects a `file:` URL, returns `{filepath, bytes, data_url: audio/wav}` (`audio_recording.js:33-71`) | |

`at` is `{elementID: {_0: "<integer as string>"}}` or `{coordinate: {_0: [x, y]}}` (`client.js:272-292`). Requests are stripped of `undefined` fields recursively (`client.js:344-356`). The JS-side validation errors are `TypeError`s: `app is required`, `elementIndex must be an integer`, `<from|to|coordinate> must include finite x and y coordinates`, `mouseButton must be left, right, middle, l, r, m, 0, 1, or 2`, `direction must be up, down, left, or right`, `pages must be a finite number > 0` (`client.js:117-118,132-134,264-343`). Client-defined but unused by any method: `startApp` (`ComputerUseIPCAppStartRequest`, `client.js:31-33`); `getAppPolicy` is used internally (§2.6).

### 1.5 macOS error codes (`S/targets/mac/errors.js:2-24`)

`ServerErrorCode`: senderProcessNotAuthenticated −10000, couldNotGetRequestData −10001, couldNotGetRequestTypeName −10002, couldNotResolveRequestType −10003, unhandledEvent −10004, unknownError −10005, appNotAllowed −10006, runningApplicationNotFound −10007, accessibilityError −10008, permissionsNotGranted −10009, invalidApp −10010, noActiveSession −10011, userStoppedSession −10012, incompatibleClientVersion −10013, permissionsPending −10014, blockedURL −10015, userIntervened −10016, couldNotGetSenderPID −10017, ambiguousApp −10018, couldNotGetBootstrapPort −10019, screenLocked −10020. Any other JSON-RPC error code → `errorName: "jsonRPCError"` (`:25-35`). The helper knows more names than the JS map (`turnEnded`, `serverError`, `couldNotFindServiceApp`, the `messages*` family: `H:49290-49345`), all of which surface as `jsonRPCError`.

- `SkyComputerUseError {name, code, errorName, message, request: null, requestType: "jsonRPC"}` for a server error (`errors.js:26-35`, built at `native-pipe.js:496-515`).
- `SkyComputerUseTransportError {name, message, cause}` for transport faults (`errors.js:36-42`).
- The server's message is the user-visible text, formatted by the helper as `Computer Use server error <code>: <reason>` (`H:33874`); observed: `Computer Use server error -10005: timeoutReached` and `... -10005: invalid configuration: invalid type: map, expected a boolean in features` (`C/docs/evidence/2026-10-14-native-baseline/README.md:51-52`), `noWindowsAvailable` (an app with no window; `C/scripts/native-baseline/cells.mjs:49`, `H:45651`).
- cua's trusted wrapper classifies vendor failures by `errorName` (all 22 names) or `transport`/`not_approved`/`app_blocked` for its value-free secret diagnostics (`C/src/services/sky.mjs:57-65,93-102`).

### 1.6 Linux `setup` and `execute` methods

`setup` → `{target: "linux", methods: [perform_secondary_action, click, clipboard_read, clipboard_release, clipboard_write, drag, drag_handle, activate_window, get_screenshot, list_apps, list_windows, move, move_relative, press_key, key_down, key_up, scroll, type_text, launch_app, get_window_state]}` (+ `start/stop_audio_recording` with `SKY_ENABLE_AUDIO=1`) (`S/targets/linux/create_client.js:31-57`). Shapes are `P/docs/sky-full-desktop-api.md:44-190`; transport and tree in §4. Errors are plain `Error`s with the helper's string (`sky_linux_transport.js:164-171`), plus `Unknown element ID <n> for this window; refresh get_window_state()` (`element_ids.js:34`) and helper sentences such as `launchable application "<x>" was not found` (`C/test/repl-parity/scenarios/native.mjs:21`).

### 1.7 The reached surface vs dormant

What cua's facade (`C/src/cua-api/`) and first-call document (`C/docs/cua-api/core.md`) reach:

| model API | macOS sky call | Linux sky call |
|---|---|---|
| `cua.listApps()`, `cua.getState()` | `list_apps` (`get-state.mjs:19-32`) | `list_apps`, mapped to `{id, displayName: name, isRunning: windows.length > 0, windows}` (`get-state.mjs:24-28`) |
| `cua.listWindows()` (Linux only) | – | `list_windows` (`create-tinysky-alt.mjs:73-77`) |
| `cua.getApp(x)` | `get_app_state({app, disableDiff: true})`, binds to the returned `app`, emits its text (`create-tinysky-alt.mjs:53-60`) | `list_windows`, then `get_window_state({window, include_screenshot: false})` (`:63-71`) |
| `app.getAXState(opts)` | `get_app_state({app, disableDiff?})`; `disableDiff` only if `disableDiffing` given (`bind-mac-app.mjs:13-17,81-85`) | `get_window_state({window, include_screenshot: false})`, always full (`bind-linux-app.mjs:14-24`) |
| `app.getScreenshot()` | `get_app_state({app})`, **no** `disableDiff` (`bind-mac-app.mjs:18-24`) | `get_window_state({window, include_screenshot: true})` (`bind-linux-app.mjs:26-33`) |
| `app.getAXStateAndScreenshot()` | `get_app_state` once (`:25-33`) | `get_window_state` once (`:34-43`) |
| `click`, `drag`, `pressKey`, `typeText`, `performSecondaryAction` | same-named methods | same; Linux `drag` is a two-point `path`, ids are `String(index)` (`bind-linux-app.mjs:44-84`) |
| `scroll` | `scroll` with `pages` | `scroll` with `{pixels}` |
| `paste` | `paste` | `type_text` (text format only) (`bind-linux-app.mjs:75-78`) |
| `selectText`, `setValue` | `select_text`, `set_value` | refused locally, no call (`bind-linux-app.mjs:69-74`) |
| `cua.computer.target` | `"mac"` | `"linux"` |
| `cua.computer.launch_app?` (`core.md:129,160`) | absent | `launch_app` |

`cua.computer` **is** the raw proxy (`create-tinysky-alt.mjs:41-42,100-103`), so model code can also call any advertised raw method. On Linux that makes `activate_window`, `get_screenshot`, `move`, `move_relative`, `key_down`, `key_up`, `clipboard_read/write/release` and `drag_handle` reachable but undocumented. On macOS every advertised method is already reached.

Dormant for cua:

- Audio recording, both targets: it needs `SKY_ENABLE_AUDIO=1`, which cua never sets. The own-host spec excludes it (`own-repl-host-design.md:47`).
- `startApp`: defined, never called.
- Telemetry: off, see §2.8.
- The Windows target.
- Every helper IPC request type the JS client never sends: `ComputerUseIPCAppModify/AppNextCaptureUpdate/AppStartCapture/AppStop/AppUsage/Calendar*/CodexStatusItemMenuState/CodexTurnEnded/EventStream*/FrontmostWindow/Messages*/Permission/Skysight*` (the `ComputerUseIPC*Request` names in `H`; the JS uses only the 7 at `client.js:5-11`).
- The legacy stdio MCP server in `SkyComputerUseClient.app` (§2.4).

---

## 2. macOS transport: the JS service to the native helper

### 2.1 Locating and launching the helper (`S/targets/mac/native-pipe.js`)

1. **Socket path:** `nodeRepl.env.SKY_CUA_SERVICE_NATIVE_PIPE_PATH`, else `~/Library/Group Containers/2DC432GLL2.com.openai.sky.CUAService/IPC/computeruse.sock` (`:37-46`; doctor's copy `C/src/runtime/doctor.mjs:84`). The directory is the helper's App Group container. Its entitlements include `com.apple.security.application-groups = [2DC432GLL2.com.openai.sky.CUAService]` (`codesign -d --entitlements`).
2. **Connect:** through privileged `nodeRepl.nativePipe.createConnection(path)`; without it, `Sky Computer Use native pipe is unavailable` (`:33-36`). The first attempt is a 250 ms connect-and-ping loop (`:47-48,206-245`). Each attempt pings with `min(1000, remaining)` ms. A version mismatch, or `incompatibleClientVersion`, aborts at once instead of retrying (`:233-235`). Retries sleep 100 ms.
3. **Start on failure:**
   - If `NODE_REPL_HOST_SERVICES_PIPE_PATH` is set (the desktop app's host-services socket), it sends `ensureService {service: "computer-use"}` (JSON-RPC id 0, same framing, 5 s; `:54-162`). cua never sets it (`launch.mjs:72-74`).
   - Otherwise it calls `nodeRepl.launchServices.openApplication(...)` with `{applicationPath: SKY_CUA_SERVICE_PATH}`, else `{applicationPath: $CODEX_HOME/computer-use/Codex Computer Use.app}` if it exists, else `{bundleIdentifier: "com.openai.sky.CUAService"}` (`:163-188`). cua sets `SKY_CUA_SERVICE_PATH` to the pinned relocated app (`launch.mjs:32-33,205`).
   - Then it reconnects for up to 5000 ms (`:196-202`).
   - Failures read `Sky Computer Use service startup request failed` or `Sky Computer Use native pipe startup failed`, with a cause.
4. cua's own host has a `launchServices.openApplication` too, as `/usr/bin/open -a <path>` or `-b <bundle>` (`C/src/repl-host/launch-services.mjs:1-44`), and a supervisor-side `nativePipe` relay (`C/src/repl-host/native-pipe.mjs:1-30`). Neither is used for macOS computer sessions today (§2.5).

### 2.2 Framing and protocol

- **Framing:** a 4-byte little-endian length prefix, then UTF-8 JSON. The maximum frame is 8,388,608 bytes (8 MiB) each way; a larger one is a transport error (`native-pipe.js:28,322-351`).
- **Protocol: JSON-RPC 2.0, not protobuf.** The `SwiftProtobuf` bundle in the helper serves its analytics events (`H:31547…`), not the IPC. Two methods:
  - `ping {clientApiVersion}` → `{serverApiVersion}`, which must equal the client's (`:304-320`).
  - `request {clientApiVersion, codexTurnMetadata, deadlineUnixMilliseconds, request, requestType}` → `result` (`:275-303`).
- **Validation:** responses must be `{id: number, jsonrpc: "2.0"}` with exactly one of `result` or `error {code: number, message: string}`; anything else is `Sky Computer Use returned an invalid JSON-RPC response` (`:359-400`).
- **API version:** `CodexComputerUseIPC-5` (`client.js:15`). cua's doctor and installer check that the pinned client source speaks exactly the pin's version (`C/src/runtime/checks.mjs:33-47`).
- **Timeouts:**
  - Per request: `timeoutSeconds`, default **120 s** (`client.js:17`), sent as `deadlineUnixMilliseconds = now + timeout`. Expiry raises `Sky Computer Use request timed out` (`native-pipe.js:458-466`).
  - Close and error: on close or error every pending request rejects; a closed transport is dropped and the next call reconnects (`client.js:199-246`; `native-pipe.js:256-271,516-525`).
- **Serialization:** requests on one transport are chained, **one in flight at a time** (`native-pipe.js:278-301`). There is one transport per API version per service process (`client.js:239-246`).
- **Turn metadata:** `codexTurnMetadata` is `nodeRepl.requestMeta["x-codex-turn-metadata"]`, parsed if bytes (`client.js:249-260`, `native-pipe.js:352-358`). cua sets `{session_id, thread_id: sessionId, turn_id: taskId, call_id, model}` (`C/src/mcp/server.mjs:114`).

### 2.3 Peer authentication (what #116 found)

- The helper's IPC server records, per connection, `senderPID`, `parentIdentity`, `responsibleIdentity`, `ancestorIdentities` and `clientType`. `clientType` is `legacyMCP` or `nodeRepl`. Each identity's `codeSignature` is `{bundleIdentifier, executableName, teamIdentifier, identifier}`. The server also records `allowedRelayRequirement`, `trustedProcessRequirement` and `parentProcessIsCodex` (`H:43150-43200,49299-49300,49334`). It logs `computer_use_ipc_authorization_failure_reason`, `computer_use_ipc_has_trusted_ancestor` and `computer_use_ipc_ancestor_depth` (`H:28826-28833`). The error for a rejected peer is `senderProcessNotAuthenticated` (−10000).
- #116's probes (`C/docs/doperpowers/research/2026-10-14-own-repl-host/07-ordinary-node.txt`, `08-vendor-node.txt`) used an ordinary Node and the vendor's own Node, both started directly from an ssh shell. Each connected, sent `ping`, and saw `socket-end`, then `socket closed before response`. Recorded as `own-repl-host-design.md:38,87,1051-1053,1095-1096`.
- Signatures (`codesign -dv`): `node_repl` (Identifier `node_repl`, team 2DC432GLL2), vendor `node` (Identifier `node`, the same team), helper `com.openai.sky.CUAService`, client app `com.openai.sky.CUAService.cli`.
- **Inference:** the vendor Node carries the same team signature and was still refused. So the helper authorizes by **process ancestry**, accepting a Node whose parent or trusted ancestor is the signed `node_repl`. The silent close without a JSON-RPC error matches a pre-request authorization check.
- **Consequence:** this is why `replHostFor` pins macOS computer sessions to the vendor host (`C/src/runtime/launch.mjs:279-307`, reason `macos_native_peer_requires_vendor`). The #117 comment on the issue moves the macOS host switch into #117.

### 2.4 Roles of the bundled apps

- **`SkyComputerUseService`** (bundle `com.openai.sky.CUAService`, `LSUIElement`, Sparkle auto-update feed `oaisidekickupdates…/mac/cua/alpha/appcast.xml`; `P/Codex Computer Use.app/Contents/Info.plist`) is the engine. It holds the TCC identity: Accessibility and Screen Recording "belong to the Codex Computer Use helper" (`C/src/runtime/doctor.mjs:151`). It also hosts unrelated services: Messages, Skysight/Computer History, Record & Replay, Calendar, remote PiP and a Chrome extension installer (`H:27879-28120`, and the IPC request families listed in §1.7).
- **`SkyComputerUseClient.app`** (`com.openai.sky.CUAService.cli`) is the **legacy stdio MCP server** (`HC:14185-14190`: "Runs the Computer Use client as an MCP server", "Handles a Codex turn-ended notification"; tool descriptions at `HC:14157-14170`). It is client type `legacyMCP`.
  - It ships `SkyComputerUseClient_Parent.coderequirement` = `{team-identifier: 2DC432GLL2}`. **Inference:** this is a macOS launch constraint on its parent.
  - No JS in `@oai/sky`, `@oai/cua` or `@oai/cua-repl` references it. **It is not on cua's path.**
- **`CUALockScreenGuardian.app`** is spawned over XPC for guarded auto-unlock (`H:27957-27979`; §7).

### 2.5 Sessions

- The per-app controller keeps a `chatID`, `lastAXTree`, `isAXTreeDiffingEnabled`, `needsUISettleBeforeSkyshot`, `virtualCursor`, `focusEnforcer` and the skyshot image files (`H:28440-28462`). A session tracker and lock-screen code key on the Codex thread: "this Computer Use request cannot be associated with a ChatGPT thread" (`H:28824`).
- The legacy tool text says `get_app_state` "Start[s] an app use session if needed … This must be called once per assistant turn before interacting with the app" (`HC:14158`; also `H:33933`). Relevant error codes are `noActiveSession` (−10011) and `userStoppedSession` (−10012).
- **Inference:** diff baseline and element indexes are per (thread, app). cua's thread is its MCP session id, and a new `turn_id` per task may require a fresh `get_app_state` before input.
- The helper is **shared machine-wide**, across cua connections, other clients and Codex desktop. It "keeps the configuration of whoever launched it" (`C/docs/evidence/2026-10-14-native-baseline/README.md:52`).

### 2.6 Per-app approvals: who asks and how it reaches MCP elicitation

`withComputerUsePolicy` (`S/targets/mac/computer-use-policy.js:12-139`) runs on every app-scoped call:

1. **Reset response meta.** It clears response meta (`:14`).
2. **Freeze the input.** `app` must be a non-empty plain data property; the input is frozen (`:244-270`).
3. **Ask the helper for policy.** It sends `ComputerUseIPCAppPolicyRequest {app}`, which returns `{allowPersistentApproval, decision: allowed|denied|forbidden, target: {appPath, bundleIdentifier, displayName, risk: high|low, warningSubtitle?}}` (`client.d.ts:86-97`).
4. **Set response meta** `codex/toolSurface: {kind: "computerUse", app: {appId: <bundle>, kind: "appId"}}`, plus `codex/computerUseChrome: true` for `com.google.Chrome` (`:197-224`).
5. **Refuse on a denial:**
   - `denied` throws `Computer Use is blocked from using the app '<bundle>' by your organization's policy.`
   - `forbidden` throws `Computer Use is not allowed to use the app '<bundle>' for safety reasons.` (`:21-33`)
6. **Ask for approval.** It calls `nodeRepl.createElicitation({message: 'Allow Computer Use to use "<displayName>"?', meta})` on **every** call. `meta` is:
   - `codex_approval_kind: "mcp_tool_call"`, `connector_id: "computer-use"`, `connector_name: "Computer Use"`
   - `persist: ["session","always"]` or `["session"]`, and `riskLevel`
   - `subtitle?`, `tool_call_id?` (from turn metadata `call_id`/`item_id`), `tool_name`
   - `tool_params: {app: bundle}` and `tool_params_display: [{name: "app", display_name: "App", value: displayName}]`

   (`:34-93,225-243`)
7. **Check the answer.** Anything but `action: "accept"` throws `Computer Use was not approved to use <displayName>` (`:131-133`). An answer whose `content.source === "computer-use-persisted-state"` is a remembered approval and skips approval telemetry (`:94-130`).
8. **Run the action.** It replaces `app` with the policy's `appPath` (`:136`), then runs the action under `nodeRepl.withSuspendedTimeout` and tool telemetry (`:137,175-196`).

**Where the persistence lives:**

- The vendor Rust `node_repl` (`src/computer_use.rs`) intercepts `connector_id: computer-use` elicitations and answers repeats from stored state. It uses the strings `computer-use-persisted-state`, `persist`, `computer-use/config.toml`, `allowed`, `denied` and "macOS computer-use approvals" (`NRs:14637-14639,17287-17331`).
- cua's proxy forwards `elicitation/create` to the MCP client unchanged. On accept it adds `_meta.persist = CUA_SHIM_PERSIST` (default `session`) when the client sent no `_meta` (`C/src/mcp/surface.mjs:374-380`, `server.mjs:345,432`).
- `node_repl` then writes `$CODEX_HOME/computer-use/sessions/<sessionId>.toml`, which cua deletes at connection close (`C/src/mcp/connection.mjs:69-82`; observed in `C/docs/evidence/m6-acceptance.md:98`).
- The resulting MCP request is `{message, requestedSchema: {type: "object", properties: {}}, mode: "form", _meta}` (the harness matcher `C/scripts/accept/lib.mjs:132-146`; the default schema is `C/src/repl-host/privileged-node-repl.mjs:130-133`).

**cua's own host forwards elicitations but persists nothing.** It suspends the budget while the client decides (`C/src/repl-host/supervisor.mjs:474-500`). The host rule "Apps ask for approval once per connection" (`C/src/mcp/surface.mjs:200-201`) is true today only because of the vendor Rust host.

Linux has no policy and no approval at all (`surface.mjs:240`; `S/targets/linux/*` never elicit).

### 2.7 Configuration the helper reads

- **JS side:** `SKY_CUA_SERVICE_PATH`, `SKY_CUA_SERVICE_NATIVE_PIPE_PATH`, `NODE_REPL_HOST_SERVICES_PIPE_PATH`, `CODEX_HOME` (only to find `computer-use/Codex Computer Use.app`), `SKY_ENABLE_AUDIO`, `OAI_SKY_CONFIG_PATH`, `OAI_SKY_LINUX_BIN`.
- **Helper side:** it reads `CODEX_HOME`'s config. A shared helper started by another client with a `~/.codex/config.toml` whose `[features]` held a dotted key failed every call with `invalid configuration: invalid type: map, expected a boolean in features`. The helper launched through cua's runtime read cua's own `CODEX_HOME` (`<CUA_HOME>/state/codex`, `launch.mjs:15`) and worked (`native-baseline/README.md:52`).
- **Helper app-server use:** the helper also drives a Codex app-server, using `/Applications/Codex.app/Contents/Resources/codex` and `features.{memories,apps,plugins,multi_agent,tool_search,tool_suggest}=false` overrides (`H:28687-28693,31174-31178`), for identity/auth status, thread events (`CodexAppServerThreadEventObserver`) and org app policy (`CodexAppServerComputerUsePolicyProvider`, `H:21160-21161`). It has a config kill switch: "Computer Use is disabled by your configuration." (`H:28844`).
- **Inference:** a cua-launched helper has no account, so the org-policy and URL-policy lookups degrade to their defaults. The native no-account acceptance check passes (`C/scripts/accept-native.mjs:227-231`).

### 2.8 Analytics

- **JS:** Statsig client `client-br04…`, posting to `ab.chatgpt.com/v1` and `chatgpt.com/ces/v1/rgstr`. It fetches `chatgpt.com/backend-api/me` to attach the user id and email. Its events are `CodexComputerUseMcp{ServerLaunched,ToolCalled,AppApprovalRequested,AppApprovalResolved}` (`S/targets/mac/computer-use-telemetry.js:6-9,12-121,122-219`).
  - It is inactive when `NODE_REPL_DISABLE_ANALYTICS=1` or `BROWSER_USE_DISABLE_AMBIENT_NETWORK=1`, or when there is no privileged `config`/`fetch` (`:220-232`).
  - cua sets `NODE_REPL_DISABLE_ANALYTICS=1` (`launch.mjs:202`), and its own host provides no `fetch`.
- **Helper:** it carries its own Statsig, Datadog transport and `https://chat.openai.com/ces/v1/telemetry/intake` (`H:22255,28015`). **Inference:** cua's flag does not reach it.

### 2.9 Error mapping, end to end

A helper JSON-RPC error becomes `SkyComputerUseError`, then cua's wrapper (a value-free reclassification only when a secret was substituted), then the worker. Only the message reaches the cell. JS-side policy and transport failures are plain `Error`s or `SkyComputerUseTransportError`s with fixed sentences:

- `Sky Computer Use native pipe is closed`
- `… closed before response`
- `… frame is too large: N`
- `Sky Computer Use API version mismatch: client=… server=…`
- `Sky Computer Use requires the trusted nodeRepl runtime`

(`native-pipe.js:33-36,192-202,314-318,327-345,401-407,453-455`)

---

## 3. The accessibility text on macOS (`get_app_state` → `.text`)

### 3.1 Who produces it

- The whole text is produced by the helper: `skyshot.text`. JS only validates that it is a string. It prepends `<app_specific_instructions>\n…\n</app_specific_instructions>\n` once per app per service process when the helper returns `appSpecificInstructions`. `com.apple.iWork.Numbers` is excluded. The key is the bundle id, else the `app` string (`S/targets/mac/window_result.js:3,35-81`; the Set lives in `create_client.js:18`).
- Helper-side app notes exist for Spotify (link rewriting), a Google Docs host pattern and Slack (`H:29197-29198,29208,28635`).
- The facade adds nothing (`research-A-js-api.txt:847`).

### 3.2 Grammar

No vendor doc or skill carries a macOS sample (`P/docs/sky-window-api.md` and `P/docs/skills/oai_sky_lib/macos/SKILL.md` only say "accessibility text"). The grammar below is reconstructed from three sources:

- the regexes cua's harnesses depend on (`C/scripts/native-baseline/cells.mjs:44-52`, `C/scripts/accept/textedit.mjs:84-90`);
- cua's synthetic TextEdit double, "shaped as measured on the mini" (`C/test/native-baseline/textedit-double.mjs:3-21`);
- helper strings.

Synthetic example (cua-authored test double, `textedit-double.mjs:17`, not vendor docs and not an owner window):

```
App=com.apple.TextEdit
Window: "Open", App: TextEdit.
0 standard window Open, ID: open-panel, Secondary Actions: Raise
	1 row Description: a document of the owner
	74 button New Document, ID: NewDocumentButton
	76 button Cancel, ID: CancelButton
```

and (`:20`) `7 text field (settable) Value: <v>, ID: saveAsNameTextField`.

- **Header** (reconstructed): `App=<bundle id>`, then `Window: "<window title>", App: <display name>.`. The text describes the app's **key window** only ("the state of the app's key window", `HC:14158`).
  - cua depends on the header: `^Window: "([^"]*)"` gives the front title (`cells.mjs:44`, `textedit.mjs:85`).
  - With no window the call fails with `noWindowsAvailable` instead of returning text (`cells.mjs:49`, `textedit.mjs:269`).
- **Element line:** tabs per depth, the decimal index, a space, then the **role description**, optional `(flags)`, the title, then comma-joined titled labels (`Description: …`, `Value: …`, `ID: <AXIdentifier>`, `Secondary Actions: a, b`).
  - cua's oracles depend on `^\s*\d+ ` as an element line and on `ID: …` tokens (`cells.mjs:45-48,72,140`; `textedit.mjs:86` `/Value: (.*?), ID: First Text View/`).
  - The Linux renderer reproduces the same shape client-side (§4.3), which corroborates it.
- **Role names are localized.** On the Korean mini the text-view line reads `2 텍스트 엔트리 영역 (settable) Value: <marker>, ID: First Text View` (cua fixture marker, `C/docs/evidence/2026-10-07-reverse-remote-acceptance.md:84`). cua's host rules say "role names are in the system language" (`C/src/mcp/surface.mjs:230`). **Inference:** the role column is `AXRoleDescription`, not `AXRole`, while `ID:` and the flag words (`settable`) are not localized.
- **Flags** seen: `settable`. **Inference:** flags mirror the Linux renderer's set (focused, selected, expanded, checked/unchecked, settable, disabled; `S/targets/linux/accessibility_tree.js:26-56`), which looks modelled on the mac output.
- **Text values may be rendered as Markdown.** `select_text` asks for text "exactly as it appears in the accessibility tree, including any Markdown formatting" (`HC:14163`), and the helper carries attributed-text style names (`Title/Heading/Subheading/Body/Fixed width`, `H:31269-31273`) and cmark (`H:36134`).
- **Trailer** (inference from `H:31206-31211`; also `research-A-js-api.txt:847`): optional `The focused UI element is <…>` and `Selected text: \`\`\`…\`\`\`` lines.

### 3.3 Indexes

- **Assignment:** indexes are assigned by the helper. The double's non-contiguous numbers (0, 1, 74, 76) suggest numbering over a fuller tree than is printed (**inference**).
- **Resolution:** actions send the index as a string `elementID` (`client.js:299-304`). The helper resolves it against the app's stored tree (`lastAXTree`, `RefetchableSkyshotAXTree`) and re-fetches invalidated elements by matching criteria. It fails with `The element ID is no longer valid. Try to get the on-screen content again…`, `… multiple elements were found that match the criteria…` or `<n> is an invalid element ID` (`H:29190-29195`).
- **Stability (inference):** the diff format names changed and added elements by id and summarizes removed ones "by ID range" (§3.4). So ids persist across revisions of one lineage (`lineageID`, `previousRevision`, `H:31227-31233`). The documents still tell the model to re-derive indexes from the latest text (`core.md:166`; macOS `SKILL.md:72`).

### 3.4 Diffing (`disableDiff`)

- **Default** (no `disableDiff`): the helper returns a diff against the previous tree when "appropriate" (`core.md:167`). Its headers (`H:29199-29203,31207`):
  - `The following is a diff from the previous accessibility tree`
  - then either `with ~ and + representing changed and added elements, respectively. Removed elements are summarized by ID range.` (followed by `Removed element IDs: <ranges>`), or `with ~, +, and - representing changed, added, and removed elements, respectively.`
  - `The following is a cumulative diff from the initial accessibility tree`
  - `There has been no change in the accessibility tree for <…>`
- **`disableDiff: true`** returns the full tree. `cua.getApp` always passes it (`create-tinysky-alt.mjs:56`).
- **Screenshot-only observations advance the baseline.** `getScreenshot` calls `get_app_state({app})` in default mode, so the helper's diff baseline moves even though the text is discarded. Hence `core.md:167`: "After a screenshot-only observation, request a full tree before relying on accessibility indexes again."
- `core.md:174` (do not repeat a no-change `getAXState`) depends on the no-change sentence.

### 3.5 Inclusion, exclusion and limits (mostly inference from strings)

- **Scope:** key window only (`HC:14158`).
- **Menus:** the controller tracks `_currentlyOpenedMenu` and `_currentlyFocusedMenuBarItem` (`H:28444-28445`) and has `MenuBarUIElement`/`MenuBarItemUIElement` types (`H:22572-22573`). The errors include `Menu mouse action not supported` and `Failed to click menu item` (`H:28477-28478`). **Inference:** an open menu is reported and actionable; whether the menu bar is listed at rest is not determinable statically.
- **Offscreen:** there is a `cannotClickOffscreenElement` error (`H:45750`). Whether offscreen elements are printed is unknown.
- **Web content:** the helper sets `AXManualAccessibility`/`AXEnhancedUserInterface` (`H:31468-31469`, with an `axEnablementAssertion` field). **Inference:** this enables Chromium/Electron web AX trees. It has an `ax_prefetch_disabled_bundle_ids` config (`H:29138`).
- **Private windows:** localized "Incognito"/"private browsing" title fragments follow the browser list (`H:29293-29300`). **Inference:** private windows get special handling.
- **Limits:** the only hard bound visible is the 8 MiB IPC frame (§2.2). The helper also has `Max depth exceeded` (`H:31225`). `[truncated to visible range]` (`H:28634`) sits in the event-stream recorder, not clearly `get_app_state`.
- **Measured size:** an empty TextEdit document is 2,810 characters and 53 elements (`native-baseline/README.md:17`).

### 3.6 Augmentation beyond accessibility

- **Settle:** after an action the helper waits "about 1 second, with additional delays of up to 5 seconds if the app has a loading indicator or other signs of state changes" before capturing (`P/docs/skills/oai_sky_lib/macos/SKILL.md:112`; `needsUISettleBeforeSkyshot`, `H:28443`). `core.md:210` promises this wait to the model.
- **Not on cua's path:** "Appshot" (`Package_Appshot.bundle`, an `Appshot.wav` sound, `AppshotCaptureStore`) and Skysight (`SkysightSummarizer.md`) are Codex-desktop screen-context features. **Inference** from `ComputerUseIPCAppStartCapture/NextCaptureUpdate` being unused by the JS client. No OCR or vision text was found in the `get_app_state` contract.

### 3.7 Screenshot path and format

- `skyshot.screenshot = {url, mimeType?}`. An empty or absent URL means `screenshot: null` (`window_result.js:10-30`, `client.d.ts:98-104`). The skill says the URL is "always `file://`" in that environment (`SKILL.md:116`); the docs type says data URL (`sky-window-api.md:111-113`). The facade accepts both: base64-decode or `readFile(fileURLToPath)` in the **cell** (`C/src/cua-api/display.mjs:31-37`).
- **Inference:** a file URL must be readable from the kernel's sandbox.
- **Measured:** a window JPEG of 1172 × 976, about 50 KB (`native-baseline/README.md:18`).
- **Coordinates** are "in the app-window screenshot" (`sky-window-api.md:51-52`); host rule: "coordinates are screenshot pixels (apply the host's downscale)" (`surface.mjs:230`).
- No JS resizing. cua's MCP layer only corrects MIME by magic bytes (`C/src/mcp/surface.mjs:287-291`).

---

## 4. Linux

### 4.1 Transport: `sky_linux`

- **Binary:** `package_bin({relative_path: ["bin","linux",`sky_linux_${arch}`], env_var_override: "OAI_SKY_LINUX_BIN"})` (`S/targets/linux/sky_linux.js:8-11`, `S/core/package_bin.js:5-35`). cua pins `OAI_SKY_LINUX_BIN` to the relocated helper (`launch.mjs:34-35`; `C/runtime/releases/26.928.40906-linux-arm64.json` layout `skyLinuxBin`).
- **Process:** spawned as `<bin> [--mouse-size-px N] server`, one process per (bin, args) in a module Map (`sky_linux.js:12-22`). Under cua's own host it is the trusted worker's supervised child (`C/src/repl-host/supervisor.mjs:14`).
- **Framing:** newline-delimited JSON on stdio.
  - Request: `{"id":<n>,"command":"<name>","input":{…}}\n`.
  - Response: `{"id":<n>,"ok":true,"output":…}` or `{"id":<n>,"ok":false,"error":"…","restart"?:true}` (`sky_linux_transport.js:33-55,115-172`).
- **Concurrency:** requests are pipelined and correlated by id, not serialized.
- **Failure handling:**
  - `restart: true` kills the child and rejects its in-flight requests.
  - Invalid JSON, or a response without a numeric id, kills it with `sky_linux server emitted invalid JSON: …` or `sky_linux server response missing numeric id`.
  - Exit rejects with `exit=<code>`/`signal=<sig>` plus the last 8 KB of stderr.
  - The child is unref'd when idle (`:57-106,128-180`).
- **Options:** `{target: "linux"}` only, because cua sets no `OAI_SKY_CONFIG_PATH`. So there is no `mouse_size_px`, and `post_action_sleep_ms` defaults to 100.
- **Settling:** every input method waits for the `ActionSettler`, then defers the next call by 100 ms (`action_settler.js:23-38`, e.g. `click.js:7-12`).
- **Results:** `sky_linux()` returns `JSON.stringify(output)`, and callers parse it (`sky_linux.js:23-28`).

### 4.2 Methods and `get_window_state`

The commands match the method names (§1.6); `drag_handle` sends `{action: "start"|"move_to"|"end", …point}` (`drag_handle.js:4-63`). `get_window_state` (`S/targets/linux/get_window_state.js:6-28`):

1. **Read the window.** `sky_linux("get_window_state", {window, include_screenshot?, query?})` returns `{window, ax_tree, ax_tree_source: "at_spi"|"x11", screenshots: [{filepath}]}`.
2. **Load the screenshots.** Each one is read from its file into `{filepath, bytes, data_url: image/jpeg}` (`get_screenshot.js:17-32`).
3. **Assign ids.** `ElementIds.assign` (`element_ids.js:2-20`) keeps each node's native id in `native_id`. It replaces `id` with a compact decimal string from one counter shared by all windows, reusing the id the same native id had in that window's previous snapshot. Without a `query` the per-window map is rebuilt from this snapshot, so ids are **stable across consecutive calls** for elements that stay. An element that vanishes and returns gets a new id.
4. **Resolve ids on input.** An input `element_id` that is all digits is translated back to the native id. An unknown one is the error `Unknown element ID <n> for this window; refresh get_window_state()`. Any other string passes through as a native id (`:21-35`).
5. **Cross the RPC.** The service strips `bytes` (`service.js:36-41`); the facade re-decodes them and re-attaches `to_string` (`C/src/cua-api/sky.mjs:69-72`).

Shapes:

- **Window:** `{app, focused, height, id (X11), modal, title?, width, window_type?, x, y}` (`sky-full-desktop-api.md:54-65`; measured key set `C/src/services/sky.mjs:38-40`).
- **AccessibilityNode:** `{actions?, children, description?, id, name?, native_id?, role, states?, value?}` (`:179-190`).
- **Behaviour:** targeted input does not activate the window or move the pointer (`:7`; `core.md:162`).

### 4.3 Client-side rendering (`C/src/cua-api/linux-accessibility-tree.mjs`)

This is a port of `S/targets/linux/accessibility_tree.js:2-255`, "the vendor's exactly" (`:1-9`). `to_string` first prunes the tree (`:55-109`):

- It drops nodes that have no label, no kept children and no usable interactivity, unless their native id is `x11:`.
- An unlabeled, non-interactive container with one child is replaced by that child; children of the same role are flattened.
- A text child whose labels are already in its parent's labels is folded into the parent.
- Runs of plain text leaves merge into one `text` node.

It then renders one line per node, tab-indented by depth: `<id> <role> (<flags>) <labels>`.

- **Role:** containers (group, panel, filler, section, generic) render as `container`; text, static and label render as `text`; `menu item` renders as no role (`:30-34`).
- **Flags:** focused, selected, expanded, indeterminate, checked/unchecked, settable (editable), disabled (`:35-41`).
- **Labels:** name untitled, then `Description:` and `Value:`, de-duplicated; long ones (> 100 characters or containing a newline) go last (`:42-49,125-137`).
- **Secondary Actions:** a node's action names, minus a first action of press/click/dodefault/clickancestor and minus a lone showcontextmenu (`:43-47`).
- **Escapes:** `\r`, `\n` and `\t` are escaped (`:50-51`).

`bind-linux-app` prefixes `Accessibility source: <source>\n` and always returns the full tree, ignoring `disableDiffing` (`bind-linux-app.mjs:19-24`; `core.md:168`). x11-fallback elements are observation-only (`core.md:168`).

Synthetic sample from cua's tests (`C/test/repl-parity/m4-native.test.mjs:33`): `Accessibility source: at_spi\n0 frame <file>\n\t1 text (focused, settable)\n\t2 button Save`.

### 4.4 Known defects recorded

- **GTK3 crash under `typeText`/`paste`.** The helper inserts through AT-SPI EditableText (`PasteText`, `SetCaretOffset`). Both crash gedit 46.2 and mousepad 0.6.1 on arm64, with SIGSEGV in `gtk_text_buffer_get_iter_at_offset`. The cell got `Resource temporarily unavailable (os error 11)` (`C/docs/evidence/2026-10-06-linux-acceptance.md:107-117`); it later got `D-Bus org.freedesktop.DBus.Properties.Get failed: org.freedesktop.DBus.Error.NoReply: …` with the window exiting (`C/docs/evidence/2026-10-14-own-repl-host-native/README.md:30-36,81`; spec `:1087`). On cua-bench one vendor sample gave os error 11 against NoReply, which failed the M5 comparison (`README.md:146`).
- **GTK4.** gnome-text-editor inserts, then throws `Text.SetCaretOffset … NotSupported`, and `pressKey` does not reach it (`linux-acceptance.md:114-115`).
- **x64.** `typeText` did not crash, but threw `editable Paste did not insert text` (`C/src/mcp/surface.mjs:221-227`).
- **Workaround.** Hence the host rule "type there with pressKey, one X keysym per call" (`surface.mjs:238`).
- **Performance.** `pressKey` costs about 400 ms per call (`own-repl-host-native/README.md:83`).
- **Sandbox.** The scoped sandbox keeps `sky_linux` off X and the session bus, so Linux computer sessions default to `disabled` (`C/src/runtime/doctor.mjs:277-283`).
- **Measured** (vendor, gedit, VM, `README.md:13-26`): `getAXState` 428 ms wall and 425 ms in-cell for about 10.9k characters and 399 elements (`at_spi`); `getScreenshot` 532 ms for a 910 × 756 JPEG of about 35.7 KB.

---

## 5. Windows

The pinned package has a Windows target in JS only. `S/targets/windows/create_client.js:1-6` returns `WindowsComputerUseClient` (`internal/computer_use_client.js` 442 lines, `computer_use_client_base.js` 567, `helper_transport.js` 670, `codex_turn_metadata.js` 49: about 1,730 readable lines). It implements the window2 API (`P/docs/sky-window2-api.md:15-30`): `list_windows`, `get_window`, `list_apps`, `launch_app`, `get_window_state` (include_text/include_screenshot), `click`, `press_key`, `type_text`, `scroll`, `set_value`, `drag`, `perform_secondary_action`, `activate_window` and optional audio. It talks to a helper over its own named-pipe transport. No Windows helper binary ships in the darwin package: `P/bin` is empty, and `package.json` `bin` lists only `sky_linux_arm64`/`x64`. cua's facade drops the target (`create-tinysky-alt.mjs:10-12`).

---

## 6. What cua's harnesses offer #117

### 6.1 `scripts/native-baseline.mjs`

- **What it is:** a timed, attested, owner-content-free harness over real `cua serve` on a device (`C/scripts/native-baseline.mjs:1-41`).
- **Operations:**
  - `ssh.roundtrip`; `cold.{miss,hit}.{initialize,tools_list,first_js,total}`; `warm.{noop,getState,listApps}`
  - per platform: `bind.getApp`(+`.retry`), `approval.elicitation`, `setup.*`, `guard.scratch`, `warm.getAXState`, `warm.getScreenshot`, `task.{act,verify,close|clear,total}`
  - Linux `method.{typeText,paste,paste.format,setValue,selectText,scroll.pages}`; then `end_task`
  - Each row records wall and in-cell time (`cells.mjs:1-31`).
- **`compare <vendor-dir> <cua-dir>`** judges each operation (`compare.mjs:1-27,56-113`):
  - latency: the candidate's median must be ≤ baseline + max(10%, 500 ms), with cold phases net of ssh;
  - success share no lower than the baseline's;
  - method-case outcomes equal sample for sample, or strictly better.
- **Recorded baselines:**
  - Mac/TextEdit: `C/docs/evidence/2026-10-14-native-baseline/`, three runs. In-cell medians: getAXState 51 ms, getScreenshot 53 ms, listApps 22 ms, first getApp 1,410 ms, task 4,039 ms (`README.md:7-21`).
  - Linux/gedit: `C/docs/evidence/2026-10-14-own-repl-host-native/`, including the M5 cua-bench pair.

**Can it run "vendor sky vs candidate engine" on the same cells? Not as is.** It varies the REPL host, not the engine:

- `run` takes only `--host vendor|cua` (`native-baseline.mjs:88-92`). The adapters hardcode `meta.service = {surface: 'computer', engine: 'sky', answered: 'vendor', …}` (`macos.mjs:57`, `linux.mjs:151`).
- Helper attestation greps `SkyComputerUseService` (`remote.mjs:155`) or `sky_linux`.
- `compare` requires the baseline to attest host `vendor` and the candidate host `cua` (`compare.mjs:117-118`). It also requires the **native service** attestation to be equal on both sides (`COMPARABLE.service`, `:26,120-121`; `summary.mjs:53,62-72`), which an engine swap violates by design.
- On macOS the candidate cannot run yet: the own host refuses the computer surface (`launch.mjs:296-307`).

**What would need adding:**

1. **Selection.** An engine selection, e.g. `CUA_NATIVE_ENGINE=vendor|cua` resolved per connection like `replHostFor`, with an `--engine` flag.
2. **Attestation.** An engine attestation the engine itself returns: for instance a `setup` field or a `_meta['cua/nativeEngine']` marker, mirroring `hostAttestationOf` (`native-baseline.mjs:74-78`), plus engine-aware helper attestation.
3. **Comparison mode.** A `compare` mode that holds host, device, release, OS, display, sandbox and plan equal, and requires the engine to differ (vendor baseline, cua candidate).
4. **Mac method cases**, mirroring Linux's `method.*`: paste in text/md/html, setValue, selectText, performSecondaryAction, click by coordinates, scroll by element and point, drag, typeText with non-ASCII, a diff-mode `getAXState` after an action, and the no-change sentence.
5. **A structural AX oracle**, recording counts or hashes only: the share of element lines with a non-empty title, the `ID:` count, the role-description histogram hash, and index resolution success. This would make "naming accuracy" measurable without exporting text.
6. **The issue's timed scenario set.** Adapters for Finder, Chrome's own chrome (toolbar and menus, not page content) and a Catalyst app, each with run-owned windows and the same refusal and guard discipline as TextEdit.

**#116 differential/parity harness** (`C/scripts/repl-parity.mjs`):

- Its `--suite native` is Linux-only: `nativeCommand` throws unless the device is `cua-linux` (`C/scripts/repl-parity/native.mjs:4-7`).
- Its 19 native cases cover the facade members on a harness-owned gedit (`C/test/repl-parity/scenarios/native.mjs:19-44`), host vs host.
- Reusable for #117: the AttestedConnections, raw-cell capture and `vendor-defects.mjs` machinery. It would need an engine axis and macOS native scenarios.

### 6.2 Native acceptance items (the issue's "native acceptance script's items")

`C/scripts/accept-native.mjs` (header `:16-36`), items 1–10, each PASS, FAIL or BLOCKED:

1. `npm test` (`:145`).
2. Pinned install: verified private tree, idempotent reinstall, refusal of bad archives, download mode (`:186`). The checks include signatures by team 2DC432GLL2 over the helper app (`C/src/runtime/checks.mjs:49-75`), which #117 must re-pin.
3. `doctor --json`: release, paths, signatures and compatibility, with runtime health reported apart from live helper and permission evidence (`helper.permissions` blocked, `helper.live`) (`:190-215`).
4. `serve` and `verify.mjs`: the four-tool surface on relocated binaries and own configuration; no installed-desktop runtime path; native without an account (empty owned `CODEX_HOME`) (`:219-233`). `verify.mjs` records which helper held `computeruse.sock` (`C/verify.mjs:37,163`).
5. Live native fixture, `--live-textedit` (`:261-269`); its steps in §6.3.
6. Secrets: terminal-only masked set, key-only listing and the live store roundtrip; with both flags, `{{secret:KEY}}` typed into TextEdit and read back by hash (`:336`).
7. Native input substitution: methods, rejection before dispatch and store refusals (`test/services-sky*.test.mjs`) (`:338-345`).
8. Task lifecycle: cancel does not stop a running cell; `end_task` after a cancel; work in flight is rejected as `task_ending`; an uncertain completion fails closed; idle EOF; **per-connection app approvals observed** (TextEdit, `$CODEX_HOME/computer-use/sessions` files) (`:347-371`).
9. Release gates, always BLOCKED here: a clean macOS machine or VM install with permissions, native fixture and real secret substitution; a cold start of the pinned native helper; fresh TCC onboarding (`:375-386`).
10. Packaging, plugin README, tracked files, clean-clone tests (`:391-442`).

### 6.3 `C/scripts/accept/textedit.mjs` steps (`:46-63`)

The steps:

- preconditions
- open the fixture document
- connection A: bind TextEdit; type and observe the marker; close
- connection B: bind TextEdit; close only the fixture document; close
- remove the fixture document
- every server the fixture started has exited
- with a secret: the value in a fixture store; type the reference; the document holds exactly the stored value (compared by hash inside the cell); cleanup

The fixture depends on these engine facts:

- `getApp("com.apple.TextEdit")` asks one approval per connection, with the exact elicitation the matcher expects (`lib.mjs:132-146`).
- The header `Window: "<title>"` and `Value: (.*?), ID: First Text View` (`textedit.mjs:84-91`).
- The screenshot is JPEG or PNG and non-empty (`:206-209`).
- `super+w` closes the window, and the next observation errors `noWindowsAvailable` (`:262-278`).
- The approval session file exists while the connection is open and is gone after it closes (`:119,151`).

### 6.4 `C/scripts/accept/linux-native.mjs` steps (`:35-69`)

1. preconditions (linux, DISPLAY, gedit)
2. bind the fixture window by X11 id (`listWindows` poll, `getApp({windowId})`)
3. type the marker with `pressKey` keysyms and read it back from the tree (`Accessibility source: <src>`)
4. screenshot of the window, an image content item
5. `end_task` ended
6. `cua serve` exited cleanly
7. no run entry left

---

## 7. Other behaviour a drop-in replacement must reproduce

Each item is sourced; "(H)" means only strings show it.

**Approval and safety**

- **Approval persistence:** once per connection per app, remembered until the connection closes, on every call, with the exact elicitation shape (§2.6). The own host has none.
- **App policy:**
  - `forbidden` for safety (inference: the password-manager list `com.apple.keychainaccess`, `com.apple.Passwords`, 1Password, Bitwarden, Dashlane, LastPass, NordPass, Proton Pass, and system UI such as `com.apple.SecurityAgent`, `LocalAuthenticationRemoteService`, `UserNotificationCenter`, `ScreenContinuity`; `H:29247-29290`; "Computer use actions are not allowed for system security process: ", `H:28464`).
  - `denied` by org policy.
  - `risk: high` with a warning subtitle ("Allowing ChatGPT to use this app introduces new risks, including … prompt injection…", `H:28843`). **Inference:** for the terminal and browser lists `H:29252-29289`.
  - The JS sentences are in §2.6.
- **User intervention:** physical input during an action stops it with `userIntervened`. The sentences are `The user changed '<app>'. Re-query the latest state with \`get_app_state\` before sending more actions.` and `The user is still interacting with '<app>'… seconds and retry.` (H `H:28792-28795`). The policy counts −10012 and −10016 as "cancelled" (`computer-use-policy.js:182-185`).
- **Lock screen:** `screenLocked` (−10020) has three sentences ("The Mac is locked and automatic unlock could not unlock it…", "…paused because physical input was detected…", "…cannot be associated with a ChatGPT thread…") and guarded auto-unlock through `CUALockScreenGuardian` with "Press any key or click to unlock" (H `H:28822-28824,29180`).
- **Blocked URLs:** `blockedURL` (−10015), "Computer Use stopped due to encountering a disallowed URL: " (H `H:28576`; `ComputerUseURLBlocklist`, `AuraSiteStatusURLPolicyChecker` `H:21173-21180`).

**Input semantics**

- **Focus and cursor:** a virtual cursor overlay (`ComputerUseCursor`/`FogCursor`, the Lens frame sequence in `Package_ComputerUse.bundle`) and a `focusEnforcer` ("focusThiefAlsoStoleTypingFocus", CPS key-focus notifications; H `H:28450-28453,31338-31345`). **Inference:** input reaches background apps without taking the user's focus or pointer. Linux states it explicitly (`core.md:162`).
- **App launch and relaunch:** `get_app_state` "transparently launches the app in the background if it's not already running" (`SKILL.md:109`). "Drop a quit app's handle: getAXState() relaunches it" (`surface.mjs:231`). The first launch of TextEdit sometimes fails with `timeoutReached` after about 5.5 s and binds on retry (`native-baseline/README.md:51`).
- **App identifiers:** name, path or bundle id, with the `ambiguousApp` and `invalidApp` errors (`core.md:209`; `SKILL.md:110-111`).
- **The bound identity is the policy's `appPath`** (`computer-use-policy.js:136`, `get_app_state.js:11-17`): `getApp`'s `App` is bound to that path, so every later call passes a path.
- **typeText:** keyed through the current layout ("Could not find key code for character: %C", H `H:29214-29217`). It **drops characters the layout cannot key (emoji)**, which the host rules tell the model to paste instead (`surface.mjs:232`). IME composition is not handled (**inference**). Secrets are delivered through `type_text`/`paste`/`set_value` (`C/src/services/sky.mjs:6-16`), so non-ASCII secret values inherit this behaviour.
- **pressKey:** xdotool/X keysym syntax with aliases (`super` = Command, `Control`/`Ctrl`/`Alt`/`Shift`, `KP_0`) (`sky-window-api.md:57`; `core.md:208`).
- **paste:** writes the system pasteboard, sends the paste and **restores the previous clipboard** (`sky-window-api.md:22`; `core.md:202`). It supports `text|md|html`. Failure and conflict sentences: "Timed out waiting for the application to read the clipboard", "The user may have conflicted with your paste operation…", "Could not write generated content to the clipboard" (H `H:28473-28475`).
- **Action errors:** `Could not find the requested text to select in the element`, `Cannot select text for an element that does not support a settable selected text range`, `Cannot set a value for an element that is not settable`, `<action> is not a valid secondary action for <element>`, `Missing scroll amount`/`direction`, `No capturable window found: `, `Running application not found: ` (H `H:28465-28480`).

**Observation and timing**

- **Settle before capture** (~1 s, up to +5 s) and **timeout suspension** around the action (`withSuspendedTimeout`) and around the approval wait (the host suspends the budget). A launch plus settle that counted against `timeout_ms` would time out cells that pass today (`computer-use-policy.js:137`; spec `:1072`).
- **App-specific instructions** once per app per service lifetime, except Numbers (§3.1). **Response meta** `codex/toolSurface` per call (§2.6).
- **Concurrency and timeouts:** one request in flight per transport, 120 s default deadline (§2.2). The Linux helper pipelines.

**Process and identity**

- **Shared helper lifecycle.** The helper is a LaunchServices app shared by every client and never killed by cua (`launch-services.mjs:6-7`; spec `:170`). It uses its launcher's configuration (§2.7).
  - A replacement must choose shared or per-connection on purpose.
  - Doctor, verify and the harnesses identify the helper as the holder of `computeruse.sock` (`doctor.mjs:84`, `verify.mjs:37`, `textedit.mjs:66-67`).
- **TCC identity.** The Accessibility and Screen Recording grants belong to `com.openai.sky.CUAService` (team 2DC432GLL2). A cua helper is a new identity that every user must grant afresh. This is the #9 clean-machine/TCC gate (`accept-native.mjs:380-386`) and the issue's acceptance.
- **cua's own coupling points to update in step:**
  - `src/services/sky.mjs`: pinned shapes and vendor error names.
  - `src/runtime/launch.mjs`: `SKY_CUA_SERVICE_PATH`, `CUA_SKY_VENDOR_SERVICE`, `replHostFor`'s `macos_native_peer_requires_vendor`.
  - `src/runtime/manifest.mjs`/`checks.mjs`: `skyServiceApp`, `ipcClient`, the IPC version check.
  - `doctor.mjs`, `verify.mjs`, `scripts/native-baseline/*`, `scripts/accept/*`, `scripts/probe/*`.
  - Tests: `test/services-sky*.test.mjs`, `test/runtime-*.test.mjs`, `test/fixtures/{runtime-fixture,linux-sky-service,linux-native-runtime}.mjs` (from `grep -l` over `C`).

## Top regression risks if missed

1. **Approval persistence and budget suspension.** Without them the user is prompted on every action, or long launches and settles time cells out (§2.6, §7).
2. **Text grammar.**
   - Header lines (`App=…`, `Window: "…"`), `<index> <role description> (flags) title, Label: …, ID: <AXIdentifier>, Secondary Actions: …`, localized role descriptions, Markdown text values.
   - Default diff with `disableDiff` full; the baseline advances on screenshot-only observations; the no-change sentence.
   - cua's harness regexes and the model guidance depend on these (§3).
3. **Index resolution against the latest stored tree per (thread, app),** with re-fetch of invalidated elements and the vendor's error sentences (§3.3).
4. **The settle wait and per-operation latency.**
   - Mac in-cell medians: 51 ms tree, 53 ms screenshot, 22 ms listApps.
   - Linux: 425 ms tree, 527 ms screenshot.
   - Judged at max(10%, 500 ms) per operation (§6.1).
5. **Input and safety semantics.**
   - Background input without stealing focus, clipboard-restoring paste with md/html, layout-keyed typeText.
   - User-intervention, lock-screen, blocked-URL and forbidden-app stops.
   - App resolution and relaunch with the canonical `appPath`, key-window scope, `noWindowsAvailable`.
   - Plus the new TCC identity (§7).
