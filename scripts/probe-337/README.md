# Probe 337: a click inside Chrome's omnibox popup that the screenshot already showed

Hosted measurement kit for #337, built on #316's kit (`scripts/probe-316/browser.mjs` and `install.sh` are reused). It is
disposable and not a ci-kit gate. Workflow: `.github/workflows/probe-337.yml`. Dispatch it with an exact engine SHA. The
engine is built unmodified from that SHA in a detached worktree.

Each row does the following, on stable Google Chrome placed at (400, 31, 620×678):
1. A re-set: Escape twice, the page reloaded, the web area focused. Then either Chrome is made frontmost, or a TextEdit
   cover at (0, 40, 380×300) is raised so that Chrome sits behind it, uncovered.
2. One observation.
3. ⌘L, plus `type_text` of `http://127.0.0.1:<port>/results` in the typed sequences, all through the engine.
4. A re-observation.
5. One coordinate click placed in that re-observation's screenshot, either on the popup's first row (the
   what-you-typed URL row, which navigates to `/results` when taken) or on the page's Beta button outside the popup.

The side tool (`tool.swift`, op `popup`) reads the popup's window and its accessibility rows. The page's beacons show
where the click went.

Cells:
- `shared-behind`: the ticket's case.
- `shared-behind-primed`: keys sent while Chrome was frontmost, then the cover raised.
- `shared-front` and `dedicated-behind`: the controls.

Reader: `node scripts/probe-337/summary.mjs <results.json>`.

## Results, engine d44a4fe129128c14f126b6ff64e85d049048bd06 (main)

Run 1: https://github.com/SSFSKIM/cua/actions/runs/44797144792 (kit 9c3bd44b; Google Chrome 157.0.8103.79, macOS 26.7.2,
image 20261117.0516.1; 72 rows).
Run 2: https://github.com/SSFSKIM/cua/actions/runs/44799499336 (kit e004fea6; Google Chrome 156.0.8078.80, macOS 26.7.2,
image 20261102.0473.1; 18 rows).
Each run's artifacts (`results.json`, the engine's screenshots, full-screen captures) are in
`~/.local/share/probe-337/run-<id>/` on the MacBook.

### Clicks on a popup row (typedRow, plus zeroRow where a popup showed)

| cell | rows with the popup in the screenshot | engine answer | stalePoint | where it went |
|---|---|---|---|---|
| shared-behind | 7 (typedRow 6, zeroRow 1) | `backgroundClickRefused` 7/7, nothing posted | kept/noHit 7/7 | the popup stayed up, no navigation, TextEdit still frontmost |
| shared-front | 6 (typedRow) | posted 6/6 (route 3) | kept/noHit 6/6 | **the page under the popup** 6/6 (`pointerdown`, `mousedown`, `click` on the page's `wrap` div), the popup dismissed, no navigation: the suggestion was taken 0/6 |
| dedicated-behind | 6 (typedRow) | posted 6/6 (route 3) | kept/noHit 6/6 | **the page under the popup** 6/6, the same as shared-front; TextEdit stayed frontmost |
| shared-behind-primed | 0 of 12 | none | none | Chrome closes the popup when the cover is raised, so this setup cannot hold it |

The refusal sentence, verbatim, in all 7 cases:
`Google Chrome's web page does not accept a background click; use a dedicated desktop, or ask the person to bring Google Chrome forward`

### Clicks outside the popup (the Beta button)

| cell | popup up at the re-observation | answer | stalePoint | where it went |
|---|---|---|---|---|
| shared-behind (outsideTyped, run 2) | 6/6 | posted 6/6 | kept/nonInteractiveHit 6/6 | Beta 6/6 (click without focusin); the popup stayed up |
| shared-front (outsideTyped, run 2) | 6/6 | posted 6/6 | kept/nonInteractiveHit 6/6 | Beta 6/6; the popup dismissed |
| dedicated-behind (outsideTyped, run 2) | 6/6 | posted 6/6 | kept/nonInteractiveHit 6/6 | Beta 6/6; the popup dismissed |
| all four cells (outside, ⌘L alone, run 1) | 0/24 | posted 24/24 | kept/nonInteractiveHit 24/24 | Beta 24/24 |

### The popup's window

- **The CG window list:** a layer-0 window of Chrome's directly above the browser window, which holds the click
  point (`holdsPoint` true, 19/19 rows). It was window 49 in run 1 and window 30 in run 2; the browser window was 28.
  - With a typed URL: bounds (499, 56, 458×218).
  - With zero-suggest: bounds (499, 56, 458×178).
  - Its top 60 pt cover the omnibox itself.
- **Accessibility:** its own AXWindow, subrole AXUnknown. The window holds a WebUI page: an AXWebArea at (515, 116), with
  an AXList of rows (AXStaticText, 40 pt high). The row clicked was (515, 116, 426×40), at point (728, 136). The
  application's hit-test there answers inside the popup's AXWindow, so `windowHit` turns it into nil (noHit).
- **What the model sees:** the engine's screenshot shows the popup over the page, with both rows drawn. The
  observation's tree holds none of the popup's rows (0/19), only the main window's toolbar nodes under its bounds.
- **⌘L alone** left a popup at the re-observation in only 1 of 48 rows, so the typed sequence carries the measurement.

### Reading

- **The ticket's case reproduces, 7 of 7.** In shared mode, with Chrome behind, the click is kept as noHit and then
  refused. The refusal blames the page, not the popup window over it.
- **The controls refute the finding's expectation that "the click is posted and goes to the popup".** The engine stamps
  its pointer events with the observed window's id and window-local point (`stampWindow`, Mouse.swift, fields 91/92).
  Chrome therefore delivers them to the browser window under the popup. On this fixture that is a blank div. On a real
  page it is whatever element lies under the suggestion row. Either way the click dismisses the popup, and the
  suggestion is never taken.
- **An outside click with the popup up behaves as today** in every cell.

## #452's qualification: a click on the app's own window over the observed one, main against the fix

`qualify.mjs` (workflow input `kit=qualify`; `fix=<sha>` builds a second head and interleaves it with `engine`, per unit,
alternating the order by rep). Each row: a re-set, one observation, the overlay opened kit-side the same way in every
mode (keys through the engine, an AX press, a kit hover, an AX menu press), a re-observation whose screenshot holds it,
then one coordinate click on an item of the overlay (inside) or on a control of the observed window outside the overlay
(outside). Modes: shared-behind (a Finder window frontmost as the cover), shared-front, dedicated-behind. Reader:
`qsummary.mjs`. 5 rows per head, cell, mode and side.

Heads: main 0469183929cf46bd224870234fcc2340f33061d0, fix 5f85ffcc077a746698ed8c65b4f16663b1d26e02 (fix/452-same-app-overlay).
Runs: smoke on main alone https://github.com/SSFSKIM/cua/actions/runs/44802527126 (kit ff53c85e, 36 rows); batch 1
https://github.com/SSFSKIM/cua/actions/runs/44805302760 (kit 74914833, 300 rows: status bubble, hover card, and the
first two-window and sheet setups, which did not hold); batch 2 https://github.com/SSFSKIM/cua/actions/runs/44816112944
(kit d929148b, 180 rows: two windows, sheet); batch 3 https://github.com/SSFSKIM/cua/actions/runs/44822312301 (kit
d929148b, 360 rows: omnibox, select, datalist, permission, TextEdit menu, TextEdit popover). Chrome 157.0.8103.79
(batch 2: 156.0.8078.80), macOS 26.7.2. Artifacts in `~/.local/share/probe-337/run-<id>/` on the MacBook.

### The overlays (window facts at the re-observation)

| cell | overlay window | how it opens on hosted |
|---|---|---|
| omnibox | Chrome, layer 0, (499,56,458×218) | ⌘L and a typed URL, every mode |
| select | Chrome's native menu, layer 101, (404,154,77×82) | AXPress on the `<select>`, every mode |
| datalist | Chrome, **layer 999**, (467,220,164×166) | focus the `<input list>` and type; shows only with Chrome frontmost (in none of the 40 behind or dedicated rows) |
| permission (geolocation) | Chrome, layer 0, (521,111,320×266) | a fresh origin per row; shows in 2-3 of 5 rows; with Chrome frontmost the bubble is the app's focused window, so get_app_state observes the bubble itself |
| TextEdit menu (font popup) | TextEdit, layer 101, (535,44,159×660) | AXPress on the format bar's popup, every mode |
| TextEdit popover (text colour well) | TextEdit, layer 0, (393,91,225×246); in AX an AXPopover inside the document's window, so its swatches are in the observed tree | AXPress on the colour well, every mode |
| status bubble | Chrome, layer 0, (399,689,206×22), click-through | kit hover on a link; shows only with Chrome frontmost |
| tab hover card | Chrome, layer 0, (508,66,270×122), click-through | kit hover on the tab; shows only with Chrome frontmost |
| two windows (Chrome, TextEdit) | the app's second window, layer 0 | writing the app's AXFocusedWindow to a back window changes nothing in either app, so a back window is only observed through a stale screenshot: the first window observed while front, then the second raised over it |
| Save panel (TextEdit) | the panel is the app's focused window on macOS 26, so get_app_state observes the panel itself | AX File > Save… on an untitled document; opens only with TextEdit frontmost |

Omnibox rows where the popup's window was on screen at alpha 0 (8 of 60; the screenshot shows no popup, so the kit's
point lay on the page the screenshot showed) are left out below; there main and fix both posted to the page, which is
what the screenshot showed.

### Main against fix, per cell (inside: the click on the overlay's item; outside: a control of the observed window)

