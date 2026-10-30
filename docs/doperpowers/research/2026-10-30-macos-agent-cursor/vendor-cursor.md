# B. The vendor agent cursor (Codex Computer Use), behaviour and logic (for SSFSKIM/cua #235)

**Subject:** the overlay "virtual cursor" drawn by OpenAI's helper `SkyComputerUseService`, part of the bundle `Codex Computer Use.app`.
- Pinned build: 26.924.1001281, at `~/.claude/jobs/1ea561bc/tmp/117/work/app`.
- Also checked: 26.1021.1001631, the copy inside `/Applications/ChatGPT.app/Contents/Resources/cua_node/…/@oai/sky/`.

**Method:** static reading only. Nothing was launched, opened, signalled or attached to. The tools were Ghidra 12.1.4 headless decompiles (project copies `agent1` to `agent4`), `otool -tV`/`-ov`, `llvm-objdump`, `nm`, `swift-demangle`, `strings`, and Python stdlib run with `-I`.

**Scope:** the brief first asked for behaviour facts. The owner then allowed reading and translating the vendor's logic, so Appendices A to C hold reimplementable Swift pseudocode.

**Confidence marks:**
- **[code]**: read in a Ghidra decompile.
- **[disasm]**: checked in the disassembly; floats and register arguments are always verified this way.
- **[inference]**: reasoned from the code, not read in it.
- **fact**: shown directly by a cited artifact.

**Local artifacts.** Everything lives under `/Users/new/.local/share/cua-235/research/vendor/` and is never committed:

| path | contents |
|---|---|
| `decomp/` | first 693 functions: cursor range `0x10008bc00–0x10009a000`, Fog `0x10013ee00–0x100147000`, lens `0x100204b00–0x100207200` |
| `decomp-path/`, `decomp-anim*/`, `decomp-look/` | follow-up decompiles |
| `sym/` | demangled symbol extracts; `objc-ov.txt`; the 26.1021 symbol list |
| `notes/{path,anim,look}.md` | the three detailed readings, copied below as Appendices A–C |
| `scripts/` | `lens.py`, `pnginfo.py`, `rdva.py`, `findd.py`, and the readers' `mangled.py`, `fieldrefs.py`, `arrow.py` |
| `lens/` | the 45 extracted Lens frames |
| **`lens-contact-sheet.png`** | contact sheet of the Lens frames (taste reference only) |
| **`agent-cursor-shape.png`** | the cursor's arrow path, rasterised from the recovered geometry (taste reference only) |

**Corrections to earlier readings:**
- E-helper-catalogue §3.4 and §608 link the `LensSequence` frames to the virtual cursor. **They are not part of the cursor.** No view in the cursor's tree references `SkyLensView` (Appendix C §2, last part).
- The catalogue's guess "a drawn overlay, the real pointer is not moved" is confirmed.

---

## Summary

- **Window:**
  - One borderless, click-through, transparent `NSWindow` subclass per controlled app, titled "Software Cursor", containing a SwiftUI view.
  - It is not hidden from capture. In fact the vendor adds the cursor window to the model's own screenshots on purpose.
- **Z-order:**
  - While the target app is frontmost, or has a menu open, the window sits at the overlay level (102).
  - Otherwise it takes the target window's level and is ordered directly above that window.
  - It hides when the target window is not on screen in the current Space.
