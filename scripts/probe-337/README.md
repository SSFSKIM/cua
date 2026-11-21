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