| cell | mode | inside, main | inside, fix | outside, main / fix |
|---|---|---|---|---|
| omnibox | shared-behind | refused `backgroundClickRefused` 5/5 | refused `appWindowOverPoint` 5/5 | landed 4/4 / 5/5 |
| omnibox | shared-front | posted, **landed on the page beneath** 5/5, popup dismissed | refused 3/3 | landed 5/5 / 5/5 |
| omnibox | dedicated-behind | posted, page beneath 4/4 | refused 2/2 | landed 4/4 / 5/5 |
| select (menu, L101) | all three | posted, menu dismissed, option not taken 15/15 | the same 15/15 (L101 left as main) | the click only dismisses the menu 15/15 / 15/15 |
| datalist (L999) | shared-front | posted, **page beneath** 5/5 | **the same: posted, page beneath 5/5** (L999 is not the observed window's layer) | landed 5/5 / 5/5 |
| permission | shared-behind | refused `backgroundClickRefused` 3/3 | refused `appWindowOverPoint` 2/2 | landed 3/3 / 1/1 |
| permission | dedicated-behind | posted, page beneath 2/2 | refused 1/1 | landed 2/2 / 2/2 |
| permission | shared-front | the bubble is the observed window: Never allow taken 1/1 | no prompt in its 5 rows | n/a |
| TextEdit menu (L101) | all three | posted, menu dismissed, item not taken 15/15 | the same 15/15 | the click only dismisses the menu 15/15 / 15/15 |
| TextEdit popover | all three | posted, **landed in the text beneath** (caret moved) 15/15 | refused `appWindowOverPoint` 15/15 | landed 15/15 / 15/15 |
| status bubble | shared-front | **landed on the control under the bubble 5/5** | **refused `appWindowOverPoint` 5/5** | landed 5/5 / 5/5 |
| tab hover card | shared-front | **landed on the control under the card 5/5** | **refused `appWindowOverPoint` 5/5** | landed 5/5 / 5/5 |
| two windows, Chrome | all three | refused `noScreenshotForCoordinates` 15/15, nothing posted | the same 15/15 | the same 15/15 / 15/15 |
| two windows, TextEdit | all three | refused `noScreenshotForCoordinates` 15/15 | the same 15/15 | the same 15/15 / 15/15 |
| Save panel (observed itself) | shared-front | posted (kept/noHit: the hit is the out-of-process panel's), Cancel not taken, the panel stayed 5/5 | the same 5/5 | n/a |

The fix's sentence (Chrome; TextEdit's names TextEdit):
`Google Chrome has a window of its own over the one the screenshot showed at this point (a suggestion list, popup or panel), and a click here would reach the window under it, not what the screenshot shows. Nothing was sent. Use keys instead (the arrow keys and Return for a suggestion list, Escape to close it), or call getScreenshot for a new screenshot and click an element its tree holds.`

### Reading

- Main reaches an overlay's own item in no cell: a posted click on an overlay at layer 0 lands in the observed window
  beneath (omnibox, permission, popover), and one on a layer-101 menu only dismisses it.
- The fix's regressions are the click-through windows: the status bubble and the tab hover card. Main lands those clicks
  on the observed window's control, as the screenshot shows; the fix refuses 10/10. In both cases the application's AX
  hit-test at the point answers the observed window (main's verdict `nonInteractiveHit`, no `hitWindow` on the fix),
  while on every real overlay it answers the overlay (`hitWindow` = the overlay's number on omnibox, datalist and
  permission). That is the carve-out signal the data offers. The popover is the exception: its AX hit lies inside an
  AXPopover in the document's own AX tree (verdict `sameElement`), and the CG rule is what refuses it.
- The fix leaves one misdelivery: Chrome's datalist (autofill-style) popup sits at layer 999, so the same-layer rule
  skips it and the click still lands on the page beneath, 5/5.
- Two windows of one app: a back window is never the observed one. Once the other window is raised, the app's focused
  window changes and both heads refuse `noScreenshotForCoordinates` before any overlay rule, so no regression here.

### Requalification of the reworked rule, fix-only against the same main data (`compare.mjs`)

The rule as reworked refuses `appWindowOverPoint` in two cases; otherwise main's verdict stands:
- `by: "axHit"`: the app's AX hit at the point is in another window of the app.
- `by: "popover"`: the hit lies under an AXPopover in the observed window, and a same-app, same-layer window with alpha
  above 0 is over the point.

The new `stalePoint.hitMs` records the hit-test's duration. Both runs below used kit dec29b1b, 330 rows each,
`label=fix2` and `label=fix3`:
- fix2, 023a3beecd22b659eb2b64bfbaa5979789486ba9: https://github.com/SSFSKIM/cua/actions/runs/44831489386 (Chrome
  156.0.8078.80, image 20261102.0473.1).
- fix3, bbe42e2c9c0a06d26e4754295379a81c36529a4f, the final head: https://github.com/SSFSKIM/cua/actions/runs/44837693749
  (Chrome 157.0.8103.79, image 20261117.0516.1, the same as main's batch 3).

bbe42e2c adds three things over 023a3bee:
- An axHit refusal needs the hit's window listed on screen with alpha above 0, holding the point, and in front of the
  observed window.
- A hit under an observed AXSheet counts as in the observed window.
- `hitMs` is carried on the element route.

| cell (where the overlay shows) | main | fix2 (023a3bee) | fix3 (bbe42e2c) |
|---|---|---|---|
| omnibox, shared-behind, inside | refused `backgroundClickRefused` 5/5 | refused `appWindowOverPoint` by axHit 5/5 | refused by axHit 5/5 |
| omnibox, shared-front / dedicated, inside | page beneath 5/5, 4/4 | refused by axHit 5/5, 5/5 | refused by axHit 4/4, 5/5 |
| datalist (L999), shared-front, inside | page beneath 5/5 | refused by axHit 5/5 | refused by axHit 5/5 |
| permission, shared-behind, inside | refused `backgroundClickRefused` 3/3 | refused by axHit 4/4 | refused by axHit 1/1 |
| permission, shared-front (the bubble observed itself) | Never allow taken 1/1 | taken 2/2 | taken 4/4 |
| TextEdit popover, all modes, inside | text beneath 15/15 | refused by popover 15/15 | refused by popover 15/15 |
| select menu and TextEdit menu (L101), all modes | posted, item not taken 30/30 | the same 30/30 | the same 30/30 |
| status bubble, shared-front, inside | landed under it 5/5 | **landed 5/5** | **landed 5/5** |
| tab hover card, shared-front, inside | landed under it 5/5 | **landed 5/5** | **landed 5/5** |
| two windows, Chrome and TextEdit, all modes | refused `noScreenshotForCoordinates` 60/60 | the same 60/60 | the same 60/60 |
| Save panel (observed itself), shared-front, inside | posted, Cancel not taken 5/5 | **refused by axHit 5/5** (the hit's AXSheet reads as the document's window) | posted, Cancel not taken 5/5, as main |
| every outside click | landed (menus: dismissed) | the same | the same |

Notes:
- Omnibox rows whose popup window was at alpha 0 are left out. On fix3 the one such inside row posted to the page, as
  main does, which matches the screenshot.
- Permission prompts show in 1 to 4 of 5 rows. Datalist, status bubble and hover card show only with Chrome frontmost.

The sentence (Chrome; TextEdit's names TextEdit), unchanged from 5f85ffcc:
`Google Chrome has a window of its own over the one the screenshot showed at this point (a suggestion list, popup or panel), and a click here would reach the window under it, not what the screenshot shows. Nothing was sent. Use keys instead (the arrow keys and Return for a suggestion list, Escape to close it), or call getScreenshot for a new screenshot and click an element its tree holds.`

Timing, per lane, over every click that carried a stalePoint (ms):

| lane | head | clicks | stalePoint.ms p50 | p95 | hitMs p50 | p95 | hitMs present |
|---|---|---|---|---|---|---|---|
| chrome | main 04691839 | 98 | 1.67 | 7.91 | - | - | 0/98 |
| chrome | fix2 023a3bee | 101 | 1.11 | 4.38 | 1.62 | 5.89 | 93/101 (not on the 8 background element-route clicks) |
| chrome | fix3 bbe42e2c | 96 | 1.72 | 5.22 | 2.53 | 4.93 | 96/96 |
| textedit | main 04691839 | 65 | 1.25 | 3.33 | - | - | 0/65 |
| textedit | fix2 023a3bee | 65 | 0.89 | 2.51 | 0.74 | 1.37 | 65/65 |
| textedit | fix3 bbe42e2c | 65 | 1.00 | 2.07 | 0.81 | 1.89 | 65/65 |

fix2 ran on another runner image and Chrome than main. fix3 ran on main's image and Chrome. On Chrome, fix3's `hitMs` p50 is above its
`stalePoint.ms` p50, so the hit-test's time is not inside `stalePoint.ms`; read the two as adding.

## #454: a click on an open pop-up menu's item

Kit `scripts/probe-454/` (`menus.mjs`, `tool.swift`: #337's tool plus `menuinfo` and `post`; reader `summary.mjs`),
workflow `.github/workflows/probe-454.yml`, dispatched with an exact engine SHA built unmodified. The page, the re-sets,
the Finder cover and the TextEdit handling are #452's qualification's. Each row: a re-set, one observation, the menu
opened kit-side by AXPress on its pop-up button, a re-observation whose screenshot holds it, the menu's facts (its CG
window, the observation's nodes in it, the item's AX chain and actions), then one route on the same item:

- `coord`: the engine's coordinate click on the item, in the re-observation's pixels (today's case).
- `element`: the engine's element click on the item's node of the re-observation, when the observation lists it.
- `keys`: the engine's `press_key` Down until the item reads highlighted (AXSelected), then Return.
- `outside`: the engine's coordinate click on the observed window outside the menu.
- `button`: no menu opened; the engine's coordinate click on the closed pop-up button.
- `kit:observed`, `kit:menu`, `kit:none`, `kit:hid`: the kit's own click, not the engine's: the engine's events rebuilt
  (`Mouse.swift`) and posted to the app stamped to the observed window, to the menu's window, to no window, or a HID-tap
  click (a person's). `kit:warp-observed` and `kit:warp-menu` move the cursor to the point first; `kit:move-menu` and
  `kit:move-hid` post a mouse-moved 200 ms before the down; `kit:warpmove-menu` does both. Shared modes only.

Menus: `select` (Chrome's `<select>` native menu), `font` (TextEdit's format-bar font pop-up), `typeface` (TextEdit's
typeface pop-up), `language` (Script Editor's document language pop-up). Modes: shared-behind, shared-front,
dedicated-behind.

Readers: `summary.mjs` (per cell, the menu's facts, representative meta) and `pivot.mjs` (where each route went, one
column per mode).

### Results, engine fdd285ddf376e4f3841b5c91f9d5255b6d9cf514 (main)

Full run: https://github.com/SSFSKIM/cua/actions/runs/44848863214 (kit 3f5bb82a; Google Chrome 157.0.8103.79, macOS
26.7.2, image 20261117.0516.1; 495 rows, 5 per cell, no setup failures). Smokes, 1 row per cell, the same answers:
https://github.com/SSFSKIM/cua/actions/runs/44845897832 (kit 6e275a2e, 92 rows, all four menus; Chrome 156, image
20261102.0473.1; `typeface` matched `font` cell for cell, so it was left out of the full run) and
https://github.com/SSFSKIM/cua/actions/runs/44847726632 (kit 1c93a36b, 57 rows, keys and kit posts). Artifacts in
`~/.local/share/probe-454/run-<id>/` on the MacBook.

The menus at the re-observation (150/150 rows each): Chrome's `<select>` menu, layer 101, (404,154,77×82); TextEdit's
font menu, layer 101, (535,44,159×660); Script Editor's language menu, layer 101, (388,85,97×54). Each is a window of the
app's own, above the observed window, holding the click point.

| menu | route | shared-behind | shared-front | dedicated-behind |
|---|---|---|---|---|
| all three | `coord` (today) | ok, item not taken, menu closed 15/15 | the same 15/15 | the same 15/15 |
| all three | `element` (AXPick) | taken 15/15 | taken 15/15 | taken 15/15 |
| all three | `keys` (Down…, Return) | taken 15/15 | taken 15/15 | taken 15/15 |
| all three | `outside` | menu closed, the control not reached 15/15 | the same 15/15 | the same 15/15 |
| select | `button` (closed) | menu opened 5/5 (#282's element route, AXPress) | opened 5/5 | ok, the page's `<select>` got mousedown/focusin/click, no menu 5/5 |
| font, language | `button` (closed) | ok, **nothing opened** 10/10 | opened 10/10 | ok, **nothing opened** 10/10 |
| all three | `kit:observed` (the engine's events, rebuilt) | menu closed, not taken 15/15 | the same 15/15 | - |
| all three | `kit:menu` (stamped to the menu's window) | menu closed, not taken 15/15 | the same 15/15 | - |
| all three | `kit:none` (no window stamped) | menu closed, not taken 15/15 | the same 15/15 | - |
| all three | `kit:warp-observed` | menu closed, not taken 15/15 | the same 15/15 | - |
| select, font | `kit:warp-menu` | menu stays up, nothing taken 10/10 | the same 10/10 | - |
| language | `kit:warp-menu` | closed 4, up 1 | closed 5 | - |
| all three | `kit:move-menu` (mouse-moved first, cursor elsewhere) | menu closed, not taken 15/15 | the same 15/15 | - |
| font, language | `kit:warpmove-menu` (cursor at the point, mouse-moved, stamped to the menu) | **taken 10/10** | **taken 10/10** | - |
| select | `kit:warpmove-menu` | not taken, the page's `<select>` got a click 5/5 | the same 4/5, taken 1/5 | - |
| select, font | `kit:hid` (HID down and up, no move) | menu stays up 10/10 | the same 10/10 | - |
| language | `kit:hid` | closed 4, up 1 | closed 5 | - |
| all three | `kit:move-hid` (HID, mouse-moved first) | **taken 15/15** | **taken 15/15** | - |

The engine's answers: `coord` posted by route 3 (`activationJoin: "fresh"`, `error: null`) 45/45, stale point kept
(`<select>` `noHit` 15, the AppKit menus `sameElement` 30), stamped to the observed window (its frame in
`coordinateClick.windowFrame`; the stamp is the primary window's number, Input.swift `click.windowNumber`); `element`
route 1 `elementClick {plan: action, reason: advertised, action: AXPick, hit: element}` 45/45; `keys` route 2′ 45/45,
`keyEffect: unconfirmed`, the highlight read Down by Down reached the item every time (`<select>` One, Two, Three;
TextEdit Helvetica, Times; Script Editor AppleScript, JavaScript). No refusal in 495 rows.

A representative `coord` reply (TextEdit, shared-front), verbatim:
`{"receivedAt":…,"startedAt":…,"endedAt":…,"inputRoute":3,"activationJoin":"fresh","hidIdleMs":null,"stalePoint":{"verdict":"kept","reason":"sameElement","recordedRole":"AXMenuItem","hitRole":"AXMenuItem","identity":"handle","ms":0.72,"windowsMs":0.43,"hitMs":0.508},"coordinateClick":{"screenshotPoint":{"x":215,"y":73},"windowPoint":{"x":215,"y":73},"postedLocation":{"x":615,"y":104},"postedWindowLocation":{"x":215,"y":73},"windowFrame":{"x":400,"y":31,"width":620,"height":679},"frameBeforePost":{"x":400,"y":31,"width":620,"height":679}}}`
(`<select>`: `"stalePoint":{"verdict":"kept","reason":"noHit","recordedRole":"AXGroup","underlyingRole":"AXMenuItem",…}`).

The item in the trees:
- **The observation lists the item in every row**, as an AXMenuItem with actions `AXCancel, AXPress, AXPick` and a token:
  TextEdit at depth 3 under AXMenu < AXPopUpButton < the document window; Script Editor at depth 4 under AXMenu <
  AXPopUpButton < AXGroup < window; Chrome at depth 9 under an AXMenu the walk hangs below the window's groups.
- **The app's AX tree:** TextEdit's and Script Editor's menus are children of their pop-up button, inside the document
  window. Chrome's real menu (404,154,77×82) is an AXMenu with no parent chain to a window (an app-level menu); Chrome
  also keeps an untitled 57×10 AXMenu under the page's AXPopUpButton.
- **The application's hit-test** at the click point answers the AXMenuItem in every row; for the `<select>` the engine's
  `windowHit` turns it into `noHit`, because the item's chain reaches no window.

### Reading

- **Why today's click is not taken.** The engine's events reach the app (the menu closes in 45/45), but the menu treats
  them as a click outside it. Stamping the menu's own window instead changes nothing (0/30), nor does stamping no window
  (0/30). Only events that come with the real cursor on the item and a mouse-moved before the down take it: posted to
  the app and stamped to the menu, AppKit's menus take it 20/20; at the HID tap, all three take it 30/30. A HID down and
  up with no move before them leaves the menu up. So menu tracking reads the cursor's real position and needs a move to
  highlight the item; the window stamp alone cannot carry it. Chrome's `<select>` menu does not take even the stamped,
  warped and moved post (1/10).
- **Re-aiming (#453) does not deliver a menu click** without moving the person's cursor. The engine has no input that
  posts to another window or moves the real cursor: every pointer event is stamped with the app's primary window
  (`coordinatePlacement` → `primaryWindow`, ElementInput.swift; `stampWindow`, Mouse.swift), and `spikeRoute` and the
  route-4 override change the route, not the stamp.
- **Both ways through work in every mode and menu:** the element click on the observation's AXMenuItem (AXPick, 45/45)
  and keys (Down to the item, Return, 45/45). The observation always holds the item, so a refusal can name either.
- **Outside clicks** only close the menu, in every mode; the control under them is not reached (45/45).
- **A second false ok, found here:** a coordinate click on a *closed* AppKit pop-up button in a background app (TextEdit,
  Script Editor; shared-behind and dedicated-behind) answers ok and opens nothing, 20/20; with the app frontmost it opens
  the menu, 10/10. Chrome's `<select>` opens in shared mode (through #282's element route) and in dedicated mode answers
  ok with the page's click events and no menu, 5/5.

## #454's qualification: main fdd285dd against the fix c83ed846

The same kit, with these cells added: `tectx` (TextEdit's context menu on a selected word; Copy is taken when the
pasteboard holds the word), `chromectx` (Chrome's page context menu; Reload is taken when the page loads again),
`menubar` (TextEdit's Edit menu from the menu bar, window at x 60; Select All is taken when the selection is the whole
text), `submenu` (Format > Font, then Show Colors; taken when the colour panel's window shows), and `*-same` (each
pop-up's already-selected item). Each cell gets an inside click on the item (`coord`) and an outside click (`outside`),
5 rows per mode. The engines were built unmodified.

Runs. Main fdd285ddf376e4f3841b5c91f9d5255b6d9cf514: pop-ups 44848863214 (above); new cells
https://github.com/SSFSKIM/cua/actions/runs/44856543463 (kit 24bf3b88, 240 rows; its Chrome context menu behind is left
out, because the kit's HID right click tripped the engine's 5 s intervention debounce); `*-same` and Chrome's context
menu https://github.com/SSFSKIM/cua/actions/runs/44863373571 (kit 55fcdcea, 120 rows). Fix
c83ed8467f5e06f53632c2f8e59932a00bbaac68: https://github.com/SSFSKIM/cua/actions/runs/44860009214 (kit 96261a16, 300
rows; its Chrome context menu behind has the same setup artifact, so it is re-run on kit 55fcdcea in
https://github.com/SSFSKIM/cua/actions/runs/44864909827, 30 rows: refused `screenChangedSinceScreenshot` 15/15, outside
closes the menu 15/15). All runs used Chrome 157.0.8103.79, macOS 26.7.2 and image
20261117.0516.1.

| cell (inside click), all three modes | main | fix |
|---|---|---|
| select (`<select>`, Three) | ok, not taken, menu closed 15/15 | `clickUnconfirmed`, route 1 AXPick, `menuClosed`, `value: "unread"`; **taken** 15/15 |
| font (TextEdit pop-up) | ok, not taken 15/15 | ok, `effect: "confirmed"`, **taken** 15/15 |
| language (Script Editor pop-up) | ok, not taken 15/15 | ok, confirmed, **taken** 15/15 |
| select-same (One, already selected) | ok, menu closed 15/15 | refused `appWindowOverPoint`, `refused: notRecorded`, nothing sent, menu stays up 15/15 |
| font-same, language-same | ok, menu closed 30/30 | `clickUnconfirmed`, `value: "unchanged"`, menu closed, selection unchanged 30/30 |
| tectx (Copy) | ok, not taken 15/15 | `clickUnconfirmed`, AXPick, **taken** (the pasteboard holds the word) 15/15 |
| chromectx (Reload), shared-front and dedicated | refused `screenChangedSinceScreenshot` (`otherWebArea`) 10/10 | the same 10/10 (items in an AXWebArea stay on main's path) |
| chromectx, shared-behind | refused `screenChangedSinceScreenshot` 5/5 | the same 5/5 (run 44864909827) |
| menubar (Edit > Select All) | ok, not taken (kept/noHit) 15/15 | refused `appWindowOverPoint`, `notRecorded`, nothing sent, menu stays up 15/15 |
| submenu (Format > Font > Show Colors) | ok, not taken (kept/noHit) 15/15 | refused `appWindowOverPoint`, `notRecorded` 15/15 |
| every outside click | closes the menu, the control not reached | the same, in every cell and mode |

Facts per cell (both heads):
- **Menu windows:** every menu is a layer-101 window of the app's own. Chrome's context menu is at (701,275,284×401).
  TextEdit's context menu is at (686,185,225×519). The Edit menu is at (155,31,265×534). The submenu is at
  (435,31,214×438), over Format at (199,31,241×248).
- **Observation:** it lists the item with `AXCancel, AXPress, AXPick` and a token for every pop-up and both context menus.
  It lists **no** item of the menu-bar menu or its submenu (`menuBar` holds 8 nodes and no AXMenuItem).
- **Screenshot:** the engine's screenshot shows pop-up and context menus, but not the menu-bar menu or its submenu. At the
  kit's point it shows document text.
- **Hit-test:** the application's hit-test at the item answers the AXMenuItem in every row.
- **Ways through on main:** keys take the item in every context-menu row, but in the menu-bar and submenu rows only with
  TextEdit frontmost. Behind, the menu stays up, 20/20. The element click takes context-menu items 25/25 (Chrome behind
  excluded by the setup artifact).

Refusal sentence (fix, menubar, submenu and select-same):
`TextEdit has a menu open at this point, which a click takes only as its item's own action, but the item there is not the one the screenshot showed at this point. Nothing was sent. Use keys instead (the arrow keys to the item, then Return; Escape closes the menu), or call getAXState() and click the menu item it lists, by its element.`
Unconfirmed sentence:
`The click could not be confirmed: it was carried by the menu item's AXPick action in Google Chrome, since a pointer click does not take a menu's item, and the menu closed, but nothing cua can read shows the item taken. Observe the app with get_app_state before any retry, and never retry blindly.`

Timing (ms; coord clicks, 15 per cell; main / fix):

| cell | stalePoint.ms p50/p95 | hitMs p50/p95 | fix menuItemClick.ms p50/p95 |
|---|---|---|---|
| select | 1.33/3.33 / 0.96/4.10 | 0.60/3.87 / 0.46/1.40 | 1022.7/1064.1 (unconfirmed, polls to 1 s) |
| font | 0.72/1.03 / 0.81/1.71 | 0.47/1.54 / 0.55/1.09 | 415.0/470.9 (confirmed) |
| language | 0.83/2.07 / 0.76/1.56 | 0.54/1.44 / 0.54/1.34 | 409.9/470.3 (confirmed) |
| tectx | 0.81/1.87 / 0.72/2.25 | 0.59/1.31 / 0.52/1.52 | 1027.5/1072.4 (unconfirmed) |
| font-same / language-same | 0.93/1.82, 1.10/1.99 / 0.67/1.76, 0.78/1.41 | - | 1034.1/1071.2, 1025.7/1063.7 (unconfirmed) |
| menubar / submenu | 0.66/1.69, 0.56/2.42 / 0.55/0.85, 0.68/2.21 | 0.59/1.76, 0.73/1.71 / 0.59/0.94, 0.79/1.56 | - (refused) |

### Reading

- **The fix delivers and confirms the AppKit pop-ups,** 30/30.
- **Chrome's `<select>` is delivered (15/15) but answers `clickUnconfirmed`** with `value: "unread"`. The builder
  expected a confirmation there.
- **An already-selected item:**
  - In AppKit it answers unconfirmed (`unchanged`), as ruled.
  - Chrome's `select-same` is refused `notRecorded`. Its sentence says the item differs from the screenshot, but the
    screenshot shows the menu's own One item there, so the reason it names is not the one that applies.
- **Context menus** are delivered and unconfirmed (TextEdit, 15/15). Chrome's page context menu keeps main's refusal
  (`otherWebArea`), because its items hang under the web area.
- **Menu-bar menus** are refused, as expected: the screenshot does not show them and the observation does not list them.
  The submenu is refused as well, where the builder expected a delivery.
- **Ordinary outside clicks are unchanged.**

### The confirm on 74c99b92a7668c1915b917138c61aa95a68ec771, fix-only, against the same main data

https://github.com/SSFSKIM/cua/actions/runs/44866341695 (kit 735d8727, 300 rows). Reader: `effects.mjs`, which gives the
answer per coordinate click, `menuItemClick`'s effect/value/refused, whether the item was taken, and whether the menu
stayed up.

| cell (inside), all modes | main | 74c99b92 |
|---|---|---|
| select | ok, not taken 15/15 | `clickUnconfirmed` [`unread`], **taken** 15/15 |
| select-same | ok, menu closed 15/15 | `clickUnconfirmed` [`unread`], menu closed, nothing changed 15/15 (now delivered, no longer refused `notRecorded`) |
| font, language | ok, not taken 30/30 | ok, `confirmed`/`taken`, taken 30/30 |
| font-same, language-same | ok, menu closed 30/30 | `clickUnconfirmed` [`unchanged`] 30/30 |
| tectx | ok, not taken 15/15 | `clickUnconfirmed` [`unread`], taken 15/15 |
| chromectx | refused `screenChangedSinceScreenshot` 15/15 | the same 15/15 |
| menubar, submenu | ok, not taken 30/30 | refused `appWindowOverPoint` `refused: unobserved`, nothing sent, menu up 30/30 |
| outside, every cell | closes the menu | the same (one language-front row had a setup miss: opener not found) |

The `unobserved` sentence (menubar, submenu):
`TextEdit has a menu open at this point that the screenshot does not show (a menu-bar menu, a submenu, or a menu opened since the screenshot), so the click cannot be checked against it. Nothing was sent. A click outside the menu closes it. To choose one of its items, call getAXState() and click the item it lists by its element; a menu-bar menu's items are listed once its title in the menu bar has been clicked by its element.`

`menuItemClick.ms` p50/p95: confirmed 421/471 (font) and 406/464 (language); unconfirmed 1019–1040/1064–1073.
`stalePoint.ms` p50 0.5–1.0, p95 0.8–4.6; `hitMs` p50 0.3–0.7, p95 0.6–1.5 on coordinate clicks.

### The confirm on cf9162490b14ecfeb4a50ba4241afbcc526b4e45 (the PR head), fix-only, against the same main data

https://github.com/SSFSKIM/cua/actions/runs/44869514420 (kit e78f90e5, 300 rows, no setup failures). This run landed on
another runner image than main's: Google Chrome 156.0.8078.80, image 20261102.0473.1 (main: Chrome 157,
image 20261117.0516.1).

| cell (inside), all three modes | main fdd285dd | cf916249 |
|---|---|---|
| select (Three) | ok, not taken, menu closed 15/15 | `clickUnconfirmed`, route 1 AXPick, `value: "unread"`; **taken** 15/15 |
| select-same (One) | ok, menu closed 15/15 | `clickUnconfirmed` [`unread`], menu closed, nothing changed 15/15 |
| font (TextEdit pop-up) | ok, not taken 15/15 | ok, `effect: "confirmed"`, `value: "taken"`; **taken** 15/15 |
| language (Script Editor pop-up) | ok, not taken 15/15 | ok, confirmed; **taken** 15/15 |
| font-same, language-same | ok, menu closed 30/30 | `clickUnconfirmed` [`unchanged`], selection unchanged 30/30 |
| tectx (Copy) | ok, not taken 15/15 | `clickUnconfirmed` [`unread`]; **taken** 15/15 |
| chromectx (Reload) | refused `screenChangedSinceScreenshot` (`otherWebArea`) 15/15 | the same 15/15 |
| menubar, submenu | ok, not taken (kept/noHit) 30/30 | refused `appWindowOverPoint` `refused: unobserved`, nothing sent, menu up 30/30 |
| outside, every cell (150 rows a head) | closes the menu, nothing under it reached | the same 150/150 |

Sentences on cf916249:
- `unobserved` (menubar, submenu): `TextEdit has a menu open at this point, and the accessibility record of the screenshot holds no item of it at this point (a menu-bar menu, a submenu, or a menu opened since the screenshot), so the click cannot be checked against what the screenshot showed. Nothing was sent. A click outside the menu closes it. If a fresh getAXState() lists the item (a menu-bar menu's items are listed once its title in the menu bar has been clicked by its element), click the item by its element.`
- `clickUnconfirmed` (select, select-same, tectx, font-same, language-same; the app's name varies): `The click could not be confirmed: it was carried by the menu item's AXPick action in Google Chrome, since a pointer click does not take a menu's item, and the menu closed, but nothing cua can read shows the item taken. Observe the app with get_app_state before any retry, and never retry blindly.`
- chromectx keeps main's `screenChangedSinceScreenshot` sentence.

Timing, coordinate clicks, 15 per cell (ms, p50/p95):

| cell | main stalePoint.ms | cf916249 stalePoint.ms | main hitMs | cf916249 hitMs | cf916249 menuItemClick.ms |
|---|---|---|---|---|---|
| select | 1.33/3.33 | 1.17/13.95 | 0.60/3.87 | 0.48/3.80 | 1024.9/1060.5 (unconfirmed) |
| select-same | 0.86/1.25 | 1.21/1.80 | 0.44/1.18 | 0.74/1.62 | 1032.0/1052.9 (unconfirmed) |
| font | 0.72/1.03 | 1.16/3.55 | 0.47/1.54 | 0.69/1.30 | 430.5/485.5 (confirmed) |
| language | 0.83/2.07 | 0.77/2.09 | 0.54/1.44 | 0.53/1.89 | 412.6/487.7 (confirmed) |
| font-same | 0.93/1.82 | 0.96/2.51 | 0.53/1.87 | 0.60/1.73 | 1024.7/1050.9 (unconfirmed) |
| language-same | 1.10/1.99 | 0.85/1.92 | 0.86/1.36 | 0.57/1.30 | 1031.3/1068.7 (unconfirmed) |
| tectx | 0.81/1.87 | 0.90/6.41 | 0.59/1.31 | 0.65/1.71 | 1017.3/1068.0 (unconfirmed) |
| chromectx | 1.80/4.54 | 1.86/3.51 | 1.32/3.66 | 1.38/2.98 | - (main's refusal) |
| menubar | 0.66/1.69 | 0.74/1.79 | 0.59/1.76 | 0.61/1.30 | - (refused) |
| submenu | 0.56/2.42 | 0.71/1.49 | 0.73/1.71 | 0.99/1.73 | - (refused) |

Reading:
- **No cell answers a false ok any more.** Each one either takes the item or answers honestly:
  - confirmed and taken: the AppKit pop-ups, 30/30;
  - unconfirmed and taken: Chrome's `<select>` and TextEdit's context menu, 30/30;
  - unconfirmed with nothing changed: the already-selected items, 45/45;
  - refused with nothing sent: the menu-bar menu and submenu, 30/30, and Chrome's context menu, 15/15.
- **Chrome's `<select>` still does not confirm** `Three`: the value reads `unread` 15/15.
- **The unconfirmed answers cost about 1 s each.** `menuItemClick.ms` p50 is about 1020–1030 ms against about 410–430 ms
  when confirmed. `stalePoint.ms` and `hitMs` stay where main's are, apart from single p95 outliers (select 13.95 ms,
  tectx 6.41 ms).


## #458: a click on a closed pop-up button of a background app

Kit `scripts/probe-458/` (`closed.mjs`; `tool.swift`, #454's tool plus `state` and `watch`; readers `summary.mjs` and
`pivot.mjs`), workflow `.github/workflows/probe-458.yml`, dispatched with an exact engine SHA built unmodified. The page,
the re-sets and the Finder cover (0, 40, 380×300, beside the app's window at x 400, not over it) are #454's. Each row: a
re-set with the menu closed, one observation, the pop-up button's node in it, then one route on the closed button, read
at 300 ms and 1.8 s (the app's new windows, a menu's at layer 101; AXExpanded; the AX menus; the focus; the frontmost app;
the window order). A second tool samples the window list every 10 ms through the action (`watch`), so a menu that opens
and closes at once shows. After anything opened, the engine's Escape, then the window order again.

Routes: `button` (the engine's coordinate click on the button, today's case); `button-2p` (the same click forced to
route 2′ with `spikeRoute`: posted to the app, no activation); `element-item` (the engine's element click on the
button's node, a re-observation, then the engine's coordinate click on a menu item, #454's fix); `element-1` (the element
click forced to route 1); `keys:space`, `keys:Down` (the kit writes AXFocused on the button, then the engine's
`press_key`); `kit:axpress`, `kit:axshowmenu` (the kit's AX action on the button); `kit:observed` (the kit's click
posted to the app, the engine's events rebuilt and stamped to the observed window, no activation); `kit:hid` (a HID-tap
click, a person's). Pop-ups: `select` (Chrome's `<select>`), `font` (TextEdit's font pop-up), `language` (Script
Editor's language pop-up), and `combo`, TextEdit's font-size combo box (an NSComboBox, clicked on its arrow), the added
native control. Modes: shared-behind, shared-front, dedicated-behind; kit routes in the shared ones, `element-1` behind.

### Results, engine edbfbd233ad9b4496b4d78062e51c0f826f78631 (main, with #454's fix)

Full run: https://github.com/SSFSKIM/cua/actions/runs/44877626226 (kit 62c4a406; Google Chrome 157.0.8103.79, macOS
26.7.2, image 20261117.0516.1; 475 rows, 5 per cell, no setup failures). Smokes, 1 row per cell, the same answers:
https://github.com/SSFSKIM/cua/actions/runs/44875033215 (kit aa498a6c, 96 rows; also `keys:fka-space`, Full Keyboard
Access on, the same as `keys:space`, and `kit:warpmove-observed`, the same as `kit:observed`) and
https://github.com/SSFSKIM/cua/actions/runs/44876506494 (kit 287ff573, 59 rows). Artifacts in
`~/.local/share/probe-458/run-<id>/` on the MacBook.

"Opened": a menu window still up at 1.8 s (or AXExpanded true for the combo box's list); "opened-closed": the watch saw
it come and go. "Top": the top layer-0 window, Finder's (the person's) or the app's observed window, after the action and
after Escape. The frontmost app stayed Finder in every behind row but `kit:hid`'s.

| pop-up | route | shared-behind | shared-front | dedicated-behind |
|---|---|---|---|---|
| font, language | `button` (today) | ok route 3, **opened-closed 10/10**, top Finder | ok, opened 10/10 | ok route 3, nothing seen 9, opened-closed 1; top app |
| select | `button` | ok route 3 (#282's AXPress), opened 5/5, top app | ok, opened 5/5 | ok route 3, nothing 3, opened-closed 2 (page: pointerdown, mousedown, focusin, click); top app |
| combo | `button` | ok route 3, nothing 5/5 | ok, opened 5/5 | ok, nothing 5/5 |
| all four | `button-2p` (route 2′) | ok, **opened 20/20**, top app | opened 20/20 | **opened 20/20**, top app |
| select, font, language | `element-item` | ok route 3 `action:AXPress:advertised`, opened 15/15, top app | ok route 1, opened 15/15 | ok route 3, opened 15/15, top app |
| select, font, language | `element-1` (route 1) | ok, opened 15/15, top app | - | opened 15/15, top app |
| combo | `element-item` | ok route 3 `synthesized:noAction` (no action advertised), nothing 5/5 | nothing 5/5 | nothing 5/5 |
| select, font, language | `keys:space`, `keys:Down` | ok route 2′, opened 30/30 (AXFocused write answered 0, the button read focused), top app | opened 30/30 | opened 30/30, top app |
| combo | `keys:space` | ok, nothing 5/5 (the AXFocused write answered 0 but the combo box never read focused) | nothing 5/5 | nothing 5/5 |
| select, font, language | `kit:axpress`, `kit:axshowmenu` | answered 0, opened 30/30, top app | opened 30/30 | - |
| combo | `kit:axpress` / `kit:axshowmenu` | -25206 (unsupported) / 0, nothing 10/10 | the same 10/10 | - |
| all four | `kit:observed` | opened 20/20; top app (combo: top Finder) | opened 20/20 | - |
| font, combo | `kit:hid` | TextEdit activated; font opened-closed 5, combo opened 5 | opened 10/10 | - |
| select, language | `kit:hid` | nothing, not activated 10/10 (unexplained) | opened 10/10 | - |

The follow-through, `element-item`'s coordinate click on an item of the menu the element click opened (#454's fix):
font and language **taken and confirmed** 30/30 (route 1 AXPick, `menuItemClick {effect: confirmed, value: taken}`,
p50 ~420 ms); select **taken** 15/15 but answered `clickUnconfirmed` (`value: unread`), #454's known Chrome answer.

Observable once open by the element click (`element-item`, `element-1`): the next observation lists the menu's items
with tokens in every row (select 6, font 72, language 2 AXMenuItem nodes), and its screenshot shows the menu (rows
checked by eye: TextEdit's font list, Chrome's One/Two/Three).

When today's click opens the menu behind (watch, ms after the click began): font 130–260 up, gone by 250–410; language
110–200 up, gone by 250–340; the engine's `delivery.screenHoldMs` 180–260 in the same rows. So the menu opens and is
closed when route 3's hold ends and the window order is put back. Dedicated: never seen in 9 of 10 AppKit rows (up for
50 ms in the tenth); Chrome's `<select>` up for about 60 ms in 2 of 5.

A representative `button` reply (font, shared-behind), verbatim:
`{"inputRoute":3,"activationGuardMs":32.814,"startedAt":1795245412313,"delivery":{"guardMs":253.142,"transientRaise":{"outlivedHold":false,"seen":true,"ms":162.569},"personInput":false,"otherAppFront":false,"screenHoldMs":260.872,"restoreLatencyMs":32.726,"capped":true,"frontmostRestored":false,"releasedAt":1795245412513,"holdStartedAt":1795245412252,"restores":4,"postedAt":1795245412313,"repairedAfterRelease":false,"frozenMs":261.21,"raiseLeft":false},"activationClick":"posted","stalePoint":{"recordedRole":"AXPopUpButton","ms":5.365,"windowsMs":0.964,"hitMs":1.594,"identity":"handle","verdict":"kept","reason":"sameElement","hitRole":"AXPopUpButton"},"activationClickKind":{"when":"early","kind":"activationPoint"},"coordinateClick":{"windowPoint":{"x":186,"y":50},"frameBeforePost":{"height":679,"x":400,"y":31,"width":620},"postedWindowLocation":{"x":186,"y":50},"windowFrame":{"y":31,"x":400,"width":620,"height":679},"screenshotPoint":{"y":50,"x":186},"postedLocation":{"y":81,"x":586}},"receivedAt":1795245412229,"endedAt":1795245412313,"hidIdleMs":null,"activationJoin":"fresh"}`
(dedicated: the same without `delivery`; Chrome's `<select>` shared-behind adds
`"elementClick":{"action":"AXPress","pressedRole":"AXPopUpButton","walk":["AXPopUpButton"],"pressed":"hit","reason":"webArea","plan":"action"}`
and `"activationClick":"outsideFrame"`). The element click behind:
`{"elementClick":{"action":"AXPress","reason":"advertised","plan":"action","hitTest":"application","hit":"element"},"activationJoin":"fresh","inputRoute":3,"activationClickKind":{"when":"early","kind":"activationPoint"},"activationClick":"posted",…}`.

### Reading

- **Why today's click opens nothing behind.** It is neither "AppKit opens a pop-up only for an active app" nor "only
  from a real mouse-down loop": the same events posted with no activation open every pop-up behind (`button-2p` and
  `kit:observed`, 40/40 with the app still in the background), and so do AX actions and keys. Route 3 is what closes it:
  in shared mode its menu opens about 150 ms in and is gone when the hold ends and the person's window order is put back
  (10/10 watched). In dedicated mode, nothing is put back, yet the menu shows in 1 of 10 AppKit rows; there the
  activation's down seems to take the click before it reaches the button (not resolved by this kit).
- **Honest routes.**
  - For AppKit and Chrome pop-up buttons, the element action AXPress works: the engine's element click opens the menu
    in every mode (30/30 on route 3, 30/30 forced to route 1). The menu is then observable (items listed with tokens,
    menu in the screenshot), and #454's fix takes the item (AppKit confirmed 30/30; Chrome taken 15/15 but
    `clickUnconfirmed`).
  - Keys (space or Down, once the button holds focus) open it in every mode (60/60 behind, 30/30 front).
  - Route 2′ for the coordinate click opens it in every mode (40/40).
  - So a closed-button coordinate click could be delivered as the button's AXPress, as #282 already does for Chrome
    in shared mode. That route opens Chrome's `<select>` behind 5/5.
- **The combo box has no element action**: its node advertises none (`synthesized:noAction`), AXPress is unsupported,
  AXShowMenu answers 0 and opens nothing, and its focus write does not hold, so keys reach the text area. Only a posted
  click opens it behind (route 2′ 10/10, `kit:observed` 5/5). The honest answers for it are a refusal that names the
  way through, or route 2′.
- **Activation and the person's windows.** No engine route activated the app: the frontmost app stayed Finder in every
  behind row (`kit:hid`, a real click, activated TextEdit). But **opening a pop-up menu behind orders the app's
  observed window above the person's window**, whichever route opens it (AXPress, keys, route 2′, the kit's post): the
  top layer-0 window became the observed one in every such row, and it stayed there after Escape. Here the two windows do
  not overlap, so nothing was hidden. Where they overlap, the opened menu's window would cover the person's.
  Route 3's `button` in shared mode is the only behind route that leaves Finder on top, because it puts the order back,
  and that is the same step that closes the menu.
- **Frontmost clicks are unchanged:** `button` opens every pop-up with the app frontmost, 20/20 (the ticket's three,
  15/15, plus the combo box).


## #458's restore: the person's window order put back after a background pop-up menu is used

Kit `scripts/probe-458/restore.mjs` (tool.swift `restore`, `order`, `watch`, `cancel`, `combo`; reader `rsummary.mjs`),
workflow `.github/workflows/probe-458-restore.yml`, dispatched with an exact engine SHA built unmodified; the restore is
the kit's.

**The engine's mechanism (Activation.swift, main edbfbd23).** Route 3's delivery guard (`FakeActivation.deliver`) takes a
screen-update hold (`SkyLight.hold`: `SLSDisableUpdate` on the main connection, `SLSReenableUpdate` at release), then
samples the window order every 2 ms (`deliveryGuardSampleMs`): while the target's window is in front of the person's
(`windowIsInFront`, a window-list walk), it raises the person's window back with `ActivationSystem.raise`, which is
`AXUIElementPerformAction(window, kAXRaiseAction)` on the person's app's `AXFocusedWindow` (`guardedUser`); with the person's
app no longer frontmost, it re-activates it (`NSRunningApplication.activate`). It ends on 3 stable samples, no sooner than
60 ms, and the hold is capped. `delivery.restores` counts the raises. The held menu activation (`MenuSpan.swift`,
`restoresByActivationOnly`) restores by activation only. The kit's `restore` does the same calls from outside the engine:
the person's focused window found by AX and matched in the window list (p50 1.7 ms), the hold, AXRaise while the app's
window is in front, 3 stable samples, at least 60 ms; `+ra` raises every window of the person's that was in front of the
app's before the open, back to front, instead of the focused one alone. It needs neither the app frontmost nor the menu
closed: raised with the menu still open, the menu stays up (layer 101) and keeps working.

The layout: the app's window (400, 30, 620×720) and, for TextEdit and Script Editor, its second window behind it; the
person's Finder frontmost, its focused window F1 (760, 420) over the app's lower right and a second window F2 (240, 480)
over its lower left; Calculator behind them all. The order at the start: Finder F1 > Finder F2 > the app's window(s) >
Calculator, 380/380. Each row opens the menu with the engine's element click on the closed button (route 3,
`action:AXPress`, 380/380 opened), then:
`pick`/`escape`/`cancel` end it by the engine's coordinate click on an item (#454's AXPick path), the engine's Escape or
the kit's AXCancel; `+r` the engine's repair (F1 raised), `+ra` every person window raised; `ropen-` restores (`+ra`)
as soon as the menu is up, then picks or escapes; `escape` and `timeout` (8 s, then Escape) restore nothing;
`person-click` is a HID click inside F1 while the menu is open, then `+ra`.

### Results, engine edbfbd233ad9b4496b4d78062e51c0f826f78631 (main), kit a64ad598

Full run: https://github.com/SSFSKIM/cua/actions/runs/44888938314 (Google Chrome 157.0.8103.79, macOS 26.7.2, image
20261117.0516.1; 380 rows, 10 per cell, plus 20 combo-box arrow rows; no setup failures). Smokes:
https://github.com/SSFSKIM/cua/actions/runs/44883898384 (kit 7ba57edb, 30 rows) and
https://github.com/SSFSKIM/cua/actions/runs/44888203834 (kit 0138fe08, 18 rows, image 20261102.0473.1, Chrome 156); the
same answers. Artifacts in `~/.local/share/probe-458/run-<id>/` on the MacBook.

| route (select, font, language) | F1 back on top | whole order as before | menu closed | pick taken | restore ms p50/p95/max |
|---|---|---|---|---|---|
| `pick+r`, shared and dedicated | 60/60 | **0/60**: F2 left under the app's window | 60/60 | 60/60 | 67/75/81 (1 raise, 2 in 2 rows) |
| `escape+r` | 30/30 | **0/30** (F2) | 30/30 | - | the same |
| `cancel+r` | 30/30 | **0/30** (F2) | TextEdit, Script Editor 20/20; **Chrome's stays up 10/10** (AXCancel answers 0) | - | the same |
| `pick+ra`, shared and dedicated | 60/60 | **60/60** | 60/60 | 60/60 | 127/200/232 (4 raises, 2 in 1 row) |
| `escape+ra` | 30/30 | 30/30 | 30/30 | - | the same |
| `ropen-pick` (restore with the menu up, then the pick) | 30/30 (also with the menu up, 30/30) | 30/30 | 30/30 | 30/30 | 145/182/185 |
| `ropen-escape` | 30/30 (menu up: 30/30) | 30/30 | 30/30 | - | 132/176/192 |
| `escape` (no restore) | 0/30: the app's window stays on top | 0/30 | 30/30 | - | - |
| `timeout` (8 s, no restore) | 0/30: after 8 s the menu is still up and the app's window still on top; Escape leaves it on top | 0/30 | 30/30 after Escape | - | - |
| `person-click`, then `+ra` | the click closes the menu (30/30) but leaves the app's window over F1 (30/30); the restore then 30/30 | 30/30 | 30/30 | - | 156/207/212 |

Every restore found the app's window in front and left it behind (300/300, every AXRaise answered 0, the hold taken
300/300). Nothing beyond F1, F2 and the app's window moved in any of the 380 rows: the app's second window and Calculator
kept their places. The frontmost app stayed Finder and the person's focused window stayed F1 in every row (380/380). The
pop-up's value: picked items taken 150/150 (AppKit confirmed; Chrome `clickUnconfirmed` but taken), Escape and AXCancel
left it unchanged.

Timing (watch, 10 ms samples; ms): the app's window rises over F1 186 p50 (max 547) after the element click begins, when
the menu opens. After the restore starts, F1 is uncovered again in 51 p50 (max 106) for `+r` and 102–109 p50 (max 211)
for `+ra`. In this kit F1 stayed covered for 1.0–1.4 s with `ropen-` and 1.5–3.3 s with restores after the pick or
Escape, mostly the kit's own waits (900 ms after the open, an observation before the pick). The restore can run as
soon as the menu is up.

The app's `AXFrontmost`: false before the open, true from the element click on, 380/380 (route 3's activation; the
frontmost app stays Finder). The restore does not change it.

