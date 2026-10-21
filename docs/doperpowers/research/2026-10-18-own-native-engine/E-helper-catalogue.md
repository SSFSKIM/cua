# E. The sky behaviour catalogue, part 1: what the pinned helper binary states outright

For SSFSKIM/cua #117 (cua's own macOS native engine replacing the vendor's). Static reading only, 2026-10-18.

**Subject:** `SkyComputerUseService`, the main executable of `@oai/sky`'s `Codex Computer Use.app` in the pinned runtime `26.928.40906-darwin-arm64` (bundle 26.924.1001281; thin arm64, 23,793,568 B). The bundle structure, plists, signatures and entitlements are in `B-helper.md` §1. The JS side of the contract is in `A-contract.md` (cited as `A §n`). Neither is repeated here.

**Rules kept:** nothing was launched, opened, signalled, attached to or sent to. The tools were `strings`, `nm`, `otool -l`, `dyld_info -fixups`, `xcrun swift-demangle` and two Python 3 stdlib scripts that read the file's bytes. No TCC database, Keychain, auth file or owner content was read.

## Citation keys and the artifacts behind them

All files are in `~/.claude/jobs/1ea561bc/tmp/117/work/`. `B` below is `work/app/Contents/MacOS/SkyComputerUseService`.

| key | file | how it was made |
|---|---|---|
| `S.strings:N` | `S.strings` (existing) | `strings -a -n 4 B`. `S.strings.sec` has the same line numbering plus each line's Mach-O section, from `strings -a -t d -n 4 B` and the `otool -l` section table. Sections: 9,733 lines in `__cstring`, 413 in `__oslogstring`, 1,260 in `__objc_methname`, 8,598 in `__swift5_reflstr`, 699 in `__data`, and 20,986 junk lines from `__text`. |
| `S.small:N` | `S.small` (new) | `python3 -I swift_smallstrings.py B S.sym`, recovering **Swift small-string literals** (see Method). `S.small.ctx` has the same line numbering plus the nearest *named* Swift module and function. |
| `S.fields:N` | `S.fields` (new) | `python3 -I swift_fields.py B S.fixups`: every field descriptor in `__swift5_fieldmd` (3,653 types) with field names and demangled field types. |
| `S.assocty:N` | `S.assocty` (new) | `ASSOC=1 python3 -I swift_fields.py B S.fixups`: every associated-type witness in `__swift5_assocty` (2,495 rows), which maps each IPC request type to its `Response`. |
| `S.fixups` | new | `dyld_info -fixups B`, used to resolve indirect symbolic references through the GOT. |
| `S.dmfull:N`, `S.sym`, `S.undef` | existing | demangled `nm` (161,617 lines), `nm` with simplified names, and `nm -u` (imports). Function addresses below come from `S.sym`. |

### Method and its limits

**Reflection metadata (`swift_fields.py`).**
- The script parses the load commands itself. It walks `__swift5_fieldmd` sequentially; each descriptor is 16 bytes plus `NumFields × 12`-byte records of {flags, mangled type name, field name}. Field names are pointers into `__swift5_reflstr`.
- Mangled names carry embedded symbolic references: `0x01` points directly at a context descriptor, `0x02` points at a GOT slot, which is resolved through `S.fixups` (a bind gives an imported `$s…Mn`/`Mp` symbol; a rebase gives a local descriptor).
- Each reference is rendered in up to three ways, and the first that demangles wins:
  1. as a one-substitution-slot placeholder type (`SDy<std><std>G`), which keeps the mangler's substitution indexes intact, with the referenced type's name pasted back into the demangled text;
  2. the same with protocol references inline;
  3. fully inline.
- **Limits:**
  - 80 of 15,621 output lines still fail to demangle and print as `RAW<…>`. They are opaque result types (`0x09` references) and deeply generic AsyncAlgorithms state. The only in-scope one is `UIElementRenderDifference.Change` (`S.fields:4015`), whose two failed cases are hand-read below.
  - Enum **raw values** are not in reflection metadata, only case names. For `String` raw-value enums the wire value equals the case name unless it was overridden; overrides would show as separate string literals, and none were found for the IPC enums.
  - Codable `CodingKeys` enums are reflected, but their custom raw values are not. Where a wire key differs from the case name, the literal was found separately (§1.2).
  - Whether a non-optional field has a custom decoder default is invisible statically.

**Small strings (`swift_smallstrings.py`).**
- Swift stores literals of at most 15 UTF-8 bytes as two immediate 64-bit words, not in `__cstring`. Word 0 holds bytes 0–7. Word 1 holds bytes 8–14, and its top byte is the discriminator: `0xE0|count` for ASCII, `0xA0|count` for non-ASCII.
- **Consequence:** most grammar words (`Value`, `ID`, `Window: "`), most `AX…` attribute names and short bundle ids **are not visible to `strings`**. Previous reports that searched `S.strings` alone could not see them.
- The scan decodes ARM64 `MOVZ`/`MOVK` sequences in `__text` (4.2 M instructions). It pairs a printable word 0 with a nearby discriminator word 1, preferring register pairs (n, n+1), and also scans data sections for statically initialised 16-byte pairs. It found 12,387 code literals and 784 data literals.
- **Limits:**
  - Literals built by other instruction forms are missed.
  - Interleaved literals are sometimes mis-paired. The artifacts read like `KP_Decimht` or `Insertioe at `; the intended word is obvious, and such entries are marked.
  - The "nearest symbol" is the closest preceding *named* function. **72 % of the text symbols are `<redacted function N>`**: 93,856 of the 130,919 `t`/`T` symbols, from `grep -c 'redacted function' S.nm` and an `awk` count of `t|T` lines. So the attribution is a neighbourhood, not proof of the caller.
- `B-helper.md` called the binary "not stripped". It is **partially** stripped: about 37 k named functions survive, mostly type members and entry points, while closures and many bodies are redacted. This matters for §9.

---

## 1. IPC schema

Transport, framing, peer authentication and the JS mapping are in `A §1.4, §2.2–2.3`. This section adds the server-side types. All IPC types live in Swift module `ComputerUseClient` (linked into the service); the server machinery is in module `ComputerUse`.

### 1.1 The envelope (JSON-RPC 2.0 over the socket)

| type | fields (wire key → type) | source |
|---|---|---|
| `JSONRPCRequest<P>` | `jsonrpc` (case `jsonRPC`, `__cstring` literal `jsonrpc` at S.strings:32858) → String, `id` → `JSONRPCID?`, `method` → String, `params` → `P?` | S.fields:1379 |
| `JSONRPCID` | `integer(Int64)` \| `number(Double)` \| `string(String)` | S.fields:1375 |
| `ComputerUseJSONRPCRequest` (the decoded method) | `close(id)` \| `ping(id, params: PingParams)` \| `request(RequestCall)` \| `unsupported(id)` | S.fields:1318 |
| method names | `close`, `ping` (literals S.strings:28363-28364); `request` via the `.request` case. Unknown method → `Method not found` (S.strings:28847) | |
| `ComputerUseJSONRPCPingParams` | `clientApiVersion` → `ComputerUseJSONRPCAPIVersion?` | S.fields:1346; key literal S.strings:28365 |
| `ComputerUseJSONRPCPingResult` | `serverApiVersion` → APIVersion (a `rawValue: String` struct, S.fields:1313) | S.fields:1323; S.strings:28366 |
| `ComputerUseJSONRPCRequestParams<R>` | `clientApiVersion?`, `requestType` → String, `request` → R, `codexTurnMetadata` → TurnMetadata?, `deadlineUnixMilliseconds` → Int? | S.fields:1329; keys S.strings:28365-28374 |
| `ComputerUseJSONRPCRequestDescriptor` (header pre-decode) | `clientApiVersion?`, `requestType`, `deadlineUnixMilliseconds?` | S.fields:1342 |
| `ComputerUseJSONRPCCodexTurnMetadata` | `model` → String?, `reasoning_effort`, `session_id`, `turn_id` → String?, `turn_started_at_unix_ms` → Int64?, `user_input_requested_during_turn` → Bool? (Swift names `reasoningEffort, sessionID, turnID, turnStartedAtUnixMilliseconds, userInputRequestedDuringTurn`) | S.fields:1335, 1348; snake-case keys S.strings:28369-28373 |
| `JSONRPCResponse<R>` / `JSONRPCError` | `jsonrpc`, `id`, `result` / `code: Int`, `message: String` | S.fields:1398, 1369 |
| `ComputerUseIPCJSONRPCSocketConnection` | `maximumFrameSize: Int`, `ioTimeout: Duration`, `processFrame: (Data) async throws -> (responseFrame: Data, closeConnection: Bool)?` | S.fields:1172 |
| server errors | `Response exceeds maximum frame size`, `Request deadline exceeded`, `Computer Use IPC server is unavailable.`, `frame is too large: `, `invalid peer token length: `, `LOCAL_PEERTOKEN failed errno=` | S.strings:28846-28849, 28868-28875 |

- **What cua sends:** cua's turn metadata is `{session_id, thread_id, turn_id, call_id, model}` (A §2.2). The helper decodes only `model`, `session_id` and `turn_id` of those. It drops `thread_id` and `call_id` and reads three keys cua never sends.
- **`close`** is a method the JS client never uses. **[inference]** It tears down the connection; the `closeConnection` flag in `processFrame` is its return path.

### 1.2 The seven requests the JS client sends, and their responses

The Request→Response mapping comes from each type's `ComputerUseIPCRequest.Response` witness (`S.assocty:2223-2235`). The wire `requestType` is the Swift type name (A §1.4).

| requestType | request fields | Response type |
|---|---|---|
| `ComputerUseIPCListAppsRequest` | none (S.fields:12542) | `[ComputerUseIPCDiscoveredApp]` |
| `ComputerUseIPCAppGetSkyshotRequest` | `app: String`, `disableDiff: Bool` (S.fields:12606) | `ComputerUseIPCSkyshotResult` |
| `ComputerUseIPCAppPerformActionRequest` | `app: String`, `action: ComputerUseIPCAction` (S.fields:12584) | `ComputerUseIPCActionResult` |
| `ComputerUseIPCAppPolicyRequest` | `app: String` (S.fields:12540) | `ComputerUseIPCAppPolicyResult` |
| `ComputerUseIPCAppStartRequest` | `app: String` (S.fields:12548) | `ComputerUseIPCAppState` |
| `ComputerUseIPCStartAudioRecordingRequest` | `maxDurationMilliseconds: Int?` (S.fields:12603) | `ComputerUseIPCEmptyResponse` (no fields) |
| `ComputerUseIPCStopAudioRecordingRequest` | none (S.fields:12605) | `ComputerUseIPCAudio {url: URL}` (S.fields:12601) |

**`disableDiff` is a non-optional `Bool`.** The JS omits the key when the caller did not pass it (`client.js:34-48` getAppState builds `{app, disableDiff: undefined}`, and undefined keys are stripped, A §1.4). The default-mode call works in production (A §3.4). **[inference]** The decoder therefore defaults a missing `disableDiff` to `false`; a synthesized `Decodable` would throw `keyNotFound`. A reimplementation must accept the key's absence.

Response types:

| type | fields | source |
|---|---|---|
| `ComputerUseIPCDiscoveredApp` | `displayName: String`, `bundleIdentifier: String`, `appPath: String?`, `lastUsedDate: Date?`, `useCount: Int?`, `isRunning: Bool`, `isFrontmost: Bool` | S.fields:12515 |
| `ComputerUseIPCSkyshotResult` | `app: ComputerUseIPCApp`, `skyshot: ComputerUseIPCSkyshot`, `appSpecificInstructions: String?` | S.fields:12593 |
| `ComputerUseIPCSkyshot` | `text: String`, `screenshot: ComputerUseIPCScreenshot?` | S.fields:12590 |
| `ComputerUseIPCScreenshot` | `url: URL`, `mimeType: String` (both non-optional) | S.fields:12587 |
| `ComputerUseIPCApp` | `pid: Int32`, `bundleIdentifier: String`, `appPath: String?` | S.fields:12511 |
| `ComputerUseIPCActionResult` | `app: ComputerUseIPCApp`, `skyshot: ComputerUseIPCSkyshot?` | S.fields:12597 |
| `ComputerUseIPCAppState` | `active: Bool`, `currentApp: ComputerUseIPCApp?` | S.fields:12508 |
| `ComputerUseIPCAppPolicyResult` | `decision: ComputerUseIPCAppPolicyDecision`, `target: ComputerUseIPCTargetDescriptor`, `allowPersistentApproval: Bool` | S.fields:12536 |
| `ComputerUseIPCAppPolicyDecision` | `allowed` \| `denied` \| `forbidden` | S.fields:12523 |
| `ComputerUseIPCTargetDescriptor` | `bundleIdentifier: String`, `displayName: String`, `appPath: String` (non-optional), `risk: ComputerUseIPCTargetRisk` (`low` \| `high`), `warningSubtitle: String?` | S.fields:12530, 12527 |

Differences from the JS typings (A §1.4 cites `client.d.ts`):
- In `DiscoveredApp`, `displayName`, `bundleIdentifier`, `isRunning` and `isFrontmost` are **required** server-side. The JS types them optional, and its `id` fallback (`bundleIdentifier ?? displayName ?? "unknown"`) can never fire against this server.
- **Every action returns `{app, skyshot?}`.** JS discards it (A §1.4 lists the results as `undefined`). The controller methods all take `returnSkyshot: Bool` (`ComputerUseAppController.click(…returnSkyshot:)` at 0x10007c4d8 and the others in §9). **[inference]** The IPC path passes `false`, because the legacy MCP path returns post-action state and the JS never reads it. This is not determinable statically.
- `screenshot.url` is a `Foundation.URL`, which encodes as a string. A data URL is not excluded by the type.

