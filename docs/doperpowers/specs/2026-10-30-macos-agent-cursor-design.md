# A visible agent cursor on macOS, drawn by cua's own engine (#235)

## Purpose

When an agent drives a Mac through cua's own macOS engine (#117), it acts in the background: it posts its clicks, drags and scrolls straight to the target app, and the person's real pointer never moves. Today nothing on screen shows where the agent is acting. After this change, every agent session that acts on the Mac shows its own cursor: a small rounded arrow with a frosted halo, tinted in the session's colour, with a pill naming the session. The arrow glides to each target along a smooth curve and dips at each click. It rocks gently while the agent thinks between actions, goes half-transparent while the person has taken over the app, and fades five seconds after the last action. It sits on the window it acts in, so whatever covers that window covers the cursor too, and it never takes a click, the focus or the front position. Screen recordings and screen sharing show it; the agent's own screenshots do not.

The cursor serves four situations, all of them the owner's (2026-10-30): the owner watching their own Mac live, several agents acting at once (MAWS supervises many sessions), recordings and demos, and remote cua devices watched over screen sharing. It is on by default and can be turned off per device or per session.

How to see it working, once M3 lands: on a Mac whose approved engine is this branch's build, with `CUA_NATIVE_ENGINE=cua`, any cua_repl session that clicks in a background TextEdit window shows its cursor gliding there and dipping as the click lands, labelled with the session's name; `cua engine status` reports `cursor: on`.

Vocabulary used throughout:
- **The engine**: `cua Engine.app`, the Swift executable built from `native/engine/`, one resident per Mac at `~/Library/Application Support/cua/engine/` (#117's spec, "Install, signing and permissions").
- **The service**: cua's JS computer service for macOS, `src/services/engine/` (`service.mjs`, `client.mjs`), one per MCP session, holding one engine connection.
- **A connection**: one service's socket to the engine; the engine keeps its state in `ConnectionState` (`native/engine/Sources/Engine/Lineage.swift`). One connection is one agent session.
- **The target window**: the window an action is aimed at, the one the engine posts into.
- **The vendor cursor**: the cursor OpenAI's helper (`SkyComputerUseService`, Codex Computer Use) draws; read statically from build 26.924 (identical constants in 26.1021). Its behaviour and logic are in `docs/doperpowers/research/2026-10-30-macos-agent-cursor/vendor-cursor.md` (cited below as **VC**, with section numbers; its appendices give each function's address, inputs, outputs, constants and Swift pseudocode).
- **The engine reading**: `docs/doperpowers/research/2026-10-30-macos-agent-cursor/engine-hooks.md` (cited as **EH**), where every hook point and constraint in cua's engine is located by file and line at `fc15e1b8` and #211's head `a8c3bc1c`.
- **The look reference**: `docs/doperpowers/research/2026-10-30-macos-agent-cursor/look-mockup.html`, an animated page the owner reviewed and approved; its option A is the look this spec builds.

## Progress

