# A — cua's macOS engine, read for #235 (an opt-in visible agent cursor drawn by the engine)

Read-only reading, 2026-10-30. Sources:

- **main** = `origin/main` at `fc15e1b8` in the cua repo (worktree `/Users/new/Developer/GitHub/cua-171`, nothing checked out or changed). Unless marked otherwise, a path below is relative to the repo root at that commit, e.g. `native/engine/Sources/Engine/Input.swift:164`.
- **#211** = PR #211 head `a8c3bc1c` (`feat/117-m4`, base `9c57bfa7`). The engine Swift files, `src/services/engine/` and the engine runtime files are byte-identical between #211's base and main (`git diff --stat 9c57bfa7 origin/main` on those paths is empty).
- **spec** = `docs/doperpowers/specs/2026-10-18-own-native-engine-design.md` on main.

"Global point" below means CoreGraphics/Accessibility global display space: points, top-left origin at the primary display. AppKit windows use Cocoa space (bottom-left origin), so an overlay has to flip y.

---

## 1. Process model, install, signing, TCC

### How the engine runs

- **One executable, `cua-engine`, in an app bundle `cua Engine.app`.** It is a SwiftPM executable target linking ApplicationServices, AppKit, Carbon, CoreGraphics and ScreenCaptureKit (`native/engine/Package.swift:7-25`). It uses Apple frameworks only, with private SPI resolved through `dlsym` (`Package.swift:2-4`; spec L129).
- **Startup in `main.swift`.** `--probe …` runs a harness probe and exits (`main.swift:6`). The server path then runs, in order:
  - `Lifecycle.install()` (`main.swift:8`)
  - loads `engine.json` (`main.swift:10-11`)
  - **`NSApplication.shared`** (`main.swift:12`)
  - reads the screens on the main thread (`screenScales.start()`, `main.swift:14`)
  - starts the socket server (`main.swift:15-16`)
  - then **`application.run()`** (`main.swift:20`)
- **Activation policy.** In the bundle, `LSUIElement` makes the engine an accessory app with no Dock icon. The assembler writes it: `src/runtime/engine-bundle.mjs:65` on main, with M0's copy at `scripts/spike/engine/assemble.mjs:75`. An unbundled run (the unit tests' debug build) calls `setActivationPolicy(.prohibited)` (`main.swift:17-19`). `isBundled` means the bundle URL ends in `.app` (`Version.swift:23`). The engine never calls `NSApp.activate` and creates no window, panel or view anywhere (a grep for NSWindow, NSPanel and NSView finds none).
- **How it is launched.** It is launched on demand and stays resident, one engine per Mac (spec L131). The service launches it through the host relay's `nodeRepl.launchServices.openApplication` (`src/services/engine/client.mjs:197`), which runs **`/usr/bin/open -n -g -a <bundle>`** (`src/repl-host/launch-services.mjs:7`). `cua engine approve` relaunches it the same way (`src/runtime/engine.mjs:383`). `-g` keeps the launch from taking focus. LaunchServices is the parent process, so TCC attributes the grants to the bundle.
- **Threads:**
  - **Main thread:** the NSApplication run loop. Several things run on it:
    - AXObserver run-loop sources for the settle and the paste effect (`Monitor.swift:61-62`)
    - screen-parameter notifications (`Screenshot.swift:145-150`)
    - NSWorkspace activation observers (`Methods.swift:62` → `MenuSpan.swift:270-277`)
    - every input-source, pasteboard and rich-text call, made through **`onMain` = `DispatchQueue.main.sync`** (`Keyboard.swift:36-45`, `Pasteboard.swift:59-80`, `RichText.swift:106`). A keyed `type_text` checks the input source before every key event (`Input.swift:420-424` → `Input.swift:450-455` → `Keyboard.swift:45`), so **the main thread is on the critical path of typing and paste.**
  - **Accept thread:** one (`Server.swift:70-72`).
  - **Connection threads:** one per connection, with a 4 MB stack (`Server.swift:152-156`). Each connection serves its requests serially: it reads the next frame only after answering the last (`Server.swift:204-228`). Every request handler, so every input method, runs on its connection's thread.
  - **Intervention event tap:** a thread with its own CFRunLoop (`Intervention.swift:306-322`).
  - **Screenshot capture:** a thread per capture (`Skyshot.swift:124-133`).
  - **Signals:** a serial queue (`Lifecycle.swift:17`).
  - **Timers:** global-queue timers for the route-3 screen-update hold cap and the menu span (`Activation.swift:102-104`, `MenuSpan.swift:57`).