### 1.3 `ComputerUseIPCAction` (the `action` of PerformAction)

This is a Swift enum with associated values and synthesized Codable, so the wire form is `{"<case>": {<labels>}}`. Unlabelled payloads use key `_0`.

Sources: S.fields:12558 (cases), S.fields:12840-12873 (per-case `…CodingKeys`), S.fields:12581/12883-12887 (`at`).

| case | payload (wire keys → type) | JS sends (A §1.4) | notes |
|---|---|---|---|
| `click` | `at: LocationSpecifier`, `mouseButton: UInt32`, `clickCount: Int`, `duration: Double?`, `key: String?` | `at, clickCount, mouseButton` | `duration` and `key` are **never sent by JS**. Controller signature `click(at:with:clickCount:andDragTo:holdDuration:key:returnSkyshot:)` (0x10007c4d8): `duration` = press-and-hold time, `key` = a key held during the click **[inference from the parameter names]**. `mouseButton` is a raw `CGMouseButton` (0 left, 1 right, 2 center). |
| `performSecondaryAction` | `elementID: String`, `action: String` | same | |
| `setValue` | `elementID: String`, `value: String` | same | the controller adds `autosubmitSearchFields:` (0x100075910), not on the wire |
| `selectText` | `elementID: String`, `text: String`, `prefix: String?`, `suffix: String?`, `selection: TextSelection` | same | `TextSelection` = `text` \| `cursorBefore` \| `cursorAfter` (S.fields:12572) |
| `scroll` | `at: LocationSpecifier`, `direction: ScrollDirection`, `pages: Double` | same | `ScrollDirection` = `up` \| `down` \| `left` \| `right` (S.fields:12576). `pages` is a **Double**: fractional pages are representable. |
| `drag` | `from: CGPoint`, `to: CGPoint` | `from: [x,y]`, `to: [x,y]` | `CGPoint`'s Codable is the unkeyed `[x, y]` |
| `pressKey` | `_0: String`, `duration: Double?` | `_0` only | key hold `duration` is never sent by JS (`performKeyboardAction(_:text:duration:…)`, 0x100076f80) |
| `type` | `_0: String` | same | |
| `paste` | `text: String`, `format: PasteFormat` | same | `PasteFormat` = `text` \| `md` \| `html` (S.fields:12568) |

- **`LocationSpecifier`** = `coordinate(CGPoint)` \| `elementID(String)`, so `{"coordinate":{"_0":[x,y]}}` or `{"elementID":{"_0":"<n>"}}` (S.fields:12581, 12883-12887).
- **Coordinates** are `CGFloat`, so sub-pixel values survive the wire. **[inference]** `CursorPosition.init(coordinateArray: [Int]?)` (0x10007b130) truncates them to integers: the controller's coordinate click takes `at: [Int]?`.
- **Element-index clicks have no middle button.** `ComputerUseAppController.ClickType` is `left` \| `right` only (S.fields:427), and `click(elementID:type:numberOfClicks:…)` takes `ClickType?` (0x100071d60). **[inference]** A middle click with an `elementID` either maps to left/right or fails; not determinable statically.
- Wire-level action errors: `ComputerUseIPCAppPerformActionRequest.Error` = `invalidElementID` \| `invalidScrollPages` (S.fields:1165); literal `invalid_element_id` (S.strings:28845).

### 1.4 Errors

- `ComputerUseIPCClient.ServerError.Code` lists 30 codes (S.fields:12115). The first 21 are A §1.5's numbering. Then come `turnEnded` and `messagesPermissionsPending` through `messagesSendRateLimited`. **[inference]** These take −10021 to −10029 by order; the numbers themselves are not in reflection data.
- Payload-carrying cases: `couldNotResolveRequestType(requestTypeName)`, `unhandledEvent(eventClass: UInt32, eventID: UInt32)`, `unknownError(String)`, `incompatibleClientVersion(clientVersion: String?, serverVersion: String)` (S.fields:12093).
- The client-side error enum adds `serverError(errorNumber: Int32, errorString: String)`, `accessibilityError(AXError)`, `blockedURL(url:)`, `userIntervened(message:)`, `screenLocked(message:)`, `ambiguousApp(message:)` and `couldNotFindServiceApp` (S.fields:12146).
- **`unhandledEvent(eventClass, eventID)`** fits an **Apple Event** path. The server registers an Apple Event handler, `-[ComputerUseIPCServer handleEvent:withReplyEvent:]` (0x10017b764, S.dmfull:133), next to the selectors `setEventHandler:andSelector:forEventClass:andEventID:` (S.strings:51999). **[inference]** It is a second, legacy transport beside the socket and the XPC sessions (`ComputerUseIPCXPCSession`).

### 1.5 Server-side identity and lifecycle types (peer authentication)

| type | fields | source |
|---|---|---|
| `ComputerUseIPCSenderContext` | `senderPID: Int32`, `parentIdentity: ProcessIdentity?`, `responsibleIdentity: ProcessIdentity?`, `ancestorIdentities: [ProcessIdentity]`, `clientType: ClientType?`, `mcpRuntime: ComputerUseMCPRuntime?` | S.fields:1205 |
| `…SenderContext.ClientType` | `unknown(String)` \| `nodeRepl` | S.fields:1223. A §2.3's "`legacyMCP` or `nodeRepl`" is the separate `ComputerUseMCPRuntime = legacyMCP | nodeRepl` (S.fields:12089; raw value `node_repl`, S.small:8179), carried as `mcpRuntime`. |
| `ComputerUseIPCSenderAuthorization` | `allowedRelayRequirement`, `trustedProcessRequirement`, each a `ProcessIdentity.Requirement` | S.fields:1226 |
| `ProcessIdentity` | `codeSignature: CodeSignature?`, `bundleIdentifier: String?`, `executableName: String?` | S.fields:1216 |
| `ProcessIdentity.Requirement` | `teamIdentifiers: Set<String>`, `identifiers: Set<String>`, `executableNames: Set<String>` | S.fields:1232 |
| `ComputerUseIPCSenderContextResolver` | `senderParentResponsibleIdentity: (Int32) -> ProcessIdentity?`, `senderAncestorIdentities: (Int32) -> [ProcessIdentity]` | S.fields:1229 |
| `ComputerUseServiceLifecycle.Mode` | `codexManaged(ownerProcessIdentifier: Int32)` \| `standalone` | S.fields:1213 |
| `ComputerUseIPCServer` | callbacks `ensureApplicationHasPermissions`, `prepareForAuthenticatedRequest(Bool, Bool)`, `onAppUsed`, `onCodexTurnEnded`, `shouldTerminateWhenNoClientsRemain`; `clientExitSources: [Int32: dispatch_source_proc]`, `senderAuthorization`, `computerUsePolicyProvider`, `serviceLifecycleMode` | S.fields:1239 |
| `ComputerUseIPCClient.RunningServiceCandidate` | `processIdentifier: Int32`, `parentProcessIsCodex: Bool` | S.fields:12170 |

- **Requirement values** are statically initialised small strings in `__data`. At 0x1013dc1b0–0x1013dc3a8 they read, in order: `MQ55VZLNZQ`, `codex-acp`, `2DC432GLL2`, `2DC432GLL2`, `HX7739G8FX`, `node`, `node_repl`, `node`, `node_repl`, `2DC432GLL2` (S.small:12545-12554). Nearby code literals: `node_repl` in `ComputerUseServiceLifecycle.currentMode()` (S.small:1215) and `2DC432GLL2` in `-[ComputerUseIPCServer handleEvent:withReplyEvent:]` (S.small:1217, 1222).
- **[inference]** `allowedRelayRequirement` is {team `2DC432GLL2`, identifiers `node`/`node_repl`, executables `node`/`node_repl`}. `MQ55VZLNZQ` and `HX7739G8FX` are further trusted team ids, with `codex-acp` an accepted executable or identifier. Which team each belongs to is not visible.
- **Authorization failure reasons** (telemetry values): `relay_without_trusted_ancestor`, `untrusted_parent` (S.strings:28834-28835). The keys `computer_use_ipc_has_trusted_ancestor` and `computer_use_ipc_ancestor_depth` sit with the parent and responsible team, signing-id and executable telemetry keys (S.strings:28826-28842).
- **[inference]** Together with A §2.3's probe this matches the rule: a relay (`node`/`node_repl`, team 2DC432GLL2) is accepted only when a trusted ancestor exists. A Node started from ssh has none, which gives `relay_without_trusted_ancestor`.
- **Primitives imported** (`S.undef`): `_getsockopt` (with `LOCAL_PEERTOKEN`, S.strings:28868), `_audit_token_to_pid`, `_SecTaskCreateWithAuditToken`, `_SecCodeCopyGuestWithAttributes`, `_SecCodeCopySigningInformation`, `_SecCodeCopyStaticCode`, `_proc_pidinfo`, `_proc_pidpath`, `_proc_listpids` and `_sysctl`. The responsible-process lookup has no import, so **[inference]** it is soft-linked (§3.1).
- A second requirement evaluator lives in `SlimCore`: `SkyIPCRequirement.evaluate(senderAuditTokenData:)` (0x100ef8a1c) and `.evaluate(processIdentifier:)` (0x100ef8a7c).

### 1.6 Other request types (by name only; none sent by cua's JS)

The 35 conformers of `ComputerUseIPCRequest` are in `S.assocty` (`grep 'ComputerUseIPCRequest :: Response' S.assocty`).
- **App and capture:** `AppStop`, `AppModify(app, modification: activate|deactivate)` (both → `AppState`), `AppStartCapture` (→ `AppStartCaptureResponse`), `AppNextCaptureUpdate` (→ `CaptureUpdate {type: axText|completed|failed|metadata|screenshot, app, text?, screenshot?, transitionSnapshotURL?, failureReason?}`), `FrontmostWindow` (→ `FrontmostWindow? {bundleIdentifier, name, windowTitle?}`), `CodexTurnEnded(threadID, turnID?)` (→ empty).
- **Event stream:** `EventStreamStart`, `EventStreamStatus`, `EventStreamStop(reason)`.
- **Other families:** `CodexStatusItemMenuState`, `CalendarPlaceholder`, nine `Messages*`, nine `Skysight*`.

---

## 2. The AX surface

### 2.1 The vocabulary, as the source names it

Module `AccessibilitySupport` wraps AX names in string-backed structs. Their `static` members are the source-named vocabulary the service uses. Most of the matching `AX…` literals are small strings: the bulk is S.small:2994-3134, with the longer ones at S.strings:31291-31312, 31407-31477 and 53106-53115.

| struct (members) | members | source |
|---|---|---|
| `UIElementRole` (63) | application browser busyIndicator button cell checkBox colorWell column comboBox dateField dateTimeArea disclosureTriangle dockItem drawer generic grid group growArea handle heading helpTag image incrementor layoutArea layoutItem levelIndicator link list matte menu menuBar menuBarItem menuButton menuItem outline page popover popUpButton progressIndicator radioButton radioGroup relevanceIndicator row ruler rulerMarker scrollArea scrollBar sheet slider splitGroup splitter staticText systemWide tabGroup table textArea textField timeField toolbar unknown valueIndicator webArea window | S.dmfull:141266-141524 |
| `UIElementAction` (18) | cancel collapse confirm decrement delete expand increment pick press raise scrollDownByPage scrollLeftByPage scrollRightByPage scrollToVisible scrollUpByPage showAlternateUI showDefaultUI showMenu | S.dmfull:141780-141888 |
| `AXNotification` (37) | announcementRequested applicationActivated applicationDeactivated applicationHidden applicationShown created drawerCreated elementBusyChanged focusedUIElementChanged focusedWindowChanged helpTagCreated layoutChanged mainWindowChanged menuClosed menuItemSelected menuOpened moved resized rowCollapsed rowCountChanged rowExpanded selectedCellsChanged selectedChildrenChanged selectedChildrenMoved selectedColumnsChanged selectedRowsChanged selectedTextChanged sheetCreated titleChanged uiElementDestroyed unitsChanged valueChanged windowCreated windowDeminiaturized windowMiniaturized windowMoved windowResized | S.dmfull:141569-141715 |
| `UIElementAttribute` (143) | grouped in §2.2 | S.dmfull:142335-142907 |

`expand` and `collapse` are not Apple actions. They are the service's pseudo-actions: the static action list in `__data` reads `AXPress AXPick AXIncrement AXDecrement AXConfirm AXCancel AXShowDefaultUI AXRaise AXShowMenu AXDelete SAIExpand SAICollapse` (S.strings:53106-53117). **[inference]** It is the order and allowlist that `MacUIElementTreeTransformation.filterActions` (S.fields:4711) applies to `Secondary Actions:`, and expand/collapse are implemented by setting a disclosure attribute.

### 2.2 Attributes, grouped by apparent use

Grouping is **[inference]** from Apple's constant families and from `TransformedUIElement`'s fields (S.fields:4717). The member names are facts (S.dmfull:142335-142907).