- [x] (2026-10-30) Design session (cua_repl#1ea561bc, coordinating #171 in parallel): three research readings (engine hooks, the vendor cursor's behaviour and logic, prior art and macOS overlay technique), three question rounds with the owner, an animated look mockup; design approved by the owner.
- [ ] Spec review (independent spec review and the execution section's buildability review).
- [ ] M1 — The cursor in the engine: overlay, motion, states.
- [ ] M2 — Identity, settings, lifecycle wiring and the harness.
- [ ] M3 — The attended proof on the MacBook, the plugin bump, the docs.

## Owner decisions this design carries

All 2026-10-30, from the design session:

| # | Decision | Alternative the owner turned down |
|---|---|---|
| O1 | Serves the owner live, several agents at once, recordings and demos, remote devices. | — |
| O2 | Each session: its own colour and a name label. | Colour only; all the same. |
| O3 | Visible while acting; rocks while thinking; fades 5 s after the last action; returns at the next action. | 1.5 s or 3 s fade; never fading (the vendor's). |
| O4 | On by default; off per device or per session. | Opt-in; MAWS-only. |
| O5 | Actions happen at once; the cursor glides there and marks the click on arrival. | Actions wait for the cursor (the vendor's); a per-session demo pacing switch. |
| O6 | The cursor sits on its target window: what covers that window covers it. | Always on top of everything. |
| O7 | The agent's own screenshots leave the cursor out. | Include it (the vendor's). |
| O8 | Keep the thinking rock and the half-transparent taken-over state. | No states. |
| O9 | Look A, "Codex-like" (the look reference's option A). | B, MAWS's browser cursor; C, a minimal ring. |
| O10 | Outside MAWS the label is the session's sminos name, else the project folder's name; MAWS sets its own title. | "Claude" for all; no label outside MAWS. |
| O11 | Reading the vendor's code and translating parts of it is allowed wherever it makes cua more capable or faster; no unverified open-source project is a source of code or design. #120 (clean room) is not a concern now. | Clean-room only. |
| O12 | Separate from #225 (the Linux cursor), which stays Linux-only. | One cross-platform ticket. |

## Design

### What the person sees

**The look** follows the look reference's option A (O9). The arrow is cua's own drawing, a rounded navigation arrow pointing up-left, about 13.5 pt on screen (an 18-unit path drawn at 0.75), filled with the session's colour and outlined with a 2 pt white stroke at 80 % opacity, with a faint shadow so it reads on white. Around it sits the **halo**: a soft circle of about 42 pt (edge blur 12) that blurs and lightens what lies behind it, as frosted glass does, and swells up to 2.5× with speed (the vendor's swell, VC §4; the look reference reproduces its curve) while the arrow stays the same size. The **label** is a pill beside the arrow, below and to the right of the tip, in the session's colour with white text (system font, 11 pt, medium weight, at most 24 characters with an ellipsis), placed so it never covers the point the arrow acts on. The vendor's own arrow path and assets are not used: the owner wanted the look, not the artwork.

**States**, each animated in with an ease-in-out of 0.2 s (VC §4):

| state | what shows | entered when | left when |
|---|---|---|---|
| hidden | nothing (the window is ordered in, fully transparent; see Rendering) | the session has not acted yet; after a fade; after the session ends | the session's next action |
| acting | the arrow moving or resting at the target; a press dip at a click | an action reaches a hook | the action's motion settles |
| thinking | the arrow rocks ±10° (ease-in-out, about 0.68 s per swing), its fill a little stronger (the vendor goes from 16 % to 24 %; cua's coloured fill rises by the same ratio) | the action's motion has settled and no new action has come | the next action (to acting), 5 s after the last action (to fading), the person taking over (to taken over) |
| taken over | the whole cursor at 50 % opacity, still | the engine's intervention detection reports the person acting in the same app (`Intervention.swift`) | the next agent action (to acting); 5 s idle (to fading) |
| fading | opacity and blur out over 0.44 s (the vendor's fade-in time, VC §2, used both ways) | 5 s after the last action | the fade ends (to hidden); an action arrives (to acting, faded back in from where it is) |

**Pacing (O5).** The engine never waits for the cursor. When an action fires, the hook hands the cursor the target point (or the drag's path) and returns; the event or accessibility action goes out at once. The cursor glides there from wherever it is and plays the press dip as it arrives, so it can trail the action by up to the glide's length (about 0.34–0.97 s for a long move). This is the opposite of the vendor, which makes coordinate actions wait for the whole glide and element clicks for 99.5 % of it (VC §3); cua keeps its speed.

**Where it shows (O6).** The cursor's window is ordered directly above the target window, at that window's level, so windows above the target cover the cursor exactly as they cover the target. While the target app is the frontmost app or has a menu open, the cursor's window rises to level 102, above menus, as the vendor's does (VC §1, Appendix C §3), so a cursor acting in the front app or in a menu stays visible. When the target window is not on screen in the current Space, or is minimised, the cursor hides. When the target window moves, the cursor follows at its next motion (the vendor follows only during motion; cua re-reads the target's frame at each action).

**Several agents.** Each connection has its own cursor, with a last position kept per target app, so two agents acting in two apps show two cursors in two colours, and two agents in one app show two cursors over the same window.

**Reduce Motion.** When the person has Reduce Motion on (`NSWorkspace.accessibilityDisplayShouldReduceMotion`, observed live through `NSWorkspaceAccessibilityDisplayOptionsDidChangeNotification`), every motion is a straight 0.15 s ease-out with no squash, tilt, swell or rock, and the press dip is a 0.1 s opacity dip instead of a scale. With Increase Contrast on, the fill is drawn fully opaque and the stroke at 100 %. The vendor handles neither (VC §5).

**Screen capture (O1, O7).** The cursor windows set `sharingType = .readOnly`, so screen recording, screen sharing and the person's screenshots show them. The agent's screenshots capture one window at a time through ScreenCaptureKit (`SCContentFilter(desktopIndependentWindow:)`, EH §4), so a separate cursor window is never in them, with no extra work. `sharingType = .none` is not used: on macOS 15.4 and later ScreenCaptureKit is reported to ignore it, and it would hide the cursor from the recordings O1 asks for.

### The overlay window

One borderless, transparent `NSPanel` per cursor, created on the engine's main thread at the session's first action:
- style `.nonactivatingPanel`, `canBecomeKey` and `canBecomeMain` false, `ignoresMouseEvents = true`, `hasShadow = false`, `isOpaque = false`, clear background, title "cua Agent Cursor";
- `collectionBehavior`: `.canJoinAllSpaces`, `.fullScreenAuxiliary`, `.ignoresCycle`, `.transient`; the vendor's is `0x40048` (VC §1), and `.canJoinAllSpaces` with `.fullScreenAuxiliary` is what keeps a non-activating panel usable over another app's full-screen Space (macOS 26 behaviour reported on Apple's developer forums);
- frame: the visible frame of the screen that holds the target point, so one cursor can glide anywhere on that display; when an action's target point is on another screen, the panel moves to that screen and the cursor starts from the nearest point on the new screen's edge (a snap, not a glide across screens);
- ordering: `order(.above, relativeTo: targetWindowNumber)` at the target's level, or level 102 per "Where it shows", re-applied at every action.

Why a panel spanning the display, not the vendor's small 126 pt window that moves every frame: a moving window needs a frame update on the main thread every display frame, and the engine's main thread is on the typing path (each key is posted through `DispatchQueue.main.sync`, `Keyboard.swift`, EH §1). A display-wide panel lets Core Animation move the cursor layer inside it with no main-thread work per frame (Rendering, below). M1's first step checks the one thing this costs, the halo's blur following an animated layer; the fallback order is in M1.

Why `NSPanel` at the target's level rather than a window at `.screenSaver` level: O6 wants the cursor covered by whatever covers the target, which only window ordering gives; and a non-activating panel that cannot become key is what keeps the harness's focus, activation and keystroke-gate checks clean (EH §5).

### Motion

The motion is the vendor's, translated (O11). Every function below names the vendor function it comes from, and the translation cites the same name and address in a comment, as `native/engine/Sources/Engine/Derivations.swift` does for #117. All points are in the cursor panel's coordinates, with the arrow's tip at the point (the vendor's tip-to-hotspot alignment is undetermined, VC §7; cua puts the tip exactly on the target point, which the person reads as "here").

**Two modes**, chosen by distance (`FUN_100092ba4`, VC Appendix B §3.2):
- **Snap**: no animation when the cursor is hidden and fading in at the target (an action from hidden fades in at the target point, it does not glide in from nowhere), when Reduce Motion is on (then the straight ease above), or when the skip check of `FUN_100091650` (VC Appendix A §9) says so.
- **Scoot**, for moves of at most 196 pt: a point spring with secondary springs for stretch, squash and tilt (VC Appendix B §3.4, Appendix A §7.4).
- **Path**, for longer moves: a Bézier path chosen from 20 candidates, carried by a progress spring from 0 to 1 (VC Appendix A §1–6, Appendix B §3.3).

**The constants** are `MotionConfiguration.live` (VC §3), reproduced exactly:

| field | value |
|---|---|
| clickAngle (resting tilt) | −44° |
| candidateCount | 20 (2 base curves and 18 arcs) |
| boundsMargin | 20 pt |
| startHandle / endpointHandle | 0.41960295 / 0.15 (handle = clamp(dist·h, 48, min(0.9·dist, 640))) |
| arcSize | 0.27655232 (clamp(dist·arcSize, 50, 520), scaled by [0.55, 0.8, 1.05]) |
| arcFlow | 0.57835553 (clamp(dist·arcFlow, 38, 440), scaled by [0.65, 1.0, 1.35]) |
| straightPathDistanceThreshold | 10 pt |
| springResponseScaler / Min / Max | 0.9 / 0.12 s / 2.2 s |
| springDampingFraction | 0.9 (idle threshold 0.01) |
| scootDistanceThreshold | 196 pt |
| scootPositionResponse / DampingFraction | 0.24 / 0.84 |
| scootPositionSettleVelocity | 12 pt/s |
| scootAxisResponse / Damping | 0.07 / 0.82 |
| scootBaseRotationResponse / Damping | 0.09 / 0.86 |
| scootStretchResponse / Damping | 0.095 / 0.72 |
| scootStretchMin / PivotX / XAmount / SquashYAmount | 0 / 0.5 / 0.38 / 0.18 |
| scootRotationResponse / Damping / Max | 0.055 / 0.76 / 76° |
| terminalTangentBlendStart | 0.99 |

**Path choice** (`FUN_100099938`, `FUN_100094558`, `FUN_100094d24`, `FUN_100099624`): every candidate is measured from 24 samples per segment and scored `cost = length + 320·detour + 140·angleChangeEnergy + 180·maxAngleChange + 18·totalTurn + (arc ? 45 : 0) + backwardPenalty`; only candidates inside the target screen's visible frame inset by 20 pt count when any do; the lowest cost wins, ties to the first. **The progress spring's response** is `FUN_100095014`'s formula (VC §3), between 0.12 and 2.2 s. **The integrator** is the vendor's: velocity-Verlet at a fixed 1/240 s step, k = (2π/response)² capped at 28800, drag = 2√k·ζ, finishing by snapping to the target once the speed falls under the idle threshold (VC Appendix B §1). **The heading**: on a path the arrow faces its direction of travel, `angle = (atan2(−ty, tx)·180/π + 90 − clickAngle)·π/180` for tangent t, blended back to rest over the last 1 % of progress (ease-out cubic); a scoot does not turn toward its travel but tilts by up to 76° on its envelope and relaxes (VC Appendix A §7).

**The press dip** (`VirtualCursor.press()`, VC §6): scale to 0.7 over 0.1 s and back over 0.1 s on the vendor's press spring (stiffness 130.5, damping 18.85), played when the cursor arrives at a click's point (O5). **Drags** trace their path: the cursor glides to the drag's start, dips, then follows the drag's own points at the drag's pace, and rests at its end (the vendor's behaviour here is undetermined, VC §7; tracing it shows the person what was dragged). **Scroll** glides to the scroll point with no dip. **Keyboard-only actions** (a key press or typing with no element point) do not move the cursor; they count as actions for the idle timer, so a long typing run keeps the cursor in thinking, not fading.

**Retargeting.** An action arriving while the cursor is still moving starts a new motion from the cursor's current presented position and velocity (read from the layer's presentation state), so the cursor turns toward the new target without jumping.

### Rendering and the main thread

The engine's main thread runs every keystroke (`Keyboard.swift`), so the cursor does no work on it per frame:
1. The hook calls `CursorHub.act(…)` (Interfaces) on the calling request's thread. It records the action and returns.
2. A serial cursor queue (not main) computes the whole motion: the mode, the chosen path, and the spring integration at 240 Hz into a sampled trajectory of position, angle, stretch, squash and halo swell.
3. One block, dispatched with `DispatchQueue.main.async` (never `sync`), orders the panel above the target and installs the trajectory as `CAKeyframeAnimation`s on the cursor's layers, in one `CATransaction`. Core Animation's render server plays it.
4. State animations (thinking rock, fade, taken over) are long-running Core Animation animations installed the same way.

The cursor's views are layer-backed AppKit views (`CAShapeLayer` for the arrow, a text layer for the pill), not SwiftUI, so nothing re-renders per frame. The halo is a backdrop blur of what lies behind the panel, masked to a soft circle. Which mechanism gives a backdrop blur that follows a Core Animation–animated layer is M1's first question (M1, step 1). The answer decides between this rendering and the fallback, without changing anything the person sees or the typing-speed acceptance.

The panel stays ordered in for the whole connection, fully transparent when hidden, and is ordered out only when the connection closes. The engine's screenshot path re-lists ScreenCaptureKit's shareable content whenever the set of on-screen window numbers changes (`Screenshot.swift`, EH §4, about 60 ms on the MacBook). So, too, that cache's key leaves out the engine's own windows, so a cursor appearing never costs a screenshot a re-list.

Energy: nothing animates while the cursor is hidden; the rock animates only while thinking (at most 5 s at a time); the engine takes an `NSProcessInfo` activity (`.userInitiated`, not `.idleSystemSleepDisabled`) only while a cursor is visible, so App Nap cannot delay a motion that is due.

### Hooks: where the engine tells the cursor

Every hook is one call to `CursorHub.act(connection:app:window:kind:)` placed after the target point is resolved and before the event is posted, plus nothing on the way out (O5). The points, located in EH §2:
- `deliverPointer` in `native/engine/Sources/Engine/Input.swift`: every coordinate click, right click, double click and drag, and route-1 fallback clicks. The call goes before `activations.acquire` (route 3 freezes screen updates on the engine's own connection for up to 100 ms, `Activation.swift`, so the cursor's commit goes out before the freeze).
- The element click's point in `Input.swift` (route 1).
- Scroll in `native/engine/Sources/Engine/ScrollDrag.swift`.
- The accessibility-only element methods, at the midpoint of the element's stored frame: `SecondaryAction.swift`, `ValueSetting.swift`, `TextSelection.swift`, and `type_text`/`paste` aimed at an element.
- Keyboard-only actions (`press_key` and typing with no element): `CursorHub.touch(connection:)`, which only resets the idle timer.

Kinds: `.click(point)`, `.press(point)` for an element action with no posted click, `.drag(path)`, `.scroll(point)`. The point arrives in global top-left screen coordinates (EH §2, `ElementInput.swift`); the hub flips it into AppKit's bottom-left space of the panel's screen.

#211 (#117 M4, open) changes none of these hook points (EH §7): it touches `withMeta` in `Input.swift`, the `require*` bodies in `Methods.swift`, and in the service the `PER_CALL` line and catch block of `service.mjs` and the launch logic of `client.mjs`. This branch rebases onto #211 when it lands; a conflict there is resolved by keeping both changes.

### Lifecycle and identity

**One cursor per connection** (`ConnectionState`), with the last point per app key (`ResolvedApp.key`, path#pid), hidden (fading) on:
- 5 s with no action (O3);
- the session's `end_task`: the service registers a turn-ended handler (`runtime.addTurnEndedHandler`, as `src/browser-service/backend.mjs`'s `TurnEndedTracker` does) and sends `cursor` with `{"hide": true}` (Interfaces);
- the screen locking (`Methods.swift` already refuses every execute while locked);
- the target window leaving the current Space or being minimised.

The panel is ordered out and released on the connection's close (`Server.unregister`) and on the engine's shutdown (`stopAndExit`).

**Identity.** At connect, the service sends one `cursor` request with the session's label and colour (Interfaces), resolved in this order:
1. **MAWS**: the environment variables `CUA_CURSOR_LABEL` and `CUA_CURSOR_COLOR` (`#rrggbb`), which MAWS sets for the sessions it supervises (MAWS's side is later work, outside this spec).
2. **The session's sminos name** (O10): the alias the desk shows for the Claude Code session that owns this MCP server, found by the session id (`CLAUDE_CODE_SESSION_ID`, when the MCP server's environment has it) through the sminos plugin when it is installed. M2 establishes the exact lookup (a delegated unknown, M2), bounded to 500 ms and cached; any failure falls through.
3. **The project folder's name**: the basename of the session's working directory.

Sources 2 and 3 are resolved on the trusted side, in `src/runtime/launch.mjs`, before the worker starts: the service runs inside the sandboxed worker, which can neither run the sminos command nor read `~/.claude/`. The launcher puts the result into the worker's environment as `CUA_CURSOR_LABEL` unless MAWS already set it, so the service only ever reads the three variables.

The colour, when MAWS gives none, is a stable pick from eight colours by a hash of the session id (else of the label): clay `#c9663f` (MAWS's accent), blue `#2f6feb`, green `#1f883d`, violet `#8250df`, teal `#0f8b8d`, amber `#bf8700`, pink `#cf3a7f`, slate `#57606a`. These are hues: the pill's background uses a shade of each that gives its white 11 pt text at least 4.5:1 contrast (WCAG AA for small text; clay and amber need darkening for the pill), while the arrow's fill keeps the hue itself. M1's tests pin the contrast of every pill shade.

**Settings (O4).** The cursor is on unless:
- **per device**: `~/.config/cua/engine.json` has `"cursor": false`. `Config.swift` gains the key, strict like the others: a value other than `true` or `false` stops the engine at start with a sentence naming it. The engine reads it once at launch, as it reads `peerPolicy` and `routes`.
- **per session**: the environment variable `CUA_CURSOR=0` for the MCP server (the service sends `cursor` with `{"enabled": false}`), or the `cursor` request's `enabled: false` from any client of the wire.

`cua engine status` and `cua doctor`'s engine row report `cursor: on` or `cursor: off (engine.json)`.

### The harness

The checks that guard the person's desktop must keep passing with a cursor on screen, and they must see the cursor where it would be a fault. From EH §5:
- the activation watcher, the focus probe and route 3's own guard need nothing: the panel never activates the engine and never becomes key;
- the keystroke probe gate and composition guard read the first layer-0 window: they skip windows owned by the approved engine's bundle path (the same rule the matrix's alert check already applies, `scripts/native-matrix/matrix-device.mjs`, `steps.mjs`);
- the live paste check (`scripts/native-matrix/live-device.mjs`) passes the engine's pids into its alert watch's `runPids`, as the matrix check does;
- **the intervention tap**: with `ignoresMouseEvents`, a person's click on the cursor's area should reach and be annotated as the window beneath (inference, EH §5). M1 proves it, since a click swallowed by the panel would be neither delivered nor seen as the person taking over.

### #117's spec

#117's design (`docs/doperpowers/specs/2026-10-18-own-native-engine-design.md`) excludes a cursor overlay in its scope line and in its Decision Log entry of 2026-10-18 ("no cursor overlay … MAWS synthesizes its own agent cursor"). That entry's reason held only for MAWS's in-app browser pages, whose cursor MAWS draws. M1 adds a dated entry to #117's Decision Log superseding it and pointing here.

## Acceptance

Run on the owner's MacBook, attended (M3), with the branch's engine built and approved, `CUA_NATIVE_ENGINE=cua`, and the fixture apps of #117's harness. Items 1–7 are watched by the owner and recorded on video; 8–10 are measured.

1. **It shows where the agent acts.** A cua_repl session clicks a button in a background TextEdit window, then one in a background Safari window: the cursor fades in at the first target, glides along a curve to the second, and dips as each click lands. The click lands at once, not after the glide (O5): the button's state changes before or while the cursor arrives.
2. **Identity.** Two sessions acting at once show two cursors, each in its own colour, each pill reading the session's sminos name; with `CUA_CURSOR_LABEL=Research CUA_CURSOR_COLOR=#2f6feb` set for one, its pill reads "Research" in that blue.
3. **States and timing.** After an action the arrow rocks; 5 s later it fades over about 0.44 s; the next action fades it back in at its target. When the owner clicks in the app the agent is driving, the cursor goes half-transparent until the agent's next action. `end_task` fades it at once.
4. **Covered and front (O6).** With the agent's TextEdit window partly under the owner's front window, the cursor disappears under the front window wherever it passes under it. With TextEdit frontmost and a menu open, the cursor shows above the menu.
5. **Never in the way.** While a cursor is visible, the owner's clicks on the area under it reach the window beneath; the front app, the key window and the focused element do not change because of the cursor (the harness's activation watcher and focus probe report nothing for the engine's pid); the cursor does not appear in the agent's screenshots (`get_app_state` images); it does appear in a screen recording made with QuickTime or `screencapture -v`.
6. **Reduce Motion.** With Reduce Motion on, moves are short straight eases with no squash, tilt or rock.
7. **Off switches.** With `"cursor": false` in `~/.config/cua/engine.json` (and the engine relaunched), no cursor appears and `cua engine status` says `cursor: off (engine.json)`; with `CUA_CURSOR=0` for one session, that session shows none while another does.
8. **The motion matches the vendor's.** The motion module's unit tests reproduce the vendor's numbers: for a fixed set of start and end points (short, long, near a screen edge, backward), the chosen candidate, its cost and the progress spring's response equal the translated vendor functions' outputs, and the spring's settle time matches the integrator's. A side-by-side recording of the vendor cursor (the vendor engine, `CUA_NATIVE_ENGINE=vendor`) and cua's on the same scripted moves is shown to the owner, who judges the feel.
9. **Typing speed is unchanged.** `type_text` of a 200-character string and 30 single `press_key` calls into TextEdit, timed with the cursor on (and moving: each typing request follows a click that starts a long glide) and with it off, interleaved in one sitting, 20 samples a side: the cursor-on median is within the noise rule of the cursor-off median, the bootstrap 95 % interval of the difference including 0 with its upper end at most max(5 % of the off median, 1 ms) (the rule #171's Acceptance 3 uses).
10. **Click speed is unchanged.** The same comparison for coordinate clicks, element clicks and drags.

## Execution

### Constraints that bind every milestone

- **Sources (O11).** The vendor's code may be read and translated; translated code cites the vendor function (name and address) in a comment. Raw decompiled listings stay out of the repository (they are local, under `~/.local/share/cua-235/research/vendor/` on the MacBook). No code or design from unverified open-source projects. The vendor's arrow path and image assets are not used (O9).
- **Libraries.** Apple frameworks only, as #117's engine (AppKit, QuartzCore, Foundation); no package dependency.
- **The engine protocol** stays `cua-engine-1`, matched exactly by every client (`Methods.swift`, `Version.swift`): the new request is additive, and an older engine answers it with its existing unknown-method error, which the service treats as "no cursor" and never as a failure of the session.
- **No action ever waits for the cursor** (O5), and nothing the cursor does can fail an action: a cursor error is logged to the engine's log and the action proceeds.
- **The mini.** Nothing in this work runs on the Mac mini, writes its `~/.config/cua/engine.json`, or touches its checkout, runner or engine; the mini is reserved for MAWS's work. The live proof is the MacBook's (owner's choice, 2026-10-30).
- **The MacBook's approved engine** is replaced by this branch's build only in M3's attended sitting, with the owner at the screen for codesign's key prompt and the Accessibility and Screen Recording grants (#117's "Install, signing and permissions"). The owner's own sessions use the vendor engine by default and are unaffected.
- **The plugin bump** (`.claude-plugin/plugin.json`, minor) comes with M3; the PR merges only when ci-gate is green on its head with the hosted-macOS `test` and `engine-swift` gates among those that ran, its body lists every macOS-visible change checked against the diff, and it carries nothing from another initiative's open bump (#171's rule, `docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md`, Constraints).

### M1 — The cursor in the engine: overlay, motion, states

**What exists at its end.** The engine draws a cursor for each connection when actions reach the hooks, with the look, states, motion, ordering, Reduce Motion and capture behaviour of the Design, and the motion module reproduces the vendor's numbers in unit tests. The identity is a fixed placeholder label and colour per connection (M2 wires the real ones); the cursor is always on (M2 adds the switches).

**Step 1, a spike: the halo's backdrop blur and the main thread.** Before building the renderer, answer two questions with a throwaway build, run on the MacBook by the executor (no grants are needed to draw a window; driving apps is not needed):
- Does a backdrop blur masked to a soft circle follow a layer moved by a `CAKeyframeAnimation` inside a display-wide transparent panel, at display rate, with no main-thread work per frame? Candidates, in order: `NSVisualEffectView` (`.behindWindow`, `.hudWindow` or `.underWindowBackground` material) as the moving layer's content; a `CALayer` `backgroundFilters` Gaussian blur (works only if the window server honours it for a non-opaque window behind content; measure).
- With a cursor gliding continuously, does a tight loop of `DispatchQueue.main.sync` no-op blocks (standing in for key posts) see any added latency against no cursor?

Promote the Rendering design if a candidate blurs smoothly and the main thread shows no added latency. Otherwise, in this order: (a) keep the display-wide panel and draw the halo without backdrop blur, as a soft translucent disc in the session's colour (the look degrades; tell the design session before building); (b) the vendor's way, a small window moved every frame from a display link, only if the main-thread loop shows the added latency within the noise rule of Acceptance 9. Record the verdict in Surprises & Discoveries with the measurements, and tell the design session before building on a fallback.

**Then the build.**
- **Touches:** new `native/engine/Sources/Engine/Cursor/` (the hub, the panel, the views, the motion module, the states); the hook calls in `Input.swift`, `ScrollDrag.swift`, `SecondaryAction.swift`, `ValueSetting.swift`, `TextSelection.swift`, `Keyboard.swift` (the touch), `Paste.swift`; `Server.swift` (order out on unregister and shutdown); `Screenshot.swift` (the shareable-content cache key leaves out the engine's own windows); `native/engine/Tests/EngineTests/` (the motion and state tests); `docs/doperpowers/specs/2026-10-18-own-native-engine-design.md` (the superseding Decision Log entry).
- **Interfaces produced:** `CursorHub` with `act` and `touch`, the `CursorAction` kinds, `CursorMotion` (Interfaces and Dependencies).
- **Decisions of this milestone:**
  - The motion module is pure: inputs are the start state, the target and the screen's visible frame; output is the sampled trajectory. Its tests run headless on CI's `engine-swift` gate. The panel and views are exercised by a small `--probe cursor` mode (beside the existing probes in `Probe.swift`) that draws a cursor on the current screen and runs a scripted set of moves, presses and states, used by the executor and by M3.
  - The intervention tap: with a cursor visible over a fixture window, a click posted at the cursor's area through the HID tap (as the keystroke probe posts) must reach the fixture window and be attributed to its pid, not the engine's; prove it with `--probe cursor` and the existing intervention reading. If it is not, set the panel's `ignoresMouseEvents` and also exclude the panel from hit-testing (`NSWindow.Level` and `sharingType` do not affect it), and record what worked.
  - The taken-over state needs the intervention detector to tell the cursor hub; it does so from the detector's existing per-pid ledger, never by a new event tap.
  - Multiple screens: the panel moves to the screen of the target point (Design). Spaces and full screen: tested by hand with `--probe cursor` over a full-screen app.
- **Does not touch:** the wire (no `cursor` request yet), `src/`, the settings, the harness scripts.
- **Proves:** Acceptance 8's unit part (the vendor numbers), and these behaviours its tests pin: the state table's transitions (hidden → acting → thinking → fading → hidden; thinking → taken over; any → acting on an action; the 5 s timer reset by `touch`); retargeting starts from the presented position; Reduce Motion gives straight eases; the press dip plays at arrival, not at the call; the colour palette's contrast.

### M2 — Identity, settings, lifecycle wiring and the harness

**What exists at its end.** Each session's cursor carries its real label and colour; `end_task` hides it; the device and session switches work and are reported; the harness's desktop checks pass with a cursor on screen.
- **Touches:** `native/engine/Sources/Engine/Methods.swift` (the `cursor` request), `Config.swift` (the `cursor` key), `Lineage.swift` (the per-connection identity and switch); `src/services/engine/service.mjs` and `client.mjs` (send `cursor` at connect, the turn-ended handler, `CUA_CURSOR`, `CUA_CURSOR_LABEL`, `CUA_CURSOR_COLOR`, the unknown-method tolerance), `src/runtime/launch.mjs` (resolve the label on the trusted side and pass the three variables into the worker's environment allowlist), `src/runtime/doctor-engine.mjs` and the `cua engine status` output (the `cursor` line); `scripts/native-matrix/` (the two harness changes); tests under `test/` for the service and doctor parts; `README.md`'s environment table (the three variables and the `cursor` key).
- **Interfaces consumed:** M1's `CursorHub`. **Produced:** the `cursor` wire request (Interfaces and Dependencies).
- **Decisions of this milestone:**
  - **The sminos lookup (the delegated unknown).** Find how a process inside a Claude Code session can learn that session's sminos alias: the sminos plugin's scripts and its local state under `~/.claude/sminos/`, keyed by the session id when `CLAUDE_CODE_SESSION_ID` reaches the MCP server's environment. Use a documented sminos command if there is one; read its state files only if their shape is stable and documented by sminos; otherwise skip this source and record why. Bounded to 500 ms, cached per session, never blocking the session's start.
  - The label is trimmed, stripped of control characters, and cut at 24 characters with an ellipsis; an empty label falls through to the next source.
  - A colour given by MAWS that is not `#rrggbb` is ignored with a log line; the hash colour is used.
- **Does not touch:** the motion, the look, the states (M1's).
- **Proves:** Acceptance 2's and 7's mechanics in unit tests (the service sends the right `cursor` request for each environment; doctor's line; the strict `cursor` key), and the harness's own unit tests (`test/native-matrix/`) with a recorded cursor window in their readings.

### M3 — The attended proof on the MacBook, the plugin bump, the docs

**What exists at its end.** The acceptance section run on the MacBook with the owner, its videos and measurements in `docs/evidence/2026-10-30-macos-agent-cursor/`; the plugin bumped; README's computer-use section describing the cursor, its states and its switches; the PR open under the plugin-bump conditions.
- **Touches:** `.claude-plugin/plugin.json`, `README.md`, `docs/cua-api/core.md` (a line on what the person sees while an agent acts), the evidence directory.
- **Decisions of this milestone:** the sitting is one attended block with the owner at the MacBook: build and approve the engine (the owner answers codesign's key prompt and the grants), run Acceptance 1–7 with the owner watching and a screen recording running, run 9–10 interleaved, record the vendor-versus-cua side-by-side for 8, then put the MacBook's approved engine back to the build it had before the sitting (rebuild from `origin/main` and approve), unless the owner says to keep this one.
- **Proves:** Acceptance 1–10 as written.

## Concrete Steps

From the worktree root (`/Users/new/Developer/GitHub/cua-235` on the MacBook, or the seat's own worktree):

```bash
# M1, M2: the engine's build and unit tests (the engine-swift gate runs the same)
swift build -c release --package-path native/engine --scratch-path "$TMPDIR/cua-engine-235"
swift test --package-path native/engine --scratch-path "$TMPDIR/cua-engine-235"
# expected: all tests pass, among them the motion module's vendor-number tests and the state-table tests

# M1: the cursor probe, on the MacBook's screen (no grants needed to draw)
"$TMPDIR/cua-engine-235/release/cua-engine" --probe cursor
# expected: a cursor appears, runs the scripted moves (scoot, long path, edge, backward), a press, thinking, taken over,
#           fade; exits 0 printing one line per step with its measured duration

# M2: the JS tests
npm test
# expected: pass; the service's cursor tests and doctor's cursor line among them

# Every milestone: the hosted gates
ci-gate --gates test,engine-swift,plugin
# expected: GREEN on the pushed head

# M3, attended (OWNER at the MacBook): build and approve this branch's engine
node bin/cua.mjs engine build --sign-wait 600000
node bin/cua.mjs engine approve
node bin/cua.mjs engine status
# expected: approved: true, accessibility and screenRecording true, cursor: on
```

## Interfaces and Dependencies

In `native/engine/Sources/Engine/Cursor/CursorHub.swift`:

```swift
/// What an action did, for the cursor. Points are global, top-left origin (the engine's posting space).
enum CursorAction {
  case click(CGPoint)          // coordinate or element click: glide, then the press dip on arrival
  case press(CGPoint)          // an accessibility action at an element's midpoint: glide, then the dip
  case drag([CGPoint])         // glide to the first point, dip, trace the path, rest at the last
  case scroll(CGPoint)         // glide, no dip
}

/// One per engine. Thread-safe: called from request threads; never blocks them.
final class CursorHub {
  func act(connection: ConnectionID, app: ResolvedApp.Key, window: CGWindowID, _ action: CursorAction)
  func touch(connection: ConnectionID)                     // keyboard-only action: resets the idle timer only
  func configure(connection: ConnectionID, _ identity: CursorIdentity?, enabled: Bool)   // M2
  func hide(connection: ConnectionID)                      // end_task (M2), lock
  func closed(connection: ConnectionID)                    // order out and release
}

struct CursorIdentity { let label: String; let color: NSColor }
```

In `native/engine/Sources/Engine/Cursor/CursorMotion.swift`, pure and headless:

```swift
struct MotionConfiguration { /* the 30 fields of the Design's table, `static let live` */ }
struct CursorState { var position: CGPoint; var velocity: CGVector; var angle: CGFloat; /* stretch, squash, swell */ }
struct Trajectory { let step: TimeInterval /* 1/240 */; let samples: [CursorState]; let mode: Mode; let chosen: Int? }
enum Mode { case snap, scoot, path }

/// The vendor's motion: mode choice, candidates, cost, response, integration (FUN_100090920 and the functions it calls).
func plan(from: CursorState, to: CGPoint, bounds: CGRect, reduceMotion: Bool,
          configuration: MotionConfiguration = .live) -> Trajectory
```

The wire request, additive to `cua-engine-1`, method `cursor` with params:

```json
{ "label": "linux171", "color": "#8250df", "enabled": true }
{ "hide": true }
```

Result `{ "cursor": "on" | "off", "reason": "engine.json" | "session" | null }`. An engine without the method answers its existing unknown-method error; the service then stops sending `cursor` for that connection.

Environment, read by the service: `CUA_CURSOR` (`0` turns the session's cursor off), `CUA_CURSOR_LABEL`, `CUA_CURSOR_COLOR`. Settings: `~/.config/cua/engine.json` key `cursor` (`true` default, `false` off), read by the engine at launch.

## Surprises & Discoveries

(None yet.)

## Decision Log

- Decision: verification. The spec gets one independent spec review and the `doperpowers:adversarial-reviewer`'s buildability review of the execution section, in the same round, before it is handed to the executor. The branch gets `doperpowers:review-code` at **high** (reviewer-high) before the PR: an always-on overlay on the owner's desktop, touching every input path's hook and the main thread's typing path, is high-stakes for a small diff.
  Rationale: three milestones and an attended live proof; a defect here is visible on every session's screen or slows every action.
  Date/Author: 2026-10-30, the design session (cua_repl#1ea561bc).

## Outcomes & Retrospective

Pending — written at finish.
