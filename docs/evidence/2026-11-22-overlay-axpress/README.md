# #453: hosted macOS evidence for clicks on the app's own overlays, carried by the recorded row's AXPress

All runs here are on GitHub-hosted macOS: image 20261117.0516.1, Google Chrome 157.0.8103.79, macOS 26.7.2 (25G332). Each engine was built unmodified from an exact SHA. The kit is `probe/453-measure`: `scripts/probe-453/qual453.mjs`, the reader `qual-reader.mjs` and the AX tool `tool.swift`, through workflow `probe-453.yml`. Every table below comes from `scripts/probe-453/README.md` on that branch:
- §"#453 qual, counted on the final head" (`dd26228b`) for the qualification;
- §"#453 spike" for the AXPress measurement;
- §"Preview: fix d1e7d318" and the de0d119f section for the history.

## What changed

On main (`5580ac20`), #452 refuses a coordinate click with `appWindowOverPoint` when the point lies in one of the app's own windows over the observed one. That covers Chrome's address-bar suggestions, a site's permission prompt and an AppKit popover, even when the screenshot shows that window.

The fix (`fix/453-axpress`, head `a8307c6cb`; rulings 1071–1083) takes only that refusal, and only for a plain left click. It presses the row that the screenshot's record holds at the point, by its recorded handle, with AXPress. It posts no mouse event and does not activate the app. The row must:
- be the one the screenshot showed: alive, the same role, the same label parts, its frame within 2 pt after the window's shift, enabled, and read again just before the press;
- lie in the one overlay window that the screenshot listed over the point;
- have its whole recorded subtree, and its list's children, recorded.

Inside an AXList or AXGrid, the row is the list's direct child at the point. It is promoted only over inert or repeated nodes. Anything else keeps main's refusal. The click is confirmed only by the overlay's window leaving the screen; otherwise the answer is `clickUnconfirmed`. The meta is `overlayClick {window, by, kind, route: "action", confirmed, row}`, or, on a refusal, `{…, refused, row?, refusedBy {role, reason}}`.

**Three kinds are delivered:** Chrome's omnibox popup, its permission prompt and an AppKit popover. **Chromium's `<datalist>` list keeps main's refusal.** Its recorded row is a wrapper AXGroup over the options, so the fix refuses it (`actionableDescendant`; #483).

## Runs