- **Motion:**
  - Moves of 196 pt or less are a "scoot": a point spring plus cartoon stretch, squash and tilt.
  - Longer moves follow a curved Bézier path. The path is chosen from 20 candidates by a cost function and kept inside the screen. A progress spring (velocity-Verlet at 240 Hz, ticked by the window's display link) carries the cursor along it, and the arrow turns to face its direction of travel.
- **Waiting:** clicks and set-value continue once the cursor is "close enough" (progress ≥ 0.995 and within 3.157 pt of the end). Other moves wait until the motion has finished.
- **Look:**
  - A small rounded arrow pointing up-left (18-pt frame drawn at 0.75 scale), with a translucent fill and a white stroke, inside a 126-pt frosted "fog" halo that swells with speed.
  - **Idle:** still. **Loading** (thinking): rocks ±10°. **Paused** (the user took over): 50 % opacity.
  - A click shrinks it to 70 % for 0.1 s.
  - It fades in and out over 0.44 s, combining opacity with a blur.
- **Accessibility:** no Reduce Motion or Increase Contrast handling anywhere in the cursor code.
- **Settings:** the defaults key `feature/computerUseCursor` (default on) gates it. There is no environment variable, user setting or idle timeout.
- **26.1021:** the constants and offset tables are identical to 26.924. One method is new: `FogCursorStyle.windowVisibilityDidChange()`.

---

## 1. The overlay window

| property | value | evidence |
|---|---|---|
| class | `ComputerUseCursor.Window`, an **`NSWindow`** subclass (not an `NSPanel`) | `sym/objc-ov.txt`: superclass `_OBJC_CLASS_$_NSWindow` (fact) |
| creation | `initWithContentRect: .zero, styleMask: 0` (borderless), `backing: 2` (buffered), `defer: true` | `FUN_10009032c` [code]; args at disasm `0x1000904e8–0x1000904f4` |
| title | "Software Cursor" | small-string immediate at `0x100090508–0x100090524` [disasm] |
| collectionBehavior | `0x40048` = `.canJoinAllApplications \| .ignoresCycle \| .transient` | `0x100090558–0x10009055c` [disasm] |
| ignoresMouseEvents | true | `FUN_10009032c` [code+disasm] |
| background | `NSColor.clearColor`; content is an `NSViewController` whose view is `style.makeView()` with `wantsLayer = true` | [code] |
| isOpaque, hasShadow | never set by the cursor code, so AppKit defaults apply. The view is transparent apart from the drawn shape. | [code]; that the defaults leave no shadow is [inference] |
| **sharingType** | **never set.** The selector `setSharingType:` does not appear anywhere in the binary, so the window is visible to screen capture. | `S.strings` has no `setSharingType:` (fact) |
| capture use | `updateSkyshot` (`FUN_10006c984`) adds the visible cursor window to the model's screenshot as an extra window when `feature/computerUseCursor` is on. The PiP stream also captures the cursor window separately (`CursorCaptureKey.cursorWindowID`). | Appendix C §5 [code] |
| canBecomeKey | not overridden; a borderless `NSWindow` cannot become key | [inference] |
| constrainFrameRect | overridden to return the rect unchanged, so the window can sit over the menu bar or off-screen | `0x10009091c` [code] |
| size | follows the hosting view: 126×126 pt for the Fog style; 20×23 for the fallback image style | Appendix C §1–3 |
| which screen | whichever screen the computed origin lands on. Coordinates are converted from CG (top-left) to AppKit with `NSScreen.convertPointFromCGCoordinates`. The animation clock is that window's own display link. | `FUN_100090920` [code]; Appendix B §1.1 |
| level and z-order | `appMonitor` reason (target app active, or a menu of it open) or `petLaunch` reason: CGS level from `kCGOverlayWindowLevelKey`, then `setLevel: 102`. Neither reason: `setLevel:` = the target window's layer, then `orderWindow: .above relativeTo: targetWindowID`. Both reasons clear: level 0. | `FUN_100097420`, `FUN_100096aec`, `FUN_100096bbc` [code+disasm]; `overlayWindowLevel` = 102 at `0x101041320` [disasm] |
| visibility test | visible only if the target window's number is in `NSWindow.windowNumbersWithOptions: 1` (all applications, current Space only) | `FUN_1000972b4` [code]; meaning of option 1 per AppKit [inference] |

**Following the target window:**
- **Spaces:** `activeSpaceDidChange:` re-runs the ordering, so the cursor disappears when its target window is on another Space.
- **Minimise and hide:** the same window-list test hides the cursor [inference].
- **Full screen:** follows from `.canJoinAllApplications` plus the active-Space test [inference]. No full-screen-specific code was found.
- **Occlusion:** if the cursor window becomes occluded while attached, it re-orders itself above the target (`FUN_100096e6c`).
- **Focus change:** an AX `focusedWindowChanged` in the target app re-targets the cursor to the app's new primary window.
- **Window moves:** the cursor does **not** follow a target window that moves while the cursor is idle; nothing observes the target's moves or resizes. During a motion, each frame re-reads the target window's origin (`relativeToWindow: true`), so the cursor rides along mid-flight. Details: Appendix C §4, Appendix A §8, Appendix B §3.3.

## 2. Lifecycle

**Creation:**
- One `ComputerUseCursor` per `ComputerUseAppController`, so per controlled app (`virtualCursor` field). There is no session-wide singleton, though every cursor is registered in a weak `ComputerUseCursor.all` table.
- It is created lazily by `createVirtualCursorIfNeeded()` (`0x10006bb70`) with `Style.current()`, `MotionConfiguration.live` and the app's pid, and gets an `AppMonitor`. That monitor watches AX `focusedWindowChanged`, `menuOpened` and `menuClosed`, plus KVO on `NSRunningApplication.isActive` [code].
- The creators are: the start of a PerformAction request, the GetAppState request, element click, select-text, secondary action, `positionElement`, and coordinate `moveMouse` (Appendix C §5).

**Showing:** the cursor appears on its first move. The window's alpha starts at 0 and its blur at 7.
- If the Codex host app has published a "pet" (avatar overlay) position over XPC (`setPetLocationWithX:y:available:`), the cursor **flies out from the pet** at overlay level, then re-attaches above the target.
- Otherwise it fades in at the target: 0.44 s, ease-in-ease-out, alpha 0→1 and Gaussian blur 7→0.
- Sources: [code] `FUN_100090920`, `FUN_10009283c`; Appendix B §4.

**Activity state** (`idle`, `loading`, `paused`) [code]:

| moment | state | where |
|---|---|---|
| PerformAction starts | `.idle` | `FUN_10014ef48` |
| PerformAction ends | `.loading` | `FUN_100154e60` |
| a GetAppState request | `.loading` | `FUN_100157aa4` |
| user input in the controlled app | `.paused` | `ComputerUseAppInstanceManager` |
| after the 5 s debounce | `.loading` | `ComputerUseAppInstanceManager` |

So the arrow is still while acting, rocks while the model thinks, and dims while the user has taken over.

**Hiding:**
- `orderOut()` (`0x10008f330`) stops the motion, fades out (0.44 s, blur 0→7, alpha→0), orders the window out and posts `computerUseCursorDidHide`.
- Its only caller is `ComputerUseAppController.deactivate()` (`FUN_10006fbd0`): the AppModify request, the end-by-user path, and the controller's init.
- **There is no idle timeout.** `shouldFadeOut` is set in `init` and never read [code; field-reference scan].

**Switches:**
- `FeatureFlag.computerUseCursor` (key `feature/computerUseCursor`, "Enable the virtual cursor in Computer Use.", default **true**).
  - Read by the screenshot update, `positionElement`, element click, secondary action and select-text.
  - Resolved through `NSUserDefaults` [disasm]; the suite name is undetermined.
  - The coordinate `moveMouse` route does not read it [inference].
- `feature/detachComputerUseCursor` ("Detach the computer use cursor from the command palette.", default true) has no reader in this build.
- No environment variable was found.
- The style is chosen at launch, when `applicationDidFinishLaunching` replaces the image cursor with the Fog style.

**Who else sees the position:** every move and hide is forwarded over XPC to the host app (`setComputerUseCursorLocationWithX:y:isActive:withReply:`) for its picture-in-picture view (Appendix C §5).

## 3. Motion

**Entry point:** `ComputerUseCursor.move(to:aboveWindowID:relativeToWindow:nextInteractionTiming:animated:fadeIn:…)`, an async method at `0x10008e178` that calls `Window.move` (`FUN_100090920`).
- **Snap** (not animated, or the skip check in `FUN_100091650` applies): set the origin, set the angle to rest, and call both handlers at once.
- **Scoot**, for moves of 196 pt or less (`scootDistanceThreshold`): a `SpringAnimation<CGPoint>`, with secondary springs for stretch, squash and tilt.
- **Path**, for moves over 196 pt: a chosen Bézier path and a progress spring from 0 to 1. The branch is `b.ls` at `0x100092c40` [disasm].
- All points are window origins. The hotspot offset is the view centre (63, 63) for Fog, or (4, 4) for the image style.

**`MotionConfiguration.live`** is the only instance used. It is set in once-init `FUN_10008c128` and verified field by field against getter offsets in the disassembly. 26.1021 has byte-identical values (`rdva.py` at `0x10110f360`).

| field | default | role (detail in Appendices A and B) |
|---|---|---|
| clickAngle | **−44°** | resting tilt of the arrow. The rest direction is k = (sin θ, cos θ), pointing up-left, and every candidate path leaves and arrives along k. |
| candidateCount | **20** | cap on the candidate list. Exactly 20 are generated: 2 base curves plus 18 arcs. |
| boundsMargin | **20** pt | inset of the screen (or target window) rect used by the in-bounds test |
| startHandle | **0.41960295** | start handle = clamp(dist·0.4196, 48, min(0.9·dist, 640)) |
| endpointHandle | **0.15** | end handle, with the same clamps |
| arcSize | **0.27655232** | arc offset length = clamp(dist·arcSize, 50, 520), scaled by the table [0.55, 0.8, 1.05] |
| arcFlow | **0.57835553** | arc tangent ("flow") length = clamp(dist·arcFlow, 38, 440), scaled by the table [0.65, 1.0, 1.35] |
| straightPathDistanceThreshold | **10** pt | at or below this, one straight cubic with no rotation |
| springResponseScaler / Min / Max | **0.9 / 0.12 / 2.2** s | response of the path progress spring (formula below) |
| springDampingFraction | **0.9** | damping of the progress spring (idle threshold 0.01) |
| scootDistanceThreshold | **196** pt | scoot versus path |
| scootPositionResponse / DampingFraction | **0.24 / 0.84** | scoot point spring |
| scootPositionSettleVelocity | **12** pt/s | the scoot spring's idle-velocity threshold: below it, the spring snaps to the target and finishes |
| scootAxisResponse / Damping | **0.07 / 0.82** | spring for the travel-axis angle of the stretch |
| scootBaseRotationResponse / Damping | **0.09 / 0.86** | spring that relaxes the heading back to rest |
| scootStretchResponse / Damping | **0.095 / 0.72** | squash spring |
| scootStretchMin / PivotX / XAmount / SquashYAmount | **0 / 0.5 / 0.38 / 0.18** | stretch up to 1 + 0.38·e along the axis, squash to 1 − 0.18·e across it, where e is a bump envelope |
| scootRotationResponse / Damping / Max | **0.055 / 0.76 / 76°** | tilt toward the travel direction, up to e·76° |
| terminalTangentBlendStart | **0.99** | over the last 1 % of progress the heading blends back to rest (ease-out cubic) |

**Path selection** (Appendix A §2–5) [code+disasm]. The candidate with the lowest cost wins:

`cost = length + 320·detour + 140·angleChangeEnergy + 180·maxAngleChange + 18·totalTurn + (arc ? 45 : 0) + backwardPenalty`

- Only candidates that stay in bounds are considered when any do; ties go to the first.
- Each candidate is measured from 24 samples per segment.
- Progress is split equally across segments, so speed varies along the curve; there is no arc-length reparameterisation.

**Progress spring response** (`FUN_100095014`) [code+disasm]. The terms are:
- D = clamp((len − 180)/760)
- detour = clamp((len/straight − 1)/0.55)
- turn = clamp(totalTurn/(1.4π))
- energy = clamp(angleChangeEnergy/1.25)
- back = clamp((−0.08 − dot(dir, k))/0.92)
- c = 0.42·detour + 0.38·turn + 0.2·energy

`response = clamp((arc ? 0.9 : 1) · 0.9 · (0.42 + 0.22·D + 0.28·back + 0.12·clamp(c) + (arc ? 0.04 : 0)), 0.12, 2.2)`

That gives roughly 0.34–0.97 s, with damping 0.9.

**Spring integrator** (Appendix B §1) [code+disasm]:
- OpenAI's own `Animation` module: velocity-Verlet at a fixed 1/240 s step.
- k = (2π/response)², capped at 28800; drag = 2√k·ζ.
- Each frame it simulates up to the display link's `targetTimestamp`. After a stall of more than 1 s it simulates only 1/60 s.
- When the spring has settled, it snaps to the target and finishes. Settled (`FUN_1007d622c`, resolved 2026-10-30, Appendix B §1.3) means both the velocity and the force (the acceleration, mass 1) are within the idle-velocity threshold, `max(|v|², |F|²) ≤ τ²`, and the value is within 1 % of the target's own magnitude, `|target − x|² ≤ |0.01·target|²` (skipped when the target is zero). It is checked once per display frame, after that frame's sub-steps.
- The clock is the cursor window's `displayLink(target:selector:)` in common run-loop modes, at the display's native rate; no frame-rate range is set.

**Close enough versus finished** (Appendix B §3.3–4):
- The `nextInteraction` handler fires when progress ≥ 0.995 **and** the cursor is within 3.157 pt of the end, or at completion if that comes first.
- `move()` resumes its awaiting caller at whichever handler fires first. The animation keeps running afterwards, and `isMoving` clears only at completion.
- `.finished` pre-sets the "satisfied" flag, so its callers resume only at completion.
- **Element click, set-value and select-text use `.closeEnough`.** The click is posted while the cursor is still settling over the last ~3 pt. **Secondary actions, element scroll and coordinate actions use `.finished`.**

**Direction-of-travel rotation** (Appendix A §7):
- `angle = (atan2(−ty, tx)·180/π + 90 − clickAngle)·π/180`, where t is the path tangent. The angle is 0 when travelling along k.
- It is set every path frame, blended to the rest direction after progress 0.99, and reset to 0 on snaps.
- Scoots do not rotate toward their travel; they tilt by e·76° and relax.

## 4. Look

**Shipped style.** The shipped style is **Fog** (`FogCursorStyle(isAttached: false)`), a SwiftUI `CursorView` in an `NSHostingView`. Full view tree, constants and the wiggle code are in Appendix C §2.
- **Arrow:** `AgentCursor.path(in:)` (`0x100143248`). A rounded navigation arrow pointing up-left with round tip, wing and tail, and an inner notch; the exact Bézier coordinates are in Appendix C §2.
  - Frame 18×18 pt, drawn at 0.75 scale because `isAttached` is false, so about 13.5 pt on screen.
  - Fill: the foreground colour at **16 %** (24 % while loading). Dark on a light appearance [inference].
  - Stroke: **2 pt white at 80 %**.
  - Render: `vendor/agent-cursor-shape.png`.
- **Fog halo:**
  - A frosted backdrop blur (radius 17) that partly re-shows the wallpaper. Parameters: saturation 1.0, wallpaper opacity 0.39, dynamic-shadow opacities 0.37/0.59/0.29, and a luminance curve.
  - It is masked to a soft 42-pt circle (blur 12, offset (−3, −2)) around the arrow, inside a 126×126 frame.
  - The halo grows up to 2.5× with speed while the arrow is counter-scaled to stay the same size.
- **States:**
  - **Idle:** still.
  - **Loading:** the arrow rocks between ±10° (ease-in-out, about 0.68 s per swing, endless), and the fill rises to 24 %.
  - **Paused:** the whole cursor at 50 % opacity.
  - State changes animate with `easeInOut(0.2)`.
- **Press:** the scale goes to 0.7 for 0.1 s and back for 0.1 s, on a spring (stiffness 130.5, damping 18.85; response about 0.55 s, ζ about 0.83).
- **Fallback:** `SoftwareCursorStyle`, an `NSImageView` showing the bundle asset `SoftwareCursor` (20×23 pt, hotspot (4, 4)). It is replaced at launch.

**The Lens frames** (`LensSequence/Lens_frame_00…44.png`, identical in 26.1021). These are not the cursor (see the corrections above); the readers infer they are a Sky "lens" glyph shown elsewhere in the UI.
- Each frame is 48×48 px, 16-bit RGBA with a `cICP` chunk (BT.709 primaries), stored uncompressed (`pnginfo.py`).
- The image is a full disc of glossy blue diagonal bands. The silhouette never changes (identical alpha in every frame); only the bands' colour and position move.
- The colour cycles from light sky blue (mean about #7AC8FD) to deep azure (about #44AAFB, frames 11–13), to pale ice blue (about #ADE4FF, frames 33–35), and back. Frame 44 leads into frame 0, so it loops.
- `SkyLensView` plays it as a 1.5 s loop over frames 0–43 and eases back to frame 0 over 1.2 s when stopped. With `isTinted`, it uses the `luminosityBlendMode` compositing filter.
- **Contact sheet:** `/Users/new/.local/share/cua-235/research/vendor/lens-contact-sheet.png`. It shows the 45 frames at 4× on a light and a dark background, numbered in row-major order.

## 5. Accessibility

No handling was found [fact for the selectors and environment values].
- **Selectors:** neither `accessibilityDisplayShouldReduceMotion` nor `…IncreaseContrast` is present in the binary.
- **SwiftUI:** no `EnvironmentValues.accessibilityReduceMotion` or contrast getter is imported. The only `EnvironmentValues` imports are imageScale, accentColor, colorScheme, lineSpacing, symbolRenderingMode, multilineTextAlignment, font, isEnabled and lineLimit (`S.fixups`).
- **Notifications:** `NSWorkspaceAccessibilityDisplayOptionsDidChangeNotification` is not observed.
- **High-contrast appearances:** `NSAppearanceNameAccessibilityHighContrast*` is imported, but none of the cursor decompiles references it.
- **Effect:** the springs, scoot, wiggle and blur fades run regardless of Reduce Motion. The 16 % fill does not change under Increase Contrast. This is a gap cua should not copy.

## 6. Clicks, drags and typing

- **Click:** before the event or accessibility action, the arrow does a press animation (scale 0.7, 0.1 s down and 0.1 s up). It is called from the element-click decision (`FUN_1007a1e6c`, `FUN_1007a2704` → `VirtualCursor.press()` `0x1007afda0`) and from `performSecondaryAction` (`0x100074f14`).
  - There is **no ripple, ring or click highlight**: no such view or type exists.
  - The coordinate route passes the cursor into `sendClick(…virtualCursor:)`; its use of the cursor there was not traced.
- **Drag:** no trail. There is no trail type, field or layer. Before acting, the coordinate route moves the cursor to the point with `.finished`. Whether the overlay also travels to the drag end during the posted drag events is **undetermined**.
- **Typing:** no indicator. `performKeyboardAction` neither creates nor moves the cursor. Only the request-level state changes apply: idle during the action, loading afterwards.
- **Scroll:** the element-targeted scroll moves the cursor to the element's point with `.finished` and shows no other effect.

## 7. Undetermined

- The anchor of the main rotation effect and how the arrow tip lines up with the hotspot (a (4.5, 4.5) offset pair whose role is unread).
- What the GaussianBlur filter's `0x202` flags mean.
- The defaults suite behind `FeatureFlag.isEnabled`.
- Whether anything sets the cursor's `delegate` or `isAttached` in this build.
- Whether the coordinate drag moves the overlay to the drag end.
- What `FogCursorStyle.windowVisibilityDidChange()` (new in 26.1021) does; probably it pauses the fog when the window is hidden [inference].

---

The appendices below are the three readers' notes, unedited apart from relative paths, which now point to `vendor/`. They give each function's address, inputs, outputs, constants and Swift pseudocode.


---

# Appendix A. Path generation and evaluation (from `vendor/notes/path.md`)

## Vendor cursor: path generation and path evaluation (SkyComputerUseService 26.924)

Scope: how `ComputerUseCursor.Window` builds the motion path between two overlay-window origins, scores and picks it, evaluates point and tangent at a progress value, and turns the tangent into the arrow's rotation. The spring/tick/closeEnough mechanics belong to another note; they are touched only where the evaluation pipeline runs through them.

Binary: the pinned 26.924 `SkyComputerUseService` (work/app). Decompiles: `vendor/decomp/` (first run) and `vendor/decomp-path/` (this note: 0x10009a1ac, 0x10009a714, 0x10009a35c/36c/3d0, 0x10009a770). Disassembly: `~/.claude/jobs/1ea561bc/tmp/117/decomp-m2a/dis.txt`. Constants were read with `rd.py` and checked against the `fmov`/`movk`/`ldr d` sites; where Ghidra and the disassembly disagreed, the disassembly wins and the note says so.

Marks: **[code]** read in the decompile, **[disasm]** checked in the disassembly, **[inference]** reasoned.

`cfg` below is `ComputerUseCursor.MotionConfiguration.live` (defaults in the parent report: clickAngle −44, candidateCount 20, boundsMargin 20, startHandle 0.41960295031576633, endpointHandle 0.15, arcSize 0.2765523188064277, arcFlow 0.5783555327868779, straightPathDistanceThreshold 10, terminalTangentBlendStart 0.99).

---

### 0. Coordinate space and data types

- **Space [code+disasm].** Paths are built between *overlay-window frame origins* in AppKit screen coordinates (y up), not between hotspots: `FUN_100090920` converts the requested CG point with `NSScreen.convertPointFromCGCoordinates`, subtracts the style's hotspot, and passes current and target origins to the path code. When the move is relative to a target window, both origins are made relative to that window's AppKit frame origin, and every tick adds the window's *current* origin back (§8). Because the hotspot is a fixed offset from the origin, the hotspot follows the same curve shifted.
- **Rest direction [disasm 0x1000999a4, 0x1000941d4].** `k = (sin θ, cos θ)` with `θ = clickAngle·π/180`. With θ = −44°, k = (−0.695, 0.719): up-left in y-up space, the way the arrow's tip points at rest. x takes the sine and y the cosine (Ghidra's naming hides this; the disassembly shows `d15 = sin → x`, `d12 = cos → y`).
- **Types [S.fields:577-596; layout read from stores in 0x100099938].**

```swift
struct Segment { var end, control1, control2: CGPoint }            // 0x30 bytes; start = previous segment's end (or path.start)
struct CursorMotionPath {                                           // 0x98 bytes
    var start, end, startControl: CGPoint                           // +0x00 +0x10 +0x20
    var arc, arcIn, arcOut: CGPoint?                                // +0x30/+0x40 tag, +0x48/+0x58, +0x60/+0x70
    var endControl: CGPoint                                         // +0x78
    var rotatesAlongPath: Bool                                      // +0x88
    var segments: [Segment]                                         // +0x90
}
struct CursorMotionPathMeasurement {                                // 0x28 bytes
    var length, angleChangeEnergy, maxAngleChange, totalTurn: CGFloat
    var staysInBounds: Bool
}
```

---

### 1. `FUN_1000942c4`: build the path (straight or chosen candidate)

Inputs: `from`, `to` (origins), `bounds` (CGRect from §4). Output: `CursorMotionPath`. Callers: the animated move `FUN_100092ba4` (path branch, distance > 196) and the snap branch of `FUN_100090920`.

```swift
func buildPath(from s: CGPoint, to e: CGPoint, bounds: CGRect) -> CursorMotionPath {
    if distance(s, e) <= cfg.straightPathDistanceThreshold {           // 10 pt; `fcmp; b.ls` [disasm 0x100094340]
        let c1 = s + (e - s) / 3, c2 = s + (e - s) * (2.0 / 3.0)
        return CursorMotionPath(start: s, end: e, startControl: c1, arc: nil, arcIn: nil, arcOut: nil,
                                endControl: c2, rotatesAlongPath: false,
                                segments: [Segment(end: e, control1: c1, control2: c2)])
    }
    return selectPath(enumerateCandidates(from: s, to: e), bounds: bounds)   // §2, §3
}
```

A straight path never rotates the arrow (`rotatesAlongPath = false`) [code].

---

### 2. `FUN_100099938`: enumerate candidates

Inputs: `s`, `e`. Output: `[CursorMotionPath]` (prefix of 20). [code + disasm 0x100099938–0x10009a0b0]

Constants: handle floor **48** (`0x4048…`, a `fmaxnm` Ghidra dropped), cap **640**, cap factor **0.9** (0x10104d788), short-handle factor **0.65** (0x10104d7b0), bias **0.16** (0x10104d7b8), arc length clamp **50…520**, flow length clamp **38…440**, arc-offset table **[0.55, 0.8, 1.05]** (Swift array at 0x1013d9408, elements at 0x1013d9428), flow table **[0.65, 1.0, 1.35]** (0x1013d9448, elements 0x1013d9468). Degenerate-direction epsilon **0.001** (0x10104d718).

```swift
func enumerateCandidates(from s: CGPoint, to e: CGPoint) -> [CursorMotionPath] {
    let a = cfg.clickAngle * .pi / 180
    let k = CGPoint(x: sin(a), y: cos(a))                    // not re-normalised here (unit anyway)
    let d = e - s, dist = distance(e, s)
    let dir = d.length >= 0.001 ? d / d.length : CGPoint(x: 1, y: 0)

    func handle(_ f: CGFloat) -> CGFloat { max(min(dist * f, dist * 0.9, 640), 48) }
    let hs = handle(cfg.startHandle), he = handle(cfg.endpointHandle)

    let sc   = s + k * hs,        ec   = e - k * he           // both handles along the rest direction
    let sc65 = s + k * hs * 0.65, ec65 = e - k * he * 0.65

    let side: CGFloat = (k.y * dir.x - k.x * dir.y) >= 0 ? 1 : -1
    let n    = CGPoint(x: -dir.y * side, y: dir.x * side)     // unit normal, on `side`
    let mid  = (s + e) * 0.5
    let arcLen  = min(max(dist * cfg.arcSize, 50), 520)      // `d < 520 ? max(d, 50) : 520`
    let flowLen = min(max(dist * cfg.arcFlow, 38), 440)
    let bias = k * hs * 0.16                                  // shifts every arc apex toward the rest direction

    func base(_ c1: CGPoint, _ c2: CGPoint) -> CursorMotionPath {
        CursorMotionPath(start: s, end: e, startControl: c1, arc: nil, arcIn: nil, arcOut: nil,
                         endControl: c2, rotatesAlongPath: true,
                         segments: [Segment(end: e, control1: c1, control2: c2)])
    }
    func arced(_ apex: CGPoint, _ flow: CGPoint) -> CursorMotionPath {
        let inP = apex - flow, outP = apex + flow             // apex tangent is parallel to the travel line
        return CursorMotionPath(start: s, end: e, startControl: sc, arc: apex, arcIn: inP, arcOut: outP,
                                endControl: ec, rotatesAlongPath: true,
                                segments: [Segment(end: apex, control1: sc, control2: inP),
                                           Segment(end: e, control1: outP, control2: ec)])
    }

    var out = [base(sc, ec), base(sc65, ec65)]
    for ka in [0.55, 0.8, 1.05] {
        let off = n * (arcLen * ka)
        let apexA = mid + off + bias, apexB = mid - off + bias
        for kf in [0.65, 1.0, 1.35] {
            let flow = dir * (flowLen * kf)
            out.append(arced(apexA, flow))                    // `side` first
            out.append(arced(apexB, flow))                    // then the mirror
        }
    }
    precondition(cfg.candidateCount >= 0)                     // trap at 0x10009a18c
    return Array(out.prefix(cfg.candidateCount))              // 2 + 3·3·2 = 20; candidateCount 20 keeps all
}
```

Notes:
- `candidateCount` is only a prefix cap: with the default 20, every candidate is kept [code]. A smaller value would drop the arcs in the order generated.
- Both sides are always generated; `side` only decides which comes first, which matters only as the tie-break in §3 [code + inference].
- Example, dist = 600: hs = 251.8, he = 90, arcLen = 165.9 (apex offsets 91.3/132.7/174.2), flowLen = 347 (flow 225.6/347/468.5), bias 40.3 along k [arithmetic].
- **[inference] Visual consequence.** Every candidate leaves `s` and arrives at `e` moving along k (up-left). A move toward the lower right therefore swings out and comes back into the target tip-first. Arcs let it swing to one side instead of looping.

---

### 3. `FUN_100094558`: score and select

Inputs: candidates, bounds. Output: the chosen `CursorMotionPath`. [code + disasm 0x100094558–0x100094850]

Weights (all checked in the disassembly): arc **45** (`0x4046800…`), backward cap **90** (`0x4056800…`), detour **320** (`0x4074000…`), energy **140** (`0x4061800…`), max angle change **180** (`0x4066800…`, the same slot as the deg/rad 180), total turn **18** (`fmov #18`). The backward terms are −0.08 and 0.92 (0x10104d750/758).

```swift
func selectPath(_ cands: [CursorMotionPath], bounds: CGRect) -> CursorMotionPath {
    let a = cfg.clickAngle * .pi / 180
    let k = CGPoint(x: sin(a), y: cos(a))
    var scored: [(path: CursorMotionPath, m: CursorMotionPathMeasurement, cost: CGFloat)] = []
    for c in cands {
        let m = measure(c, bounds: bounds)                                   // §5
        let detour = max(m.length / max(distance(c.end, c.start), 1) - 1, 0)
        let arcPenalty: CGFloat = c.arc != nil ? 45 : 0                      // tag at path+0x40 [disasm 0x10009474c]
        let d = c.end - c.start
        let dir = d.length >= 0.001 ? d / d.length : CGPoint(x: 1, y: 0)
        let back = (-0.08 - (k.x * dir.x + k.y * dir.y)) / 0.92
        let backPenalty = back >= 1 ? 90 : max(back, 0) * 90
        let cost = arcPenalty + m.length + 320 * detour + 140 * m.angleChangeEnergy
                 + 180 * m.maxAngleChange + 18 * m.totalTurn + backPenalty
        scored.append((c, m, cost))
    }
    let inBounds = scored.filter { $0.m.staysInBounds }
    let pool = inBounds.isEmpty ? scored : inBounds                         // fallback: ignore bounds
    guard var best = pool.first else { return cands[0] }                    // traps if cands is empty
    for x in pool.dropFirst() where x.cost < best.cost { best = x }         // strict <: earliest wins ties
    return best.path
}
```

- `backPenalty` uses the straight start→end direction, so it is the same for every candidate and never changes the choice. The same −0.08/0.92 term feeds the spring response (`FUN_1000954b0`, other note) [code + inference].
- When no candidate stays in bounds, the cheapest of all wins [code].

---

### 4. `FUN_100099624`: bounds for the in-bounds test

Inputs: `s`, `e`, optional target-window record (`CGWindow?`; tag at +0x38). Output: CGRect. [code + disasm 0x100099624–0x100099920]

```swift
func motionBounds(s: CGPoint, e: CGPoint, target: CGWindow?) -> CGRect {
    if let w = target {                                         // relative-to-window move
        let r = NSScreen.convertRectFromCGCoordinates(w.bounds)  // SlimCore helper 0x100f36750
        return CGRect(x: 0, y: 0, width: r.width, height: r.height)   // window-local space [disasm 0x1000997e4]
    }
    let frames = NSScreen.screens.map(\.frame)
    for f in frames where f.contains(s) || f.contains(e) { return f }   // per screen: start tested first, then end
    return frames.reduce(CGRect.null) { $0.union($1) }
}
```

`boundsMargin` is not applied here. It is applied in §5 as an inset. The test points are overlay origins, not the hotspot [code + inference].

---

### 5. `FUN_100094d24`: measure a path

Inputs: path, bounds. Output: `CursorMotionPathMeasurement`. Constants: **24** samples per segment, step epsilon **0.01** (0x10104d6e8), wrap ±π / ±2π (0x10104d738/760/768/770). [code + disasm 0x100094d24–0x100094fa0]

```swift
func measure(_ p: CursorMotionPath, bounds: CGRect) -> CursorMotionPathMeasurement {
    let inset = bounds.insetBy(dx: cfg.boundsMargin, dy: cfg.boundsMargin)
    var inBounds = inset.contains(p.start)
    var length: CGFloat = 0, energy: CGFloat = 0, maxTurn: CGFloat = 0, total: CGFloat = 0
    var prevHeading: CGFloat? = nil                   // persists across segments
    var p0 = p.start, prev = p.start
    for seg in p.segments {
        for i in 1...24 {
            let t = CGFloat(i) / 24
            let q = bezier(p0, seg.control1, seg.control2, seg.end, t)
            let step = distance(q, prev)
            if inBounds { inBounds = inset.contains(q) }
            let d = q - prev
            if d.length > 0.01 {
                let h = atan2(d.y, d.x)
                if let ph = prevHeading {
                    var dh = h - ph
                    while dh > .pi { dh -= 2 * .pi }
                    while dh < -.pi { dh += 2 * .pi }
                    energy += dh * dh; maxTurn = max(maxTurn, abs(dh)); total += abs(dh)
                }
                prevHeading = h
            }
            length += step
            prev = q                                  // updated even for tiny steps
        }
        p0 = seg.end
    }
    return .init(length: length, angleChangeEnergy: energy, maxAngleChange: maxTurn,
                 totalTurn: total, staysInBounds: inBounds)
}
func bezier(_ p0: CGPoint, _ c1: CGPoint, _ c2: CGPoint, _ p3: CGPoint, _ t: CGFloat) -> CGPoint {
    let u = 1 - t
    return p0 * (u*u*u) + c1 * (3*t*u*u) + c2 * (3*t*t*u) + p3 * (t*t*t)
}
```

The animated path branch measures the chosen path again for the spring response (`FUN_100095014`, other note).

---

### 6. `FUN_1000914a4` and `FUN_10009a1ac`: point and tangent at progress

`FUN_1000914a4(progress)`, self = path; returns `(point.x, point.y, tangent.x, tangent.y)` in d0–d3 (Ghidra shows only d0) [disasm 0x1000914a4–0x100091638]. `FUN_10009a1ac(p0 in d0/d1, t in d2, segment in x0)` is the cubic derivative [code].

```swift
func pointAndTangent(_ p: CursorMotionPath, progress q: CGFloat) -> (CGPoint, CGPoint) {
    let n = p.segments.count
    let i: Int, t: CGFloat
    if q >= 1 { i = n - 1; t = 1 }
    else { let x = max(q, 0) * CGFloat(n); i = Int(x); t = x - CGFloat(i) }   // traps on NaN/inf
    let seg = p.segments[i]
    let p0 = i == 0 ? p.start : p.segments[i - 1].end
    let u = 1 - t
    let point = bezier(p0, seg.control1, seg.control2, seg.end, t)
    let tangent = (seg.control1 - p0) * (3*u*u) + (seg.control2 - seg.control1) * (6*u*t)
                + (seg.end - seg.control2) * (3*t*t)                              // d/dt within the segment
    return (point, tangent)
}
```

- Progress is split equally across segments (half each for an arc path), and the Bézier parameter is linear in progress: no arc-length reparametrisation, so speed along the curve varies [code + inference].
- The tick turns the tangent into a point velocity for the style: `velocity = tangent · springVelocity · n` (pt/s). That is the other note's ground [code, `FUN_100093c30`].

---

### 7. Direction of travel and arrow rotation

#### 7.1 `FUN_100094180`: blend the tangent to the rest direction near the end

Inputs: tangent `v`, progress `q`. Output: unit direction. Constant: `terminalTangentBlendStart` 0.99 (cfg +0xe8); exponent **3** (`pow`). [disasm 0x100094180–0x1000942c0]

```swift
func travelDirection(_ v: CGPoint, progress q: CGFloat) -> CGPoint {
    let a = cfg.clickAngle * .pi / 180
    var k = CGPoint(x: sin(a), y: cos(a)); k = k.length >= 0.001 ? k / k.length : CGPoint(x: 1, y: 0)
    let tn = v.length >= 0.001 ? v / v.length : k
    let w = min(max(q, 0), 1)
    let u = (w - cfg.terminalTangentBlendStart) / (1 - cfg.terminalTangentBlendStart)
    let s = u >= 1 ? 0 : 1 - max(u, 0)
    let blend = 1 - pow(s, 3)                       // ease-out cubic over the last 1 % of progress
    let r = k * blend + tn * (1 - blend)
    return r.length >= 0.001 ? r / r.length : CGPoint(x: 1, y: 0)
}
```

#### 7.2 The angle formula

```swift
func arrowAngle(_ dir: CGPoint) -> CGFloat {                     // radians, written to Style.angle
    guard dir.length >= 0.001 else { return 0 }
    let n = dir / dir.length
    return (atan2(-n.y, n.x) * 180 / .pi + 90 - cfg.clickAngle) * .pi / 180
}
```

The constants are 57.29577951308232 (0x10104d720), +90 (`0x4056800…`) and 0.017453292519943295 (0x10104d728). `atan2(−y, x)` turns the y-up heading into a clockwise angle, the sense of SwiftUI's rotation. The rest direction k gives exactly 0: `atan2(−cos θ, sin θ) = θ − 90°` [arithmetic]. Moving right gives +134° clockwise, for example.

The setter is the style's vtable slot +0x130 and the getter +0x128. Matching them to `Style.angle` set/get is an [inference] from the class's field order: hotSpot get +0xa8, velocityX set +0xb8, velocityY set +0xd0, each stored property taking three slots. It is consistent at every call site.

#### 7.3 Where the angle is applied [code + disasm]

| when | function | value |
|---|---|---|
| path motion starts (path `rotatesAlongPath`) | `FUN_100092ba4` → `SlimCore.withAnimationDisabled(true) { closure 0x10009a36c → FUN_100093390 }` | `arrowAngle(tangent at progress 0)`, raw tangent with no blend. For every candidate this is along k, so **0** |
| every path tick | `FUN_100093c30` (via `FUN_10009a35c` → `FUN_100093488`) | `arrowAngle(travelDirection(tangent(q), q))` |
| snap move (not animated, or animation skipped) | `FUN_100090920` | builds the same path. If it rotates: `arrowAngle(travelDirection(tangent(1), 1))` = **0**. A straight (≤ 10 pt) path leaves the angle alone |
| scoot (distance ≤ 196) | `FUN_100092ba4` scoot branch | not direction-of-travel. The target is `arrowAngle(k)` = 0, and `cursorScootBaseRotationOffset = wrap180(currentAngle° − 0)` (disasm 0x100093054–0x10009311c; Ghidra had the subtraction reversed), which a spring then relaxes (other note) |

**[inference] Net effect.** On long moves the arrow starts at its rest tilt, rotates so its tip leads along the curve, and is back at rest by arrival: the end tangent is along k by construction, and the 0.99 blend guarantees it.

#### 7.4 Scoot geometry in `FUN_10009367c` (direction-dependent squash and tilt; the springs belong to the other note)

Read for completeness [disasm 0x1000936fc–0x100093930]. Inputs: scoot start `s`, end `e`, current spring point `c`, travel direction `dir` (unit `e − s`, falling back to k).

```swift
let L2 = (e - s).x * (e - s).x + (e - s).y * (e - s).y
let prog = L2 < 0.001 ? 1 : min(max(((c - s) • (e - s)) / L2, 0), 1)      // projection onto the hop
let env  = min(max(min(prog / 0.22, 1) * pow(max(1 - prog, 0), 0.62), 0), 1)   // 0.22 @0x10104d740, 0.62 @0x10104d748
// stretch target (FUN_100095e20):
//   a = 1 − scootSquashYAmount · env · (1 − scootStretchMin)
//   b = 1 + env · scootStretchXAmount
//   pivot = env · axisValue + (1 − env) · scootStretchPivotX     (axisValue = 2nd return of FUN_10009556c)
// tilt target (FUN_1000961dc): env · clamp(0.75·dir.x + 0.62·dir.y, −1, 1) · scootRotationMax (76)
```

---

### 8. Per-tick evaluation pipeline (`FUN_100093c30`, path mode; evaluation part only)

[code + disasm] The spring event has kind 0 (update, value q) or kind 1 (finished: q = the target value). Any other kind returns.

```swift
let (pt, tan) = pointAndTangent(path, progress: q)
window.currentInterpolatedOrigin = pt
var origin = pt
if let id = targetWindowID, let w = CGWindow.window(id) {        // re-queried EVERY tick when relative
    origin = origin + NSScreen.convertRectFromCGCoordinates(w.bounds).origin
}
window.setFrameOrigin(CGPoint(x: origin.x.rounded(), y: origin.y.rounded()))   // frinta: half away from zero
FUN_100096c88(origin)                                              // level/order upkeep (other note)
if path.rotatesAlongPath { style.angle = arrowAngle(travelDirection(tan, progress: q)) }
// then closeEnough (q ≥ 0.995 && distance(pt, path.end) ≤ 3.157, fires once) and velocity: other note
```

The scoot tick (`FUN_10009367c`) does the same window-origin re-add, rounding and `setFrameOrigin` with the spring's point [code].

---

### 9. `FUN_100091650`: should the animated move be skipped?

Inputs: current origin `a`, target origin `b` (screen space). Output: Bool, where true means skip the animation and snap. [disasm 0x100091650–0x1000917c4]

```swift
func targetHiddenAtBothEnds(a: CGPoint, b: CGPoint) -> Bool {
    guard let target = correspondingWindowID else { return false }
    func hot(_ o: CGPoint) -> CGPoint {                               // hotspot in AppKit screen space
        CGPoint(x: o.x + style.hotSpot.x, y: o.y + frame.height - style.hotSpot.y)
    }
    if NSWindow.windowNumber(at: hot(a), belowWindowWithWindowNumber: 0) == target { return false }
    return NSWindow.windowNumber(at: hot(b), belowWindowWithWindowNumber: 0) != target
}
```

`FUN_100090920` takes the animated branch only when the call asked for animation, the window is visible and has a screen, either it was already visible before the call or the origin changed, and this returns false. Otherwise it snaps. So with an attached target window, the glide is dropped when the target is not the topmost window under the hotspot at both the start and the end. Whether `windowNumberAtPoint` sees the click-through overlay itself is **undetermined** [inference: probably not, since the overlay ignores mouse events, but not verified].

---

### 10. Undetermined / not covered

- `CursorMotionPath.arc/arcIn/arcOut` are stored but never read in the evaluation, which uses only `segments`. Their only use found is the arc tag in §3 and the response flag in `FUN_100095014`. Some other reader (debug drawing?) may exist [inference].
- The response formula, spring integration, closeEnough and velocity fallback: see the spring/tick note.
- `NSScreen.convertRectFromCGCoordinates` (SlimCore 0x100f36750) was not decompiled. It is assumed to flip y against the primary screen.
- The newer helper (ChatGPT.app, 26.1021.1001631) was **not** compared for this slice.

---

# Appendix B. Animation mechanics (from `vendor/notes/anim.md`)

## Vendor cursor: animation mechanics (SkyComputerUseService 26.924.1001281)

Static reading only (Ghidra decompiles + `otool -tV` disassembly); nothing was launched or attached to.
Raw decompiles: `vendor/decomp/` (cursor module), `vendor/decomp-anim/` (Animation module, cursor closures),
`vendor/decomp-anim2/` (spring simulation), `vendor/decomp-anim3/` (move continuation helpers, blur filter).
Confidence marks: **[code]** read in the decompile, **[disasm]** checked in the disassembly, **[inference]** reasoned.

Abbreviations: `CUC` = `ComputerUse.ComputerUseCursor`, `W` = `CUC.Window` (the overlay NSWindow subclass),
`MC` = the window's copy of `MotionConfiguration` (defaults in B-vendor-cursor.md: clickAngle −44, scootDistanceThreshold 196, …).
Coordinates inside the motion code are AppKit screen points (y up); the CG input is converted at the start of `W.move`.
Angles: `clickAngle` is the resting tilt of the arrow; the arrow's tip direction at rest is `c = (sin θ, cos θ)` with θ = clickAngle·π/180,
i.e. for −44° the unit vector (−0.695, 0.719), up-left **[disasm 0x100095690–0x100095738]**.

---

### 1. The Animation module (OpenAI's own, statically linked)

#### 1.1 Clock: `DisplayLinkAnimationDriver` [code]
- `NSWindow` (also `NSView`, `NSScreen`) conforms to `Animation.AnimationDriverSource`; `makeAnimationDriver()` (witness 0x1007c5f74) builds a
  `DisplayLinkAnimationDriver` whose `displayLink` is `[source displayLinkWithTarget:selector:@selector(displayLinkDidFire)]` (FUN_1007c5f80; the macOS 14 per-window `CADisplayLink`),
  added with `addToRunLoop:[NSRunLoop currentRunLoop] forMode:NSRunLoopCommonModes` (FUN_1007c5a44); `invalidate` on stop.
- No `preferredFrameRateRange` is set anywhere in the binary (no such selector string) → the display's native rate (60/120 Hz ProMotion) **[code + strings]**.
- `displayLinkDidFire` (0x1007c5bd4 → FUN_1007c5afc) reads `timestamp`, `duration`, `targetTimestamp` into `AnimationUpdate{timestamp, duration, targetTimestamp}` and calls the driver's `frameCallback`.
- Every cursor spring is started with `Animation.start(afterDelay: .zero, drivenBy: <the cursor W>)` (0x1007b0050; `FUN_100097858` returns the W-as-driver-source witness) → **all cursor animation is ticked by the cursor window's own display link** (follows the screen the overlay is on).

#### 1.2 `SpringParameters` → `VelocityVerletSimulation.Configuration` (FUN_1007d5c9c) [code + disasm]
```swift
struct SpringConfig { var response, stiffness, drag: Double; let dt = 1.0/240.0; var idleVelocityThreshold: Double }
init(response r: Double, dampingFraction z: Double, idleVelocityThreshold v: Double?) {
    stiffness = min(r > 0 ? pow(2 * .pi / r, 2) : .infinity, 28_800)   // FUN_1007d6a78; cap 28800 = 0x40dc200000000000
    drag      = 2 * stiffness.squareRoot() * z                          // FUN_1007d6c94 (integer literal 2 at 0x101074700)
    idleVelocityThreshold = v ?? 0.06                                   // default literal 0.06 at 0x10107afa8
}
```
Mass is 1 (no mass term). `setSpring(_:)` (0x1007b6108) rebuilds the configuration keeping the stored idle threshold; velocity and force are kept (retarget-safe).

#### 1.3 Simulation state and step [code; operation order partly inferred from the generic SIMD code]
State: `time: Double, velocity: V, force: V` (fields of `VelocityVerletSimulation`, S.fields:5045). `SpringAnimation.init` creates it with `time = 0, velocity = 0, force = 0` (FUN_1007b6718 → FUN_1007d5fec). `reset()` zeroes velocity and force (FUN_1007d60bc).

Per display-link tick, `InterpolatableAnimation.performTick(with: update)` (0x1007b42f0):
```swift
func performTick(_ u: AnimationUpdate) {
    if state != .running { sim.time = u.timestamp /* start hook FUN_1007b62e4 */ }
    state = .running
    if let x = springValue(at: u.targetTimestamp) { emit(.valueChanged(old: value, new: x)); value = x }
    else { value = target; state = .ended; emit(.finished(target)) }        // FUN_1007b3cf4
}
func springValue(at t: Double) -> V? {                                         // FUN_1007b63a8
    if t - sim.time > 1.0 { sim.time = t - 1.0/60.0 }                          // stall clamp (FUN_1007d6180, literal 0.016666…)
    while sim.time < t { step(); sim.time += cfg.dt }                          // fixed 240 Hz sub-steps
    return settled() ? nil : x
}
func step() {                                                                   // FUN_1007d6e8c (velocity Verlet)
    let h = cfg.dt * 0.5
    let vHalf = v + h * F
    x = x + cfg.dt * vHalf
    F = cfg.stiffness * (target - x) - cfg.drag * vHalf                         // [inference: sign/order of the two terms]
    v = vHalf + h * F
}
func settled(_ x: V, _ target: V) -> Bool {                                    // FUN_1007d622c [code + disasm, resolved 2026-10-30]
    let tau2 = configuration.idleVelocityThreshold * configuration.idleVelocityThreshold
    if max(velocity.magnitudeSquared(), force.magnitudeSquared()) > tau2 { return false }   // 0x1007d6548–0x1007d6604
    let a = (target * 0.01).magnitudeSquared()                                 // 0.01 at 0x10104d6e8; 0x1007d6610–0x1007d6958
    if !(a > 0) { return true }                                                // integer literal 0 (0x101054bb0, width 1)
    return !((target - x).magnitudeSquared() > a)                              // 0x1007d69d4–0x1007d6a24
}
```
How it was read (2026-10-30, #235 M1 step 0). The caller `FUN_1007b63a8` passes `x0` = the animation's value (getter 0x1007b3280) and `x1` = its target (0x1007b3554), after the sub-steps of `FUN_1007d6180`, with `x20` = a copy of the simulation. In the callee, `[x2+0x28]` and `[x2+0x2c]` are the simulation's field offsets 2 and 3, `velocity` and `force` (S.fields: `configuration, time, velocity, force`), and the threshold is field 4 of the `Configuration` metadata (`FUN_1007d4d48`, offset at `+0x30`: `response, stiffness, drag, dt, idleVelocityThreshold`), squared with `Numeric.*`. The vector norm is the `AnimatableVector` witness at `+0x30`; in `SIMD2<A> : AnimatableVector`'s witness table (conformance 0x10107a160, pattern 0x1014047d0) that slot is the thunk 0x1007cdb38 → `SIMD2.magnitudeSquared()` (0x1007cdb00); the `+0x28` slot is `magnitude()`. The 0.01 vector is a splat (`SIMDStorage` subscript setter loop), multiplied lane by lane with the target; the displacement is `target − x` (`AdditiveArithmetic.-`, lanes of `x1` minus lanes of `x0`). The result `1` makes the caller return nil, which `performTick` turns into `value = target; .finished`.
Consequences. The force term dominates near rest: for the progress spring (τ 0.01, k = (2π/R)² ≈ 50–190 for the responses of 0.46–0.87 s the reference cases give) it holds only within about 2e-4 of the target, so the 1 % displacement term rarely binds there; for the scoot's point spring (τ 12 pt/s) it holds within about 0.8 pt. The displacement term is relative to the target's magnitude, so for a point spring it depends on where the coordinate origin is (the vendor's scoot runs in screen or window-relative origins). Against "speed under the threshold and within 0.01 of the target", the resolved rule finishes about 20 % later on the reference cases (path: 208 against 173 sub-steps at 197 pt; scoot: 67 against 53 at 117 pt), all of it in the last, invisible fraction of the motion.
- Retarget: setting `targetValue` on a running animation keeps `v`/`F` (the simulation is untouched) and, by the Event enum, reports `.retargeted(from:to:)` **[inference: enum read (S.fields:4959), setter not traced]**.
- `stop(immediately: true)` (0x1007b41a4): `state = .ended` and **emits `.finished(currentValue)`** to the event handler (this matters, §3.5).
- `isLogicallyComplete` (0x1007b5ac0) = `sim.time − startTime ≥ response` (else `state == .ended`); not used by the cursor code **[inference: no cursor caller]**.
- `Event = valueChanged(oldValue, newValue) | finished(value) | retargeted(fromValue, toValue)`; cursor handlers ignore `retargeted`.

### 2. Springs the cursor creates (all `SpringAnimation`, all driven by W) [code + disasm]

| field on W | value type | params (response, ζ) | idle threshold | target | event handler → effect |
|---|---|---|---|---|---|
| `cursorMotionProgressAnimation` | CGFloat 0→1 | (computed, `springDampingFraction` 0.9) | 0.01 | 1 | FUN_10009a35c → FUN_100093488 → **path tick** FUN_100093c30 |
| `cursorScootPositionAnimation` | CGPoint from→to | (`scootPositionResponse` 0.24, `scootPositionDampingFraction` 0.84) | **`scootPositionSettleVelocity` 12** (pt/s) | to | FUN_10009a3d0 → FUN_100093574 → **scoot tick** FUN_10009367c |
| `cursorScootBaseRotationAnimation` | CGFloat deg | (0.09, 0.86) | 0.01 | 0 (shortest wrap) | FUN_100099578 → FUN_1000963fc: store `cursorScootBaseRotationOffset`, recompute angle |
| `cursorScootAxisAnimation` | CGFloat deg | (0.07, 0.82) | 0.01 | folded travel angle | FUN_100099570 → FUN_100095d04: `cursorScootAxisRotation`; `style.scootStretchAngle = deg·π/180` |
| `cursorScootStretchAnimation` | CGFloat | (0.095, 0.72) | 0.01 | `1 − 0.18·e` | FUN_100099568 → FUN_1000960a8: `cursorScootStretchScale = clamp(v, scootStretchMin 0, 1)`; `style.scootStretchScale` |
| `cursorScootRotationAnimation` | CGFloat deg | (0.055, 0.76) | 0.01 | `e·tilt·76` | FUN_100099540 → FUN_1000963fc: `cursorScootRotationOffset`, recompute angle |

Each "set target" helper (FUN_1000957dc base, FUN_100095a70 axis, FUN_100095e20 stretch, FUN_1000961dc tilt) retargets the running spring when one exists and is not `.ended`, else creates and starts a new one from the current stored value. Base rotation and axis targets are first wrapped to the shortest signed delta in (−180, 180] from the current value.

Style vtable slots used (Style class, 3 slots per property): `+0xa8 hotSpot.get`, `+0xb8 velocityX.set`, `+0xd0 velocityY.set`, `+0xe8 isPressed.set`, `+0x128 angle.get`, `+0x130 angle.set`, `+0x148 scootStretchXScale.set`, `+0x160 scootStretchScale.set`, `+0x178 scootStretchPivotX.set`, `+0x190 scootStretchAngle.set`, `+0x1a8 scootTiltAngle.set`, `+0x1b8 makeView` [disasm offsets; slot order matches the S.fields declaration order].

#### 2.1 Angle helpers [disasm]
```swift
func headingAngle(_ d: CGVector) -> Double /*radians*/ {          // used by path tick, snap, scoot start, FUN_100095654
    let u = d.length >= 0.001 ? d / d.length : CGVector(dx: 1, dy: 0)
    return (atan2(-u.dy, u.dx) * 180 / .pi + 90 - MC.clickAngle) * .pi / 180
}   // headingAngle(c) == 0: the arrow at rest; moving along d rotates the tip onto d
func refreshStyleAngle() {                                          // FUN_100095654
    style.angle = .radians(headingAngle(c) /* = 0 */ + cursorScootBaseRotationOffset * .pi / 180)
    style.scootTiltAngle = .radians(cursorScootRotationOffset * .pi / 180)
}
func travelAxis(_ d: CGVector) -> (axisDeg: Double, pivotX: Double) {   // FUN_10009556c
    guard d.length >= 0.001 else { return (0, MC.scootStretchPivotX /*0.5*/) }
    var a = atan2(d.dy, d.dx) * 180 / .pi, pivot = 1.0
    while a <= -90 { a += 180; pivot = 1 - pivot }
    while a > 90  { a -= 180; pivot = 1 - pivot }
    return (a, pivot)                                                   // pivot 1 = moving rightward, 0 = leftward
}
```

### 3. Window motion (`W.move`, FUN_100090920) and the two motion modes

#### 3.1 Entry [code]
Inputs: target point (CG, global), `aboveWindowID: UInt32?`, `relativeToWindow`, `timing` (`closeEnough` = 0, `finished` = 1; S.fields enum order), `animated`, `nextInteractionHandler`, `completionHandler`. Returns `true` when an animated motion was started.
```swift
let wasVisible = isVisible
var target = convertFromCG(point) - style.hotSpot                         // window origin for the hotspot
var start  = frame.origin
if !wasVisible { start = target }
if !wasVisible && animated, let pet = petLocation { start = convertFromCG(pet) - hotSpot }   // §4.3
let win = (relativeToWindow && aboveWindowID != nil) ? CGWindow(id) : nil
if progressAnim != nil || scootAnim != nil { start = currentInterpolatedOrigin }      // retarget from the live position
resetMotion()                                                             // FUN_100097584, §3.5
currentInterpolatedOrigin = start (window-relative if win != nil: minus window origin; target likewise)
if !wasVisible { setFrameOrigin(start) }
attach(windowID, petLaunch: !wasVisible && animated && pet != nil && start != target)   // FUN_100096bbc → ordering (lifecycle notes)
if animated && isVisible && screen != nil && (wasVisible || start != target) && !bothEndsOccluded(start, target) {
    if !wasVisible { alphaValue = 1; blurRadius = 0 }                     // a pet launch appears at full opacity, no fade
    startAnimatedMotion(...)                                              // FUN_100092ba4
    return true
}
// snap
setFrameOrigin(target); drop petLaunch level reason
let path = buildPath(start, target)                                       // FUN_1000942c4 (path notes)
if path.rotatesAlongPath { style.angle = headingAngle(blendTangent(path.tangent(at: 1), 1)) }  // = 0, rest pose
nextInteractionHandler?(); completionHandler?()
return false
```
`bothEndsOccluded` (FUN_100091650): only when tracking a target window: the window under the hotspot at the start origin, and then at the end origin (`windowNumberAtPoint:belowWindowWithWindowNumber:0`), are both ≠ the target window → snap instead of animate **[code]**.

#### 3.2 Mode choice (FUN_100092ba4) [disasm 0x100092c38–0x100092c40]
`distance(start, target) ≤ MC.scootDistanceThreshold (196)` → **scoot**; otherwise → **path**. Both store the two handlers and set
`cursorMotionDidSatisfyNextInteractionTiming = (timing == .finished)` — i.e. `.finished` pre-disables the early "close enough" release.

#### 3.3 Path mode
Setup [code + disasm]:
```swift
path = buildPath(start, target); m = measure(path)                       // FUN_1000942c4, FUN_100094d24 (path notes)
let R = springResponse(path, m)                                          // FUN_100095014: clamp(f·0.9·(0.42 + 0.22·dist + 0.28·back + 0.12·clamp(0.42·detour + 0.38·turn + 0.2·energy) + g), 0.12, 2.2); f,g = 0.9,0.04 when the path has an arc else 1,0
progress = SpringAnimation<CGFloat>(.init(response: R, dampingFraction: MC.springDampingFraction /*0.9*/),
                                    initial: 0, target: 1, idleVelocityThreshold: 0.01)
progress.eventHandler = pathTick; progress.start(afterDelay: .zero, drivenBy: self)
```
Path tick (FUN_100093c30) [code + disasm]:
```swift
func pathTick(_ e: Event) {
    let p: Double; let finished: Bool
    switch e { case .valueChanged(_, let new): p = new; finished = false
               case .finished(let v): p = v; finished = true
               default: return }
    let (pt, rawTangent) = path.pointAndTangent(at: p)       // FUN_1000914a4: uniform cubic segments, t≥1 clamps to the end
    let origin = (win != nil ? CGWindow(win.id)?.origin : nil)      // re-queried every frame → rides along with a moving window
    let prev = currentInterpolatedOrigin
    currentInterpolatedOrigin = pt
    setFrameOrigin((pt + (origin ?? .zero)).rounded())
    maintainPetLaunchLevel(screenPoint)                       // FUN_100096c88 (lifecycle notes)
    if path.rotatesAlongPath { style.angle = .radians(headingAngle(blendTangent(rawTangent, p))) }
    if finished {
        nextInteractionHandler?(); progressAnim = nil; nextInteractionHandler = nil
        let done = completionHandler; completionHandler = nil; didSatisfy = false
        drop petLaunch level reason; style.velocity = (0, 0); done?()
    } else {
        if p >= 0.995 && distance(pt, path.end) <= 3.157 && !didSatisfy {        // CloseEnoughConfiguration.default, inlined
            didSatisfy = true; nextInteractionHandler?(); nextInteractionHandler = nil
        }
        let v = rawTangent * progress.velocity * Double(path.segments.count)     // pt/s, chain rule
        style.velocity = v.length > 0 ? v : (pt - prev)                          // fallback: per-frame delta
    }
}
func blendTangent(_ t: CGVector, _ p: Double) -> CGVector {                    // FUN_100094180
    let u = t.length >= 0.001 ? t.normalized : c
    let k = (clamp(p, 0, 1) - MC.terminalTangentBlendStart /*0.99*/) / (1 - MC.terminalTangentBlendStart)
    let s = k >= 1 ? 0 : 1 - max(k, 0)
    let w = 1 - pow(s, 3)                                      // 0 until p = 0.99, then cubic ease to 1 at p = 1
    let d = c * w + u * (1 - w)
    return d.length >= 0.001 ? d.normalized : CGVector(dx: 1, dy: 0)
}
```
So the arrow points along travel and eases back to its resting tilt over the last 1 % of progress. Spring overshoot (ζ 0.9 ≈ 0.15 %) is clipped by the `t ≥ 1` clamp, so the drawn cursor never passes the target.

#### 3.4 Scoot mode (short hops ≤ 196 pt)
Setup (FUN_100092ba4, scoot branch) [disasm 0x100092f78–0x100093180]:
```swift
let d = (target - start).length >= 0.001 ? (target - start).normalized : c
cursorScootBaseRotationOffset = wrap180(style.angle.degrees - 0)     // continuity: absorb the current heading into the offset
scootPos = SpringAnimation<CGPoint>(.init(response: 0.24, dampingFraction: 0.84), initial: start, target: target,
                                    idleVelocityThreshold: MC.scootPositionSettleVelocity /*12 pt/s*/)
scootPos.eventHandler = scootTick (captures start, target, d, win)
setBaseRotationTarget(0)                    // FUN_1000957dc: spring the heading back to the resting tilt (0.09, 0.86)
setAxisTarget(travelAxis(d).axisDeg)        // FUN_100095a70
scootPos.start(afterDelay: .zero, drivenBy: self)
```
Scoot tick (FUN_10009367c) [code + disasm]:
```swift
func scootTick(_ e: Event) {
    let pos: CGPoint; let finished: Bool   // .valueChanged → new, .finished → value, else return
    let seg = target - start
    let t = seg.lengthSquared < 0.001 ? 1 : clamp(dot(pos - start, seg) / seg.lengthSquared, 0, 1)
    let e = clamp(min(t / 0.22, 1) * pow(max(1 - t, 0), 0.62), 0, 1)    // envelope; peak 0.857 at t = 0.22
    let origin = win != nil ? CGWindow(win.id)?.origin : nil
    currentInterpolatedOrigin = pos
    setFrameOrigin((pos + (origin ?? .zero)).rounded()); maintainPetLaunchLevel(...)
    let (axis, pivotDir) = travelAxis(d); setAxisTarget(axis)
    setStretch(scale:  1 - MC.scootSquashYAmount /*0.18*/ * e * (1 - MC.scootStretchMin /*0*/),   // sprung (0.095, 0.72)
               xScale: 1 + MC.scootStretchXAmount /*0.38*/ * e,                                    // set directly
               pivotX: e * pivotDir + (1 - e) * MC.scootStretchPivotX /*0.5*/)                     // set directly
    setTiltTarget(e * clamp(0.75 * d.dx + 0.62 * d.dy, -1, 1) * MC.scootRotationMax /*76°*/)        // sprung (0.055, 0.76)
    style.velocity = (0, 0)
    if finished {
        nextInteractionHandler?(); scootPos = nil; clear handlers; didSatisfy = false
        currentInterpolatedOrigin = target; setFrameOrigin((target + origin).rounded())
        drop petLaunch level reason
        resetScootEffects()                    // FUN_1000964ec: stop all four effect springs, offsets 0, scales 1, pivot 0.5
        style.velocity = (0, 0); completion?()
    } else if t >= 0.995 && distance(pos, target) <= 3.157 && !didSatisfy {
        didSatisfy = true; nextInteractionHandler?(); nextInteractionHandler = nil
    }
}
```
The scoot is cartoon physics: the arrow stretches along its travel axis (≤ 1.33× long, ≤ 0.85× thick), tilts toward the travel direction (up to ≈ 65°) and springs back; all effects are 0 at both ends because the envelope vanishes at t = 0 and t = 1.

#### 3.5 Reset (`resetMotion`, FUN_100097584) [code]
Drop the petLaunch level reason (setLevel 0 unless the app-active reason holds); stop the progress spring **without** clearing its event handler (so `stop(immediately:)` emits `.finished(current)` → the path tick runs its finish branch → both handlers fire and the awaiting `move` resumes); clear the scoot position spring's event handler first, then stop it (no finish callback); `resetScootEffects()`; release both handlers without calling them; `didSatisfy = false`; `style.velocity = 0`; re-order the window if the petLaunch reason was dropped.
**[inference]** An interrupted *scoot* therefore drops its handlers uncalled; whether the outer `CheckedContinuation` can leak depends on callers never overlapping moves (not checked).

### 4. `CUC.move(…)` (async, 0x10008e178 → FUN_10008e228 / FUN_10008e93c / FUN_10008ec9c) [code + disasm]
Signature: `move(to: CGPoint, aboveWindowID: UInt32?, relativeToWindow: Bool, nextInteractionTiming: CursorNextInteractionTiming, animated: Bool, fadeIn: Bool, isDelegate: Bool) async` (registers: d0/d1 point, x0 id, w1…w5 flags).
```swift
@MainActor func move(...) async {
    if !isDelegate {
        targetWindowID = relativeToWindow ? aboveWindowID : nil
        if let delegate { await delegate.cursorMove(...); /* then continues below */ } else { isMoving = true }
    }
    let wasVisible = window.isVisible
    if !wasVisible && (fadeIn || animated) { window.alphaValue = 0; window.blurRadius = 7 }   // GaussianBlur layer filter
    var resumed = false
    let started = await withCheckedContinuation { cont in
        window.move(..., nextInteraction: { if !resumed { resumed = true; cont.resume() } },      // FUN_10008f0f4
                         completion:      { if !resumed { resumed = true; cont.resume() }
                                            if !isDelegate { self.isMoving = false } })            // FUN_10008f178
    }
    if !wasVisible && (fadeIn || animated) && !started { await window.fadeIn() }                  // §4.1
    NotificationCenter.default.post(name: computerUseCursorLocationDidChangeNotification, object: self)  // DAT_10155e9b0, once FUN_10008c690
}
```
So the caller resumes **at closeEnough** (`.closeEnough`: projected progress ≥ 99.5 % and within 3.157 pt of the end) or **at completion** (`.finished`, or whenever the motion ends first, or immediately for a snap). The motion keeps animating after `.closeEnough` returns; `isMoving` turns false only at completion.

#### 4.1 Fade in / fade out [code + disasm]
Both last **0.44 s** (`0x3fdc28f5c28f5c29`) with `kCAMediaTimingFunctionEaseInEaseOut`, and pair an opacity change with a Gaussian blur.
- `fadeIn()` (async, FUN_100092360 → FUN_10009283c, continuation label "fadeIn()"): `alphaValue = 0`; layer filter `GaussianBlur(radius: 0)` as the model value; `CABasicAnimation("filters.gaussianBlur.inputRadius", from: 7, to: 0, duration: 0.44, easeInEaseOut)` under key `"cursorBlurTransition"` (FUN_100091ac4); `NSAnimationContext.runAnimationGroup { ctx.duration = 0.44; easeInEaseOut; animator().alphaValue = 1 }` (FUN_100092adc via FUN_10009a40c, literal 1.0); completion removes the GaussianBlur filter (FUN_1000917ec) and resumes.
- `fadeOut()` (async, FUN_100091cd8 → FUN_100091ee8 → FUN_100092098, label "fadeOut("): filter `GaussianBlur(radius: 7)` as model; blur animation 0 → 7; alpha → 0; completion `orderOut(nil)`, `alphaValue = 1`, remove blur, resume.
- Other callers of `fadeIn()` outside the cursor: 0x10007bb98, 0x10007a0f4, 0x100070ffc (controller; see lifecycle notes).

#### 4.2 `orderOut()` (async, 0x10008f330 → FUN_10008f3c0) [code]
If a delegate exists, it is awaited instead. Otherwise: `wantsToBeVisible = false`; `resetMotion()`; if visible → `await fadeOut()` (0.44 s blur-out) else `super.orderOut(nil)` at once; tell the delegate (witness +0x18), post `computerUseCursorDidHideNotification` (once FUN_10008c738), log the app pid and prior visibility.

#### 4.3 Pet launch point (static `0x1013de468/470`, nil flag `0x1013de478`) [code + disasm]
Written only by `RemoteHostedPIPContentPublisher.setPetLocationWithX(_:y:available:withReply:)` (0x1001ea218; store at 0x1001ea41c: `available ? (x, y) : nil`) and cleared on PiP disconnect (0x1001e4714). It is the screen position of the Codex app's avatar ("pet") overlay. A cursor that is hidden and moved with `animated` starts at the pet and flies out at overlay level (`petLaunch` reason) until the hotspot is over the target window (FUN_100096c88 hit test), then re-attaches above that window. Without a pet location, a hidden cursor appears at the target with the 0.44 s fade/unblur.

### 5. `press(count:delay:)` (async, 0x10008d960 + partials 0x10008da68…0x10008e100) [code]
```swift
func press(count: Int, delay: Duration) async throws {
    for _ in 0..<count {
        style.isPressed = true;  try await ContinuousClock().sleep(for: delay)
        style.isPressed = false; try await ContinuousClock().sleep(for: delay)
    }
}
```
Both call sites use `count: 1, delay: SynthesizedEvent.humanClickInterval` (0.1 s; FUN_100743804): `VirtualCursor.press()` (0x1007afda0, called before an element's AX action, F-helper-logic §5) and the controller at 0x100074f14. So a click shows ~0.1 s pressed + 0.1 s released (0.2 s) before the action proceeds. A cancelled first sleep leaves `isPressed == true` **[code: the throw path skips the reset]**. What `isPressed` looks like is in the Style/view code (look notes).

### 6. Undetermined
- The `0x202` companion flags of `GraphicsSupport.LayerFilter.GaussianBlur` (FUN_1000838c4 / `CALayer.updateFilter`).
- What the cursor delegate does (who sets `CUC.delegate`; likely the remote-hosted PiP path) — outside this slice.

---

# Appendix C. Look, lifecycle and window tracking (from `vendor/notes/look.md`)

## Vendor agent cursor: look, lifecycle, window tracking (SkyComputerUseService 26.924)

Static reading only of `work/app/Contents/MacOS/SkyComputerUseService` (bundle 26.924.1001281). Raw Ghidra output: `vendor/decomp/` and `vendor/decomp-look/`; disassembly `~/.claude/jobs/1ea561bc/tmp/117/decomp-m2a/dis.txt`. Helper scripts: `vendor/scripts/mangled.py` (decodes SwiftUI view types from symbolic mangled names via `S.fixups`), `vendor/scripts/fieldrefs.py` (finds every user of a Swift field-offset global), `vendor/scripts/arrow.py` (rasterises the arrow path). Marks: **[code]** read in the decompile, **[disasm]** checked in the disassembly, **[inference]** reasoned.

Taste reference renders (local only): `vendor/agent-cursor-shape.png` (the arrow path at 18 pt, ×8, fill and stroke as read; the fog halo is not rendered), `vendor/lens-contact-sheet.png`.

### 1. Style selection

| item | finding |
|---|---|
| `Style.current` (global closure, `0x1013de480`) | Static initial value is `0x1000977e8` = `{ SoftwareCursorStyle() }` [disasm]. The service's launch path (redacted fn 951 at `0x100026d88`, reached from `applicationDidFinishLaunching:` `0x100029f14`) overwrites it unconditionally at `0x1000270cc` with `0x1000280b0` = `{ FogCursorStyle(isAttached: false) }` [disasm]. So the shipped look is the **Fog** style. |
| `Style.fog` (`0x100141170`) | `FogCursorStyle(isAttached: true)`; no caller found [disasm]. |
| `Style.software` (`0x100097878`) / `SoftwareCursorStyle.makeView` (`0x1000981b8`) | `NSImageView` with `Bundle.module.image(forResource: "SoftwareCursor")` (the only asset in `Package_ComputerUse.bundle/Assets.car`, 200×230 px per `assetutil --info`), `image.size = 20×23`, view frame 20×23. `hotSpot = (4, 4)` (`0x1000981ac`) [code+disasm]. Fallback/default only. |
| `Style` base (`0x1000979b0`, `0x1000980bc`) | abstract: `hotSpot`/`makeView` hit `_assertionFailure` [code]. Stored fields (offsets): velocityX 0x10, velocityY 0x18, isPressed 0x20, activityState 0x21 (idle 0, loading 1, paused 2), isAttached 0x22, angle 0x28, scootStretchXScale 0x30 (=1), scootStretchScale 0x38 (=1), scootStretchPivotX 0x40 (=0.5), scootStretchAngle 0x48 (=0), scootTiltAngle 0x50 (=0) [code `10013ef18`]. |
| `FogCursorStyle.hotSpot` (`0x10013f3dc`) | `hostingView.intrinsicContentSize * 0.5` (the view centre), `(0,0)` before the view exists [disasm]. |
| `isAttached` | Only writer found is the init. No caller of `CUC.isAttached.setter` or the style's vtable slot (+0x118) was found, so in this build it stays **false** and the cursor draws at 0.75 scale [inference: vtable calls can hide a writer]. |
| `FeatureFlag.detachComputerUseCursor` (`0x1013a11f8`) | key `feature/detachComputerUseCursor`, description "Detach the computer use cursor from the command palette.", **default true** [disasm]. No reader of its addressor or getter found [disasm]. Reading: "attached" means docked to the Codex command palette; detached is the free-floating overlay [inference]. |
| `FeatureFlag.computerUseCursor` (`0x1013a11d0`) | key `feature/computerUseCursor`, "Enable the virtual cursor in Computer Use.", **default true**. Read by `updateSkyshot` (`0x10006c9b0`), `positionElement` (`0x100070598`), element `click` (`0x100071f6c`), `performSecondaryAction` (3 sites), `selectText` (`0x100079264`) [disasm]. `moveMouse` (coordinate route) does not read it [inference from the reference list]. |
| How flags resolve | `FeatureFlag {key, description, defaultValue}`; `isEnabled` (`0x100eb7ba4`) touches `NSUserDefaults standardUserDefaults` / `initWithSuiteName:` [disasm]. So a defaults key `feature/computerUseCursor` overrides the default [inference]; the suite name is undetermined. No env var found. |

### 2. Look: the Fog cursor (`CursorView`, SwiftUI in an `NSHostingView`)

`FogCursorStyle.makeView` (`0x100140fb0`) builds `NSHostingView<CursorView>` once and caches it. `CursorView` fields, read from the constants it stores [code+disasm]:

```swift
struct CursorView: View {
  let viewModel: FogCursorViewModel        // @Observable mirror of Style fields
  let cursorRadius: CGFloat = 9            // arrow frame = 2*9 = 18 pt
  @State var animatedAngleOffsetDegrees = 0.0
  @State var loadingAnimationToken = 0
  let fogRadius: CGFloat = 21              // fog frame = 6*21 = 126 pt; halo circle = 2*21 = 42 pt
  let cursorScaleAnchorPoint = UnitPoint(x: 0.1, y: 0.1)
  let fogScaleAnchorPoint   = UnitPoint(x: 0.25, y: 0.25)
}
```

**Arrow shape** `AgentCursor.path(in rect)` (`0x100143248` → `0x10014347c`): uses only `rect.width` (w) and `rect.height` (h) [disasm; origin ignored]. Unit coordinates (x·w, y·h), constants at `0x10104d800…8c8`:

```
move   (0.00599, 0.15864)
curve  to (0.15158, 0.00627)  c1 (-0.02364, 0.06456)  c2 (0.06169, -0.02474)   // rounded tip, top-left
line   (0.87634, 0.25652)
curve  to (0.88794, 0.48095)  c1 (0.97594, 0.29096)   c2 (0.98340, 0.43547)    // rounded right wing
line   (0.59343, 0.62108)                                                      // inner notch
line   (0.45955, 0.92925)
curve  to (0.24510, 0.91717)  c1 (0.41611, 1.02925)   c2 (0.27801, 1.02146)    // rounded tail
line   (0.00599, 0.15864); close
```
A rounded "navigation arrow" pointing up-left; with `clickAngle = -44°` the resting tilt matches a classic pointer [inference].

**View tree** (type decoded from the mangled `ModifiedContent` chain at `0x101046210`, values from `FUN_100141534`, `FUN_10014288c`, `FUN_100142dd0`, `FUN_1001426f4`, `FUN_1001411c4`):

1. `ZStack { AgentCursor().opacity(f); AgentCursor().stroke(Color.white.opacity(0.8), StrokeStyle(lineWidth: 2)) }` in an 18×18 frame. `f = 0.24` when `activityState == .loading`, else `0.16` (table `0x10103e300`) [code+disasm]. The fill has no explicit colour, so it uses the foreground style (`.primary`: dark on a light appearance) [inference].
2. Tilt: `rotationEffect(scootTiltAngle, anchor: UnitPoint(0.00599, 0.15864))` (the arrow tip) [code: constants and tilt field passed together; anchor pairing is inference].
3. Speed swell: `s = clamp(abs((velocityX + velocityY) / 2) / 3000, 0, 1)`, `swell = (1 - s) + 2.5 * s` (`FUN_1001411c4`) [code]. The fog-halo mask is scaled by `swell`; the arrow inside it is counter-scaled by `1/swell` [code: `1.0 / swell` stored beside the cursor sub-chain], so the halo grows up to 2.5× at speed while the arrow stays the same size.
4. `scaleEffect(attach * press, anchor: cursorScaleAnchorPoint)` where `attach = isAttached ? 1 : 0.75`, `press = isPressed ? 0.7 : 1` [code]. With isAttached false: 0.75 at rest, 0.525 while pressed.
5. `.frame(126×126)`; `.background(FogBackgroundEffectView().ignoresSafeArea().allowsHitTesting(false))` via `View.fogBackgroundEffect(FogRenderParameters)` with (`FUN_100142cbc`) [code]: `blurRadius 17`, `saturationAmount 1.0`, `wallpaperCaptureOpacity 0.39`, `dynamicShadowOpacity 0.37`, `dynamicShadowBackdropOpacity 0.59`, `dynamicShadowWallpaperCaptureOpacity 0.29`, `backdropGroupIdentifier nil`, luminance curve from `defaultLuminanceCurveValues = [0.0, -2.0, 0.026172, 3.0]` (input min, output min, input max, output max), `luminanceCurveAmount 1.0`. So the "fog" is a frosted backdrop blur behind the arrow that partly reproduces the wallpaper [inference from field names].
6. `.mask { ZStack { <the arrow sub-chain>; Circle().frame(42×42).blur(radius: 12 /* fogRadius - cursorRadius */).offset(x: -3, y: -2).scaleEffect(attach*press, anchor: fogScaleAnchorPoint).scaleEffect(swell) } }`, then `.compositingGroup()` [code `FUN_100142dd0` stores 42, 12, −3, −2; modifier order from the decoded type]. The fog is therefore visible only inside a soft 42-pt blob around the arrow plus the arrow itself.
7. `.opacity(activityState == .paused ? 0.5 : 1.0)` [code].
8. Stretch (scoot squash): `rotationEffect(-stretchAngle)` → `scaleEffect(x: stretchXScale, y: stretchScale, anchor: UnitPoint(x: ((126-18)/2 + 18*clamp(pivotX,0,1)) / 126, y: 0.5))` → `rotationEffect(+stretchAngle)` [code]. The values are driven per frame by the window's springs (other fork).
9. `rotationEffect(angle + animatedAngleOffsetDegrees)` (`FUN_1001412c0` adds the wiggle offset to the model angle) [code]. Anchor undetermined.
10. Animations attached to values (from the stored (animation, value) pairs) [code; pairing is inference]: `Animation.spring(Spring(mass: 1, stiffness: 130.5, damping: 18.85))` for velocityX, velocityY, isPressed and isAttached (that is a response of about 0.55 s and damping ratio about 0.83); `easeInOut(duration: 0.2)` for activityState; `nil` (no implicit animation) for angle and the five scoot values. A final pair `(cursorRadius/2, cursorRadius/2) = (4.5, 4.5)` closes the struct, probably an offset that puts the arrow tip near the view centre (the hotspot) [inference; tip alignment undetermined].

**Loading "thinking" wiggle** [code+disasm]:
```swift
// onAppear (FUN_100143b0c -> FUN_100142138)
if state == .loading { startWiggle() } else { animatedAngleOffsetDegrees = 0 }
// onChange(of: state == .loading) (FUN_100143b7c)
isLoading ? startWiggle() : stopWiggle()

func startWiggle() {                                  // FUN_1001421ec
  let cur = animatedAngleOffsetDegrees
  loadingAnimationToken += 1; let token = loadingAnimationToken
  let target: Double = abs(-10 - cur) < abs(10 - cur) ? -10 : 10   // nearest extreme
  let full = 0.684931506849315                       // seconds per 20° swing
  withAnimation(.easeInOut(duration: abs(target - cur) / 20 * full), completionCriteria: .logicallyComplete) {
    animatedAngleOffsetDegrees = target
  } completion: {                                    // FUN_1001425a8
    guard token == loadingAnimationToken, state == .loading else { return }
    withAnimation(.easeInOut(duration: full).repeatForever(autoreverses: true)) {
      animatedAngleOffsetDegrees = (target != 10) ? 10 : -10       // closure 0x100144bb0
    }
  }
}
func stopWiggle() {                                   // FUN_100142484
  loadingAnimationToken += 1
  withAnimation(.easeInOut(duration: 0.41)) { animatedAngleOffsetDegrees = 0 }  // closure 0x100144c1c
}
```
So: idle = still arrow at 16 % fill; loading = arrow rocks ±10° (about 0.68 s per swing, eased, endless) with 24 % fill; paused = whole cursor at 50 % opacity. No colour change, no spinner, no ripple in the view.

**Press** (`CUC.press(count:delay:)` `0x10008d960`, continuations `…da68…e0c0`) [code]: `for _ in 0..<count { style.isPressed = true; try await sleep(delay); style.isPressed = false; try await sleep(delay) }`; on cancellation it still clears `isPressed`. `VirtualCursor.press()` (`0x1007afda0`) calls it with `count: 1, delay: SynthesizedEvent.humanClickInterval` (0.1 s, per F-helper-logic). Visual: the arrow springs to 70 % and back.

**Fade in/out** (window level, not SwiftUI) [code+disasm]: fade-in (`FUN_10009283c`) sets alpha 0, then animates `alphaValue → 1` with `NSAnimationContext` (0.44 s, ease-in-ease-out) and a layer `CABasicAnimation` on `filters.gaussianBlur.inputRadius` from 7 → 0 (0.44 s, key `cursorBlurTransition`). Fade-out (`FUN_100092098`) is the reverse (blur 0 → 7, alpha → 0).

#### SkyLensView (the Lens frames) is not part of the cursor
`CursorView`'s decoded type contains no `SkyLensViewRepresentable`, and the only symbolic reference to its descriptor (`0x101182ab0`) is its own metadata (`0x101157e1c`); its metadata accessor is only used by its own conformance code [disasm]. So the 45-frame Lens is not drawn by the agent cursor in this build. It is probably the Sky "lens" glyph used elsewhere (status item or command palette) [inference]. Its logic, for completeness [code]: `isAnimating` starts an `AnimationDriver` (display link); frame = `Int(frac((t - t0) / 1.5) * 44)` (a 1.5 s loop over frames 0–43, about 29 fps); on stop with frame ≠ 0 it "resets to idle" over 1.2 s: `p = clamp((t - r0)/1.2)`, `v = (1 - e^(-4.7125 p) * (cos(8.2336 p) + 0.57235 sin(8.2336 p))) / 0.99855`, `frame = (startFrame + Int(v * (45 - startFrame))) % 45`, then clears its cache. `isTinted` sets the image layer's `compositingFilter = "luminosityBlendMode"`; `contentsGravity = resizeAspect`; frames load asynchronously into an `NSCache`.

### 3. Overlay window

`ComputerUseCursor.Window` superclass is **`NSWindow`** (bind `AppKit/_OBJC_CLASS_$_NSWindow` at `0x1013D37F0`), not NSPanel [S.fixups]. Init `FUN_10009032c` [code+disasm]: `initWithContentRect: .zero, styleMask: 0 (borderless), backing: .buffered, defer: true`; `title = "Software Cursor"`; `collectionBehavior = 0x40048` = `.canJoinAllApplications | .ignoresCycle | .transient`; `isReleasedWhenClosed = false`; `ignoresMouseEvents = true`; content = `NSViewController` whose view is `style.makeView()` with `wantsLayer = true`; `backgroundColor = .clear`; `delegate = self`; observes `NSWorkspace.activeSpaceDidChangeNotification`. Never called on it: `setSharingType:` (absent from the whole binary, so the window is capturable), `setHasShadow:`, `setOpaque:`, `setCanHide:`, `setHidesOnDeactivate:` [strings+code]. `constrainFrameRect:toScreen:` returns the rect unchanged (no clamping to a screen) [code]. Window size follows the hosting view (126×126 pt for Fog) [inference: contentViewController sizing].

**Level and z-order** (`FUN_100097420` "update ordering", `FUN_100096aec`, `FUN_100096bbc`, `FUN_100097584`) [code+disasm]:
```swift
// overlayWindowLevelReasons = { appMonitor: Bool, petLaunch: Bool }
func updateOrdering() {
  guard wantsToBeVisible, targetStillOnScreen() else { resetMotion(); if isVisible { super.orderOut(nil) }; return }
  if let target = correspondingWindowID, !reasons.appMonitor, !reasons.petLaunch {
    if let info = CGWindow(target) { level = info.layer }          // same layer as the target window
    order(.above, relativeTo: target)                               // directly above the target
  } else { orderFront(nil) }                                        // at overlay level
}
func targetStillOnScreen() -> Bool {                                // FUN_1000972b4
  guard let id = correspondingWindowID else { return true }
  return NSWindow.windowNumbers(options: [.allApplications])!.contains(id)   // on-screen, active Space only
}
func setReason(_ on: Bool) {                                        // overlay entered
  if on && none were set { CGSSetWindowLevel(mainConnectionID, windowNumber, CGWindowLevelForKey(.overlayWindow)); level = 102 }
  if all cleared { level = 0 /* normal */ }
  updateOrdering()
}
```
`ComputerUseCursor.overlayWindowLevel` = 102 (`kCGOverlayWindowLevel`, above pop-up menus 101) at `0x101041320`.

### 4. Window tracking

| trigger | handler | behaviour |
|---|---|---|
| Target app becomes active / inactive | `AppMonitor` KVO on `NSRunningApplication.isActive` (`FUN_100098c44`) | `appIsActive = new`; `reasons.appMonitor = appIsActive || menusOpen > 0` → overlay level 102 while the target app is frontmost, else attached above the target window [code]. Initial value set from `isActive` in `AppMonitor.init` (`FUN_100098400`). |
| AX `menuOpened` / `menuClosed` | `FUN_10009aa68` (via `FUN_10009a7e0` → MainActor task) | `menusOpen += 1 / -= 1`; same `reasons.appMonitor` recomputation, so the cursor floats above an open menu [code]. |
| AX `focusedWindowChanged` | `FUN_10009aa68` | if the app has a `primaryWindow` and the cursor is visible: `correspondingWindowID = primaryWindow.windowID`, `wantsToBeVisible = true`, `updateOrdering()` — the cursor follows to the newly focused window [code]. |
| Active Space changed | `activeSpaceDidChange:` `0x100097214` | `updateOrdering()`; the target-on-screen test hides it when the target window is on another Space, minimised or hidden [code; the hide cases are inference from `windowNumbersWithOptions:` without `allSpaces`]. |
| Cursor window occluded | `windowDidChangeOcclusionState:` → `FUN_100096e6c` | if visible, `!occlusionState.contains(.visible)`, no overlay reason, has target: scan the front-to-back on-screen list; if the target is now in front of the cursor, re-assert `order(.above, relativeTo: target)` [code]. |
| Cursor window lost its screen | `windowDidChangeScreen:` → `FUN_10009710c` | `screen == nil` → log, reset motion state [code]. |
| Cursor window moved | `ComputerUseCursor.windowDidMove:` → `FUN_10008fff8` | notify `delegate` (slot +0x20) and post `computerUseCursorLocationDidChange` [code]. |
| Target window moved | none | No AX `moved`/`resized` observer and no `NSWindowDidMove` on the target: the cursor does **not** follow a window that moves while idle; it is re-placed on the next `move` [inference from the AppMonitor's three notifications]. `relativeToWindow: true` only makes the motion maths use the target's frame at move time (`FUN_100090920` reads `CGWindow(windowID)`); that part belongs to the motion fork. |
| Target app changes | `setCorrespondingApplication(pid:)` `0x10008ff28` | stores the pid and replaces the `AppMonitor` [code]. |

**Pet launch.** `RemoteHostedPIPContentPublisher.setPetLocationWithX:y:available:` (`0x1001ea218`, an XPC call from the host app) stores a global optional point at `0x1013de468` [disasm]. In `Window.move` (`FUN_100090920`), when the cursor is hidden and the move is animated, the start point is that pet location, so the cursor flies out of the Codex app's floating avatar to its target. During that flight `reasons.petLaunch = true` (`FUN_100096bbc`, overlay level 102); it is cleared and the level restored when the motion ends or is reset (`FUN_100097584`) [code]. The analytics names `CodexAvatarOverlay…PetKind` match [inference].

### 5. Lifecycle

**Ownership.** One `ComputerUseCursor` per `ComputerUseAppController`, i.e. per controlled app (field `virtualCursor`), created lazily by `createVirtualCursorIfNeeded()` (`0x10006bb70`) with `Style.current()` and `MotionConfiguration.live`, bound to the app pid and an `AppMonitor` [code]. Every cursor is registered in a weak `NSHashTable` (`ComputerUseCursor.all`) and observes its own window's `NSWindowDidMoveNotification` (`CUC.init` `0x10008d65c`) [code].

**Who creates and moves it** (all moves use `relativeToWindow: true`, `animated: true`, target window = the element's or the app's window) [disasm of the call sites]:

| action | where | timing passed |
|---|---|---|
| element click | `click(elementID:…)` → `prepareToInteract(positionElement: true)` (`0x100071ed8`) | `.closeEnough` |
| set value | `setValue` (`0x1000759e0`) | `.closeEnough` |
| perform secondary action | `0x100073a5c` | `.finished` |
| element-targeted scroll | dispatcher `0x10015116c` | `.finished` |
| select text | `prepareToInteract(nil, positionElement: false)` then its own move (`0x10007a010`) | `.closeEnough` |
| coordinate actions | dispatcher → `moveMouse(to:, .finished)` (`0x100150038`, `0x100152164`; which branches is inference: coordinate click/drag and coordinate scroll) | `.finished` |

The controller inlines `CUC.move`: set `targetWindowID`; if a delegate exists hand over to it, else `isMoving = true`; if the window is hidden set alpha 0 and blur 7; call `Window.move`; afterwards, if the window had been hidden and `Window.move` did not start an animated flight, run `fadeIn()` (0.44 s) [code `FUN_1000708c8`, `FUN_100070ffc`]. Net effect: the first appearance is a blur-fade-in at the target, or a flight from the pet if the host app has published one.

**Activity state writes** [code]:
- `PerformAction` request start (`FUN_10014ef48`): create the cursor, `activityState = .idle`.
- `PerformAction` end (`FUN_100154e60`): `.loading`.
- `GetAppState`/skyshot request (`FUN_100157aa4`): create the cursor, `.loading`.
- User interference (`ComputerUseAppInstanceManager`, F-helper-logic.md §9 item 1): `.paused` on the user's own input in the controlled app; after the 5 s debounce `.loading`; `clearUserInterruptedInterventionAfterStateRequery` (`FUN_1000a4c68`) writes the recomputed state.
So the cursor sits still while acting, wiggles while the model is thinking between steps, and dims while the user has taken over.

**Hiding.** `CUC.orderOut()` (`0x10008f330`, continuations `…f3c0`, `…f968`): ask the delegate (slot +0x10) if any; if visible: `wantsToBeVisible = false`, stop motion, `await fadeOut()` (0.44 s), `super.orderOut`; notify the delegate (slot +0x18) and post `computerUseCursorDidHide` [code]. Its only caller is `ComputerUseAppController.deactivate()` (`FUN_10006fbd0`), called from the AppModify request (`0x10014d258`), `ComputerUseAppInstance.endByUserRequestAfterPendingOperations` (`0x10009f168`), the controller's init path (`0x10006a8a8`) and eight unresolved async continuations at `0x100004f70–0x100005f08` [disasm]. **No idle timeout**: `shouldFadeOut` is written only by `init` and never read outside its accessors [fieldrefs]. Off-Space or minimised targets hide it through `updateOrdering()` only (§3).

**Consumers of the cursor's position.**
- The host app: on `computerUseCursorLocationDidChange` the service calls `RemoteHostedPIPContentPublisher.setComputerUseCursorLocation(point, isActive: true)` (call site in fn 1197 at `0x1000317e0`), and on `computerUseCursorDidHide` it calls the same with `isActive: false` (`0x100031924`). These are forwarded over XPC (`setComputerUseCursorLocationWithX:y:isActive:withReply:`) [disasm]. The PiP renderer also captures the cursor window itself with ScreenCaptureKit (`CursorCaptureKey.cursorWindowID`) and draws it on a separate `cursorDisplayLayer` [S.fields].
- Skyshots: `updateSkyshot` (`FUN_10006c984`) adds the visible cursor window to the capture as an extra window when `FeatureFlag.computerUseCursor` is on [code]. So **the model sees the agent cursor in its screenshots**.

### 6. Undetermined
- The exact anchor of the main `rotationEffect` and the exact on-screen position of the arrow tip relative to the hotspot (the (4.5, 4.5) pair).
- The fill colour in a dark appearance (`.primary` assumed).
- The UserDefaults suite behind `FeatureFlag.isEnabled`, and whether Statsig gates also feed it.
- Who, if anyone, sets `CUC.delegate` or `isAttached` in this build (no writer found).
- The owners of the eight early `deactivate()` continuations.
- `FogBackgroundEffectView` internals (Fog module): only the parameter values were read.
