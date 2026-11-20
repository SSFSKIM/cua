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
