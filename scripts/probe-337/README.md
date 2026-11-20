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
| datalist | Chrome, **layer 999**, (467,220,164×166) | focus the `<input list>` and type; shows only with Chrome frontmost (0/10 behind or dedicated) |
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