**TextEdit's font-size combo box** (for the fix's arrow rule, in 4 rows of this run plus every arrow row, kit AX read and
the engine's observation agree): the combo (715, 70, 52×22), actions `AXShowMenu, AXConfirm`; one AXButton child
`font size` (743, 73, 20×15), actions `AXPress`, its trailing edge **exactly 4.0 pt** inside the combo's (28 pt from its
leading edge). The arrow pressed behind, `arrow-kit` (the kit's AXPress on it) and `arrow-engine` (the engine's element
click on its node, route 3 `action:AXPress`): the list opens 20/20 (AXExpanded true, a new **layer-0** window
(706, 70, 65×250) above the app's document window, below both Finder windows), the frontmost app stays Finder, the order
of the person's windows is unchanged, and Escape closes it 20/20.

### Reading

- **The engine's own repair (F1 raised) is reliable, about 70 ms, and incomplete.** It puts the person's focused window
  back over the app's every time (120/120, never leaving it in front), inside the screen-update hold (taken 300/300; no
  pixel check was made for a flash), with no activation or focus change. But it restores only the focused window: a
  second window of the person's that the app's window covered keeps being covered (F2, 120/120). That is a reorder of
  another of the person's windows.
- **Raising every window of the person's that was in front of the app's before the open, back to front, restores the
  whole order** in every row (180/180 across pick, Escape, restore-while-open and the person's click), at 120–160 ms
  p50 and 232 ms worst, with nothing else moved. It needs the order read before the open (the person's windows in front
  of the app's).
- **The restore does not need the menu closed:** run with the menu up, it uncovers F1, the menu stays usable, and the pick
  or Escape after it leaves the order as restored (60/60). So the window covers the person's for only the time from the
  menu opening to the restore (here ~190 ms to the raise, ~100 ms more to uncover).
- **What the engine cannot restore:** a menu left open (8 s: still up, the app's window still on top, 30/30) and a menu
  closed by the person's own click elsewhere (the click is consumed closing the menu, and the app's window stays over F1,
  30/30). Restoring as soon as the menu is up covers both. Chrome's menu also ignores AXCancel (answers 0, stays up,
  10/10).
- **The combo box's arrow** has an element action that opens its list behind without raising anything: AXPress on the
  trailing AXButton child, whose trailing gap is exactly 4.0 pt, so the fix's "within 4 pt" has to include 4.


## #458 qual: main edbfbd23 against fix/458-popup-press 7e5bb454

Kit `scripts/probe-458/qual.mjs` (tool.swift's `order`, `watch`, `state`, `front`; reader `qreader.mjs`), workflow
`.github/workflows/probe-458-qual.yml`, one engine head per dispatch, built unmodified. Cells:
- Delivery: the engine's coordinate click on a closed pop-up: TextEdit's font pop-up, Script Editor's language pop-up,
  Chrome's `<select>`, and TextEdit's font-size combo box on its arrow. Run in shared-behind, dedicated-behind and
  shared-front, with layout a. Read at 300 ms and 1.8 s: the app's new windows (a menu's at layer 101; the combo box's
  list at layer 0), the answer and its meta, the whole layer-0 window order against the one before the click, the
  frontmost app, and the person's focused window. Then the pick of an item (#454's path), or Escape for the combo box.