| use | `UIElementAttribute` members |
|---|---|
| **Read per element for the tree.** `TransformedUIElement` stores `role, subrole, roleDescription, title, description, value (+ truncationRange: NSRange?), valueDescription, valueTypeName, placeholderValue, help, identifier, url, domClassList, actionDescriptions, isSelected, isSelectable, isFocused, isFocusable, isEnabled, isDisclosing, isDisclosable, isValueSettable, attributedString, transformedString` | role subrole roleDescription title description value valueDescription placeholderValue help identifier url domClassList selected enabled focused expanded disclosing edited elementBusy hidden labelValue labelUIElements titleUIElement servesAsTitleForUIElements linkedUIElements traits exhibitsMacCatalystBehavior chromeNodeID textualContent keyShortcutsValue unitDescription units minValue maxValue valueIncrement valueWraps allowedValues orientation sortDirection index loaded |
| Structure and traversal | children visibleChildren selectedChildren parent window windows windowIDs topLevelUIElement contents nextContents previousContents rows visibleRows selectedRows columns visibleColumns selectedColumns selectedCells columnTitle columnHeaderUIElements rowIndexRange columnIndexRange disclosedRows disclosedByRow header tabs sections splitters horizontalScrollBar verticalScrollBar incrementButton decrementButton incrementor overflowButton shownMenuUIElement menuItemPrimaryUIElement matteHole matteContentUIElement markerUIElements markerType markerTypeDescription growArea proxy document filename |
| Application and window state | focusedApplication focusedUIElement focusedWindow mainWindow main frontmost minimized modal fullScreen menuBar extrasMenuBar isApplicationRunning alternateUIVisible closeButton minimizeButton zoomButton toolbarButton defaultButton cancelButton |
| Geometry (click points, visibility) | position size frame activationPoint scrollToVisible (an action name also kept as an attribute member) |
| Menu items | menuItemCmdChar menuItemCmdGlyph menuItemCmdModifiers menuItemCmdVirtualKey menuItemMarkChar |
| Date/time fields | ampmField dayField hourField minuteField monthField secondField yearField |
| **Text and selection** (select_text, set_value, Markdown) | numberOfCharacters selectedText selectedTextRange visibleCharacterRange sharedCharacterRange sharedTextUIElements sharedFocusElements startTextMarker endTextMarker selectedTextMarkerRange |
| **Parameterized** (by name) | attributedStringForRange attributedStringForTextMarkerRange attributedStringForTextMarkerRangeWithOptions boundsForRange stringForRange stringForTextMarkerRange nextLineEndTextMarkerForTextMarker scrollToShowDescendant makeScreenRectVisible |
| **Set to enable AX** | enhancedUserInterface manualAccessibility |

Text-marker support: imports `_AXTextMarkerRangeCreate`, `_AXTextMarkerGetTypeID` and `_AXTextMarkerRangeGetTypeID`, and types `UITextMarker`/`UITextMarkerRange` (S.types). Attributed-string keys come from AppKit imports: `NSAccessibility{Font,Link,Attachment,Underline,Strikethrough,Superscript,ListItemIndex,ListItemLevel,ListItemPrefix}TextAttribute`, `…FontNameKey/FontFamilyKey/FontSizeKey` (`S.undef`).

**Catalyst traits.**
- `AXTraits` is decoded into named traits. One group sits in `__cstring`: `updatesFrequently startsMediaSession allowsDirectInteraction statusBarElement autoCorrectCandidate selectionDismissesItem textOperationsAvailable gesturePracticeRegion allowsNativeSliding ignoreItemChooser supportsTrackingDetail allowsLayoutChangeInStatusBar webInteractiveVideo gestureHandlerRegion` (S.strings:31277-31290).
- The rest are in `__data`: `pickerElement radioButton isEditing launchIcon textField inactive footer backButton tabButton deleteKey visited scrollable spacer tableIndex draggable popupButton mathEquation touchContainer supportsZoom textArea bookContent folderIcon readOnly menuItem toggleButton alert` (S.strings:53080-53105). The type is `UIElementCatalystTraits` (S.types).

**Chromium:** `ChromeAXNodeId` (S.small:3071) is attribute member `chromeNodeID`. The transformation context carries `isCatalyst, isWebShaped, isChromium, windowFrame, urlShortener` (S.fields:4703), and `ApplicationUIElement` has `isElectronApp, isCatalystApp, isWebShaped` (`ax_members.txt`).

### 2.3 How attributes are fetched (batching, partial values, timeouts)

- **Imported AX API** (`S.undef`): `AXUIElementCopyAttributeValue`, `…CopyAttributeValues` (ranged arrays), `…CopyMultipleAttributeValues` (batched), `…CopyAttributeNames`, `…CopyParameterizedAttributeNames`, `…CopyParameterizedAttributeValue`, `…GetAttributeValueCount`, `…IsAttributeSettable`, `…SetAttributeValue`, `…CopyActionNames`, `…CopyActionDescription`, `…PerformAction`, `…CopyElementAtPosition`, `…CreateApplication`, `…CreateSystemWide`, `…GetPid`, and `AXObserver{CreateWithInfoCallback,AddNotification,RemoveNotification,GetRunLoopSource}`, `AXIsProcessTrusted`, `AXValueCreate/GetValue/GetType`.
- **SPI, soft-linked** (§3.1), through `SystemSoftware.AccessibilitySPI` (S.dmfull:133938-133953):
  - `copyHierarchy(_:attributes:options:hierarchy:) -> AXError` (0x100248054). Its option and result keys are `copyHierarchyArrayAttributesKey`, `…MaxArrayCountKey`, `…TruncateStringsKey`, `…SkipInspectionForAttributesKey`, `…ResultValueKey`, `…ResultCountKey` and `…IncompleteResultKey`.
  - `getWindowID(_:identifier:)` (AXUIElement → CGWindowID) and `getActualPID(_:pid:)`.
  - **[inference]** `copyHierarchy` is the private batched-subtree fetch, `AXUIElementCopyHierarchy`, with options to cap array counts and truncate strings. It is the "prefetch" behind the config keys `ax_prefetch_enabled` and `ax_prefetch_disabled_bundle_ids` (S.strings:29137-29138). The real SPI name is not in the binary (§3.1).
- **Partial values:**
  - `UIElementCache {supportedAttributes: Set<UIElementAttribute>, attributes: [UIElementAttribute: AXPartialValue]}` (S.fields:4744).
  - `AXPartialValue {value: AXEncodedValue, arraySubsetDescriptor: AXArraySubsetDescriptor?, textTruncationDescriptor: AXTruncationDescriptor?}` (S.fields:4522).
  - `AXArraySubsetDescriptor {count, availableRanges: [Range<Int>]?}` (S.fields:3959) and `AXTruncationDescriptor {count, availableRange: Range<Int>?}` (S.fields:4526).
  - Long arrays and strings are therefore fetched partially, and the text says so (§5.4).
- **`AXEncodedValue.StringConversionType`** = `float | integer | boolean | string | date | unknown` (S.fields lists it with `AXEncodedValue`). Values are stringified per type; `MMMM yyyy` and `en_US` are near the AccessibilitySupport code (S.small:2750, 2785).
- **`AXUIElementSetMessagingTimeout`:** **not imported, and no string names it** (`grep -ci SetMessagingTimeout S.undef S.strings S.dmfull` gives 0 for each). It could still be one of the hash-resolved symbols (§3.1). Its use is not determinable statically.
- **Tree entry points:**
  - `ApplicationUIElement.flatTree(for:contextType:transformed:includingMenus:)` (0x1007099d8).
  - `SkyshotOperation.captureAXTree(treeCache:continuingFrom:performAccessibilityEnablement:)` (0x100225bc4).
  - `SystemSelectionExtractor.extract(from:contextType:treeCache:continuingFrom:axTreeRootElement:performAccessibilityEnablement:alwaysIncludeScreenshot:enableAXDiffing:)` (0x10022a214).
  - `UIElementContextType` = `fullUIContext | eventStreamContext | informationalContext` (S.fields:3984).

### 2.4 Enabling accessibility in reluctant apps

- `AXEnablementAssertion {operation, kinds: [Kind], isEnabled}`. `Kind` = `enableElectronAccessibility | enableEnhancedUserInterface | enableVoiceOverOnPreference` (S.fields:4531, 4538).
- The controller holds one per app (`axEnablementAssertion`, S.fields:395). An `AssertionTracker` reference-counts `activeAssertions` per (application, kind) and remembers `initializedApplications` (S.fields lists it with `AXEnablementOperation`).
- Strings: `AXManualAccessibility` (S.strings:31468) is the Electron/Chromium switch; `AXEnhancedUserInterface` (31469); `com.apple.VoiceOver`, `voiceOverOnOffKey`, `com.apple.universalaccess.VoiceOverSettingsDidChange` (31328-31331).
- **[inference]** `enableVoiceOverOnPreference` makes an app believe VoiceOver is on, without starting it, by posting the VoiceOver-settings notification. Some apps only build their AX tree when VoiceOver is on. A reimplementation should know this exists: it touches a **global** preference. Which apps get it is not visible.
- Entry: `ApplicationUIElement.enableAccessibilityIfNeeded(window:for:)` (0x1006ef938). The parameter is spelled `performAccessibilityEnablement` throughout the skyshot path.

### 2.5 Observation

- `AXNotificationObserver {pid, axObserver, onNotificationReceived, installedNotificationTargets: [AXNotification: Set<AXUIElement>], …}` (S.fields:4503).
- `UIElementTreeInvalidationMonitor.State {layoutChanged: Bool, destroyedElements: Set<AXUIElement>}` (S.fields:4751): a tree is invalidated by `layoutChanged` or `uiElementDestroyed`. The controller holds `windowObserver: AXNotificationObserver?` (S.fields:395).
- Literals:
  - `_axNotificationDebounceTasks` (S.strings:28628): notifications are debounced.
  - `Failed to observe AX notifications for ` (28633).
  - `AXValueChanged`/`AXTitleChanged` in code (S.small:2797, 2806).
- Settle uses notifications too: `ApplicationUIElement.waitForUIToSettle(delay:notificationDelay:includingScrollEvents:)` (0x1006f7408; §7).
- Window ordering and geometry come from the WindowServer, not AX: `WindowOrderingObserver`, `SystemSoftware.CGWindow.Observer` and `WindowServerEvent`. Its 21 cases (S.fields:2281) are `isObscured isUnobscured isOrderedIn isOrderedOut isTerminated isChangingScreens didMove didResize didChangeOrder geometryDidChange monitorDataPending didCreate rightsGrantOffered rightsGrantCompleted recordForTermination isVisible isInvisible workspaceAddWindow workspaceRemoveWindow workspaceCreated workspaceDestroyed`, fed by `WindowServerSPI.registerConnectionNotifyProc(_:callback:event:context:)` and `requestNotificationsForWindows` (S.dmfull:133920-133934).

---

## 3. Input vocabulary

### 3.1 How private (and some public) symbols are resolved: hashed soft-linking

The brief asked for `dlsym` string arguments. **There are almost none to list, because the binary does not name its SPI.** Module `SoftLink` (S.fields:2179-2211; functions S.dmfull:155599-155700) resolves symbols by **salted 64-bit SipHash**:
- `lookUpSymbol(image:symbol: UInt64, salt: String)`, `lookUpExportedSymbol(image:linkeditBase:exportTrie:symbol:salt:)`, `lookUpBatchSymbolPointers(images: [UInt64], symbolRequests: [[UInt64]], salt:)` and `lookUpImage(image: UInt64, salt:)`.
- `hash(_:appending:)`, `hashWithPrefix(_:prefix:)`, `sipHash(…)` and `SipHashState {v0…v3, pending, pendingCount, count}`.
- Image search: `ImageSearchStrategy = framework | privateFramework | library | path`, `resolveImagePaths(name:strategy:)` and `loadImageFromFilesystem(image:salt:)`.
- Path templates: `/System/Library/Frameworks/`, `/System/Library/PrivateFrameworks/`, `.framework/Versions/{A,B,C,Current}/`, `/usr/lib/system/lib` (S.strings:29236-29246), plus `__TEXT`, `__LINKEDIT`, `.dylib` (S.small:1755-1789).
- **[inference]** It walks loaded images (`_dyld_image_count`, `_dyld_get_image_header`, `_dyld_get_image_name` are imported), or `dlopen`s one from a candidate path. It then walks the export trie and compares `SipHash(name ‖ salt)` with a constant. The 28 hex strings of 125–128 characters (S.strings:28807, 29383-29428, 36538-36553) are the likely salts.
- **Evidence:** `grep -c` over `S.strings` gives 0 for each of `CGEventPostToPid`, `CGEventPost`, `CGEventCreateKeyboardEvent`, `CGEventTapCreateForPid`, `CGEventSetWindowLocation`, `SLSMainConnectionID`, `SLPSSetFrontProcessWithOptions`, `_AXUIElementGetWindow`, `AXUIElementCopyHierarchy`, `CPSReleaseKeyFocusWithID`, and `CGEventPostToPid` is absent from `S.small` too. Yet the wrappers that obviously correspond to them exist (§3.2).
- **Consequence:** the SPI names (`SLS…`, `CGS…`, `_AX…`, `CPS…`) are **not recoverable from strings**, and grepping `S.strings` for them is meaningless. What *is* recoverable is the Swift wrapper vocabulary below. Confirming each wrapper's real symbol takes the next tier: read the salt and hash constants at each call site, then hash candidate export names, e.g. from `dyld_info -exports` of SkyLight, HIServices and CoreGraphics.
- `_dlopen` and `_dlsym` are imported. The only plain-text name candidates found near them are framework paths.