- **Could it own an on-screen window today? Yes in principle, no in code.** The AppKit app object exists, the main run loop is NSApplication's, and an accessory app may own windows. Nothing does yet. Window work has to hop from the connection thread to main. The unbundled test build is `.prohibited`, so a window cannot show in the unit tests. The engine's testing convention is a struct of replaceable OS closures, such as `ActivationSystem` (`Activation.swift:73-107`). A cursor sink would follow that pattern.
- **No App Nap or energy handling.** The engine has no `ProcessInfo.beginActivity`, no IOPM assertion and no `NSAppSleepDisabled` key (grep of `native/engine` and the Info.plist writer). The vendor declares user activity and holds a display-sleep assertion per request (`docs/doperpowers/research/2026-10-18-own-native-engine/E-helper-catalogue.md:321`).

### Install and signing

| | main (M1b) | #211 (M4) adds |
|---|---|---|
| Build | `cua engine build`: `swift build -c release` with scratch under the engine directory, assembled in `staging/`, then the old bundle is swapped out only after a `shutdown` (`src/runtime/engine.mjs:297-332`; spec L210) | `cua install` runs `installEngine` when the cua engine is selected or `--engine` is given, with `--engine-sign adhoc` available (`src/runtime/install.mjs` hunk @46 in #211) |
| Location | fixed: `~/Library/Application Support/cua/engine/cua Engine.app`, with `engine.sock`, `engine.lock`, `usage.json`, `pending.json` and `approved.json` beside it (`src/runtime/engine.mjs:5-10`; `Server.swift:24-36` derives the socket from the bundle path) | unchanged |
| Signature | `codesign --force --sign <identity> --options runtime --timestamp=none`: hardened runtime, **no entitlements** (`src/runtime/engine-sign.mjs:177`). Identity is the owner's Apple Development certificate (`CUA_SIGNING_IDENTITY` or `engine.json`'s `signingIdentity`). Ad hoc is for CI only. Over SSH it signs through a GUI-domain launchd job (spec L210) | unchanged |
| Approval | `cua engine approve` with the owner at the console writes `approved.json`. A **new on-disk copy raises a capture confirmation** the first time it captures (spec L208). Every engine rebuild means re-approving on the mini | an opt-in `foreground` approve launches `open -n -a` without `-g`, an experiment to give the prompt a window (`src/runtime/engine.mjs` hunk @379/@430 in #211) |
| Client check | ping must match `cua-engine-1` (`Version.swift:4`, `Methods.swift:85-93`), and engineVersion and build must equal the bundle's (`client.mjs` header) | relaunches the engine once on a Screen Recording `permissionsPending` (`client.mjs` `relaunchForPermissions` in #211) |
| Default selection | **vendor** (`src/runtime/launch.mjs:434`); cua's engine is opt-in through `CUA_NATIVE_ENGINE=cua` or `engine.json` `engine: "cua"` | unchanged (M5 flips it) |

### TCC grants

- **Accessibility** is required; it is asked for at first need (`Methods.swift:201-205`).
- **Screen Recording** is asked for at the first screenshot (`Methods.swift:209-213`); a new grant applies only after a relaunch.
- **Input Monitoring** is preflighted and never requested. It is needed for the intervention tap; without it detection is "off" (`Methods.swift:101`, `Intervention.swift:21-26`).
- `status` also reports `canPostHid` (`Methods.swift:95-112`).
- There is no Apple Events entitlement: tccd logs `kTCCServiceAppleEvents requires entitlement … missing` (`docs/doperpowers/research/2026-10-18-own-native-engine/spike/sit2/u5-tcc.jsonl:52`).
- **Drawing a window needs no grant.** #211 moves the two `require*` bodies into `Permissions.swift`, which adds by-hand steps and `meta.permission`; the grants themselves do not change.

---

## 2. Commands that act at a point or along a path

Every input method goes through the same prologue: resolve the app, require Accessibility, read the intervention guard, then refuse before posting if required (`ElementInput.swift:128-136`). Only after that is the target point resolved.

| Method / case | Where the point is resolved | Space and conversion | Where it is delivered |
|---|---|---|---|
| `click` at x,y | `coordinatePoint` (`ElementInput.swift:170-180`) → `screenshotPoint` (`Screenshot.swift:221-225`) → `ObservedScreenshot.windowPoint` (`Screenshot.swift:209`) | Model pixels of the connection's last screenshot of the primary window ÷ that image's per-axis scale (image px over window pt **at capture**, `Screenshot.swift:197-206`; Retina handled here). That gives a window-local point, plus the window's **current** AX origin: a global point (`ElementInput.swift:179`) | `deliverClick` (`Input.swift:314-318`) → `deliverPointer` → `postToProcess` → `CGEvent.postToPid(owner)` (`Mouse.swift:183-190`). The owner is the pid serving the AX hit at the point (`Input.swift:302-303`) |
| `click` on an element, synthesized (no advertised action, or the gate fails) | `ElementPointing.init`: AX frame → `visibleFrame` clip → `clickablePoint` = the visible part's midpoint (`ElementInput.swift:34-45`; `Routes.swift:191-221`), after `positionedTarget` scrolls it into view (`ElementInput.swift:154-159`; `Positioning.swift:36-45`) | Global points straight from AX (`AX.swift:73-76`) | `synthesizedClick` (`ElementInput.swift:198-223`) → `deliverClick` → `deliverPointer` |
| `click` on an element, route 1 (AXPress or AXPick) | The same `ElementPointing` is built (`Input.swift:280`), so `pointing.point` exists at no extra cost | Global points | `deliverAction` → `AXUIElementPerformAction` (`Input.swift:286-294`, `Input.swift:220-225`). Route 3's held activation comes first when the app does not believe it has focus (`Input.swift:289-292`) |
| `click` on a menu-bar item | The element; nothing is posted (a menu record and a held activation) | — | `Input.swift:273-277` |
| `drag` | `coordinatePoint` for both ends (`ScrollDrag.swift:146-147`); the midpoint is computed in `dragEvents` (`Mouse.swift:144`) | As for a coordinate click | `deliverPointer` (`ScrollDrag.swift:159-164`): five events, down, dragged ×3 and up (`Mouse.swift:132-153`) |
| `scroll` on an element, at x,y, or with neither (the window centre) | Element: `ElementPointing.point` after positioning (`ScrollDrag.swift:88-94`). Coordinate or centre: `ScrollDrag.swift:99-114` | Global points; the event also carries the window id in fields 51, 91 and 92 (`ScrollDrag.swift:50-57`) | `postToProcess([event])`, route 2′ (`ScrollDrag.swift:119-127`) |
| `perform_secondary_action` | Element only; no point is computed. Positioned at `SecondaryAction.swift:84` | `target.entry.frame` (the lineage's stored frame, `Lineage.swift:114-119`) gives a centre with no AX cost | AX action or AX write (`SecondaryAction.swift:103-105`) |
| `set_value` | Element, positioned (`ValueSetting.swift:90`); a focus fallback may click (`ElementInput.swift:228-239` → `synthesizedClick`) | `entry.frame`, or the fallback click's point | AX write (`ValueSetting.swift:74`) |
| `select_text` | Element, **not** positioned (`TextSelection.swift:151`); same focus fallback | `entry.frame` | AX write of the selected range (`TextSelection.swift:169`) |
| `press_key`, `type_text`, `paste` | No point. The keys go to the pid owning the focused element (`Input.swift:443-446`, `Paste.swift:224`) | The focused element's frame would be an extra AX read | `EventPoster.toProcess` → `postToPid` (`Keyboard.swift:336-338`); paste posts ⌘V (`Paste.swift:276-280`) |
| (internal) route 3's activation click | The window's `AXActivationPoint` (`Activation.swift:265-273`) | Global | `postToProcess`. This is an implementation detail, **not** an agent action; the cursor should not show it |

Window-local point on mouse events: `CGEventSetWindowLocation(point − window origin)` through `dlsym` (`Mouse.swift:79-82`, `Mouse.swift:173-179`). AppKit-side conversion for an overlay: Cocoa y = primary screen's maxY − global y. The reverse helper already exists (`topLeftFrames`, `Screenshot.swift:118-122`), and the screens are cached and refreshed on the main thread (`Screenshot.swift:135-168`).

### Narrowest hook points

All of these run on the connection thread inside the request. A sink must only enqueue: a `DispatchQueue.main.async` hop or a lock-guarded mailbox. It must **never** call `onMain` or `main.sync`, because main is busy with synchronous typing and pasteboard calls.

1. **Pointer funnel: `deliverPointer`** (`Input.swift:164-186`). Every synthesized pointer action passes through it:
   - coordinate click
   - synthesized element click
   - the focus-fallback click of `set_value` and `select_text`
   - drag

   Give it a `path: [CGPoint]` parameter (a click is `[target.point]` from `deliverClick`, `Input.swift:152-154`; a drag is `[start, end]` from `ScrollDrag.swift:159`). Then:
   - **about to act**: just before `activations.acquire` at `Input.swift:170`
   - **events posted**: right after `meta.posting` inside `send()` at `Input.swift:180`
   - **done**: in the existing `defer` at `Input.swift:169`, after the lease is released

   The activation click at `Activation.swift:273` does not pass through here, so it is excluded automatically.
2. **Scroll**: the closure at `ScrollDrag.swift:119-127`, using `target.point` from line 94 or 113.
3. **Route-1 element click**: `Input.swift:286-294`, with `pointing.point` (`Input.swift:280`).
4. **AX-only element methods**: `SecondaryAction.swift:103`, `ValueSetting.swift:94`, `TextSelection.swift:167`, using `target.entry.frame`'s midpoint.
5. **Keys and paste** (optional): `Input.swift:354`/`362`, `Input.swift:414`/`420`, `Paste.swift:253`. Showing a point here needs a focused-element frame read; do it after the action or off-thread.
6. **One universal "done"**: the existing `defer` in `Engine.execute` (`Methods.swift:148-152`). It runs after every method returns or throws and before `Server.swift:221` writes the answer. `ExecutionContext` (`Methods.swift:11-17`) is the natural carrier for a per-connection cursor sink to every method.

**Interaction with route 3 (inference).** Route 3 holds screen updates with `SLSDisableUpdate` on the engine's **own** main connection from just before the activation pair until the guard ends, capped at 100 ms (`Activation.swift:28-30`, `Activation.swift:35-49`, `Activation.swift:218-221`). Whether that freeze is per-connection or global is unverified; either way it freezes at least the engine's own windows. So:

- an overlay frame drawn during route 3's guard (37–82 ms measured, spec L151) does not reach the screen;
- the "about to act" move should be committed before `acquire`, or the design accepts a freeze of up to 100 ms.

For route 2′ (keys, scroll), the gap between resolution and posting is about 0 ms. The vendor's cursor has `CursorNextInteractionTiming = closeEnough | finished` (`E-helper-catalogue.md:318-320`), which suggests the vendor waits for the animation before acting. cua would have to decide whether to add any wait; any wait puts the cursor on the critical path.

---

## 3. Does any route move the real pointer?

No.

- Every pointer, scroll and key event is sent with **`CGEvent.postToPid`**:
  - `Mouse.swift:183-190`
  - `ScrollDrag.swift:126`
  - `Keyboard.swift:336-338`
  - `Activation.swift:78`, `Activation.swift:273`, `Activation.swift:277-283`
  - `Input.swift:318`, `ElementInput.swift:221`, `ScrollDrag.swift:161`
- There is no `CGWarpMouseCursorPosition`, `CGAssociateMouseAndMouseCursorPosition`, `CGDisplayMoveCursor` or `mouseMoved`, and no NSCursor use anywhere in the engine.
- The only HID-tap post is `EventPoster.toHIDTap` (`Keyboard.swift:340-342`). It is used only by the `--probe keystroke` stand-in user (`KeystrokeProbe.swift:206`), never by a request.
- The code says so explicitly: `Input.swift:12` ("never moves the real pointer"), `Mouse.swift:9`, `Positioning.swift:10` (scrolling into view is by AX, "the pointer never moved") and spec L150.
- Route 4 (`ForegroundAssist.swift:41-63`) activates the app (`NSRunningApplication.activate`, `Activation.swift:82`) but still posts to the pid. It changes the frontmost app, not the pointer.
- Side effect: keys and scrolls come from an `.hidSystemState` source, which resets the machine's HID idle counter (spec L166).

---

## 4. Screenshots

- **ScreenCaptureKit, one window.**
  - Filter: `SCContentFilter(desktopIndependentWindow:)`.
  - Call: `SCScreenshotManager.captureImage`.
  - Configuration: `showsCursor = false`, `ignoreShadowsSingleWindow = true`.
  - Size: the window frame × the backing scale of the best-matching screen, rounded up.

  See `Screenshot.swift:230-258` (filter at 247 and 253, cursor flag at 243) and the size rule at `Screenshot.swift:107-116` and `172-174`. The capture runs on its own thread, alongside the tree walk (`Skyshot.swift:119-134`).
- **An engine-owned overlay will not appear in observation screenshots.** A desktop-independent window filter renders only the target window's own content, whatever lies above it. No exclusion is needed for the default "hidden from the model" behaviour. Including it would need a different filter: a display filter with `including:` the target window plus the overlay, cropped to the window rect. That changes the capture's size semantics. The vendor does include its cursor window "as an extra when that feature shows it" (`docs/doperpowers/research/2026-10-18-own-native-engine/F-helper-logic.md:322`).
- **The overlay does affect the capture cache.** `ShareableWindowCache` keeps `SCShareableContent` and re-lists it when **the set of all on-screen window IDs** changes (`Screenshot.swift:39-58`, read with `CGWindowListCreate` at `Screenshot.swift:62-71`). Listing costs about 60 ms of a 134 ms capture on the MacBook (`Screenshot.swift:36-38`; spec L141 gives 156 ms cold).
  - An overlay window that is ordered in and out per action, or created per action, changes that set and adds a re-list to the next screenshot.
  - Moving a window, or changing its alpha while it stays ordered in, does not change the set.
  - **Where an exclusion goes:** filter the engine's own window numbers out of `onScreen` at `Screenshot.swift:47-48`, or keep the overlay ordered in for the session.
- `approve` captures a whole display with `SCContentFilter(display:excludingWindows: [])` (`Methods.swift:116-127`). An overlay on screen would appear in that image, but the image is discarded.

---

## 5. Harness watches (macOS: `scripts/native-matrix/`, `scripts/accept/`; tests under `test/native-matrix/`)

What each check reads, and whether an overlay trips it:

| Check | What it reads | Trips on |
|---|---|---|
| **Oracle front reading**: `scripts/accept/front-window.swift` via `matrix-device.mjs read` (`scripts/native-matrix/matrix-device.mjs:148-166`) | The frontmost app (`lsappinfo front`) and the **top on-screen window at layer 0** with width and height above 1 and alpha above 0 (`front-window.swift:52-68`, `front-window.swift:80-82`) | **A layer-0 overlay above the user's front window**: `sameFront` compares owner, number and bounds (`scripts/native-matrix/oracle.mjs:51-57`). Engine activation also trips it (frontmost changes). Windows at layer above 0 are ignored |
| **Activation watcher**: `cua-engine --probe watch-activations` (`Probe.swift:65-77`) | Every NSWorkspace activate and deactivate | **Any activation of `cua Engine`** inside a row's window plus 1 s counts against the row (`oracle.mjs:69-90`, `oracle.mjs:97-108`) |
| **Focus probe**: `--probe focus` (`FocusProbe.swift:140-141`) | The system-wide focused app and its focused window | An overlay that becomes key, or an engine that becomes the focused app; the row then fails "focus kept" (`oracle.mjs:99-100`) |
| **Keystroke probe gate** (`Probe.swift:79-91`) and **composition guard** (`scripts/native-matrix/live-checks.mjs:124-134`) | The first layer-0 window must be the named user window | A layer-0 overlay on top: the probe refuses to post |
| **Alert watch**: `live-checks.mjs:101-114` over `system-windows.swift` (all layers, w,h > 1, **alpha > 0**, `system-windows.swift:15-32`) | A window of a system-alert process; a title keyword; or **any window number not in the baseline**, of a pid outside `runPids`, at **layer 0–19** (`ALERT_LAYER_BELOW = 20`, `live-checks.mjs:85-87`, `live-checks.mjs:110`) | **The live paste check** passes `runPids: [record.pid, user.pid]` only (`scripts/native-matrix/live-device.mjs:356-363`), so the engine is **not** excluded: a new overlay window at layer below 20 aborts the paste section. **The matrix `alerts check`** excludes engine pids by executable path under the approved bundle (`matrix-device.mjs:297-335`; `steps.mjs:40-52`). That exclusion was added after the vendor's "ChatGPT Computer Use" 126×126 overlay tripped the watch (spec L1034; `docs/doperpowers/specs/2026-10-18-own-native-engine-m2b-report.md:113`). An alpha-0 window is invisible to the watch, so one that turns visible after the baseline counts as new |
| **Route 3's own guard**, inside the engine (`Activation.swift:225-246`) | The frontmost pid (NSWorkspace) and whether the target window is in front of the user's window (`windowIsInFront`, `Activation.swift:110-118`, comparing just those two ids) | **The engine becoming frontmost** makes every route-3 action fail `activationFailed` ("another app came to the front"). Window order alone does not matter |
| **Intervention tap** (`Intervention.swift:45-71`) | Field 51, the window id, is mapped to its owner pid. An event whose window is the engine's is attributed to the engine's pid, which is not driven, so it is **not** counted | If a user click hits the overlay rather than passing through, the click is neither delivered to the app nor seen as an intervention. With `ignoresMouseEvents` the WindowServer should route the click and annotate the window below (**inference; needs a probe**) |
| Unit tests `test/native-matrix/oracle.test.mjs` and `live-checks.test.mjs` | Pure logic over recorded readings | Not affected |

**Prior art read from the evidence.** The vendor's overlay sits in the normal window stack, ordered **directly above the target window and below the user's front window**. Its window log lists `6814:24000:ChatGPT Computer Use:1510,611,126,126` between Finder (front) and TextEdit (`docs/doperpowers/research/2026-10-18-own-native-engine/m2b/hold2a/window-log-attempt3.txt:87`), and the spec notes it "may show … as the top window" on background rows (spec L1036). The vendor's Linux build likewise does "target geometry tracking and restacking" (`docs/doperpowers/research/2026-10-28-own-linux-engine/F-linux-helper-logic.md:326`).

**What this means for the overlay.** An overlay passes every macOS check when it:

- never activates the engine;
- never becomes key (a non-activating panel with `canBecomeKey = false`);
- ignores mouse events;
- either sits at a level of 20 or more, or sits at layer 0 strictly below the user's front window.

At layer 0 it also has to be kept out of the paste check's `runPids` gap, or be ordered in before that check's baseline.

(Linux has a separate witness, `scripts/linux-engine-diff/witness.mjs:1-4`, which watches `_NET_ACTIVE_WINDOW`, `_NET_CLIENT_LIST_STACKING`, focus and the pointer. #171 deferred the Linux visible cursor to the backlog: `docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md:575`.)

---

## 6. Request lifecycle and where a cursor's lifetime can live

- **A connection is one MCP session's worker.** The JS service is "one per worker (the worker is the connection's)" and holds one engine connection (`src/services/engine/service.mjs:263-268`, `client.mjs:137-243`).
  - A timed-out request or a closed socket drops the connection; the next request reconnects, and that connection's lineages end (`client.mjs:15-21`).
  - The idle stop tears the runtime down, which closes the connection (`src/mcp/server.mjs:42-50`).
  - #211's Screen Recording recovery **shuts the engine down and relaunches it** (`relaunchForPermissions` in #211's `client.mjs`).
- **Engine-side state per connection.** `ConnectionState` (`Lineage.swift:25-59`) holds per-app (`ResolvedApp.key` = path#pid, `Apps.swift:19-20`) state: lineages including the last screenshot's scale and window, `needsSettle`, the intervention sets, menu records, the menu span and the focus hold.
  - **There is no per-app controller object.** Per-app state is these dictionaries.
  - Engine-wide state: `HeldActivations` per process (`Methods.swift:38-39`) and the intervention ledger per pid.
- **Connection end** is `Server.unregister` (`Server.swift:174-183`), which ends the menu span and focus hold and calls `engine.connectionClosed`. Shutdown goes through `stopAndExit` (`Server.swift:231-242`).
- **end_task is not visible to the engine or the computer service.** `end_task` → `TaskLifecycle.endTask` (`src/mcp/task.mjs:90-97`) → an upstream `turn_ended` tool call (`src/mcp/server.mjs:169-175`). The runtime and its engine connection survive it. Only the browser service listens, through `runtime.addTurnEndedHandler` (`TurnEndedTracker`, `src/browser-service/backend.mjs:368-409`).
- **The engine cannot name a session.** It has only a connection id; there is no session label on the wire. Several sessions can drive one resident engine at once (spec L131), so one engine may host several cursors.

**Where to put the cursor's lifetime:**

1. **The cursor object:** per `ConnectionState`, so one cursor per agent session, with a last point kept per app key (the vendor keeps `cursorPositionInScaledCoordinates` per app controller, `E-helper-catalogue.md:317`).
2. **Shown:** from the first acting request.
3. **Hidden on:**
   - `unregister` (`Server.swift:174-183`)
   - `stopAndExit` (`Server.swift:231-242`)
   - an idle bound (the engine already has idle-bound spans, `MenuSpan.swift`/`FocusHold.swift`)
   - lock (`Methods.swift:219-230`)
   - a new turn-ended signal: the service registers `addTurnEndedHandler` as the browser service does and sends a new engine request.
4. **Precedent:** MAWS's in-app browser cursor is shown on a pointer move and hidden after `end_task` (`docs/doperpowers/specs/2026-10-08-maws-in-app-browser-design.md:488-490`).

---

## 7. What #211 changes at the hook locations

**Engine Swift.**

- **`Input.swift`:** only `withMeta` (`Input.swift:134-139`), which now merges `meta` rather than replacing it. Line count is unchanged (+2/−2).
- **`Methods.swift`:** only the bodies of `requireAccessibility` and `requireScreenRecording` (`Methods.swift:199-213`), which now delegate to `EnginePermission.require`. Line count is unchanged (+6/−6).
- **New files:**
  - `Permissions.swift`
  - `WindowFrameProbe.swift`, a harness probe `--probe window-frame` that sets a harness-owned Finder window's frame by AX
  - `Probe.swift` dispatch, +1 case
- **Untouched:**
  - `deliverPointer`, `deliverClick`, `synthesizedClick`, `ScrollDrag.swift`, `ElementInput.swift`, `Mouse.swift`, `Activation.swift`, `Screenshot.swift`, `Server.swift` and `Lineage.swift`
  - `ExecutionContext` and the `execute` switch and its `defer` (`Methods.swift:11-17`, `129-191`)

  Line numbers in those files are the same before and after #211.

**JS service.**

- `client.mjs` gains a `pid` on the connection, `peerClosed`, `launch()` split out of `connect`, and the Screen Recording relaunch.
- `service.mjs` adds `'cua/permission'` to **the same `PER_CALL` line** (about L82) and changes the catch block (about L147).

**Rebase hazards for a cursor branch:**

- adding a `cua/…` meta key to `PER_CALL`;
- editing the error catch in `service.mjs`;
- adding launch logic in `client.mjs`;
- editing `Methods.swift:199-213` or `Input.swift:134-139`.

A trial merge of #211's head into main conflicts only in `.claude-plugin/*`, `src/cli.mjs`, `src/runtime/install.mjs`, `tech-debt-tracker.md` and `test/runtime-node.test.mjs` (`git merge-tree`). It does not conflict in any engine or service file. #211's spec diff has no cursor or overlay entry.

---

## 8. Other constraints from the engine and its spec

- **Decision Log, and scope.** The spec says "Decision: no cursor overlay, no per-app instruction texts, … in this work. Rationale: none is reachable by cua's facade today or wanted by the owner; MAWS synthesizes its own agent cursor" (spec L1102-1103), and scope L92 lists "a cursor overlay" as out of scope.
  - MAWS's cursor is the **in-app browser's** page overlay (`cursor.move {tabId, x, y}`, `docs/doperpowers/specs/2026-10-08-maws-in-app-browser-design.md:173`, `275-279`). It also hides from screenshots (`…:968-972`) and covers nothing native.
  - So #235 needs a dated Decision Log entry that supersedes L1102 for the cursor, or a child spec citing it.
- **Binding rules:**
  - The engine **never activates an app on its own**; the overlay must not activate the engine either (spec L147).
  - Apple frameworks only; SPI only through `dlsym` with feature detection (spec L129). AppKit and QuartzCore are enough for an overlay; the `setCursorUpdatesFromBackground` SPI the vendor has (`E-helper-catalogue.md:320`) would have to be resolved by `dlsym`.
  - Any engine source change moves `build`, which forces a rebuild, reinstall and **re-approve** (with a capture confirmation) on the mini (spec L208-210).
- **Main thread.** Typing, paste and rich text call `main.sync` per event (§1). An overlay animated by main-thread timers, or anything that blocks on main, slows `type_text` and paste and delays settle notifications (`Monitor.swift:61`). Core Animation layer animations (render-server driven), committed with a single `main.async` per update, keep the cursor off the critical path.
- **Not sandboxed.** The engine has hardened runtime and no entitlements; only the JS worker is sandboxed, and the engine directory is denied to it (spec L790). Nothing here blocks windows.
- **App Nap.** There is no activity or IOPM assertion (§1), so an idle accessory app with no visible window can be napped. The first cursor update after a long idle may be late.
- **Multiple displays and Spaces.** Use one overlay per screen, or a small window that moves (the vendor's is 126×126 and moves). `ScreenScaleCache` already tracks screen changes on main (`Screenshot.swift:135-168`).
- **Lock screen.** Every execute is refused while the Mac is locked (`Methods.swift:153-158`, `219-230`); the cursor should hide then.
- **Protocol.** `cua-engine-1` requires an exact match (`Methods.swift:85-93`). A new request type (for example a cursor show/hide, or a session label for per-session styling) is additive; an older engine answers `methodNotFound`. Bumping the version would break the deployed clients' exact check.
- **Opt-in switch.** Two places fit the existing rules:
  - `engine.json` (`Config.swift:3-9`), read once at launch, strict on the keys it knows;
  - a per-connection request or argument from the service, which fits "opt-in per session".