- Restore layouts, font and select, shared-behind. Each is built by bringing each window forward as a person does: AXMain,
  AXRaise, then the window's app activated with no options, back to front. Each is read back before the click, and every
  layout was built as intended in all 400 rows:
  - a: Finder F1 > Finder F2 > the app's window(s) > Calculator;
  - b: F1 > Calculator > the app's;
  - c: F1 > F2 > Calculator > F3 > the app's;
  - d: F1 > the app's > Finder F4, where F4 must stay under the app's window.
- Parity, 5 rows each: Chrome's page button Beta (behind), an open menu's item (#454; the kit's AXPress opens the font
  menu), and the combo box's text (behind and frontmost).

A second tool samples the window list every 10 ms. "Cover" is how long the app's window lay above F1.

Runs. Both used Google Chrome 157.0.8103.79, macOS 26.7.2, image 20261117.0516.1 and kit 6d30f534, with 200 rows each,
10 per cell (parity 5), and no setup failures:
- main edbfbd233ad9b4496b4d78062e51c0f826f78631: https://github.com/SSFSKIM/cua/actions/runs/44924065133
- fix 7e5bb454297326700d9bd30f0d83835d5e2cc4e5: https://github.com/SSFSKIM/cua/actions/runs/44929018111

Smokes, fix: https://github.com/SSFSKIM/cua/actions/runs/44920398171 (kit 0cab29ae, 22 rows; its layouts c and d were built
wrong, so it was rebuilt) and https://github.com/SSFSKIM/cua/actions/runs/44922278566 (kit 6d30f534, layouts b–d, 6 rows).
Artifacts are in `~/.local/share/probe-458/run-<id>/`.