### 3.2 The wrapper vocabulary (`SystemSoftware`, all `static`)

| wrapper | members (signature names) | source |
|---|---|---|
| `CGEventAPI` (24) | `create(source:)`, `createKeyboardEvent(source:virtualKey:keyDown:)`, `createScrollWheelEvent(source:units:wheelCount:wheel1:wheel2:wheel3:)`, `get/setFlags`, `get/setIntegerValueField(_:field:)`, `get/setLocation`, `getUnflippedLocation`, `get/setTimestamp`, `get/setType`, `keyboardGet/SetUnicodeString`, **`post(_:tap:)`** (0x100249f18), **`postToPid(_:pid:)`** (0x100249f24), `sourceCreate(stateID:)`, `sourceFlagsState`, `tapCreate(tap:place:options:eventsOfInterest:callback:userInfo:)`, **`tapCreateForPid(pid:…)`** (0x10024a20c), `tapEnable`, `tapIsEnabled` | S.dmfull:133850-133873 |
| `WindowServerSPI` (15) | `mainConnectionID()`, **`setWindowLocation(_: CGEvent, location:)`** (0x10025b924; an event field, so per-window event delivery **[inference]**), **`captureWindowImagesInRect(_:options:rect:connection:)`** (0x10025bbf0), `associatedWindowIDs(forWindow:)`, `getScreenRect/getWindowBounds(forWindow:…)`, `resolvedCornerRadius(forWindow:)`, `setWindowLevel`, `disableUpdate`/`reenableUpdate`, `setCursorUpdatesFromBackground(Bool)`, `register/removeConnectionNotifyProc`, `modifyConnectionNotifications`, `requestNotificationsForWindows` | S.dmfull:133920-133934 |
| `ApplicationRegistrySPI` (6) | `getProcessForPID`, `getProcessPID`, **`getKeyFocusProcess(_:flag:)`** (0x10025c498), **`releaseKeyFocus(withID:)`** (0x10025c4f8), **`setFrontProcess(_:windowID:options:)`** (0x10025c54c), `setApplicationDesiresAttention` | S.dmfull:134032-134037 |
| `AccessibilitySPI` (3 + 7 keys) | §2.3 | S.dmfull:133938-133953 |
| `PowerAssertion` | `acquire(create:release:) -> AnyCancellable`; `Error.acquisitionFailed(Int32)` | S.fields (SystemSoftware.PowerAssertion) |

- **Real imports.** The only CGEvent function imported is `_CGEventGetFlags`; there are no `_CGEventCreate*` or `_CGEventPost*` (`S.undef`). Even public CGEvent calls go through the hashed wrappers. Also imported: `_CGSMainConnectionID`, `_CGWindowListCopyWindowInfo`, `_CGWindowListCreate`, `_CGWindowListCreateDescriptionFromArray`, `_CGSessionCopyCurrentDictionary`, `_CGShieldingWindowLevel`, `_CGPreflight/RequestScreenCaptureAccess`.
- **Keyboard layout:** `_TISCopyCurrentKeyboardLayoutInputSource`, `_TISGetInputSourceProperty`, `_kTISPropertyUnicodeKeyLayoutData`, `_UCKeyTranslate`, `_LMGetKbdType`.
- **IOKit:** `_IOPMAssertionDeclareUserActivity`, `_IOPMAssertionCreateWithDescription`, `_IOPMAssertionRelease`, `_IOServiceMatching`, `_IOServiceGetMatchingService`, `_IORegistryEntryCreateCFProperty`. `IOPlatformExpertDevice` (S.strings:31162) is the hardware-id lookup. There are **no IOHID imports**, and no `HIDIdleTime` string.
- **NSEvent:** class imported. The selectors are `eventWithCGEvent:`, `mouseEventWithType:…`, `otherEventWithType:…`, `modifierFlags`, `mouseLocation`, `CGEvent`, `currentEvent` (S.strings:51155, 51408, 51479, 51768-51806). There is **no `addGlobalMonitorForEvents…`**: user input is watched with CGEvent taps (§3.4, §6.5).

### 3.3 Event synthesis and key mapping

- `SynthesizedEvent {cgEvents: [CGEvent]}` (S.fields:4678). Its senders are `send(to:)` (0x1007432e0), `send(to:delay:)` (0x1007428e4), `send(to:handler:)` (0x100742f70), and `send(delay:)` (0x100744538), which posts system-wide **[inference]**.
- Builders: `static pressKeys(_:)` (0x100743758), `static pressKeysForHolding(_:)` (0x100742828), `static type(string:)` (0x1007440cc).
- `MouseEventType = mouseDown | mouseUp | mouseDragged | mouseMoved` (S.fields:4680). `Error = invalidParameter | failedToCreateSource | failedToTranslateKeyCodes | cannotClickOffscreenElement` (S.fields:4685).
- Event targets: `MouseEventTarget {pid, element?, accessibilityWindow, windowID: UInt32, windowBounds: CGRect, windowUsesFlippedCoordinates: Bool}` (S.fields:4552) and `KeyboardEventTarget {pid, element?}` (S.fields:4559).
  - **[inference]** Mouse events are addressed to a pid *and* a window id (`postToPid` plus `setWindowLocation`). That is how clicks reach background windows.
  - `outOfProcessTarget(for:appPID:)` and `outOfProcessTargetWindow(for:appPID:)` (0x1006f6668, 0x1006f60dc) handle elements hosted by another process (view services; `UIElement.ProcessType = regularApp | viewService | nonEventHandlingProcess`).
- Click entry points:
  - `UIElementProtocol.click(_:count:delay:holdDuration:heldKey:flags:alwaysSimulateClick:in:app:focusEnforcer:virtualCursor:)` (0x10079f2cc). **[inference]** `alwaysSimulateClick` chooses between `AXPress` and a synthesized click.
  - `ApplicationUIElement.sendClick(to:at:insideWebView:andDragTo:mouseButton:count:delay:holdDuration:heldKey:flags:window:focusEnforcer:virtualCursor:)` (0x1006ebb14).
  - `UIElementProtocol.clickablePoint(scrollToVisible:)` (0x10078cb90) and `scrollToVisible(frame:)` (0x10078d864).
- Focus helpers: `focusFieldIfNeeded(in:app:focusEnforcer:)` (0x10079f434), `focus(in:app:focusEnforcer:)` (0x10079f890), `select(in:app:focusEnforcer:)` (0x10079f148), `perform(action:)` (0x10077ffdc), `setValue(_:forAttribute:)` (0x1007961b8), `setStringValue(_:)` (0x1006d4f08), `scrollUsingScrollBar(direction:)` (0x100717ab8).
- **Typing:**
  - `+[SAIVirtualKeyPress keyPressesForString:]` (0x100237730) returns `SAIVirtualKeyPress {keyCode, modifiers, string}` (`-initWithKeyCode:modifiers:string:` 0x100237690; description format `<SAIVirtualKeyPress: %d, %04x, %@>`, S.strings:29218).
  - Errors: `Unable to get current keyboard layout.`, `Unable to get keyboard layout data.`, `Unable to get keyboard layout pointer.`, `Could not find key code for character: %C` (S.strings:29214-29217).
  - **[inference]** Characters are reverse-mapped to virtual keys through `UCKeyTranslate` on the current layout. The `keyboardSetUnicodeString` wrapper exists too, so some characters may be typed as Unicode-string events. Which ones is not determinable statically (A §7 reports that emoji are dropped).
- **press_key key names** (xdotool keysyms; small strings at S.small:1558-1754, ComputerUse module). Every name below was found in the scan:
  - Named keys: `BackSpace Tab Linefeed Clear Return Pause Scroll_Lock Sys_Req Escape Delete Home Left Up Right Down Prior Page_Up Next Begin Select Print Execute Insert Redo Menu Find Cancel Help Break Mode_switch script_switch Num_Lock Back`, and `F1`–`F10`.
  - Keypad: `KP_Space KP_Tab KP_Enter KP_F1`–`KP_F4`, `KP_Home KP_Left KP_Up KP_Right KP_Down KP_Prior KP_Next KP_Page_Down KP_End KP_Begin KP_Equal KP_Multiply KP_Add KP_Separator KP_Subtract`, `KP_0`–`KP_9`. Mis-paired reads `KP_Decimht` and `KP_Page_ht` are presumably `KP_Decimal` and `KP_Page_Up`.
  - Modifiers: `Shift_L Shift_R Meta_L Meta_R Alt_L Alt_R Super_L Super_R Command` (and a mis-paired `Shift_Loht`, presumably `Shift_Lock`), plus the lowercase aliases `shift ctrl alt meta cmd super`.
  - Punctuation keysyms: `space exclam quotedbl dollar percent asterisk plus comma minus period slash colon less equal greater question at bracketright asciicircum grave bar parenright`, with mis-paired `bracketlact`, `apostropht`, `asciitilht` and `underscoht`. Also single letters, digits, and `+` as the combo separator.
  - **Not found by the scan:** `End`, `Page_Down`, `Undo`, `F11`+, `Caps_Lock`, `Control*`, `KP_Insert/Delete/Divide`, `bracketleft`, `parenleft`, `numbersign`, `ampersand`, `backslash`, `brace*`, `semicolon`. Absence is **not** proof: the keysym table is long, and pairs inside it were visibly mis-read. The authoritative table needs the next tier.
  - Also seen: `super+v` (S.small:1368).
- **Controller keyboard path:** `ComputerUseAppController.KeyboardAction = type | key | holdKey` (S.fields:430), `performKeyboardAction(_:text:duration:waitForUIToSettle:returnSkyshot:)` (0x100076f80). Errors: `Missing text to type` (S.strings:28476) and `Invalid duration` (28472).

### 3.4 Focus, activation and the virtual cursor

- **`SyntheticAppFocusEnforcer`** (S.fields:4635):
  - Fields: `pid`, `frontmostApplicationTracker`, `clickEventTap: EventTap?`, `activationEventTap: EventTap`, `activationEventSuppression: ((CGEventType, CGEvent) -> Bool)?`, and `State {applicationBelievesItIsActive, applicationBelievesItHasFocus, applicationIsActive}` (S.fields:4643).
  - `ActivationError = originalApplicationActivationFailed | frontmostApplicationChanged` (S.fields:4647).
  - Methods: `enforceActiveState(for:)` (0x100730214), `safelyEnforceActiveState(for:)` (0x100730ac0), `synthesizedActionWasPerformed()` (0x10073501c), `start/stopSuppressingMenuDismissalEvents(menuPID:)` (0x100734c5c/0x100734e94), `deactivateFocusEnforcer()` (0x100734950).
  - **[inference]** It makes the target app *believe* it is active and focused while the user's frontmost app stays frontmost: activation and click events are synthesized to the pid and suppressed through taps. The fallback is a real activation that restores the original frontmost app, which is where `originalApplicationActivationFailed` comes from.
- **`SystemFocusStealPreventer`** (S.fields:4650-4670):
  - Fields: `disallowedThiefProcesses: [DisallowedThiefProcess {pid, targetLostFocusHandler, targetGainedFocusHandler, keyboardEventTap, mouseEventTaps, isMenuDismissalSuppressionEnabled}]` and `systemState {currentFocus, previousFocus, lastViewBridgeFocusStealWasSuppressed, suppression: FocusStealSuppression {thiefPID, thiefAppPID?, victimPID, releasedTheft, suppressedReturnEvent}}`.
  - `Focus = regularApp(pid) | viewService(hostApp, viewService?, isAuxiliary)`. The taps are `systemProcessNotificationTap` and `viewBridgeKeyboardTap`.
  - Observed process notifications: `kCPSNotifyTypingFocusChanged`, `…LostTypingFocus`, `…KeyFocusChanged`, `…KeyFocusReturned`, `…KeyFocusTaken`, `…LostKeyFocus`, `…NewFront`; log `focusThiefAlsoStoleTypingFocus: ` (S.strings:31338-31345).
  - **[inference]** When the controlled app (or a view service it spawns) steals key focus from the user's app, the theft is detected through CPS process notifications and handed back (`releaseKeyFocus(withID:)`, `setFrontProcess(_:windowID:options:)`).
- **`EventTap`** {`onEventReceived`, `eventTypes: UInt64`, `location: systemwide(CGEventTapLocation) | process(pid)`, `placement`, `options`, `shouldAutoreenable`, …} (S.fields:4623, 4632).
- **Controller hooks:** `activateFocusEnforcer()` (0x10006ee50), `activate()` (0x10006eef8), `deactivate()` (0x10006f3b8), `prepareToInteract(with:cursorNextInteractionTiming:positionElement:)` (0x10006fcf4), `positionElement(_:cursorNextInteractionTiming:axTree:)` (0x100070460), `moveMouse(to:cursorNextInteractionTiming:)` (0x10007ae24), `scroll(deltaX:deltaY:)` (0x10007df90). Fields `visibleRect`, `scalingFactor`, `scaledScreenSize`, `cursorPositionInScaledCoordinates` (S.fields:395).
- **Virtual cursor:** `virtualCursor: ComputerUseCursor?` and `createVirtualCursorIfNeeded()` (0x10006bb70).
  - Types: `ComputerUseCursor` (`ActivityState`, `CloseEnoughConfiguration`, `MotionConfiguration(clickAngle:candidateCount:boundsMargin:…)` at 0x10008c0c8, `Style`), `CursorNextInteractionTiming = closeEnough | finished` (S.types; S.fields:`ComputerUse.ComputerUseCursor.CursorNextInteractionTiming`), `AgentCursor`, `FogCursorStyle` and `SoftwareCursorStyle`. The selector is `setComputerUseCursorLocationWithX:y:isActive:withReply:` (S.strings:51976).
  - **[inference]** The cursor is a drawn overlay; the real pointer is not moved. `WindowServerSPI.setCursorUpdatesFromBackground` exists, and `positionElement`'s `closeEnough` timing lets an action proceed before the animation ends.