Counted:
- Main `5580ac20`, the baseline: [45061006010](https://github.com/SSFSKIM/cua/actions/runs/45061006010). Kit 3326bebf, 263 rows; every cell except `omniremove`.
- Main's `omniremove` baseline: [45074375354](https://github.com/SSFSKIM/cua/actions/runs/45074375354), 18 rows. The artifact upload failed after measuring (`ENOTFOUND` on the runner), so its rows come from the run log: refused `appWindowOverPoint` 18/18, the suggestion kept 18/18, nothing navigated, and 0 changes to frontmost, key window and window order.
- Fix `a8307c6c`, smoke (reps 1): [45075185955](https://github.com/SSFSKIM/cua/actions/runs/45075185955).
- Fix `a8307c6c`, counted: [45075999203](https://github.com/SSFSKIM/cua/actions/runs/45075999203). Kit 58827e12, 281 rows, 54 min.
- #443's `decomove` and keep cells on `a8307c6c`, through `probe/443-qual`: [45081388473](https://github.com/SSFSKIM/cua/actions/runs/45081388473).

History (earlier heads, not counted toward the bar):
- The spike, main `5580ac20` with the kit's own bare AXPress: [45050307595](https://github.com/SSFSKIM/cua/actions/runs/45050307595).
- Preview of `e7e78424`: [45058436188](https://github.com/SSFSKIM/cua/actions/runs/45058436188).
- Counted run of `de0d119f`: [45066234145](https://github.com/SSFSKIM/cua/actions/runs/45066234145). This delivery failed, which led to rulings 1081–1083.
- Preview of `d1e7d318`: [45073546905](https://github.com/SSFSKIM/cua/actions/runs/45073546905).

## The bar (fix `a8307c6c`)

| Line | Result |
|---|---|
| Omnibox suggestion, delivered, confirmed and taken | **18/18** (6 each: shared-behind, shared-front, dedicated-behind) |
| AppKit popover swatch, delivered, confirmed, colour changed | **18/18** |
| Permission prompt Allow and Block, behind, delivered, confirmed and taken | **20/20** (Allow granted, Block `NotAllowedError`) |
| `<datalist>` option | **0/18**, refused `actionableDescendant` with nothing taken (#483) |
| Shared mode: frontmost app changed | **0/172**, transient and end |
| Shared mode: key or main window changed | **0/172** |
| Shared mode: browser window over the person's cover | transient **5/112**, end **1/112**. Four transient rows are #458's TextEdit font pop-up, as on main. The end row is a parity cell (main's element click by ID on a datalist row, route 3), not this route; see below. |
| Wrong row | **0/281** |
| Omnibox re-laid out by one more typed character | **60/60** refused `labelChanged`, nothing taken. The row at the point had changed in 60/60. |
| Remove suggestion button inside a row (`omniremove`) | **18/18** refused `actionableDescendant`, the suggestion kept, no navigation (main: `appWindowOverPoint` 18/18) |
| False ok (answered ok, not taken) | **0** |
| False confirmed | **0** |
| Refused but taken anyway | 0 |
| Reached the window beneath | 0/182 |
| Re-laid-out datalist | 18/18 refused `notOneOverlay` |
| Re-laid-out permission prompt | 12/12 refused `screenChangedSinceScreenshot`, as on main |
| Parity with main outside the route | **18/19** cells; the 19th is the end-raised row above |
| Observations | unchanged: the same result keys plus one timing, `screenshotWindowsListedMs` (p50 **0.6 ms**, p95 **1.7 ms**); wall clock p50 101 ms against 107, p95 436 against 430; nothing new in the model's view |
| #443's `decomove` | **40/40** refused `controlGone` (CfT 20, Electron 20); keep cells 40/40 kept and landed |

> **PLACEHOLDER (pin pending):** the one end-of-watch raise, `datalist-shared-behind-p-element-3`, is under a pin run. Replace this line with its result.
> Facts so far: main's route-3 element click by ID on a datalist row answered `activationFailed` after 1 s ("the app's window did not stay behind the frontmost window within 1 s"). Chrome's window stayed listed over the cover from 1064 ms to the end of the watch. Frontmost and the key window did not move. Main's counted run had 0/5 there.

Dedicated mode is recorded, not failed (ruling 1070). There, 10/82 rows raised Chrome's window, all of them main's own route-3 element click (p-element), as on main.

The rows pressed: the omnibox suggestion as its row `AXStaticText` 426×40, the popover as its swatch `AXButton` 13×13, and the permission prompt as its `AXButton`.

## The datalist, left on main's refusal

In every datalist row, the recorded chain at the point, from the overlay down, is:
- `AXList "Autofill"` (AXPress);
- its only child, a wrapper `AXGroup` the size of the list;
- `AXScrollArea`, then `AXGroup`, then an `AXGroup` with 5 children;
- the option's `AXStaticText "apricot"` (AXPress, 1 child);
- an inner `AXStaticText "apricot"` at the same frame.

Under ruling 1083 the row is the list's direct child: the wrapper. The option texts are actionable descendants of it, so the click is refused (`refusedBy` AXStaticText, row AXGroup 156×188).

The spike's bare AXPress on the outer option text took it 15/15. Reaching it needs a row rule that passes wrappers with exactly one child; that is #483.

## History of the route

- **The post route (parked, ruling 1067).** The first build, `fix/453-overlay-click`, posted a mouse down and up stamped with the overlay's own window number at the point. It never merged.
  - Three reviewer-high rounds found 7 P1 + 2 P2, then 7 P1 + 2 P2, then 4 P1 + 2 P2. Every finding was a wrong-row or false-ok path.
  - A point post made the engine prove which control was on top and that the recorded tree was complete, and AX states neither reliably.
  - Its qualification smoke also listed Chrome's window over the person's cover in 10/10 behind rows. The cause is unsettled.
- **The AXPress spike (ruling 1067), [45050307595](https://github.com/SSFSKIM/cua/actions/runs/45050307595).** The kit's bare AXPress on the recorded row's own element:
  - took it 105/105: omnibox, Web MIDI permission, TextEdit popover, and the datalist 15/15;
  - changed the frontmost app 0/105;
  - raised Chrome over the cover 0/75;
  - changed no key window outside the frontmost prompt;
  - pressed the wrong row 0 times;
  - took at most 13 ms at p50.
- **The rebuild (ruling 1071).** `fix/453-axpress` from main: the trigger is only main's `appWindowOverPoint` on a plain left click, and the target is the recorded row's handle with click-time identity checks.
- **Review rounds.**
  - Ruling 1072 (reviewer-high, 7 findings):
    - confirmation only by the window leaving;
    - one recorded overlay at the point, which added `screenshotWindowsListed` to the observation;
    - a whole recorded row;
    - each label part compared on its own;
    - the identity read again before the press;
    - a row role per kind;
    - the service meta.
  - The coordinator's ruling: a press that times out answers `clickUnconfirmed`.
  - A reviewer-medium round (3 findings):
    - the deadline and intervention checked after the last reads;
    - the cursor announced only after them;
    - the window list taken from the capture attempt that succeeded.
- **The failed delivery, `de0d119f` ([45066234145](https://github.com/SSFSKIM/cua/actions/runs/45066234145)).** It failed safe, with 0 wrong rows and 0 false oks, but only the permission prompt delivered (20/20):
  - the omnibox refused `notARow` 0/18, pressing the row's inner `AXGroup` 410×40;
  - the datalist answered `clickUnconfirmed` 0/18, pressing the option's inner text;
  - the popover refused `partlyRecorded` 0/18, because an absent `AXChildren` was read as unread.
- **Rulings 1081–1083.**
  - The row is the list's or grid's child on the recorded chain; the meta names the row and what a refusal stands on.
  - Coverage of the whole subtree follows the record's own parent edges.
  - A leaf is only an `AXChildren` slot that explicitly answered "unsupported" or "no value".
  - Promotion only over inert or repeated nodes.
  - The row must be the list's direct child and must hold the point.
  - The list's children must all be recorded.

  The `d1e7d318` preview ([45073546905](https://github.com/SSFSKIM/cua/actions/runs/45073546905)) delivered the omnibox and the popover 3/3 each, and recorded the datalist chain above.
- **Qualified (ruling 1084)** on `a8307c6c` for the three kinds; the counted runs are above.

## Runner fact: Location Services

GitHub's hosted macOS image runs with Location Services off. Chrome answers a geolocation prompt's Allow with the site's state `denied` and a "Location is turned off in system settings" bubble. On the first Allow of the post route's smoke (run 45045858141), Chrome came to the front 241 ms after the click. That raise came from Chrome's location request with the system service off, not from the click's delivery. The permission cells therefore use Web MIDI's prompt, which has no macOS layer.