### Delivery (layout a), main against fix

"Open" means a menu window, or the combo box's list, is still up at 1.8 s. "Order" means the whole window order is
unchanged at 1.8 s.

| control | mode | main edbfbd23 | fix 7e5bb454 |
|---|---|---|---|
| font, language | shared-behind | ok route 3, **open 0/20**; order 0/20 (F2 left under the app's window) | ok `popUpClick {AXPress, confirmed}`, **open 20/20**, pick taken 20/20; order 20/20 |
| font, language | dedicated-behind | ok, open 0/20; order 0/20 | confirmed, open 20/20, pick taken 20/20; **order 17/20** (3 rows end F2 > F1, the person's focused window changed) |
| select | shared-behind | ok (#282's AXPress), open 10/10, pick taken (`clickUnconfirmed`); order 0/10 | confirmed 9, **`clickUnconfirmed` 1** (menu open at 1.8 s), pick taken 10/10; order 9/10 |
| select | dedicated-behind | ok, open 0/10; order 0/10 | confirmed 9, `clickUnconfirmed` 1 (menu open), pick taken 10/10; order 9/10 |
| combo arrow | shared-behind, dedicated-behind | ok, open 0/20 | `popUpClick {AXPress, confirmed, arrow}`, open 20/20 (list (706, 70, 65×250), layer 0); order 20/20, no restore needed |
| all four | shared-front | ok route 3, open 40/40, picks taken 30/30 | ok route 1 confirmed, open 40/40, picks taken 30/30 |

There were no false confirmations: confirmed answers came with a menu or list up, 0 exceptions in 200 rows. The two
`clickUnconfirmed` answers on select were each a menu that opened about 940 ms after the click, past the 500 ms settle
(`popUpClick.ms` 550, the watch's first menu sample at 943 ms). Neither row was restored, so the app's window stayed over
F1 for about 4 s, until the reads ended.

### Restore layouts (fix; shared-behind unless named)

| layout | rows | whole order kept at 1.8 s | `restored` | frontmost app / person's focused window | cover ms p50/max |
|---|---|---|---|---|---|
| a, shared-behind | 40 | 39/40 | complete 22, `stopped: bound` 7 (order kept in all 7), none 11 (combo 10, the late-select row 1) | Finder 40/40 / kept 40/40 | 98/153 (the late-select row 4075) |
| a, dedicated-behind | 40 | **36/40** | complete 19, `stopped: bound` 10 (order kept in 7), none 11 | Finder 40/40 / **changed 3** (F2 on top) | 97/185 (late row 4207) |
| b (Calculator above the app's) | 20 | 20/20 | complete 20 | Finder 20/20 / kept 20/20 | 51/100 |
| c (F1 > F2 > Calculator > F3) | 20 | **0/20** | **`stopped: bound` 20/20** | Finder 20/20 / **changed 11/20** | 147/233 |
| d (F4 under the app's) | 20 | 20/20 (F4 stays under) | complete 20 (1 window) | Finder 20/20 / kept 20/20 | 40/129 |

`restored.ms`: p50 66 in b and d, 243–398 in a, 518–535 in c. `stopped: personInput` and `stopped: unresolved` were never
seen. On main nothing restores the order once a menu is open: select shared-behind keeps the app's window over F1 for the
whole watch (~4.7 s) in every layout, and is order 0/10 in a, b, c and d. Main's font clicks open nothing; route 3 puts
F1 back but not F2 or Calculator (a 0/10, b 0/10, c 0/10, d 10/10).

**Why `stopped: bound`** (watch samples): in layout a the raises of F2 and F1 keep landing after the restore's own reads.
The order then flips F1 > F2, F2 > F1, F1 > F2 … every 30–150 ms, for up to 1 s, past the 500 ms bound, and the last raise
to land decides which Finder window ends on top. The restore keeps re-raising both windows while it reads the order wrong
(6–11 AXRaises in those rows). In layout c, Calculator's raise does not go back above F3, the person's active app's
window (an AXRaise of a background app's window stays under the active app's), so the order never reads right. The
re-raises then leave F3 or F2 on top in 11 of 20 rows. #458's restore kit ran its restore ~900 ms after the open and saw
neither in 180/180 (layouts with only the active app's windows above).

### Parity (5 rows each, main / fix)

| cell | main | fix |
|---|---|---|
| Chrome's Beta button, behind | ok route 3, page `mousedown, focusin, click` on b2 5/5 | the same 5/5 |
| an open menu's item (#454) | ok route 1 5/5 | the same 5/5 |
| combo box text, behind | ok route 3, focus to the AXComboBox 5/5 (order: F2 left under the app's, as main's route 3 always does) | the same 5/5 |
| combo box text, frontmost | ok route 3, AXComboBox 5/5 | the same 5/5 |

No regression: nothing main kept is refused or changed by the fix.

### Reading

- **Delivery is fixed.** Every closed pop-up and the combo box's arrow opens behind in both modes. The fix answers
  confirmed 138/140 behind and 40/40 frontmost, with no false confirmed. #454's pick takes the item every time (90/90
  AppKit, 60/60 Chrome, the latter `clickUnconfirmed` as on main). Main opens nothing behind except Chrome's `<select>`
  in shared mode.
- **Chrome's `<select>` sometimes opens late:** 2/20 rows opened at ~940 ms, past the 500 ms settle. The answer was then
  `clickUnconfirmed`, and the person's order was left covered because no restore ran.
- **The restore is whole and fast when only one other app's windows are above and they settle quickly** (b and d 40/40,
  a shared 39/40). But:
  - it ends on `stopped: bound` in 17/80 of layout a's rows, from raises that land late and flip F1 and F2;
  - in dedicated mode it left F2 above F1 (the person's focused window changed) in 3/40;
  - with the person's windows interleaved with a third app's (c) it never restores (0/20) and changes the person's
    focused window in 11/20.
- No row activated anything: the frontmost app stayed the person's in all 400. The app's AXFrontmost reads true after
  the fix's route 3 press, as after main's element click.


## #458 qual 2: main aebd0eb45 against fix 67cf8b26 (one-pass restore), and the final head 2bd74c6e

This is the same kit as "#458 qual", with three additions:
- A key-window watch (tool.swift `watch` with `person`): the person's app's AXFocusedWindow and AXMainWindow are read
  every 5 ms, from the click to 5 s after it. A row counts as transient when any read is not F1, and as end when the last
  read is not F1.
- Two Chrome `<select>`s on the page that a press may open nothing for: `empty` (no options) and `blocked` (its
  mousedown cancelled by the page). These measure the cost of the 1.5 s menu wait on an unconfirmed answer.
- Click ms: the wall time of the engine's click call.

Kit 6c0906f1. All runs used Google Chrome 157.0.8103.79, macOS 26.7.2 and image 20261117.0516.1, with no setup failures,
and every layout was read back as built:
- main aebd0eb45584e41f33ee31ee4e15db7e2cbf7bcb (includes #456): https://github.com/SSFSKIM/cua/actions/runs/44936682259
  (220 rows)
- fix 67cf8b263eb1d0bb0ab9c5f0a3e9f0f06b9f7509: https://github.com/SSFSKIM/cua/actions/runs/44941888406 (220 rows)
- final 2bd74c6e2d05591cb8ed82e8925ba5d61153693d, layouts a and c, font and select, 5 rows per cell:
  https://github.com/SSFSKIM/cua/actions/runs/44947309728 (40 rows)
- smoke on 67cf8b26: https://github.com/SSFSKIM/cua/actions/runs/44935707967 (22 rows)

### Restore layouts (behind rows; the person's app Finder, F1 its focused window)

| layout | head | order kept at 1.8 s | `restored` | key window off F1: transient / end | off ms p50/max | frontmost app | cover ms p50/max |
|---|---|---|---|---|---|---|---|
| a, shared-behind | main | 0/40 (select's menu keeps the app's window over F1; route 3 leaves F2 under) | - | 0 / 0 of 40 | - | Finder 40/40 | select 4771/4827, others 21–49/79 |
| a, shared-behind | 67cf8b26 | 30/30 (+ combo 10/10, nothing raised) | complete 30, no `stopped`, `skipped` 0 | **8 / 0 of 30** (select 3, font 3, language 2) | 13–24 / 26 | Finder | 95–133/278 |
| a, dedicated-behind | 67cf8b26 | 30/30 (+ combo 10/10) | complete 30 | **11 / 0 of 30** (select 6, font 4, language 1) | 21–26 / 34 | Finder | 105–115/188 |
| b (Calculator above) | 67cf8b26 | **0/20** (Calculator left under the app's window) | complete false, `skipped` 1, 20/20 | 0 / 0 of 20 | - | Finder | 64–67/107 |
| c (F1 > F2 > Calculator > F3) | 67cf8b26 | **0/20** (Calculator and F3 left under) | complete false, `skipped` 1, 20/20 | **19 / 0 of 20** | 26–32 / 38 | Finder | 109–185/246 |
| d (F4 under the app's) | 67cf8b26 | 20/20 (F4 stays under) | complete 20 | 0 / 0 of 20 | - | Finder | 31–49/105 |
| a, shared-behind | final 2bd74c6e | 10/10 | complete 10 | **3 / 0 of 10** | 25–26 / 26 | Finder | 121–138/177 |
| a, dedicated-behind | final | 10/10 | complete 10 | **3 / 0 of 10** | 31–49 / 49 | Finder | 112–133/259 |
| c | final | 0/10 | complete false, `skipped` 1, 10/10 | **7 / 0 of 10** | 15–20 / 28 | Finder | 127–132/166 |

On main, b, c and d: select keeps the app's window over F1 for the whole watch (0/30 order). Font opens nothing, and
route 3 puts F1 back but not Calculator, F2 or F3 (b 0/10, c 0/10, d 10/10). Main's key window never left F1 (0/220).

None of the fix or final rows ended with the focused window off F1, but it was off F1 transiently in
19/60 + 19/20 rows on 67cf8b26 and 13/30 on 2bd74c6e. Each time, AXFocusedWindow read the person's other raised window
(F2 at (240, 480), or F3) for one or more 5 ms samples, 13–49 ms long, at 220–940 ms after the click. That is during the
one-pass raise (back to front, F2 then F1). AXMainWindow read off F1 in one row only (67cf8b26, language
dedicated-behind a, one sample, the transient counted above), and no read failed. `restored.ms` was
329–385 p50/max on every layout. No `stopped` value was seen (`personInput`, `bound`, `unresolved`, `focusUnknown`,
`focusRaiseFailed`: 0).

### Delivery, parity, unconfirmed (main aebd0eb45 / fix 67cf8b26)

| cell | main | fix |
|---|---|---|
| font, language, behind (both modes) | ok route 3, open 0/40 | confirmed, open 40/40, picks taken 40/40 |
| select, behind | shared: open 10/10 (#282); dedicated: 0/10 | confirmed 20/20, open 20/20, picks taken (`clickUnconfirmed`, as on main) 20/20 |
| combo arrow, behind | open 0/20 | confirmed (arrow) 20/20 |
| all four, frontmost | open 40/40 | confirmed route 1, 40/40 |
| `blocked` select (press accepted, no menu) | ok route 3, no menu, click 208/281 ms p50/max | `clickUnconfirmed` (AXPress unconfirmed) 10/10, no menu, click **1773/2015 ms** (`popUpClick.ms` 1506–1776): about **+1.57 s p50, +1.73 s max** |
| `empty` select | ok route 3, no menu, 205/235 ms | the same: ok route 3, no `popUpClick` (not taken as a pop-up), 261/313 ms |
| parity: Beta button, menu item (#454), combo text behind and front | ok route 3 / 1 / 3 / 3, 20/20 | identical, 20/20 |

There were no false confirmed answers (0 on both fix heads) and no false unconfirmed answers (0: every unconfirmed row
had no menu at 1.8 s). The late `<select>` open seen in the first qual did not recur (0/30 with the 1.5 s wait). There
were no regressions, and the frontmost app stayed the person's in every row.


## #458 qual 3: the focused-window-only restore, fix e7fc289a

The kit and layouts are qual 2's (kit 709deecf). Head e7fc289ad1be5a9f6de657615857c4040955a5e3 was built unmodified:
https://github.com/SSFSKIM/cua/actions/runs/44949635594 (120 rows, Google Chrome 157.0.8103.79, macOS 26.7.2, image
20261117.0516.1, no setup failures, every layout read back as built). The cells were font and select, 15 rows each, in
layout a (shared-behind and dedicated-behind), layout c (shared-behind), and frontmost. The main baseline is qual 2's run
44936682259 on aebd0eb4.

Key-window watch: Finder's AXFocusedWindow and AXMainWindow are read from the click to 5 s after it, with every read
succeeding. The loop asks for 5 ms, but with the AX and window-list reads it averaged ~22 ms a sample (228 reads p50
per row), so a change shorter than that could pass unseen. Qual 2's transients, 13–49 ms long, were seen with the same
loop.

| layout | rows | focused / main window off F1: transient / end | F1 above the app's window at 1.8 s | `restored` | `stopped` | frontmost app / person's focus | cover ms p50/max |
|---|---|---|---|---|---|---|---|
| a, shared-behind | 30 | **0 / 0 of 30** | 30/30 | complete (F1 raised once), `leftCovered` 1 (F2), 30/30 | 0 | Finder 30/30 / kept 30/30 | 30–44/100 |
| a, dedicated-behind | 30 | **0 / 0 of 30** | 30/30 | complete, `leftCovered` 1, 30/30 | 0 | Finder / kept | 27–51/84 |
| c, shared-behind | 30 | **0 / 0 of 30** | 30/30 | complete, `leftCovered` 3 (F2, Calculator, F3), 30/30 | 0 | Finder / kept | 32–47/77 |

The whole order is not kept (0/90): F2, and in c also Calculator and F3, stay under the app's window, as `leftCovered`
says. `restored.ms` was 338–349 p50, 383 max, with 1 raise in every row.

Delivery sanity: behind, confirmed 90/90, the menu open at 1.8 s 90/90, and the pick taken 90/90 (select
`clickUnconfirmed`, as on main). Frontmost, confirmed on route 1 30/30 and taken 30/30. Key window off F1 0/30. There
were no false confirmed or false unconfirmed answers.

## #463: transient UI a background click opens, and route 3's restore closes

Kit `scripts/probe-463/` (`measure.mjs`; `tool.swift`, #458's tool plus the watch's `fresh` windows with an epoch anchor,
`open`'s frame match and `closeExtra`; reader `reader.mjs`), workflow `.github/workflows/probe-463.yml`, one engine head
per dispatch, built unmodified. The layout is #458 qual's a (Finder F1 > F2 > the app's window(s) > Calculator, built back
to front as a person does; read back as built in all 364 rows); the screen is 1024×768. Each row: one observation, then
the action at the control the observation recorded, while a second tool samples the window list every 10 ms for 4 s:
every window new since the watch began, of any owner but the engine, at any layer (its layer, alpha and bounds, and when
it came and went on the action's clock), plus Finder's AXFocusedWindow and AXMainWindow each sample (the key-window
watch). At 1.8 s the kit reads the window order and the frontmost app. "Closed" means the UI was gone again before
1.8 s; "after release" is the time it went, less `delivery.releasedAt` (the end of route 3's hold and its guard).

Controls: TextEdit's format-bar `list style` pull-down (an AXMenuButton, not an AXPopUpButton); its title bar's
`document actions` AXMenuButton (it opens the document popover); the text view's context menu (a right click,
`mouse_button: right`); the `text color` well (it opens the colour popover). Chrome's toolbar: the app menu (an
AXPopUpButton), the profile button `You`, the bookmark star, and the site-information icon and tab-search button (both
AXPopUpButtons). The extensions puzzle is not on this image's toolbar. The page: its context menu (a right click on a
blank area), `<input list>` (clicked on its datalist arrow), `<input type=date>` (on its calendar icon) and
`<input type=color>`. Routes: `click`, the engine's coordinate click, in shared-behind (6 rows), shared-front (5) and
dedicated-behind (3). The element alternatives run behind: `element` (the engine's element click, 5 rows), `showmenu`
(`perform_secondary_action` "Show Menu", 5), and the kit's own `kit:AXPress` and `kit:AXShowMenu` (3 each), each only
where the node advertises the action.

### Results, engine 1a1956b2b7f749ccd1f8389fdc31566cd7b79a35 (main)

Full run: https://github.com/SSFSKIM/cua/actions/runs/44959835166 (kit 7fe9df6a, Google Chrome 157.0.8103.79, macOS 26.7.2,
image 20261117.0516.1). It has 364 rows: 358 measured, and 6 where a control or action was absent. There were no setup
failures. Smokes, 1 row per cell: https://github.com/SSFSKIM/cua/actions/runs/44955237095 (kit 2369e807; its Chrome rows
are void, because the reset closed the page's window) and https://github.com/SSFSKIM/cua/actions/runs/44958306802 (kit
7fe9df6a, 77 rows, the same answers). Artifacts are in `~/.local/share/probe-463/run-<id>/` on the MacBook.

**The coordinate click, engine 1a1956b2.** "UI" is the window the action opened (layer, size in pt). "Open / closed /
up" count the rows where it opened, where it was gone before 1.8 s, and where it was still up at 1.8 s.

| control | UI | shared-behind: answer; open / closed / up; gone after release (ms) | shared-front | dedicated-behind | frontmost at 1.8 s, behind |
|---|---|---|---|---|---|
| TextEdit `list style` (AXMenuButton) | menu, L101 100×280 | ok route 3; 6 / **6** / 0; 49–294 (2–3 raises) | ok, up 5/5 | ok; open 1/3, closed | Finder |
| TextEdit `document actions` (AXMenuButton) | popover, L0 660×150 | ok; 6 / 0 / **6** (opens 560–1515 ms in, after the hold) | up 5/5 | up 3/3 | Finder |
| TextEdit text view, right click | context menu, L101 220×250 | ok; 6 / **6** / 0; 41–123 (0–2 raises; none in 2 rows) | up 5/5 | nothing 0/3 | Finder |
| TextEdit `text color` well | colour popover, L0 220×250 | ok; 6 / **6** / 0; 90–286 (1 raise, before it opened) | up 5/5 | nothing 0/3 | Finder |
| Chrome app menu (AXPopUpButton) | menu, L101 320×600 | ok, #458's `popUpClick` confirmed; 6 / 0 / 6 | ok route 1, up 5/5 | confirmed, up 3/3 | Finder |
| Chrome profile `You` | bubble, L0 330×410 | ok; **1** / **1** / 0; 111 (5 rows: nothing seen) | up 5/5 | up 3/3 | Finder; dedicated **Chrome** |
| Chrome bookmark star | bubble, L0 450×340 | ok; **3** / **3** / 0; 69–187 (3 rows: nothing) | up 5/5 | nothing 0/3 | Finder; dedicated **Chrome** |
| Chrome site information (AXPopUpButton) | bubble, L0 320×280 | **`clickUnconfirmed`** (#458's AXPress; no layer-101 menu seen); 6 / 0 / **6** | `clickUnconfirmed` route 1, up 5/5 | `clickUnconfirmed`, up 3/3 | **Chrome** |
| Chrome tab search (AXPopUpButton) | bubble, L0 320×170 | **`clickUnconfirmed`**; 6 / 0 / **6** | `clickUnconfirmed`, up 5/5 | `clickUnconfirmed`, up 3/3 | **Chrome** |
| page, right click | context menu, L101 280×400 | ok; **4** / **4** / 0; 108–168 (0 raises; 2 rows: nothing) | up 5/5 | up 3/3 | Finder |
| `<input list>` arrow | datalist, L999 160×130 | ok route 1 (#282's `focusField`, the caret placed); nothing 0/6 | up 5/5 | nothing 0/3 | Finder |
| `<input type=date>` icon | picker, L101 220×280 | ok (#282's `AXPress:webArea`); up **6/6** | nothing 0/5 | nothing 0/3 | Finder |
| `<input type=color>` | picker, L101 230×250 | `backgroundClickRefused` (#282, `webArea`); nothing 0/6 | up 5/5 | nothing 0/3 | Finder |

**When the UI goes.** In all 27 rows with a closed UI, it lasted 29–323 ms. TextEdit's pull-down opened during the hold
(25–100 ms before its release), and its context menu between 44 ms before and 84 ms after; both went 41–294 ms after
the release. TextEdit's colour popover opened 49–208 ms *after* the release, and its one raise came
before that, then the popover went about 50 ms later. In Chrome, the hold was 100 ms with 0 raises; the UI opened 14–94 ms
after the release and went 37–150 ms later. So the close follows the end of route 3's fake activation whether or not the
guard raised anything; it is not the raise alone. Behind, after a closed UI, the order at 1.8 s was F1 > the app's window >
F2 (`moved` F2 and App: F2 is left under the app's window, as in #458).

**The element alternatives, shared-behind** (rows where the UI was open and still up at 1.8 s, of the rows run):

| control | `element` (engine element click) | `showmenu` (engine "Show Menu") | `kit:AXPress` | `kit:AXShowMenu` | order at 1.8 s; frontmost |
|---|---|---|---|---|---|
| TextEdit `list style` | AXPress, **5/5** | ok, 5/5 | 3/3 | 3/3 | the app's window over F1 and F2; Finder |
| TextEdit `document actions` | AXPress, **5/5** | `menuUnconfirmed`, but up 5/5 | 3/3 | 3/3 | unchanged, the popover under F1 and F2; Finder |
| TextEdit text view | - (right click) | ok, **5/5** (the context menu) | - | 3/3 | the app's window over F1 and F2; Finder |
| TextEdit `text color` | AXPress, **5/5** | not advertised | 3/3 | not advertised | unchanged; Finder |
| Chrome app menu | AXPress, 5/5 | `menuUnconfirmed`, nothing 0/5 | 3/3 | 0/3 | unchanged; Finder |
| Chrome profile | AXPress, 5/5 | `menuUnconfirmed`, nothing 0/5 | 3/3 | 0/3 | AXPress: the bubble and Chrome's window over F1, **Chrome frontmost** |
| Chrome star | AXPress, 5/5 | not advertised | **0/3** | not advertised | element: the same, **Chrome frontmost**; kit: unchanged |
| Chrome site information | AXPress, 5/5 | `menuUnconfirmed`, but up 5/5 | 3/3 | 3/3 | the same, **Chrome frontmost** in all 16 |
| Chrome tab search | AXPress, 5/5 | `menuUnconfirmed`; a small context menu (L101 100×50) 5/5 | 3/3 | the small menu 3/3 | AXPress: **Chrome frontmost**; Show Menu: unchanged, Finder |
| page, right click | - | `menuUnconfirmed`, nothing 0/5 | - | 0/3 | unchanged; Finder |
| `<input list>` | AXPress, **5/5** (the datalist) | ok, the page's context menu 5/5 | 0/3 | context menu 3/3 | unchanged; Finder |
| `<input type=date>` | **`backgroundClickRefused`** (`synthesized`, the point on a descendant) 0/5 | ok, the page's context menu 5/5 | 0/3 | context menu 3/3 | unchanged; Finder |
| `<input type=color>` | AXPress, **5/5** (the picker) | ok, the page's context menu 5/5 | 0/3 | context menu 3/3 | unchanged; Finder |

**Focus.** Finder's focused and main window stayed F1 in every sample of every row (key-window watch, 358/358 rows, no
failed reads). The frontmost app did change. In every behind row with a Chrome toolbar bubble up at 1.8 s, Chrome became
frontmost and its bubble and window went above F1 (58/58). Those rows came from the engine's AXPress, the kit's AXPress,
#458's delivery, Show Menu on site information, and dedicated mode's posted click. Dedicated mode's posted click on the
star made Chrome frontmost with no bubble seen (3/3). When an element action opened a native menu, TextEdit's window went
above F1 and F2 without TextEdit becoming frontmost (as #458 found). The popovers that AXPress opened (document actions,
colour) left the order unchanged, under the person's windows.

### Reading

- **Confirmed, and wider than menus.** With the app behind in shared mode, the coordinate click answered ok while the UI
  it opened closed again before 1.8 s:
  - TextEdit's AXMenuButton pull-down, its context menu and its colour popover, 6/6 each;
  - Chrome's page context menu 4/6 (nothing in 2), its bookmark-star bubble 3/6 (nothing in 3) and its profile bubble
    1/6 (nothing in 5).

  Frontmost, every one stays up, 5/5 each. The close follows the delivery guard's release, and in Chrome it comes with
  no raise at all. So what keeps the UI open is a delivery that does not end in route 3's activation release, as #458's
  AXPress does; skipping only the raise would not.
- **Not every transient closes.** The title bar's document popover opens 0.5–1.5 s in, after the hold, and stays up
  (6/6). Chrome's app menu is an AXPopUpButton, which #458's delivery already confirms, open 6/6.
- **#458's AXPopUpButton rule answers falsely for Chrome's bubble buttons.** Site information and tab search are
  AXPopUpButtons whose press opens a layer-0 bubble, not a layer-101 menu. So the delivery answers `clickUnconfirmed` while
  the bubble is up: 6/6 behind, 5/5 frontmost and 3/3 dedicated. The answer tells the model to observe before any retry,
  so the cost is an extra observation, not a doubled action. The same press makes Chrome frontmost.
- **Element actions that open the UI and keep it open behind:**
  - AXPress opens TextEdit's pull-down, its document-actions popover and its colour popover (engine 5/5 each, the kit's
    3/3), and each of Chrome's toolbar buttons (5/5).
  - The engine's element click opens `<input list>` and `<input type=color>` (5/5). The kit's bare AXPress opens nothing on
    them (0/3), so the engine's element route there does more than the bare action.
  - AXShowMenu opens TextEdit's text-view context menu (5/5).

  What does not work:
  - AXShowMenu on a page control opens the page's context menu, not the control's picker.
  - On Chrome's web area or its toolbar buttons, AXShowMenu opens nothing; there the engine's `menuUnconfirmed` answer is
    honest.
  - No element action opens Chrome's page context menu behind.
  - The date input's element click is refused.
- **The element route's cost for Chrome's toolbar:** every AXPress that opens a toolbar bubble makes Chrome frontmost and
  puts its window over the person's. The person's key window inside Finder is kept, but the frontmost app is not.
- **Dedicated mode mostly opens nothing** for these controls (TextEdit's context menu 0/3, the colour well 0/3, the
  pull-down 1/3 and closed, the star 0/3), and nothing there is a restore. That is #458's unexplained dedicated case,
  not this one.

Evidence for the design call, not the call:
- The restore closes three kinds of UI while answering ok: native AppKit pull-downs (AXMenuButton), a popover a control
  opens (the colour well), and context menus (TextEdit's, and Chrome's page).
- The first two have an AXPress that opens the UI and keeps it open behind without making the app frontmost, as #458's
  pop-up buttons do.
- TextEdit's context menu has AXShowMenu, with the same result. Chrome's page context menu has no element route that opens
  it behind.
- Chrome's toolbar bubbles open only sometimes behind, and are closed when they do (star 3/6, profile 1/6). Their AXPress
  opens them, but makes Chrome frontmost.
- #458's own rule answers a false `clickUnconfirmed` for Chrome's AXPopUpButtons that open bubbles.