- **Power and user activity:** labels `Codex Computer Use interaction`, `Keeping the display awake while Computer Use handles a request.`, `Computer Use user activity`, `Computer Use display sleep prevention` (S.strings:28583-28584, 28788-28789). **[inference]** `IOPMAssertionDeclareUserActivity` is called per request, plus a display-sleep assertion while a request runs.

### 3.5 Pasteboard and paste

- Selectors used: `generalPasteboard`, `clearContents`, `changeCount`, `pasteboardItems`, `types`, `dataForType:`, `stringForType:`, `setData:forType:`, `setDataProvider:forTypes:`, `writeObjects:`, `initWithPasteboardWriter:` (S.strings:51108-52316). Classes: `NSPasteboard`, `NSPasteboardItem` (`S.undef`).
- **Lazy provider:** `PasteOperation.PasteboardDataProvider` implements `pasteboard:item:provideDataForType:` (0x1001b57a0) and `pasteboardFinishedWithDataProvider:` (0x1001b582c).
  - **[inference]** The paste writes a pasteboard item whose data is provided lazily. The provider's callback tells the service the target app has read the clipboard, after which the previous contents are restored.
  - This explains the three sentences: `Timed out waiting for the application to read the clipboard`, `The user may have conflicted with your paste operation…` (raised when `changeCount` moved unexpectedly **[inference]**) and `Could not write generated content to the clipboard` (S.strings:28473-28475).
- **Formats:** `md` and `html` go through `SlimCore.RichText.WebViewPasteboardProvider` (`copy(to:)` 0x100ef1f54, `operationCompletion(for:)` 0x100ef2408), which renders rich text in a `WKWebView` before copying **[inference from the type and the imported WKWebView]**.
- Controller: `performPaste(text:format:returnSkyshot:)` (0x10007da6c).

---

## 4. Capture

### 4.1 ScreenCaptureKit surface

- **Classes imported** (`S.undef`): `SCContentFilter`, `SCDisplay`, `SCScreenshotManager`, `SCShareableContent`, `SCStream`, `SCStreamConfiguration`, `SCWindow`. **Constants:** `SCStreamFrameInfoBoundingRect`, `…ContentRect`, `…Status`.
- **Selectors** (`__objc_methname`):

| use | selectors | S.strings |
|---|---|---|
| content discovery | `getShareableContentWithCompletionHandler:`, `getShareableContentExcludingDesktopWindows:onScreenWindowsOnly:completionHandler:`, `getCurrentProcessShareableContentWithCompletionHandler:` | 51544, 51543, 51525 |
| filters | `initWithDesktopIndependentWindow:`, `initWithDisplay:excludingWindows:`, `initWithDisplay:includingWindows:`, `pointPixelScale` | 51595, 51597, 51598, 51110 |
| single shot | `captureImageWithFilter:configuration:completionHandler:` (`SCScreenshotManager`) | 51334 |
| streams | `addStreamOutput:type:sampleHandlerQueue:error:`, `startCaptureWithCompletionHandler:`, `stopCaptureWithCompletionHandler:`, delegate `stream…`/`streamDidBecomeActive`/`streamDidBecomeInactive`/`streamError` | 51233, 52146, 52159, 52162-52166 |
| `SCStreamConfiguration` setters **present** | `setWidth:` `setHeight:` `setPixelFormat:` `setShowsCursor:` `setSourceRect:` `setShouldBeOpaque:` `setIgnoreShadowsSingleWindow:` `setIgnoreShadowsDisplay:` `setMinimumFrameInterval:` `setQueueDepth:` `setCapturesAudio:` `setExcludesCurrentProcessAudio:` `setSampleRate:` `setChannelCount:` | 52126, 52024, 51224, 51137, 52089, 52086, 52030, 52029, 52057, 52075, 51968, 51127, 52080, 51970 |
| setters **absent** (`grep -cxF` = 0 each) | `setScalesToFit:` `setCaptureResolution:` `setColorSpaceName:` `setIncludeChildWindows:` `setDestinationRect:` `setPreservesAspectRatio:` `setShowMouseClicks:` `setCaptureDynamicRange:` `setIncludesWindowShadow:` `setIgnoreGlobalClipSingleWindow:` | — |

- **[inference]** Window shots use a desktop-independent-window filter (or a display filter that includes the window list). Their size comes from `setWidth:`/`setHeight:` × `pointPixelScale`. Shadow control is `setIgnoreShadowsSingleWindow:`, matching `SkyshotOperation.screenshotIncludesWindowShadow` and `screenshotShouldBeOpaque` (S.fields:1912).
- `ComputerUse.CaptureStream {outputType: SCStreamOutputType, sampleBufferHandler, errorHandler, stream: SCStream?}` (S.fields:316) is the stream path. **[inference]** It serves appshot and PiP, not `get_app_state`.

### 4.2 The skyshot screenshot path

- **`SkyshotOperation`** (S.fields:1912): `context: FocusedUIElementContext`, `contextType`, `axTreeRootElement?`, `overrideScreenshotWindowID: UInt32?`, `additionalScreenshotWindowIDs: [UInt32]`, `screenshotEncoding: ScreenshotEncoding`, `screenshotShouldBeOpaque`, `screenshotIncludesWindowShadow`, `enableAXDiffing`.
  - Methods: `capture(treeCache:imageSize:includeScreenshot:continuingFrom:performAccessibilityEnablement:)` (0x100224a9c) and `captureScreenshot(imageSize:)` (0x100226da0).
  - `Capture {context, axTree: SystemSelection, screenshot: CGImage?, screenshotFile: ScreenshotFile?, url?}` (S.fields lists it with `SkyshotOperation`).
- **`SlimCore.ScreenshotImplementation`** (static):
  - `captureScreenshotBuffer(appName:delay:imageSize:includedWindowIDs:cropToFirstWindow:shouldBeOpaque:includeWindowShadow:)` (0x100eaf10c)
  - `captureScreenshotFile(appName:delay:imageSize:includedWindowIDs:cropToFirstWindow:)` (0x100eaeef8)
  - **`captureScreenshotWithSkyLight(windowIDs:rect:)`** (0x100eadc98), which uses `WindowServerSPI.captureWindowImagesInRect` **[inference]**
  - `writeScreenshotToFile(appName:screenshot:encoding:)` (0x100eaf220)
  - `bestMatchingWindow(in:for:)` (0x100eb11bc)
- **Signpost names:** `Capture Accelerated Window Screenshot`, `Capture Screenshot File`, `Get Shareable Content`, `Screenshot Implementation` (S.strings:36231-36236); `Capture Screenshot`, `Write Screenshot File` (29195-29196).
- **Errors:** `The screen capture failed.`, `The screen capture size is invalid: ` (36237-36238) = `ScreenshotImplementation.Error.invalidCaptureSize(CGSize) | screenCaptureFailed` (S.fields:14163); `No capturable window found: ` (28479).
- **[inference]** There are two capture back ends: SCK (`SCScreenshotManager`) and a SkyLight window-list capture ("accelerated"). Which one is the default is not visible; the config key `should_use_legacy_screenshot_sizing` (29139) suggests switchable sizing.
- **Window selection:**
  - `ApplicationUIElement.cgWindowListForMatching`, `matchingCGWindow(forWindow:fromWindowList:)`, `matchingWindow(forCGWindow:fromWindowList:)` (`ax_members.txt`) and `AccessibilitySPI.getWindowID`.
  - `SystemSoftware.CGWindow {id, ownerPID, bounds, level, name?, ownerName?, isOnscreen?}` (S.fields:2245) is read from `kCGWindowNumber/OwnerPID/Bounds/Layer/Name/OwnerName/IsOnscreen` (`S.undef`) and `CGWindowListCopyWindowInfo`.
  - `WindowServerSPI.associatedWindowIDs(forWindow:)` returns related windows. **[inference]** These are sheets, popovers and menus, which go into `additionalScreenshotWindowIDs` with `cropToFirstWindow` cropping to the key window.
  - `FocusedUIElementContext.Error = noAppNameMatch(String) | noFrontmostApp | noWindowsAvailable | cgWindowNotFound | invalidProcessIdentifier` (S.fields:4823). `noWindowsAvailable` is the error cua sees for a windowless app (A §1.5).
- **Encoding:**
  - `SlimCore.ScreenshotEncoding = jpeg(compressionQuality: CGFloat?) | png` (S.fields:14147); `ScreenshotFile {file, url, mimeType}` (14150). MIME literals `image/jpeg`, `image/png` sit in `writeScreenshotToFile` (S.small:10896-10897).
  - Writer: `ImageDestination.init(url:forType:)` (0x100f324e0), `add(image:compressionQuality:)` (0x100f325d0), `addImage(from:at:maxPixelSize:)` (0x100f32754), with `kCGImageDestinationLossyCompressionQuality` and `kCGImageDestinationImageMaxPixelSize` (`S.undef`).
  - **HEIC is absent:** there is no `public.heic`, `image/heic` or `HEIC` string. The default quality value is **not visible statically**; it is overridable by config key `jpeg_compression_quality` (S.strings:29141).
- **Sizing:**
  - Config keys `should_use_legacy_screenshot_sizing` and `should_normalize_screenshot_to_point_resolution` (S.strings:29139-29140).
  - Controller fields `scalingFactor`, `scaledScreenSize`, `cursorPositionInScaledCoordinates` (S.fields:395), and `CursorPosition.applying(scalingFactor:convertingToScreenFromWindowFrame:)` (0x10007e97c).
  - **[inference]** Screenshot pixels are scaled from window points by `scalingFactor`, possibly normalised to point resolution (1×). Model coordinates are converted back through the same factor. The factor's value is not visible.
- **Screenshot omission:** `SkyshotClassifier` (S.strings:29136) behind `feature/skyshotClassifier` "Enables classifier to determine if Skyshot contains image or not." (36277-36278). It feeds `SystemSelection.screenshotNeededForContext` (S.fields:1934) through `updateScreenshotNeededUsingClassifier(screenshot:)` (0x10022761c). `updateSkyshot(treeCache:disableAXDiffing:skipScreenshot:)` (0x10006bdf4) and `SystemSelectionExtractor.shouldUseFullSkyshot(for:)` (0x10022f4f4) also exist.
  - **[inference]** With the feature on, a skyshot may carry no screenshot (IPC `screenshot: null`) when the classifier finds no image content. The flag's default is not visible.
- **Files:** the controller keeps `skyshotImageFiles: Set<SlimCore.File>` (S.fields:395), i.e. it owns and deletes the temp images **[inference]**. A §3.7 records the `file://` URL behaviour.

---

## 5. Text grammar strings

Everything that can reach the model-visible `skyshot.text`. Long literals are in `__cstring` (S.strings); short ones are small strings (S.small). The order of pieces is **[inference]** from the order the literals are materialised in one function, which is how Swift lays out string interpolation.

### 5.1 Header and trailer (`AccessibilityTreePresentation`)

`AccessibilityTreePresentation {text, focusedElement: String?, selectedText: String?, selectedElements: [String]}` (S.fields:3976), built by `AccessibilityTreePresentation.init(windowTitle:applicationName:treeLines:focusedElement:selectedText:selectedElements:)`.

| piece | literal | source |
|---|---|---|
| window header | `Window: "` · title · `", App: ` · app name · `.\n` | S.small:2652-2654 |
| a second header form | `Window: "` · `"` · ` for ` … (in `SystemSelection.llmDescription(_:lineOptions:)`) | S.small:1544-1547 |
| focused element | `The focused UI element is ` | S.strings:31210 |
| selected text | `Selected text: ```` · text · `\n```` | S.strings:31211; S.small:2657 |
| selected elements | `\nSelected:\n` | S.small:2658 |
| selection note | `Note: Pay special attention to the content selected by the user. If the user asks a question or refers to the content they are looking at on-screen, they might be referring to the selected content (but they might be referring to something else that's visible, too).` (two variants) | S.strings:31208-31209 |

**`App=`** occurs only in module `ComputerUseClient`, inside the legacy MCP server's formatting:
- `App=` · ` (pid ` · `)\n` (S.small:9407-9409, 9462-9463)
- `App=` · ` (bundleID ` · `, pid ` · `)\n` (9442-9445)
- wrappers `\n<app_state>\n` … `\n</app_state>` (9448-9449)

cua's test double begins its text with `App=com.apple.TextEdit\n` without a pid (`C/test/native-baseline/textedit-double.mjs:17`), and the JS adds no `App=` (no match under `S/`). **Unresolved statically:** whether the IPC `skyshot.text` carries an `App=` line, and in what form. The ComputerUseCore presenter starts at `Window: "`. Either the scan missed an `App=` site, or the double's first line differs from the real output. A recorded real `get_app_state` text settles it.

### 5.2 Element lines

