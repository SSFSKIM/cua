# cua's own macOS native engine (#117; child 4 of #114)

## Purpose

On macOS, cua's computer surface (`cua.getApp(...)`, `getAXState`, `click`, `typeText` and the rest of the window API the model learns from `docs/cua-api/core.md`) is answered by OpenAI's native helper, `Codex Computer Use.app` from the pinned `@oai/sky` package: it reads the accessibility tree, numbers the elements, delivers input, captures the window, and holds the Accessibility and Screen Recording permissions the user granted. Because that helper accepts only the vendor's `node_repl` as a socket peer, macOS computer sessions are also the last sessions still served by the vendor's REPL host instead of cua's own (#116). After this work, cua's own engine, `cua Engine.app`, answers the same API behind the same contract, cua's own host serves every session on every platform, and `cua install` on macOS stops downloading the vendor runtime archive altogether.

Three things become observable that are not today:

- **Nothing of the vendor runs.** `ps` during a session shows `cua-engine`, cua's Node and no `SkyComputerUseService`, `node_repl` or vendor Node. `cua doctor` shows cua's engine, its build and signature, and the permissions granted to it.
- **A driven app stays where it is.** Clicking a button in a background app does not bring that app's window to the front or take the keyboard focus from the window the user is working in. Today the vendor's click path activates the app, which the owner experiences as windows jumping forward (#162's investigation).
- **The same speed or better, measured.** Every operation of the native baseline (`docs/evidence/2026-10-14-native-baseline/`) is answered within the no-regression rule, and the three points the owner named (speed, finding elements, not interfering) are recorded against the vendor's engine on the same machine before the default changes.

How to see it: on the mini, with the plugin at the release this work ships, run a session that binds TextEdit, keep another window in front, and ask for a click in the TextEdit document. The TextEdit window stays behind, the click lands, and `cua doctor` names `cua Engine.app` as the engine. The vendor engine stays selectable with `CUA_NATIVE_ENGINE=vendor` until M6 retires it.

## Progress

- [x] (2026-10-16) Research A–D: the sky contract cua depends on (A), the helper's structure (B, partial), macOS prior art (C-macos), Linux (C-linux), the trycua cua-driver evaluation (D). Local to the coordinating session, `~/.claude/jobs/1ea561bc/tmp/117/`; M0 copies A, B, E and F into the repository.
- [x] (2026-10-17) Owner rulings: no unvetted third-party open source in the engine; cua stays internal, so signing is local and stable, not Developer ID; parity with sky on every ordinary GUI app and the browser; the engine must beat sky on speed, finding elements and not interfering.
- [x] (2026-10-18) Design resumed. Owner rulings: Linux is in scope but goes after macOS as #171; the signing identity is the owner's Apple Development certificate; approvals stay as an elicitation the plugin's hook answers, on both platforms; the approach is reading-informed reimplementation of the pinned helper, not from scratch, with clean-room (#120) still deferred; a rigorous equivalence verification system is the core requirement. M0's tier-1 reading started (agent, static only).
- [ ] Spec reviews (Decision Log entry 1).
- [ ] M0 — Reading program and measured spike.
- [ ] M1 — Engine core: bundle, protocol, tree, screenshot, renderer, harness engine axis.
- [ ] M2 — Input, settle, intervention, the full method set.
- [ ] M3 — Service, policy, approvals, host switch, engine selection.
- [ ] M4 — Install, signing, permissions, doctor, docs.
- [ ] M5 — Acceptance and the default switch.
- [ ] M6 — Retirement of the vendor runtime on macOS.

## Scope, inheritance and evidence

Child 4, board #117, of the independence composite #114 (recorded on the board; no checked-in parent spec). The parent contract is full independence from OpenAI with no capability or performance regression and an unchanged model-facing API. Siblings: #113 own browser service (landed), #116 own REPL host (landed; `docs/doperpowers/specs/2026-10-14-own-repl-host-design.md`), #115 own sandbox (landed; `docs/doperpowers/specs/2026-10-17-own-sandbox-design.md`), #120 clean-room rewrite (deferred by the owner, 2026-10-17), #171 Linux engine (deferred, opens after this).

What is in scope: the macOS engine, its JS service, the switch of macOS computer sessions to cua's own host, the engine selection and attestation, the verification system, install and signing, the retirement of the vendor runtime on macOS, and approvals on both platforms through one policy module. What is not: the Linux engine (`sky_linux` stays pinned and served by cua's own host until #171), the Windows target (cua drops it), audio recording (dormant in cua), the vendor's Skysight, Messages, Calendar, picture-in-picture, lock-screen auto-unlock, analytics and app-server features, a cursor overlay, and per-app instruction texts (the vendor ships its own; cua writes none in this work).

Terms used below:

- **Engine**: the native process that touches the Accessibility API, input and capture. The vendor's is `SkyComputerUseService` inside `Codex Computer Use.app`; cua's is `cua-engine` inside `cua Engine.app`.
- **Service**: the JavaScript that runs in the trusted worker of the REPL host and talks to the engine. The vendor's is `@oai/sky`'s `service.js` and `targets/mac/*`; cua's is `src/services/engine/`. cua's existing trusted wrapper `src/services/sky.mjs` (secret substitution) sits in front of either.
- **Facade**: the model-facing API in `src/cua-api/` (a port of `@oai/cua`'s `tinysky_alt`), which calls `nodeRepl.rpc("sky", {type: "setup" | "execute", ...})`. Unchanged by this work.
- **Skyshot**: the vendor's name for one observation of an app: its key window's accessibility text, optionally a screenshot. Kept as the name of the engine's observation result.
- **Scene**: one harness-owned window in one app family, used by the verification system (defined under "Verification system").

Research inputs, cited as `R/<file>` once M0 copies them to `docs/doperpowers/research/2026-10-18-own-native-engine/`:

| File | What it settles |
|---|---|
| `A-contract.md` | The full JS-side contract: the `setup`/`execute` RPC, the 11 macOS methods and their wire shapes, error codes and sentences, the socket framing and version, per-app approval flow and where its memory lives, the accessibility text grammar as reconstructed, diffing, the harnesses' dependencies, what a drop-in must reproduce |
| `B-helper.md` | The helper bundle: executables, plists, signatures, entitlements (partial) |
| `E-helper-catalogue.md` | Tier-1 static reading of the pinned helper: IPC schema from Swift reflection, the AX attribute and action surface, input and capture vocabulary, grammar strings, policy lists, limits, the functions that need disassembly (M0) |
| `F-helper-logic.md` | Tier-2 findings from targeted disassembly: tree walk and batching, naming and pruning, index assignment and re-resolution, diffing, the click path, typeText, paste, settle, intervention (M0) |
| `docs/evidence/2026-10-14-native-baseline/` | The vendor engine's measured cost on the mini, TextEdit, three attested runs (PR #133) |

`C-macos-prior-art.md`, `C-linux.md` and `D-cua-driver.md` stay local: by the owner's ruling the engine takes no code from the projects they survey, and their platform facts are folded into the design below where used.

The pinned helper to read is the one cua installs, `~/Library/Application Support/cua/runtimes/26.928.40906-darwin-arm64/cua_node/lib/node_modules/@oai/sky/Codex Computer Use.app` (bundle 26.924.1001281), whose main executable still carries its symbol table (about 161k symbols). The helper inside the ChatGPT app installed under `/Applications` (26.1013) is stripped and is not read.

## Design

### The contract kept, and what changes behind it

The facade's contract with the service does not change: `setup` returns `{target: "mac", methods: [the 11 names]}` and `execute {method, args}` returns what each method returns today (`R/A-contract.md` §1.2–1.4). The trusted wrapper `src/services/sky.mjs` keeps its pinned eligible shapes for secret substitution and its value-free error classification; the vendor module it delegates to is replaced by cua's service, selected by the launcher. Error sentences the model sees are kept where cua's harnesses, acceptance scripts or the first-call document depend on them (`noWindowsAvailable`, `timeoutReached`, the `userIntervened` and `screenLocked` sentences, `The element ID is no longer valid…`, `<n> is an invalid element ID`, the select/set-value refusals, `Computer Use was not approved to use <app>`, the forbidden-app sentence); elsewhere they are cua's own and bounded.

What changes behind it: the engine process, the socket it listens on, who may connect, where approval memory lives, and which REPL host runs the session.

### The engine: `cua Engine.app`

**One Swift program, Apple frameworks only.** `native/engine/` is a Swift 6 package (`swift build -c release`) producing the executable `cua-engine`, assembled into `cua Engine.app` (`LSUIElement`, hardened runtime, bundle id `io.github.ssfskim.cua.engine`, minimum macOS 14). It links ApplicationServices (the Accessibility API), CoreGraphics (events, window lists), ScreenCaptureKit (capture), AppKit (`NSWorkspace`, `NSRunningApplication`, `NSPasteboard`) and Foundation. No package dependencies: the owner's ruling bars unvetted third-party code, and Swift against Apple's frameworks needs none, where Rust would need binding crates. The vendor's private SkyLight calls, if M0 shows an input route needs them, are Apple SPI resolved with `dlsym` at run time and feature-detected, never a dependency (see "Input").

**Process model: one engine per login session, launched on demand, resident.** The service launches the bundle through the own host's existing `nodeRepl.launchServices.openApplication({applicationPath})` relay (`src/repl-host/launch-services.mjs`, `/usr/bin/open -a`), so LaunchServices is the engine's parent and TCC attributes the Accessibility and Screen Recording grants to the bundle, not to Node (the vendor's arrangement; Apple's guidance on responsible processes in `C-macos-prior-art.md` §6). The engine stays resident across sessions, as the vendor's does, and exits on a `shutdown` request (sent by the service when a version mismatch is seen, by `cua install` when it replaces the bundle, and by `cua engine stop`) or when the login session ends. The alternative, one engine per connection as a child of the trusted worker, would give peer authentication for free but makes TCC attribution depend on the process tree and re-prompts after rebuilds and relaunch heuristics; rejected.

**Socket and peer check.** The engine listens on `~/Library/Application Support/cua/engine/engine.sock` in a directory it creates with mode 0700 (the vendor's socket lives in its App Group container; cua has no app group). `CUA_ENGINE_SOCKET` overrides the path for harnesses, read by both the engine (`open --args --socket <path>`) and the service. On accept the engine reads the peer's uid with `getpeereid(2)` and closes any connection from another uid. That is the whole peer policy: the threat model is the owner's own account, where an unsigned Node cannot carry a code-signing requirement anyway (`C-macos-prior-art.md` §6, "Authenticating a local Node client"); the vendor's ancestry check is what forced the vendor host on cua and is not reproduced.

**Protocol: the vendor's wire, cua's version string.** JSON-RPC 2.0, each frame a 4-byte little-endian length then UTF-8 JSON, 8 MiB maximum each way, one request in flight per connection, as `R/A-contract.md` §2.2. Methods: `ping {clientApiVersion}` → `{serverApiVersion, engineVersion, build}` with `serverApiVersion = "cua-engine-1"`; `request {requestType, request, deadlineUnixMilliseconds}` → `result` or a JSON-RPC error `{code, message}` using the vendor's code numbers for the conditions cua maps (`R/A-contract.md` §1.5) and `-10005` with a bounded sentence otherwise; `shutdown` → `{}` then exit. The request types and payload shapes are the vendor's for the four cua uses, `ComputerUseIPCListAppsRequest`, `ComputerUseIPCAppGetSkyshotRequest`, `ComputerUseIPCAppPerformActionRequest` and `ComputerUseIPCAppStartRequest`, with the field names `R/E-helper-catalogue.md` §1 recovers from the helper's reflection metadata, plus one cua addition, `ComputerUseIPCAppResolveRequest {app}` → the app identity (the vendor's policy request answered this as a side effect; cua's policy lives in the service). Keeping the vendor's shapes is deliberate: one JS client can talk to either engine, which is what makes the engine axis of the harnesses and the IPC-level comparison in M1 possible, and the shapes are an interface, not expression; a cleaner schema would cost that comparison for nothing the model can see.

**Observation (skyshot).** `AppGetSkyshot {app, disableDiff?, includeScreenshot?, outputDirectory}` observes the app's key window (its `AXFocusedWindow`, else `AXMainWindow`; none → error `noWindowsAvailable`). The engine walks that window's accessibility tree breadth-first with `AXUIElementCopyMultipleAttributeValues` fetching, per element in one call, role, subrole, role description, title, description, value, identifier, enabled, focused, selected, position, size and children, then `AXUIElementCopyActionNames`; the messaging timeout is set on every element it touches (timeouts set on the application element do not reach its descendants; a hung app must cost a bounded wait, not a stall). Chromium and Electron apps get `AXManualAccessibility` and `AXEnhancedUserInterface` set once per process so their web content exposes a tree (the vendor does the same; without it a browser page is a single group). Depth and node caps are explicit: 40 levels, 4,000 elements, and a window that exceeds them is reported truncated, in the tree (`truncated` field) and in the text (the vendor's `Max depth exceeded` marker where depth is the cause). The result is a JSON tree (`Skyshot` in Interfaces), not text: **rendering to the model's text happens in the service.** The split is the point of the design: element handles (`AXUIElementRef`) cannot leave the process, so index assignment and re-resolution must live in the engine, while the grammar, pruning and diffing are pure functions that the service can run against recorded trees and the vendor's recorded text, which is how the grammar is pinned (goldens, under "Verification system"). Linux already renders client-side (`src/cua-api/linux-accessibility-tree.mjs`), so both platforms end up with the renderer where it can be tested.

**Indexes and handles.** Per (connection, app) the engine keeps a lineage: a table from index to element handle plus the attributes that identify it (role, identifier, title, its path of child positions). On every observation, an element whose handle is equal (`CFEqual`) to one already in the lineage keeps its index; a new element takes the next unused index; a vanished element's index is retired, never reused in that lineage. An action naming an index resolves the handle; if the app reports it invalid, the engine re-fetches by walking the current tree for the one element matching the stored identification, returns `The element ID is no longer valid. Try to get the on-screen content again…` when none matches and the ambiguity sentence when several do. This is the vendor's observable behaviour (`R/A-contract.md` §3.3; its mechanism from `R/F-helper-logic.md`, M0), which the first-call document and the model's habits rely on.

**Screenshot.** When asked, a JPEG of the key window through ScreenCaptureKit (`SCContentFilter(desktopIndependentWindow:)`, `SCScreenshotManager.captureImage`), scaled to points (the baseline's 1172 × 976 for a window on a 2× display), quality 0.8, written with mode 0600 into `outputDirectory` (the session's run directory, which the kernel's sandbox lets the cell read) and returned as a `file:` URL, as the vendor returns it (`R/A-contract.md` §3.7). `CGWindowListCreateImage` is deprecated since macOS 15 and is not a fallback. Screen Recording's periodic re-confirmation on macOS 15 and later applies to any app without Apple's capture entitlement; the vendor's helper has none either, so this is parity, not a regression.

**App resolution and launch.** `AppResolve {app}` and every app-scoped request accept a bundle id, a display name or a path. Running regular apps match first; otherwise LaunchServices (`NSWorkspace.urlForApplication(withBundleIdentifier:)`, and for a name the `.app` of that name or localized name in `/Applications`, `/System/Applications`, `~/Applications` and `/System/Library/CoreServices`), with `ambiguousApp` when more than one matches and `invalidApp` when none. An app that is not running is launched without activation (`NSWorkspace.openApplication(at:configuration:)` with `activates = false`) and the observation waits up to 5 s for a window, then fails `timeoutReached` as the vendor does; the baseline's `bind.getApp.retry` row exists for exactly that path. `ListApps` returns every running regular app plus the apps this engine has resolved before, from its own usage store (`~/Library/Application Support/cua/engine/usage.json`: bundle id, last used, use count), so the vendor's `lastUsedDate` and `useCount` fields have cua's meaning; the bound identity returned to the facade is the app's path, as the vendor binds (`R/A-contract.md` §7).

### Input

Every input request names the app (its pid) and either an element index or window coordinates. The rule that produces "not interfering": **the engine never activates an app on its own.** The routes, in order of preference, with M0's spike deciding where each family lands:

1. **Accessibility actions** for element-targeted requests when the element advertises the action: `AXPress` for a single left click, `AXShowMenu` for a right click, `AXIncrement`/`AXDecrement`, the element's own secondary actions for `performSecondaryAction`, `AXValue` for `setValue` when settable, `AXSelectedTextRange` for `selectText`. These reach the element without events and need no focus.
2. **Events posted to the process** (`CGEventPostToPid`) for everything else: coordinate clicks, multi-clicks, drags, scroll wheel, key presses and typed text. The event's location is the window point; the window field is set so the app's event routing finds the right window. The vendor posts keys this way and the baseline's `super+w` and `super+n` reach a background TextEdit, so this route is known to carry menu key equivalents.
3. **Apple SPI** (SkyLight's posting to a process with a window-local authentication field, which `R/E-helper-catalogue.md` §3 names from the helper's `dlsym` strings), resolved at run time and used only for a family where route 2 measurably drops events (Chromium pointer events are the reported case). Absent symbol or failure → route 4.
4. **Foreground assist**, bounded and reported: activate the app, post, then restore the previously frontmost app and its key window. The result's `cua/foregroundAssist: true` meta lets the harness count it, and the non-interference metric counts it as a failure for that action. It exists so a canvas app still works; it is not a route the engine chooses silently.

**Keys** (`pressKey`): the vendor's xdotool-style grammar with aliases (`super`, `Control`/`Ctrl`, `Alt`, `Shift`, `KP_0`, `Return`, …; `R/A-contract.md` §7) parsed into virtual key codes through the current keyboard layout, modifier flags set on the events, every held modifier released after.

**Text** (`typeText`): Unicode keyboard events (`CGEventKeyboardSetUnicodeString`) in chunks of at most 20 UTF-16 units that never split a surrogate pair or a combining sequence, posted to the process; this carries Hangul, emoji and mixed scripts directly, where the vendor keys through the layout and drops what it cannot key (`src/mcp/surface.mjs`'s "paste emoji" rule becomes unnecessary and is revised in M4). An app that ignores Unicode strings (the spike's matrix finds which) falls back to the paste route for that app, reported in meta.

**Paste** (`paste {text, format: text|md|html}`): write the pasteboard (plain text; HTML as `public.html` plus plain; Markdown converted to HTML plus plain), post ⌘V to the process, wait until the app has read the pasteboard (bounded, 2 s; `Timed out waiting for the application to read the clipboard` after), then restore the previous pasteboard contents only if the change count is still the engine's own (a human's newer clipboard is never overwritten; the vendor's "The user may have conflicted with your paste operation" sentence covers that case).

**Scroll**: scroll-wheel events in lines, `pages` × the scroll area's visible lines, at the element's centre or the point. **Drag**: down, interpolated moves, up, posted to the process.

**Settle.** After an action, before the next observation on that app, the engine waits for the window to be quiet: it samples a cheap signature of the key window (focused element, child count of the window, the title) every 50 ms and returns after two equal consecutive samples, at least 100 ms and at most 1 s, extended to 5 s while a progress indicator or busy element is present in the sampled subtree. The vendor waits about 1 s and up to 5 s more on the same signals (`R/A-contract.md` §3.6); the quiet-signature rule is where the speed gain is expected, and M0 measures it. The cell's time budget is suspended around the action and the settle through the host's existing suspend/resume (the own host already pauses the budget for service requests and elicitations).

**User intervention.** Before an action the engine reads the HID idle time (`CGEventSourceSecondsSinceLastEventType` on the HID system state, any input event); if the user touched input within the last second it refuses with the vendor's "still interacting" sentence, and if physical input arrives while a multi-step action runs (idle time reset below the action's elapsed time), it stops the sequence, releases held keys and buttons, and fails with `userIntervened` and the vendor's "The user changed '<app>'…" sentence. Events the engine posts do not count as HID input, so no event tap and no Input Monitoring permission are needed; the spike confirms both halves on the mini, including input through Screen Sharing, which must count as the user's (the #162 case).

**Lock screen.** `CGSessionCopyCurrentDictionary`'s `CGSSessionScreenIsLocked` true → every request fails `screenLocked` (−10020) with the vendor's first sentence. No auto-unlock, no guardian.

### The service: `src/services/engine/`

The service replaces `@oai/sky`'s macOS target behind `src/services/sky.mjs`. Its parts:

- **Client**: connects through `nodeRepl.nativePipe.createConnection(path)` (the own host's relay, `src/repl-host/native-pipe.mjs`, opens the socket outside the sandbox), pings with `cua-engine-1`, launches the bundle through `launchServices.openApplication` when the connect fails, reconnects for up to 5 s, sends `shutdown` and relaunches on a version mismatch, chains one request at a time with the 120 s default deadline, and maps JSON-RPC errors to the error object shape `src/services/sky.mjs` classifies (`name`, `code`, `errorName`, `message`).
- **Renderer**: `Skyshot` JSON → the vendor's text grammar (`R/A-contract.md` §3.2; the pruning and composition rules `R/F-helper-logic.md` establishes): the `App=` and `Window:` header, one line per element, tabs per depth, index, localized role description, flag words, title, `Description:`, `Value:`, `ID:`, `Secondary Actions:`, the focused-element and selected-text trailer, the truncation markers.
- **Diff**: per (connection, app), the default mode diffs against the previous rendered tree with the vendor's headers and `~`/`+`/`-` marks or the "Removed element IDs" summary, the no-change sentence when nothing changed, and `disableDiff` returns the full text; a screenshot-only observation advances the baseline as it does today (the first-call document says so).
- **Policy and approvals**: before every app-scoped method, resolve the app (`AppResolve`), refuse the forbidden list (password managers and system security UI, the vendor's list from `R/E-helper-catalogue.md` §6) with the vendor's sentence, classify risk (terminals and browsers high, with the subtitle), then ask once per (connection, bundle id) through `nodeRepl.createElicitation` with the exact message and meta shape the harness matcher expects (`scripts/accept/lib.mjs`; `R/A-contract.md` §2.6), remember the answer in the worker's memory, and fail `Computer Use was not approved to use <app>` on anything but accept. The memory is a `Map` in the module: the trusted worker lives exactly as long as the connection, so "once per connection" is the module's lifetime, with no session file (the vendor wrote `$CODEX_HOME/computer-use/sessions/<id>.toml`, which cua deleted at close; `scripts/accept/textedit.mjs` checked that file and changes in M3 to observe the behaviour instead: a second bind in the same connection asks nothing, a new connection asks again). `persist: ["session"]` only; `CUA_SHIM_PERSIST=always` is not implemented, by the owner's ruling that the plugin's Elicitation hook (`hooks/cua-approve.sh`) is where friction is removed and a stricter hook is where a veto lives. Linux goes through the same module keyed by the window's app name, so both platforms ask alike.
- **Result meta**: `codex/toolSurface` per call as today, plus `cua/nativeEngine {engine, version, build}` on every result and `cua/foregroundAssist` when route 4 was used; the MCP proxy surfaces `cua/nativeEngine` in each `js` result's `_meta` next to `cua/replHost`, which is the attestation the harnesses validate.

### Engine selection, host switch and retirement

`CUA_NATIVE_ENGINE=vendor|cua` is resolved per connection in `src/runtime/launch.mjs` beside `replHostFor`: the env, else `~/.config/cua/engine.json`'s `engine`, else the default, which is `vendor` until M5 flips it to `cua`. With `cua`, the launcher sets `CUA_SKY_SERVICE` to cua's service module, `CUA_ENGINE_APP` to the bundle, drops the `macos_native_peer_requires_vendor` refusal so macOS computer sessions run on cua's own host under the scoped sandbox, and `doctor` reports the selection, the bundle, its signature and the engine's permission state. With `vendor`, everything stays as today (`CUA_SKY_VENDOR_SERVICE`, `SKY_CUA_SERVICE_PATH`, the vendor host through cua's compatibility executable from #115). An explicit `CUA_NATIVE_ENGINE=cua` on a Mac without a built engine refuses before launch with a diagnostic naming `cua install`; it never silently falls back, as #116's selection never downgrades an explicit choice.

M6 removes the vendor side on macOS: the runtime archive download, the manifest layout keys `node`, `nodeRepl`, `moduleDir`, `cuaRepl`, `skyServiceApp`, `skyVendorService`, `ipcClient` and `vendorManifest`, the compatibility executable and `CUA_REPL_HOST=vendor` on macOS, and the vendor lanes of the harnesses take an explicit `--vendor-runtime <dir>` instead of the installed runtime. That is the composite's macOS end state; #171 does the same for Linux.

### Install, signing and permissions

`cua install` builds the engine on the Mac it runs on (`swift build -c release` in `native/engine/`, Xcode's toolchain; both of the owner's Macs have Xcode 26), assembles `cua Engine.app` under `$CUA_HOME/engine/<engine version>/`, and signs it with the identity named by `CUA_SIGNING_IDENTITY` or `~/.config/cua/engine.json`'s `signingIdentity` (a common name or SHA-1 from `security find-identity -v -p codesigning`), hardened runtime, no entitlements. The identity is the owner's Apple Development certificate (ruling 2026-10-18): its designated requirement names the certificate's subject, so a rebuild signed by the same certificate keeps the TCC grants, and one certificate serves both Macs once the mini imports it. Without a configured identity `cua install` refuses with the sentence that names the setting; `--engine-sign adhoc` exists for the hosted CI runner, where no permission is granted anyway, and is never a default: ad-hoc signatures change with every build and would lose the grants on each rebuild. The repository carries no certificate name.

Permissions are requested where they are first needed and reported, never clicked: the first observation calls `AXIsProcessTrustedWithOptions` with the prompt option and fails `permissionsPending` (−10014) with a sentence naming "cua Engine" in System Settings → Privacy & Security → Accessibility; the first screenshot calls `CGRequestScreenCaptureAccess` the same way. Because macOS applies a Screen Recording grant only to a relaunched process, the engine exits after it observes the grant change (polling `CGPreflightScreenCaptureAccess` at the next screenshot request) and the service relaunches it. On the mini the owner grants both over Screen Sharing, once per signing identity. `cua doctor` reports both grants from the engine's `status` request (`{accessibility, screenRecording}`), the signing identity, and whether the socket's owner is the installed bundle.

### Verification system

The owner's core requirement: no regression across the replacement, proven, before any default changes. The system has seven parts, built in the milestones that first need them and run in full at M5.

1. **Engine axis on the native baseline harness.** `scripts/native-baseline.mjs run --host cua --engine vendor|cua` (today the adapters hardcode `engine: 'sky'`); the engine attestation comes from `_meta['cua/nativeEngine']` on every result, and the helper attestation classifies both `SkyComputerUseService` and `cua-engine` processes. `compare --engines <vendor-dir> <cua-dir>` holds host, device, release, OS, display and sandbox equal, requires the engine to differ, and judges as `--same-host` does: per operation, the candidate's median within baseline + max(10%, 500 ms), p95 and max reported, exactly three attested runs per side with every planned sample present, else NO VERDICT. The same cells as the recorded baseline (TextEdit), so the 2026-10-14 vendor runs remain a reference, and a fresh vendor triple is taken in the same sitting as each cua triple.
2. **Scenes.** Four harness-owned windows, one per app family, each with run-owned content and the TextEdit fixture's refusal discipline (the harness refuses to start when the app has the owner's windows open): TextEdit (AppKit text), Finder (AppKit lists, a run-owned folder with 200 files), Chrome (its own UI and a loopback page served by the harness, as the browser parity harness does), and one Electron app present on the mini, chosen in M0 by inventory. Breadth is the ruling, scenes are the proof: the engine must handle any ordinary app; the harness proves it on these.
3. **Differential suite.** `scripts/repl-parity.mjs --suite native-mac --engine vendor|cua`, the same scripted cells on both engines, comparing the full accessibility text on the scenes' own windows (their content is the harness's) and structural measures only where a window could carry the user's content. Expected differences are declared, as `vendor-defects.mjs` declares them today, never silently absorbed.
4. **Method matrix.** The 11 methods × the four scenes, outcome equal sample for sample or strictly better (the Linux `method.*` rule), including the error sentences for refused cases (select on a non-text element, set on a non-settable one, an invalid index, an app with no window).
5. **The three points, defined.** *Speed*: on every scene, in-cell medians of `getAXState`, `getScreenshot`, `listApps` and each method cell lower than the vendor's with p95 not worse. *Finding elements*: per scene a fixed list of ten targets that must resolve by name through the model's path (`getAXState` text search → index → action), plus the share of element lines with a non-empty title or label and the `ID:` count; the vendor's scores are recorded first, cua's are not lower on any measure, and the sum of resolved targets is higher or every measure is equal, in which case the spec records parity and the owner decides. *Not interfering*: the harness keeps its own window frontmost (a second run-owned TextEdit document, activated), drives the scene's app, and after every action checks that the frontmost application and key window are unchanged through `cua.getState()` and the user window's title; every action must pass without `cua/foregroundAssist`; the vendor's score is recorded on the same cells.
6. **Korean and Unicode matrix.** `typeText` and `paste` of: `The quick brown fox jumps over the lazy dog.`, `한글 테스트`, `ㄱㄴㄷ`, `가나다 abc 123`, `😀 이모지`, `é` as e plus U+0301, `日本語`, and `줄1⏎줄2`, into the TextEdit scene, the Chrome loopback page's textarea and the Electron scene's text field, read back by SHA-256 inside the cell and compared with the expected string; a mismatch is investigated per case (autocorrection is a known cause and is recorded, not excused).
7. **Unit goldens and tests.** The renderer and diff against recorded `Skyshot` trees and the vendor's recorded text for the same window states (recorded on the scenes in M0 and M1, committed under `test/native-goldens/`: our content, the mini's Korean role names); protocol framing and the 8 MiB bound; the policy module (forbidden list, risk, once-per-connection memory, the elicitation shape against the harness matcher); secret substitution shapes unchanged (`test/services-sky*.test.mjs`); the untrusted-engine error path (the hosted runner has no grants, so `permissionsPending` is testable there).

Gates: the hosted macOS runner (`.github/ci-kit.yml`) builds the engine ad-hoc, runs 7 and the engine's untrusted paths on every PR; the live parts (1–6) run on the mini inside a CI-opt hold, GUI, with the owner's one-time grants. The default flips to `cua` (M5) only when 1–6 pass with three attested runs on each side.

## Acceptance

Behaviour a person can verify on the mini, at the plugin release M5 ships (1–9) and M6 ships (10):

1. `cua doctor --json` shows `engine.selected: "cua"`, `engine.bundle` under `$CUA_HOME/engine/`, `engine.signature.identity` matching the configured identity, and `engine.permissions.accessibility` and `screenRecording` both `true`.
2. In a session with the computer surface, `cua.getApp("com.apple.TextEdit")` asks one approval, the plugin's hook answers it, and `ps -axo comm | grep -c 'SkyComputerUseService\|node_repl'` prints `0` while `cua-engine` is running.
3. With a TextEdit document frontmost and a Finder window behind it, `finder.click({element_index: <a file row>})` selects the file; the TextEdit document is still frontmost and still has keyboard focus (type a character: it lands in TextEdit).
4. `app.typeText("한글 테스트 😀")` into a TextEdit document lands exactly, read back from the tree's `Value:`.
5. `node scripts/native-baseline.mjs compare --engines <vendor-triple> <cua-triple>` prints `VERDICT: PASS` with no judged row over the limit, and the per-operation table shows cua's medians for `warm.getAXState`, `warm.getScreenshot` and `task.total` below the vendor's.
6. `node scripts/repl-parity.mjs --suite native-mac --engine cua --diff` against the vendor run of the same sitting prints 0 unexpected differences.
7. The method matrix and the three-point report (`docs/evidence/2026-10-??-own-native-engine/summary.md`) show every method equal or better on the four scenes, the finding-elements measures not lower, and non-interference 100% for cua.
8. `scripts/accept-native.mjs` items 1–8 and 10 PASS on cua's engine; item 9 (fresh TCC onboarding) PASS on the mini after the grants are revoked with `tccutil reset Accessibility io.github.ssfskim.cua.engine` and `ScreenCapture`, granted again at the prompts.
9. `CUA_NATIVE_ENGINE=vendor` still runs a session on the vendor engine and host, attested as such.
10. After M6, `cua install` on a fresh `CUA_HOME` on macOS downloads no runtime archive, `cua doctor` lists no vendor rows, and `git grep -l 'node_repl\|SkyComputerUseService' src` lists only the Linux pin's files.

## Plan of Work

Constraints that bind every milestone: no third-party code or package dependency in `native/engine/` (Apple frameworks only; Apple SPI by `dlsym` with feature detection); never launch, signal or kill a vendor helper or the owner's apps outside the harnesses' own fixtures; GUI runs on the mini only inside a CI-opt hold, headless runs only with the runner idle; no permission dialog is ever clicked by automation; nothing logs accessibility text, titles or screenshots of windows the harness does not own; the model-facing API and `docs/cua-api/core.md` stay unchanged except where M4 revises a rule the engine makes false; each milestone lands as its own PR after a reviewer-high review and `MERGEABLE`; the spec's Progress, Surprises and Decision Log are current at every stopping point; a plugin bump accompanies every plugin-visible change (M5, M6).

### M0 — Reading program and measured spike

A prototyping milestone whose deliverable is knowledge. Two halves run in parallel.

**Reading.** Tier 1 (running): `E-helper-catalogue.md`, the static catalogue described under research inputs, from the pinned helper's symbols, strings, Swift reflection metadata and resources. Tier 2: Ghidra headless analysis of the same executable (installed under `~/tools/ghidra/`), decompiling the functions tier 1 lists as "needs disassembly", answering, each with the evidence that shows it: the attributes fetched per element and the batching; the naming and pruning rules of the text; index assignment and re-resolution; the diff rules and when the cumulative or no-change forms are used; the click path and its activation decision; the typeText path (layout key codes or Unicode); paste and clipboard restore; the settle conditions and timings; intervention detection; the peer check (understanding only). The output is `F-helper-logic.md`, and from A, E and F the executor writes `docs/doperpowers/research/2026-10-18-own-native-engine/sky-behaviour.md`, the consolidated behaviour specification the engine and renderer are built against, every rule tagged with its source. Static only, no execution of the helper.

**Spike.** `native/engine/` as a minimal Swift package: `ping`, `ListApps`, `AppResolve`, `AppGetSkyshot` (tree and screenshot) and `AppPerformAction` for click, pressKey and typeText; a bare JS client under `scripts/spike/engine/` that drives it through the own host's relays; built and signed on the MacBook with the owner's identity, copied to the mini, launched through `open`, granted by the owner once. Measured on the mini, inside a CI-opt hold, against the baseline's own cells (`getAXState`, `getScreenshot`, `listApps`, the three-cell task) and three probes: (a) which input route each scene family accepts in the background (TextEdit, Finder, Chrome's UI and web content, the Electron app), recorded per action as route 1–4; (b) HID idle as the intervention detector, including a keystroke sent over Screen Sharing during an action; (c) Unicode typeText of the Korean matrix into TextEdit and Chrome. The Electron app is chosen here by inventory of the mini's installed apps. Goldens: the vendor's accessibility text on the four scenes' fixed states is recorded here for 7.

**Promote or discard.** Promote when the spike's `getAXState` and `getScreenshot` in-cell medians are within the no-regression rule on TextEdit and route 1 or 2 carries clicks and keys to TextEdit and Finder without activation; then M1 hardens the spike's shape with tests. Discard the Swift shape (the knowledge stays) if the tree read cannot meet the rule after batching and timeouts are tuned, in which case the Decision Log records what the engine must do differently before M1 starts. Either way the design sections on input, settle and intervention are revised from the measurements, with a dated Decision Log entry, and the critique debate of Decision Log entry 1 runs on the revised design.

What it proves: nothing of the acceptance; its verdict goes to Surprises & Discoveries. What it does not touch: `src/`, the harnesses' selection logic, install.

### M1 — Engine core

What exists: `cua Engine.app` built from `native/engine/` with the socket server, peer check, protocol, app resolution and launch, the tree walk with lineage indexes and re-resolution, the screenshot, and `status`; the service's client, renderer and diff in `src/services/engine/`; the engine axis in `scripts/native-baseline.mjs` and the attestation in the proxy; `CUA_NATIVE_ENGINE` resolved by the launcher (default `vendor`), with `cua` runnable on the own host for observation-only sessions. Touches: `native/engine/`, `src/services/engine/`, `src/services/sky.mjs` (delegation target by env), `src/runtime/launch.mjs`, `src/mcp/` (the `_meta` attestation), `scripts/native-baseline.mjs` and `scripts/native-baseline/*`, `test/native-goldens/`, `.github/ci-kit.yml` (Swift build and unit tests). Interfaces: produces `EngineProtocol`, `Skyshot`, `EngineClient`, `SkyshotRenderer`, `TreeDiff`, `EngineSelection`, `EngineAttestation`. Decisions: the vendor's request shapes verbatim from `E`'s schema; the renderer's rules from `sky-behaviour.md`, pinned by the goldens; the lineage table as designed. Does not touch: input, policy, approvals, install. Proves: the observation half of acceptance 5 and 6 (`getAXState`, `getScreenshot`, `listApps` rows within the rule on the mini; goldens equal), the renderer and diff goldens of 7 in CI.

### M2 — Input, settle, intervention

What exists: all 11 methods on cua's engine, the four input routes with their selection per family as M0 measured, settle, intervention, lock screen, paste with restore, the method matrix (4) and the Korean matrix (6) in the parity harness, and the non-interference oracle (5). Touches: `native/engine/` (input, settle, intervention), `src/services/engine/` (method mapping, error sentences), `scripts/repl-parity.mjs` and `scripts/repl-parity/*` (the `native-mac` suite and scenes), `test/repl-parity/scenarios/`. Interfaces: produces `InputRoute` meta and the scene fixtures (`NativeMacScenes`). Decisions: route 3 only where M0 showed route 2 dropping events; route 4 always reported; the settle signature as designed. Does not touch: policy, approvals, host selection beyond observation sessions. Proves: acceptance 3 and 4; the method matrix and Korean matrix rows of 7 on the mini.

### M3 — Service, policy, approvals, host switch

What exists: the policy module with the forbidden list, risk and once-per-connection approvals, used on macOS and Linux; `CUA_NATIVE_ENGINE=cua` sessions with the computer surface on cua's own host, the `macos_native_peer_requires_vendor` refusal gone for that selection; `scripts/accept/textedit.mjs` and `scripts/accept-native.mjs` observing approvals by behaviour; `doctor` and `verify.mjs` engine-aware; the differential suite (3) complete. Touches: `src/services/engine/policy.mjs`, `src/services/sky.mjs` (Linux through the policy), `src/runtime/launch.mjs`, `src/runtime/doctor.mjs`, `verify.mjs`, `scripts/accept/*`, `test/services-*`, `test/mcp-*`, the Linux parity harness's approval handling. Interfaces: produces `ApprovalMemory`; consumes everything from M1 and M2. Decisions: `persist: ["session"]` only; Linux keyed by app name; the harness's Linux lane answers the pinned request instead of declining. Does not touch: install and signing. Proves: acceptance 2 and 6; `accept-native` items 7 and 8 on cua's engine.

### M4 — Install, signing, permissions, docs

What exists: `cua install` builds, assembles and signs the engine with the configured identity, refuses without one, `--engine-sign adhoc` for CI; `cua engine stop`; the permission prompts and the relaunch-after-grant behaviour; `README.md`, `docs/onboarding-new-mac.md` and `src/mcp/surface.mjs`'s host rules revised (typeText carries Unicode; the engine's name in System Settings; the identity setup); the hosted gate builds the real bundle. Touches: `src/runtime/install.mjs`, a new `src/runtime/engine.mjs`, `src/cli/*`, `.github/ci-kit.yml`, docs. Interfaces: produces `EngineInstall`. Decisions: the bundle lives under `$CUA_HOME/engine/<version>/`; the identity setting's name and sentence; relaunch after the capture grant. Does not touch: the default selection. Proves: acceptance 1, 8's item 9 (fresh onboarding on the mini), 9.

### M5 — Acceptance and the default switch

What exists: the whole verification system run on the mini in one sitting, three attested runs per side, the three-point report under `docs/evidence/`, the owner's own sitting (the owner drives apps of their choice on both engines and judges breadth), then the default `cua` in the launcher, the plugin bumped, the first-call document checked for stale claims. Touches: `src/runtime/launch.mjs` (default), `docs/evidence/`, the spec, `plugin/` version. Proves: acceptance 1–9 as written, with the exact commands under Concrete Steps.

### M6 — Retirement

After a soak the owner ends (the criterion: no `CUA_NATIVE_ENGINE=vendor` rollback needed in the owner's use since M5), the vendor side leaves macOS as described under "Engine selection, host switch and retirement"; the harnesses' vendor lanes take `--vendor-runtime`; manifests, `checks.mjs`, `doctor.mjs` and tests lose the vendor rows; README's licence note says the native engine is cua's own with the derivation note #120 needs. Proves: acceptance 10. #171 opens.

## Concrete Steps

Working directory is the worktree `/Users/new/Developer/GitHub/cua-117` on branch `feat/117-own-native-engine` unless stated. Commands the milestones add are written into this section as they are built; the ones fixed now:

```
# M0 reading, tier 2 (MacBook; static)
~/tools/ghidra/ghidra_*_PUBLIC/support/analyzeHeadless ~/tools/ghidra-projects sky -import \
  "$HOME/Library/Application Support/cua/runtimes/26.928.40906-darwin-arm64/cua_node/lib/node_modules/@oai/sky/Codex Computer Use.app/Contents/MacOS/SkyComputerUseService" \
  -postScript <decompile-listed-functions script> -scriptPath ~/.claude/jobs/1ea561bc/tmp/117/work
# expected: the listed functions' decompiled C under work/decomp/<symbol>.c; no process started

# M0 spike build and sign (MacBook)
cd native/engine && swift build -c release
node scripts/spike/engine/assemble.mjs --identity "$CUA_SIGNING_IDENTITY" --out /tmp/cua-engine-spike
# expected: /tmp/cua-engine-spike/cua Engine.app; `codesign -dv` shows the identity and flags=0x10000(runtime)

# M0 spike on the mini (inside a CI-opt hold; the owner grants Accessibility and Screen Recording once)
scp -r "/tmp/cua-engine-spike/cua Engine.app" mini:~/cua-engine-spike/
node scripts/spike/engine/measure.mjs --device mini --out docs/doperpowers/research/2026-10-18-own-native-engine/spike/run-1
# expected: a results.jsonl with in-cell timings per cell, routes per action, the probe verdicts

# M1 onward: the baseline with an engine axis (three runs per side, same sitting)
node scripts/native-baseline.mjs run --device mini --experiment <sitting> --host cua --engine vendor --out <dir>/vendor/run-<n>
node scripts/native-baseline.mjs run --device mini --experiment <sitting> --host cua --engine cua --out <dir>/cua/run-<n>
node scripts/native-baseline.mjs compare --engines <dir>/vendor <dir>/cua --out <dir>/comparison.md
# expected: VERDICT: PASS and the per-operation table

# M2 onward: the differential suite
node scripts/repl-parity.mjs --device mini --suite native-mac --engine vendor --out <dir>/vendor
node scripts/repl-parity.mjs --device mini --suite native-mac --engine cua --out <dir>/cua --diff <dir>/vendor
# expected: "0 unexpected differences" and the declared list

# Unit tests, every milestone
npm test
```

## Interfaces and Dependencies

**EngineProtocol** (`native/engine/Sources/Engine/Protocol.swift`, `src/services/engine/protocol.mjs`): JSON-RPC 2.0 over the 4-byte little-endian length-prefixed framing; methods `ping`, `request`, `status`, `shutdown`; `serverApiVersion = "cua-engine-1"`. `request.requestType ∈ {ComputerUseIPCListAppsRequest, ComputerUseIPCAppGetSkyshotRequest, ComputerUseIPCAppPerformActionRequest, ComputerUseIPCAppStartRequest, ComputerUseIPCAppResolveRequest}` with the vendor's payload shapes for the first four (`R/E-helper-catalogue.md` §1) and:

```
AppResolveRequest  {app: string}
AppResolveResponse {appPath: string, bundleIdentifier: string, displayName: string, isRunning: boolean, pid: number | null}
GetSkyshotRequest  {app, disableDiff?: boolean, includeScreenshot?: boolean, outputDirectory: string}
Skyshot            {app: {bundleIdentifier, displayName, appPath, pid}, window: {title: string, frame: Rect},
                    lineage: string, revision: number, nodes: Node[], truncated: {depth?: number, count?: number} | null,
                    screenshot: {url: string, width: number, height: number} | null, focused: number | null,
                    selectedText: string | null}
Node               {index: number, depth: number, role: string, subrole: string | null, roleDescription: string,
                    title: string | null, description: string | null, value: string | number | boolean | null,
                    valueMarkdown: string | null, identifier: string | null,
                    flags: {enabled: boolean, focused: boolean, selected: boolean, settable: boolean, expanded?: boolean, checked?: boolean},
                    actions: string[], frame: Rect | null, children: number}
StatusResponse     {engineVersion, build, accessibility: boolean, screenRecording: boolean, socket: string, pid: number}
Error              {code: number (the vendor's codes where mapped; -10005 otherwise), message: string}
```

**EngineClient** (`src/services/engine/client.mjs`): `connect()`, `request(requestType, request, {deadlineMs = 120_000})`, `shutdown()`; owns the one-in-flight chain and the launch-on-failure path through `nodeRepl.launchServices.openApplication` and `nodeRepl.nativePipe`.

**SkyshotRenderer** (`src/services/engine/render.mjs`): `render(skyshot) → string` in the vendor grammar; **TreeDiff** (`src/services/engine/diff.mjs`): `diff(previous, current) → string` with the vendor's headers; both pure, golden-tested.

**ApprovalMemory** and policy (`src/services/engine/policy.mjs`): `withPolicy(toolName, input, fn)` as the vendor's `withComputerUsePolicy` contract (`R/A-contract.md` §2.6), the forbidden list and risk tables as data at the top of the module.

**EngineSelection** (`src/runtime/launch.mjs`): `nativeEngineFor({env, config}) → {engine: 'vendor' | 'cua', reason}`, resolved beside `replHostFor`; **EngineAttestation**: `_meta['cua/nativeEngine'] = {engine, version, build}` on every `js` result.

**EngineInstall** (`src/runtime/engine.mjs`): `buildEngine({home, identity | 'adhoc'}) → {bundlePath, version, signature}`, `stopEngine()`.

**NativeMacScenes** (`scripts/repl-parity/scenes-mac.mjs`): the four scenes with their fixed states, target lists and refusal preconditions.

Dependencies: Xcode 26's Swift 6 toolchain on each Mac; Node 24+ for the own host; Ghidra (a tool under `~/tools/ghidra/`, M0 only); the pinned vendor runtime until M6, for the vendor lanes.

## Surprises & Discoveries

- Observation: the helper inside the currently installed ChatGPT app (26.1013) is stripped, while the pinned helper cua installs (bundle 26.924) still carries about 161k symbols.
  Evidence: `nm` counts in `R/B-helper.md` §1 against the owner's measurement of the installed build (2026-10-18, sminos).

## Decision Log

- Decision (2026-10-18, verification call at authoring): the spec gets one `doperpowers:adversarial-reviewer` review (technical-heavy) and, since the execution section has seven milestones, the buildability review of the execution section in the same round; a `doperpowers:critique` debate runs on the design after M0 revises it from measurements and before M1 starts, because the input and settle choices are novel and the cost of being wrong is a milestone; every milestone's PR gets a `doperpowers:reviewer-high` whole-branch review; M5 is the acceptance sitting on the mini.
  Rationale: the siblings' council (#115) with the critique moved to where the design is measured rather than guessed.
  Date/Author: 2026-10-18, maws-3f.
- Decision: the engine speaks the vendor's IPC request shapes for the four request types cua uses, with cua's version string and one added request.
  Rationale: one JS client for both engines makes the engine axis and the IPC-level comparison possible; the shapes are an interface. Alternative: a cua-native schema, cleaner, rejected because it costs the comparison and changes nothing the model sees.
  Date/Author: 2026-10-18, maws-3f.
- Decision: rendering and diffing live in the service, handles and indexes in the engine.
  Rationale: handles cannot leave the process; the grammar can be golden-tested only where it is a pure function. Alternative: text produced by the engine as the vendor does, rejected because the grammar would then be testable only live.
  Date/Author: 2026-10-18, maws-3f.
- Decision: no cursor overlay, no per-app instruction texts, no cross-connection approval persistence, no audio, no lock-screen unlock in this work.
  Rationale: none is reachable by cua's facade today or wanted by the owner; MAWS synthesizes its own agent cursor.
  Date/Author: 2026-10-18, maws-3f.

## Outcomes & Retrospective

Pending — written at finish.