`UIElementRender {id, elementID: Int?, text, detailText: String?, sourcePath, children}` (S.fields:4000) is rendered by `UIElementRender.line(indent:indentCount:options:)` (0x10062d85c), with `UIElementRenderLineOptions` an `Int` option set (S.fields:4007). Literals in the ComputerUseCore presenter (S.small:2606-2645, nearest named function `AccessibilityNode.accessibilityDescription<A>(for:)`):

| class | literals |
|---|---|
| indentation, separators | `\t`, `\n`, ` `, `, `, `: `, `(`, `)`, `-`, `_` |
| labelled fields | `Description`, `Value`, `Help`, `URL`, `Details`, `Placeholder`, `ID`, `Rows`, `Columns`; `Secondary Actions` (S.strings:31206) |
| flags (inside `(…)`) | `selected`, `disabled`, `expanded`, `settable`, `selectable`, `settable, ` |
| role-kind fallbacks | `unknown`, `container`, `row`, `element`, `menu`, `menu bar` |
| diff markers | `~`, `+`, `-` |
| misc | `NS` (prefix stripped from class names **[inference]**), `Debug` |

- **Role column:** `TransformedUIElement.roleDescription: String?` is read (S.fields:4717), and `AXRoleDescription` is in the vocabulary (S.strings:31465). With A §3.2's Korean observation, the role column is the localized `AXRoleDescription` **[inference, strongly supported]**. The fallback when it is absent is a role-kind word (`AccessibilityRoleKind = button checkBox menu menuBar menuBarItem menuButton menuItem radioGroup row generic other`, S.fields:3931) **[inference]**.
- **Flattened roles:** `UIElementFlattenedRole {separator, description, targetDescription}` (S.fields:3962), with AccessibilitySupport literals `radio button`, `radio buttons`, `outline row`, `rows` (S.small:2891-2894). **[inference]** A container flattened into its selectable child is described as "<target> <separator> <container>", with English plurals.
- **Values:**
  - `AccessibilityPresentationValue {title?, value, isLong}` (S.fields:3969): long values are flagged, and **[inference]** printed differently, as a fenced or block value.
  - `AccessibilityValueType = boolean | integer | float | string` (S.fields:3943), with literals `boolean`, `float`, `string`, `integer` (S.small:2579-2582).
  - `TransformedUIElement.valueTypeName` (S.fields:4717).
- **Actions:** `AccessibilityPresentationAction {kind: press | showMenu | scrollToVisible | other, description}` (S.fields:3949-3952). AccessibilitySupport has English action names `Decrement`, `Show Default UI`, `Scroll Left`, `Scroll Right`, `Scroll Down` (S.small:2987-2991). **[inference]** These are fallbacks when `AXUIElementCopyActionDescription` returns nothing; the system description (localized) wins otherwise.
- **Partial arrays:** `UIElementTree.Item.availableSubsetDescription` renders `(showing ` · n · ` of ` · m · ` items)` (S.small:2713-2715).
- **Depth:** `Max depth exceeded` (S.strings:31225) and `UIElementRenderTreeLineError.invalidDepth(Int, maxDepth: Int)` (S.fields:4040). A maximum depth exists; its value is **not visible**.
- **Not model-facing:** `UIElement.debugDescription` uses `Role: `, `Subrole: `, `Value: `, `Title: `, `Description: `, `Help: `, `Identifier: ` (S.small:2979-2986), and `IdentifiableWindow.debugDescription` uses `<untitled>`, ` (ID `, `; app ` (2960-2967). Both are debug output and should not be copied into the grammar.

### 5.3 Tree shaping (what is pruned, merged, flattened)

`UIElementTreeTransformation` (S.fields:4100) is applied by `UIElementTreeTransformation.transform(item:context:rebuild:providerTitle:render:)` (0x1006473d0). Its cases: `associateTitleUIElements`, `flattenIntoSelectableAncestor`, `pruneNonDescriptiveSubtrees`, `pruneEmptyDisabledElements`, `mergeSingleItemGroups`, `flattenRedundantHierarchy`, `flattenRepetitiveStaticText`, `flattenLinksIntoMarkdownText`, `mergeTextOnlySiblings`.

The Mac additions (`MacUIElementTreeTransformation`, S.fields:4711) are `shared(…)`, `filterActions`, `removeElementsUnderCalendarEvents`, `retrieveAttributedTextFromTextAreas` and `retrieveAttributedTextFromWebAreas`.

`Result = transformed(Item) | replaced(Item) | removed | unchanged` (S.fields:4110).

### 5.4 Markdown, attributed text, links

- **Spans:** `TransformedUIString` interpolation spans are `string(String) | url(String, url: URL, isImage: Bool)` with `sourceOffsets` (S.fields:3989-3994), so links and images become Markdown. The Markdown literals are `[`, `](`, `]`, plus escapes `\[` and `\]` (S.small:2660-2666).
- **Style names:** `Title`, `Heading`, `Subheading`, `Body`, `Fixed width`, `Contains paragraphs`, `Expanded`, `Collapsed` (S.strings:31269-31276). **[inference]** These map attributed-string styles to Markdown heading levels and code.
- **Writer:** `AXAttributedStringMarkdownWriter` (S.strings:22620); the Swift `Markdown` module is linked (S.types: 68 types).
- **URL shortening:** `UIElementURLShortener {configuration: {individualLimit: Int?, totalLimit: Int?, includeQuery: Bool, includeFragment: Bool}, accumulated, domains, urls}` (S.fields:4115-4120), applied by `UIElementTransformationContext.shortenURLsIfNeeded(totalLength:body:)` (0x1007478ac). Literals: `link`, `webdoc`, `data`, `https`, `http`, `www.`, `//`, `…` (S.small:2722-2733).
  - **[inference]** Long URLs are cut with `…`, `data:` URLs are elided, and there is a total URL budget per tree. The limit values are **not visible**.
- **Per-app link note:** Spotify (S.strings:29197-29198) is appended to the text for `com.spotify.client`. A Google Docs host regex `#/(?i)(?:^|\.)docs\.google\.[a-z.]+$/#` (29208) marks a special case **[inference]**.

### 5.5 Diff and no-change text

| piece | literal | source |
|---|---|---|
| previous-baseline header | `The following is a diff from the previous accessibility tree` | S.strings:29199 |
| cumulative header | `The following is a cumulative diff from the initial accessibility tree` | 29202 |
| legend, removals listed | `with ~, +, and - representing changed, added, and removed elements, respectively.` | 29200 |
| legend, removals summarised | `with ~ and + representing changed and added elements, respectively. Removed elements are summarized by ID range.` | 29201 |
| removed list | `Removed element IDs: ` | 31207 |
| no change | `There has been no change in the accessibility tree for ` (its continuation is not a C string; **not visible**) | 29203 |
| short form elsewhere | `There has been no change` (event-stream area), and `no_change` (S.small:1540) | 28630 |

- **Machinery:**
  - `SystemSelection.LLMDescriptionMode = difference(from: DifferenceBaseline) | fullTree` and `DifferenceBaseline = initial | previous` (S.fields:1942-1945).
  - `UIElementTreeRevision.differenceLines(from:options:summarizesRemovedElementIDs:ignoreDifferenceLineBudget:onLineBudgetExceeded:)` (0x100618ddc).
  - `AccessibilityDifferenceLineBudgetExceeded = difference(fullTreeLineCount: Int) | removedElementSummary(fullTreeLineCount: Int)` (S.fields:3973).
- **Feature flags:** `feature/axTreeDiffing` "Enables AX tree difference rendering." and `feature/axTreeDiffingRemovedElementIDRanges` "Summarizes removed AX tree elements as consolidated ID ranges in diff rendering." (S.strings:36279-36282). The two legend variants above correspond to the second flag, and diffing as a whole is flag-gated. Defaults are **not visible**, but A §3.4's observed diffs imply the first flag is on in the pinned runtime.
- **[inference]** A diff that would be too long relative to the full tree's line count is abandoned for the full tree. A removed-element list that is too long is replaced by the ID-range summary, hence the two legend variants. The budget values are **not visible**.
- **Change records:** `Change = none | insert(offset, new) | update(offset, new, old) | remove(offset, old)` (S.fields:4015; the `none`/`update` payloads hand-read from the `RAW<…>` as `(offset: Int, new: Cursor, old: Cursor)`). The debug strings `No change at `, `Update at `, ` from '`, `' to '`, `Insertion at ` (read `Insertioe at `), `Removal at `, ` with '` (S.small:2673-2680) are `Change` descriptions, **[inference]** not model text.

---

## 6. Policy and safety catalogue

### 6.1 Bundle-identifier lists

The list names are facts (`SystemSoftware.BundleIdentifiers`, S.dmfull:133977-134016): `systemSecurityBundleIdentifiers`, `elevatedRiskBundleIdentifiers`, `terminalBundleIdentifiers`, `browserBundleIdentifiers`, `chromiumBrowserBundleIdentifiers`, `chatGPTBundleIdentifiers`, `computerUseHostBundleIdentifiers`, `iPhoneMirroringBundleIdentifier`, `finderBundleIdentifier`, `isForbiddenComputerUseTarget(_:)`, `allowsForbiddenComputerUseTargets`, `allowForbiddenComputerUseTargetsUserDefaultsKey`.

**Membership is [inference]** from string order. The linker **uniques** C strings, so an id used in two lists appears once (e.g. `com.google.Chrome` at S.strings:27900 sits with the Chrome-extension strings, not with the browsers).

| apparent list | ids, in binary order | source |
|---|---|---|
| iPhone Mirroring | `com.apple.ScreenContinuity` | S.strings:29247 |
| password managers / keychain (**forbidden** **[inference]**) | `com.apple.keychainaccess`, `com.apple.Passwords`, `com.1password.1password`, `com.1password.safari`, `com.bitwarden.desktop`, `com.dashlane.dashlanephonefinal`, `com.lastpass.LastPass`, `com.nordsec.nordpass`, `me.proton.pass.electron`, `me.proton.pass.catalyst` | 29248-29257 |
| terminals (**elevated risk** **[inference]**) | `com.apple.Terminal`, `com.googlecode.iterm2`, `dev.warp.Warp-Stable`, `net.kovidgoyal.kitty`, `com.github.wez.wezterm`, `com.mitchellh.ghostty`, `com.raphaelamorim.rio`, `dev.commandline.waveterm`; small strings `org.alacritty`, `co.zeit.hyper`, `org.tabby` | 29258-29265; S.small:12559-12561 |
| Codex / ChatGPT hosts | `com.openai.codex{,.alpha,.beta,.dev,.nightly}`, `com.openai.chat.{alpha,beta,nightly,mac-debug}`; small `com.openai.chat`; Sky `com.openai.sky.app`, `com.openai.sky.development.app` | 29266-29274; S.small:12562; 28391-28392 |
| browsers (**elevated risk** **[inference]**) | `com.apple.Safari`, `com.openai.atlas{,.alpha,.beta}`, `ai.perplexity.comet`, `com.brave.Browser`, `com.microsoft.edgemac`, `com.operasoftware.Opera`, `com.vivaldi.Vivaldi`, `company.thebrowser.Browser`, `company.thebrowser.browser`, `company.thebrowser.dia`, `org.chromium.Chromium` | 29275-29287 |
| more browsers | `com.apple.SafariTechnologyPreview`, `org.mozilla.firefox`, `org.mozilla.nightly`, `com.duckduckgo.macos.browser` | 29400-29403 |
| system security processes (**forbidden**) | `com.apple.UserNotificationCenter`, `com.apple.LocalAuthenticationRemoteService`, `com.apple.SecurityAgent` | 29288-29290 |
| Finder / Dock | `com.apple.finder`; small `com.apple.dock` | 29390; S.small:12544 |
| Skysight exclusions (not CU **[inference]**, beside `include_/exclude_application/url`) | `com.apple.WindowManager`, `com.apple.controlcenter`, `com.apple.notificationcenterui`, `com.apple.LocalAuthentication.UIAgent` | 28355-28362 |

- **Override:** UserDefaults key **`ComputerUseAllowForbiddenTargets`** (S.strings:29389) turns forbidden targets into allowed ones (`allowsForbiddenComputerUseTargets`).
- **Private windows:** `PrivateBrowsingIndicators.isPrivateBrowserWindow(bundleIdentifier:title:)` matches localized title fragments: "(Incognito)", "(Inkognito)", "(Private)", "(Privat)", "(Gizli)", "Navegação privada", "Privates Surfen", … These sit at S.strings:29291-29320 (UTF-8 fragments) and 52976-53032, and in small-string data S.small:12563-12575.
- **Ambiguous app:** `Ambiguous app identifier '` · x · `'. Multiple apps share this bundle identifier: ` · list · `. Use an app name or full app path instead.` (29397-29399).

### 6.2 Error and refusal sentences (model-visible through `error.message`, A §1.1)

The code comes from the closest `ServerError.Code` case (A §1.5); "?" means the mapping is not shown by strings.

| sentence | code | source |
|---|---|---|
| `Computer use actions are not allowed for system security process: ` · id | appNotAllowed −10006? | S.strings:28464 |
| `Computer Use is not allowed to use the app '` · id · `' for safety reasons.` | (MCP path) forbidden | 33872-33873 |
| `Computer Use is blocked from using the app '` · id · `' by your organization's policy.` | (MCP path) denied | 33949-33950 |
| `Allow ChatGPT to use ` · name … (MCP elicitation text) | — | 33928 |
| `Computer Use could not persist the approval permanently for app '` / `…permission request canceled for app '` / `…approval denied via MCP elicitation for app '` | — | 33946-33948 |
| `Allowing ChatGPT to use this app introduces new risks, including those related to prompt injection attacks, such as data theft or loss. Carefully monitor ChatGPT while it uses this app.` | (risk `high` subtitle) | 28843 |
| `Computer Use is disabled by your configuration.` | ? | 28844 |
| `Computer Use stopped due to encountering a disallowed URL: ` · url | blockedURL −10015 | 28576 |
| `The user changed '` · app · `'. Re-query the latest state with `get_app_state` before sending more actions.` | userIntervened −10016 | 28792-28793 |
| `The user is still interacting with '` · app · … · ` seconds and retry.` (the middle is a small string, not recovered) | userIntervened −10016 | 28794-28795 |
| `The Mac is locked and automatic unlock could not unlock it. Ask the user to unlock the Mac manually before continuing.` | screenLocked −10020 | 28822 |
| `The Mac is locked and automatic unlock is paused because physical input was detected. …` | screenLocked −10020 | 28823 |
| `The Mac is locked and this Computer Use request cannot be associated with a ChatGPT thread. …` | screenLocked −10020 | 28824 |
| `The element ID is no longer valid. Try to get the on-screen content again and see if that resolves the issue.` | ? (RefetchableSkyshotAXTree.Error.elementNoLongerValid*) | 29190 |
| `The element was invalidated, and an attempt was made to refetch it, but the refetch couldn't be finished because multiple elements were found that match the criteria. …` / `…couldn't be started because…` | ? (`elementAmbiguousAfterRefetch` / `…BeforeRefetch`) | 29191-29192 |
| ` is an invalid element ID` | ? (`invalidElementID(Int)`) | 29194 |
| `The skyshot is unexpectedly missing an invalidation monitor. …` | (`noInvalidationMonitorProvided`) | 29193 |
| `Could not find the requested text to select in the element` | ? | 28465 |
| `Cannot select text for an element that does not support a settable selected text range` | ? | 28466 |
| `Cannot set a value for an element that is not settable` | ? | 28467 |
| x · ` is not a valid secondary action for ` · element | ? | 28468 |
| `AX tree unexpectedly missing.` / `UI tree capture failed.` / `Failed to capture AX payload: ` | ? | 28469, 28791, 28631 |
| `Missing scroll amount` / `Missing scroll direction` / `Missing text to type` / `Invalid duration` | ? | 28470-28472, 28476 |
| `The user may have conflicted with your paste operation. Check the app's state to ensure the user's content did not paste instead of your intended content before continuing.` | ? | 28473 |
| `Timed out waiting for the application to read the clipboard` / `Could not write generated content to the clipboard` | ? | 28474-28475 |
| `Menu mouse action not supported` / `Failed to click menu item` | ? | 28477-28478 |
| `No capturable window found: ` / `Running application not found: ` | ? / runningApplicationNotFound −10007 | 28479-28480 |
| `Computer Use server error <code>: <reason>` (envelope, A §1.5) | all | A §1.5 (`H:33874`) |

`RefetchableSkyshotAXTree.Error` (S.fields:1905) = `invalidElementID(Int) | noInvalidationMonitorProvided | elementAmbiguousBeforeRefetch | elementAmbiguousAfterRefetch | elementNoLongerValid | elementNoLongerValidAfterRefetch`. There are six cases and four sentences: the two "no longer valid" cases share 29190 **[inference]**. `SynthesizedEvent.Error.cannotClickOffscreenElement` (S.fields:4685) has no sentence of its own.

### 6.3 User intervention

- `ComputerUseUserInteractionMonitor {onAppInterrupted: (String) -> (), currentProcessID, resolveTarget: (EventData) async -> String?, monitoringLoop, state}` with `EventData {sourcePID, targetPID, windowID?}` (S.fields:675).
  - **[inference]** Real input events are watched (taps, §3.4), events from the service's own pid are ignored, and each event is resolved to the target app it hit.
- `ComputerUseAppInstanceManager` (S.fields:622-632) keeps `interventionReasonByTargetIdentifier: [String: InterventionReason]` and `userInterruptionDebounceTaskByTargetIdentifier`, with `userInteractionDebounceDuration: Duration`.
  - `InterventionReason = userInterruptedControlledApp(UserInterruptedIntervention {requiresRequery: Bool, debounceDeadline: Date?}) | stoppedByUser`.
  - Methods: `registerUserInterruptedIntervention(for:)` (0x1000a248c), `clearUserInterruptedInterventionAfterStateRequery(for:)` (0x1000a2e5c), `markStoppedByUser(for:)` (0x1000a1598), `wasStoppedByUser(for:)` (0x1000a1cc0).
  - **[inference]** After the user touches the controlled app, actions fail with "still interacting … seconds" until the debounce deadline passes. They then fail with "The user changed …" until a `get_app_state` re-query clears `requiresRequery`. "Stopped by user" gives `userStoppedSession` (−10012).

### 6.4 Lock screen

- Distributed notifications: `com.apple.screenLockUIIsShown`, `com.apple.sessionagent.screenLockUIIsShown`, `com.apple.screenIsLocked`, `com.apple.sessionagent.screenIsLocked`, `com.apple.screenIsUnlocked`, `com.apple.sessionagent.screenIsUnlocked` (S.strings:29166-29171).
- Types: `SystemLockScreenMonitor(lockUISettleDelay:lockUIFallbackDelay:)` (0x100219dc8), `SystemLockScreenAXInteractor` targeting `UserPasswordTextField` (29144-29145), `SystemLockScreenController {pollInterval, submitDelay, verificationDelay, loginAuthorizationBrokerFactory, …}` (29146-29151), `SystemLockScreenPhysicalInputMonitor(ignoredProcessID:)` with `start(onPhysicalInput:)` (0x10021f28c), and `maxAttemptsPerLockedEpisode` (28900).
- Overlay text: `ChatGPT is Using Your Mac`, `Press any key or click to unlock` (29179-29180).
- The Guardian process is out of scope. Its XPC and rendezvous errors are at 27973-27978 and 29211-29212.

### 6.5 URL policy and configuration switches

- **URL policy types:** `ComputerUseURLBlocklist`, `ComputerUseURLBlocklistCache`, `ComputerUseURLPolicyChecking`, `AuraSiteStatusURLPolicyChecker`, `SiteStatusResponse`, `SiteStatusRequestError` (S.strings:21173-21180, 28573). The service base `https://chatgpt.com/backend-api` (28790) is **[inference]** the site-status endpoint host. The `ComputerUseIPCClient.Error.blockedURL(url:)` sentence is at 28576.
- **Kill switch:** `Computer Use is disabled by your configuration.` (28844). The config literals `features` and `computer_use` are adjacent (S.small:515-521), and `CODEX_HOME`/`.codex` sit in `CodexHomeDirectory.url(environment:homeDirectoryURL:)` (S.small:8132-8134). **[inference]** The switch is `[features] computer_use = false` in `$CODEX_HOME/config.toml` (A §2.7 recorded `features` type errors).
- **Service-side config keys:** `ax_prefetch_enabled`, `ax_prefetch_disabled_bundle_ids`, `should_use_legacy_screenshot_sizing`, `should_normalize_screenshot_to_point_resolution`, `jpeg_compression_quality`, `chrome_extension_install_enabled` (29137-29142). Feature flags: `feature/skyshotClassifier`, `feature/axTreeDiffing`, `feature/axTreeDiffingRemovedElementIDRanges`, `feature/screenshot`, `feature/computerUsePersonalInstructionsOverridesBuiltIn` ("Custom personal instructions for Computer Use replaces Built In instructions completely") (36277-36312).
- **Browser note:** `## Browser Computer Use` · "When navigating to a new website or starting a separate web task, prefer opening a new tab…" (28398-28399). **[inference]** It is appended to `appSpecificInstructions` for browsers.

---

## 7. Timing and limits

Swift `Duration` and numeric literals are instruction immediates, so **values are almost never visible statically**. The table lists every named knob found, with its value where one is visible.

| knob | where | value |
|---|---|---|
| IPC frame size | `ComputerUseIPCJSONRPCSocketConnection.maximumFrameSize: Int` (S.fields:1172); errors `frame is too large: `, `Response exceeds maximum frame size` (S.strings:28875, 28848) | not visible (JS side: 8 MiB, A §2.2) |
| socket I/O timeout | `ioTimeout: Duration` (S.fields:1172, 1180) | not visible |
| request deadline | client-supplied `deadlineUnixMilliseconds`; server error `Request deadline exceeded` (28849) | client default 120 s (A §2.2) |
| listener retry | `retryAttempt`, `retryWorkItem` (S.fields:1180 State) | not visible |
| service idle exit | `cua_service_idle_timeout_reached` (S.strings:28012); `shouldTerminateWhenNoClientsRemain` (S.fields:1239); `ComputerUseServiceLifecycle.Mode.codexManaged(ownerProcessIdentifier:)` | not visible. **[inference]** The service quits when idle or when its owning Codex process exits. |
| UI settle before capture | `needsUISettleBeforeSkyshot` (S.fields:395), `updateSkyshotSettlingIfNeeded(disableAXDiffing:)` (0x10006ea0c), `waitForUIToSettle(delay:notificationDelay:includingScrollEvents:)` (0x1006f7408), `performKeyboardAction(…waitForUIToSettle:…)` | not visible (vendor doc: ~1 s, up to +5 s, A §3.6) |
| launch wait | `ApplicationUIElement.awaitingLaunchCompletion()` (0x1007084ac); `AccessibilitySupport.PollError.timeoutReached` (S.fields:4788), the source of A §1.5's `-10005: timeoutReached` **[inference]** | not visible (observed ~5.5 s, A §7) |
| AX notification debounce | `_axNotificationDebounceTasks` (S.strings:28628) | not visible |
| user-intervention debounce | `userInteractionDebounceDuration: Duration` (S.fields:622), `UserInterruptedIntervention.debounceDeadline` | not visible. The model sees "… seconds and retry." with a runtime number. |
| event timing | `SynthesizedEvent.send(to:delay:)`, `click(…delay:holdDuration:…)`, IPC `click.duration`, `pressKey.duration` | the IPC values are caller-supplied; the defaults are not visible |
| cursor motion | `ComputerUseCursor.MotionConfiguration(clickAngle:candidateCount:boundsMargin:startHandle:endpointHandle:arcSize:arcFlow:straightPathDistanceThreshold:springResp…)` (0x10008c0c8), `CloseEnoughConfiguration`, `scootPositionSettleVelocity` (S.strings:42713) | not visible |
| render depth | `Max depth exceeded` (31225), `invalidDepth(_, maxDepth:)` (S.fields:4040) | not visible |
| diff line budget | `AccessibilityDifferenceLineBudgetExceeded(fullTreeLineCount:)` (S.fields:3973), `ignoreDifferenceLineBudget:` | not visible |
| subtree fetch caps | `copyHierarchyMaxArrayCountKey`, `copyHierarchyTruncateStringsKey` (S.dmfull:133941-133953); `AXArraySubsetDescriptor`, `AXTruncationDescriptor` | not visible |
| URL budget | `UIElementURLShortener.Configuration.individualLimit / totalLimit` (S.fields:4120) | not visible |
| element-id ceiling | `NextAvailableElementIDIterator.maxElementID` (S.fields:4009; S.strings:45307) | runtime value |
| `list_apps` recency | Spotlight query `kMDItemContentType == "com.apple.application-bundle" && kMDItemFSName == "*.app" && kMDItemLastUsedDate_Ranking >= $time.today(-`·N·`)` (S.strings:28410); `kMDItemUseCount` (52928); "running … as well as any that have been used in the last 14 days" (33932) | **14 days** (visible in the description) |
| lock screen | `pollInterval`, `submitDelay`, `verificationDelay`, `lockUISettleDelay`, `lockUIFallbackDelay`, `maxAttemptsPerLockedEpisode`, `permissionGrantPendingTimeout` (S.strings:29147-29154, 28900, 28985) | not visible |
| audio | `maxDurationMilliseconds: Int?` (S.fields:12603) | JS clamps 100–300000, default 60000 (A §1.4) |

---

## 8. Resources

`Contents/Resources/Package_ComputerUse.bundle/Contents/Resources/` (`ls`) holds `AppInstructions/`, `Assets.car`, `LensSequence/` and the two Skysight `.md` files (ignored). The binary requires the bundle: `unable to find bundle named Package_ComputerUse` (S.strings:28397).

`AppInstructions/*.md` (`wc -l -c`; one-line summaries from reading each file's first lines):

| file | size | summary |
|---|---|---|
| `AppleMusic.md` | 21 lines, 1,260 B | Search through the sidebar's Search row plus `set-value` on the search field (auto-submits); the `filterField` only filters the current view. |
| `Clock.md` | 53 lines, 3,610 B | Supported Clock tasks (World Clock cities; start, pause, resume and cancel timers; …) and how to perform each. |
| `iPhone Mirroring.md` | 10 lines, 275 B | Keyboard shortcuts for the mirrored phone (⌘1 Home Screen, ⌘2 App Switcher, …). |
| `Notion.md` | 47 lines, 2,206 B | Notion's block model: select a block, Return to edit; the title placeholder; how to start editing the body. |
| `Numbers.md` | 14 lines, 1,017 B | Select a cell with one click (append) or three clicks (replace), then type, issuing click and keyboard calls in parallel. (The JS never prepends this file, A §3.1.) |
| `Slack.md` | 14 lines, 1,380 B | Make sure the composer is focused before Return; prefer `set_value` over `type_text` to avoid sending multi-line messages early; Markdown is taken verbatim. |
| `Spotify.md` | 13 lines, 828 B | Playback state lags after a click: re-run get-state before acting again; searching. |

- **Mapping to apps:**
  - The `__data` literal `AppleMusic` (S.strings:52927; S.small:12527) and the adjacent code literals `com.apple.Music`, `md`, `AppInstructions` (S.small:288-292) show that the file is chosen by a bundle-id → name table **[inference]**. The full table is not recoverable from strings. (`com.apple.Music` also appears in AccessibilitySupport code near `AXEnablementAssertion` and `waitForUIToSettle`, S.small:2812, 2818: an app-specific special case of unknown purpose.)
  - The ids that are visible: `com.tinyspeck.slackmacgap` (S.strings:28635), `com.spotify.client` (29197), `com.apple.ScreenContinuity` (iPhone Mirroring, 29247).
  - The contents return as `ComputerUseIPCSkyshotResult.appSpecificInstructions` (§1.2).
  - Two notes are compiled into the binary rather than shipped as files: the Spotify link note (29198) and `## Browser Computer Use` (28398-28399).
- **`LensSequence/Lens_frame_00…44.png`:** frames for the virtual cursor's lens animation (`Lens_frame_%02d`, `LensSequence`, S.small:1517-1519; `SkyLensView` at S.strings:29125). Visual only.
- **`Assets.car`:** not opened (compiled asset catalogue; out of scope).
- **The 11 window-API methods** need no other resource. Everything else is compiled into the binary: grammar, lists, key tables, prompts.

---

## 9. Needs disassembly (input to the Ghidra tier)

General notes for the next tier:
- **Named functions are entry points; many bodies are `<redacted function N>`.** Expect to follow calls from the named symbols below into redacted ones.
- **String cross-references** work for `__cstring` literals (`adrp`/`add` pairs). Short literals are `MOVZ`/`MOVK` immediates: use `S.small` (vmaddr column) to land in the right function.
- **Folded addresses:** a few symbols share identical-code-folded addresses (e.g. `0x1000096e8` is claimed by about 30 modules' symbols, and `UIElementRenderDifference.init(oldRender:newRender:)` points there). Treat such addresses as unreliable.
- **SoftLink resolution comes first**, because it unlocks the real SPI behind every wrapper:
  - Functions: `lookUpBatchSymbolPointers(images:symbolRequests:salt:)` 0x10023a380, `lookUpSymbol(image:symbol:salt:)` 0x10023d898, `lookUpExportedSymbol(image:linkeditBase:exportTrie:symbol:salt:)` 0x10023e328, `lookUpImage(image:salt:)` 0x10023f750, `loadImageFromFilesystem(image:salt:)` 0x10023fd9c, `hash(_:appending:)` 0x100240eac, `hashWithPrefix(_:prefix:)` 0x100241d3c, `sipHash(buffer:appending:)` 0x100238f48, `SipHashState.finalize()` 0x100238e18, `resolveImagePaths(name:strategy:)` 0x1002423ac.
  - Task: recover the SipHash key and salt handling once; read each wrapper's (image hash, symbol hash, salt) triple; then hash candidate export names offline.

| behaviour | most relevant symbols (address from `S.sym`) | what to read there |
|---|---|---|
| **Tree walk and attribute batching** | `ApplicationUIElement.flatTree(for:contextType:transformed:includingMenus:)` 0x1007099d8 · `SkyshotOperation.captureAXTree(treeCache:continuingFrom:performAccessibilityEnablement:)` 0x100225bc4 · `static SystemSelectionExtractor.extract(from:contextType:treeCache:continuingFrom:axTreeRootElement:performAccessibilityEnablement:alwaysIncludeScreenshot:enableAXDiffing:)` 0x10022a214 · `static AccessibilitySPI.copyHierarchy(_:attributes:options:hierarchy:)` 0x100248054 · `TransformedUIElement.init(element:context:)` 0x10074ca70 · `TransformedUIElement.TreeCache.init(tree:transaction:invalidationMonitor:)` 0x10075b408 · `ApplicationUIElement.enableAccessibilityIfNeeded(window:for:)` 0x1006ef938 · xrefs to `_AXUIElementCopyMultipleAttributeValues` | attribute list and order; `copyHierarchy` option values (max array count, string truncation); menus included or not; whether a messaging timeout is set; the prefetch on/off rule (`ax_prefetch_*`) |
| **Element naming and pruning** | `static UIElementTreeTransformation.transform(item:context:rebuild:providerTitle:render:)` 0x1006473d0 · `UIElementTree<>.transformed(for:using:in:)` 0x100754f88 · `UIElementTree<>.transformed<A, B>(using:in:apply:)` 0x100640b44 · `TransformedUIElement.lmReadableDescription(for:)` 0x10074b118 · `AccessibilityNode.accessibilityDescription<A>(for:)` 0x100615504 · `UIElementTree.Item.flattenedString(_:)` 0x10063eb80 · `UIElementTransformationContext.shortenURLsIfNeeded(totalLength:body:)` 0x1007478ac | exact line assembly (order of title, flags, labels, ID, actions); each transformation's predicate; the label-word mapping; URL limits |
| **Index assignment and re-resolution** | `UIElementRenderTree.setElementIDs()` 0x10062d3d4 · `UIElementRenderTree.NextAvailableElementIDIterator.next()` 0x10062e368 · `UIElementRenderDifference.Change.inheritElementID()` 0x10062eb64 · `UIElementTreeRevision.appending(tree:focusTree:render:)` 0x10064551c · `UIElementTreeRevision.element(for:)` 0x100645408 · `RefetchableSkyshotAXTree.refetchElementIfNeeded(_:validateElement:ignoreValueChange:)` 0x100220a14 · `RefetchableSkyshotAXTree.refetchTree()` 0x1002226f0 · `RefetchableUIElement.refetchIfNeeded(validateElement:ignoreValueChange:)` 0x100223708 | how IDs are numbered (DFS order? only renderable nodes?); ID inheritance across revisions (`lineageID` reset rule); the refetch match criteria and the ambiguity test |
| **Diffing** | `UIElementTreeRevision.differenceLines(from:options:summarizesRemovedElementIDs:ignoreDifferenceLineBudget:onLineBudgetExceeded:)` 0x100618ddc · `UIElementRenderDifference.makeIterator()` 0x10062c428 · `UIElementRenderDifference.Change.lines(indent:options:)` 0x10062ca78 · `…Change.lineCounter(options:)` 0x10062c5fc · `SystemSelection.llmDescription(_:lineOptions:)` 0x10022ac8c · `AccessibilityTreePresentation.init(windowTitle:applicationName:treeLines:focusedElement:selectedText:selectedElements:)` 0x10062691c · `UIElementRender.line(indent:indentCount:options:)` 0x10062d85c | the line budget and its fallback; when `initial` vs `previous` is the baseline; the no-change sentence's continuation; how context lines around a change are printed |
| **Click path** (activation decision, event API) | `ComputerUseAppController.click(elementID:type:numberOfClicks:holdDuration:key:returnSkyshot:)` 0x100071d60 · `…click(at:with:clickCount:andDragTo:holdDuration:key:returnSkyshot:)` 0x10007c4d8 · `…prepareToInteract(with:cursorNextInteractionTiming:positionElement:)` 0x10006fcf4 · `UIElementProtocol.click(_:count:delay:holdDuration:heldKey:flags:alwaysSimulateClick:in:app:focusEnforcer:virtualCursor:)` 0x10079f2cc · `ApplicationUIElement.sendClick(to:at:insideWebView:andDragTo:mouseButton:count:delay:holdDuration:heldKey:flags:window:focusEnforcer:virtualCursor:)` 0x1006ebb14 · `SyntheticAppFocusEnforcer.enforceActiveState(for:)` 0x100730214 · `static CGEventAPI.postToPid(_:pid:)` 0x100249f24 · `static WindowServerSPI.setWindowLocation(_:location:)` 0x10025b924 | AXPress vs synthesized; when the app is really activated (`setFrontProcess` 0x10025c54c) vs faked; event fields set (window id, click state, source user data); offscreen handling |
| **typeText path** | `ComputerUseAppController.performKeyboardAction(_:text:duration:waitForUIToSettle:returnSkyshot:)` 0x100076f80 · `static SynthesizedEvent.type(string:)` 0x1007440cc · `+[SAIVirtualKeyPress keyPressesForString:]` 0x100237730 · `static SynthesizedEvent.pressKeys(_:)` 0x100743758 · `static CGEventAPI.keyboardSetUnicodeString(_:stringLength:unicodeString:)` 0x100249ea4 · `static CGEventAPI.createKeyboardEvent(source:virtualKey:keyDown:)` 0x100249be0 · `SynthesizedEvent.send(to:delay:)` 0x1007428e4 · keysym table in `<redacted function 12645…12684>` (0x10023470c–0x100236654, S.small:1558-1754) | layout mapping vs Unicode-string fallback (emoji, IME); inter-key delay; the full keysym and alias table |
| **Paste and clipboard restore** | `ComputerUseAppController.performPaste(text:format:returnSkyshot:)` 0x10007da6c · `-[PasteOperation.PasteboardDataProvider pasteboard:item:provideDataForType:]` 0x1001b57a0 · `-[PasteOperation.PasteboardDataProvider pasteboardFinishedWithDataProvider:]` 0x1001b582c · `RichText.WebViewPasteboardProvider.copy(to:)` 0x100ef1f54 · `RichText.WebViewPasteboardProvider.operationCompletion(for:)` 0x100ef2408 · xrefs to S.strings:28473-28475 | the paste keystroke and target; read-wait timeout; restore of all items and types; the conflict rule (`changeCount`) |
| **Settle** | `ComputerUseAppController.updateSkyshotSettlingIfNeeded(disableAXDiffing:)` 0x10006ea0c · `…updateSkyshot(treeCache:disableAXDiffing:skipScreenshot:)` 0x10006bdf4 · `ApplicationUIElement.waitForUIToSettle(delay:notificationDelay:includingScrollEvents:)` 0x1006f7408 · `ApplicationUIElement.awaitingLaunchCompletion()` 0x1007084ac · `SkyshotOperation.capture(treeCache:imageSize:includeScreenshot:continuingFrom:performAccessibilityEnablement:)` 0x100224a9c | which actions set `needsUISettleBeforeSkyshot`; delay values; the loading-indicator rule (`AXElementBusy`/`busyIndicator`) |
| **Intervention detection** | `ComputerUseAppInstanceManager.registerUserInterruptedIntervention(for:)` 0x1000a248c · `…userInterruptedIntervention(for:)` 0x1000a22a8 · `…clearUserInterruptedInterventionAfterStateRequery(for:)` 0x1000a2e5c · `…interventionReason(for:)` 0x1000a1be0 · `…markStoppedByUser(for:)` 0x1000a1598 · `static CGEventAPI.tapCreate(tap:place:options:eventsOfInterest:callback:userInfo:)` 0x10024a200 · `SystemLockScreenPhysicalInputMonitor.start(onPhysicalInput:)` 0x10021f28c · (the `ComputerUseUserInteractionMonitor` closures are redacted; reach them from its type metadata) | event mask; how own synthetic events are excluded (source pid / user-data field); debounce length; which errors map to which state |
| **Peer authentication** | `-[ComputerUseIPCServer handleEvent:withReplyEvent:]` 0x10017b764 · `ComputerUseIPCServer.start(serviceLifecycleMode:…)` 0x10017981c · `static ComputerUseServiceLifecycle.currentMode()` 0x100171668 · `SkyIPCRequirement.evaluate(senderAuditTokenData:)` 0x100ef8a1c · `SkyIPCRequirement.Criterion.evaluate(senderAuditTokenData:)` 0x100ef87c4 · `ComputerUseIPCPermissionRequestSource.requiredPermissions.getter` 0x1001830f0 · xrefs to `_getsockopt` (LOCAL_PEERTOKEN), `_SecCodeCopyGuestWithAttributes`, and the `__data` sets at 0x1013dc1b0-0x1013dc3a8 | which set is `allowedRelay` vs `trustedProcess`; ancestor walk depth; how "responsible" is computed (soft-linked); whether a non-relay direct client is accepted |

---

## 10. Not determinable statically (consolidated)

1. Whether the IPC `skyshot.text` begins with an `App=` line, and its exact form (§5.1).
2. All timing values, limits and budgets, except `list_apps`' 14-day window (§7).
3. The real SPI names behind every `SystemSoftware.*SPI`/`CGEventAPI` wrapper. They are hashed (§3.1); confirming them is mechanical once the SipHash key is read.
4. Feature-flag and config defaults: `feature/axTreeDiffing`, `…RemovedElementIDRanges`, `feature/skyshotClassifier`, `ax_prefetch_*`, `jpeg_compression_quality`, `should_*_screenshot_*` (§4.2, §5.5, §6.5).
5. The decoder's default for an absent `disableDiff` (inferred `false`, §1.2), and what a middle click with an `elementID` does (§1.3).
6. List membership of each bundle id beyond the order-based reading (§6.1), and the bundle → AppInstructions table (§8).
7. Numeric error codes beyond −10020 (§1.4), and which sentence maps to which code for most action errors (§6.2).
8. Whether `AXUIElementSetMessagingTimeout` is used (§2.3), and which apps receive `enableVoiceOverOnPreference` (§2.4).
