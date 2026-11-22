# #452 and #337: hosted macOS evidence for a click on the app's own window over the observed one

Every run in this document happened only on GitHub-hosted macOS, in kit `probe/337-measure` (workflow `probe-337.yml`). The kit's README, `scripts/probe-337/README.md` at `50e267c5`, holds every table, each labelled with its head. Engines were built unmodified from exact SHAs. Main is `04691839` (`d44a4fe1` for the first measurement), and the final fix is `bbe42e2c`. There are 5 rows per head, cell, mode and side; each row clicks either an item of the overlay (inside) or a control of the observed window outside it (outside).

## The bug on main

Chrome draws its omnibox suggestion list as a separate layer-0 window above the browser window. The engine stamps each pointer post with the observed window's id and a point local to it (`stampWindow`, Mouse.swift), so Chrome routes a click on a suggestion row to the browser window beneath. The application's AX hit-test lands in the popup's window, which `windowHit` turned into "no hit". The suggestion rows are not in the observation tree (0 of 19 rows), so the model can't reach them by element.

| Mode | Main, click on a suggestion row |
|---|---|
| shared, Chrome behind TextEdit | refused `backgroundClickRefused` 7/7, with a sentence blaming the page (#337) |
| shared, Chrome frontmost | answered ok, landed on the page under the popup 6/6, suggestion taken 0/6 (#452) |
| dedicated, Chrome behind | the same, 6/6 (#452) |

Runs: [44797144792](https://github.com/SSFSKIM/cua/actions/runs/44797144792) and [44799499336](https://github.com/SSFSKIM/cua/actions/runs/44799499336).

## The fix

Before anything is posted, in every mode, the guard refuses `appWindowOverPoint` in two cases:

- **(a) `by: "axHit"`:** the app's AX hit at the point lies in another of the app's windows, and that window still covers the point in the on-screen window list. It must be listed with alpha above 0, its bounds must hold the point, and it must be in front of the observed window if that window is listed. Any layer counts.
- **(b) `by: "popover"`:** the hit lies under an AXPopover in the observed window's own tree, and a same-app, same-layer, visible window is over the point.

In every other case main's verdict stands. That covers a failed hit, an unread one, one past the 500 ms signal deadline, and a hit in an ordinary element of the observed window. The refusal sentence names the app's own window and the way through:

> Google Chrome has a window of its own over the one the screenshot showed at this point (a suggestion list, popup or panel), and a click here would reach the window under it, not what the screenshot shows. Nothing was sent. Use keys instead (the arrow keys and Return for a suggestion list, Escape to close it), or call getScreenshot for a new screenshot and click an element its tree holds.

## Results, main against the final head `bbe42e2c`

Main: [44822312301](https://github.com/SSFSKIM/cua/actions/runs/44822312301), [44805302760](https://github.com/SSFSKIM/cua/actions/runs/44805302760) and [44816112944](https://github.com/SSFSKIM/cua/actions/runs/44816112944). Fix: [44837693749](https://github.com/SSFSKIM/cua/actions/runs/44837693749), 330 rows on the same runner image and Chrome 157 as main's batch 3.

| Cell (inside click) | Main | Fix |
|---|---|---|
| omnibox popup, shared behind | refused, blaming the page, 5/5 | refused by axHit 5/5 |
| omnibox popup, shared frontmost and dedicated | ok, landed on the page beneath, 9/9 | refused by axHit 9/9 |
| `<datalist>` popup (layer 999), shared frontmost | ok, landed on the page beneath, 5/5 | refused by axHit 5/5 |
| geolocation permission bubble, shared behind | refused `backgroundClickRefused` 3/3 | refused by axHit 1/1 |
| permission bubble, shared frontmost (the bubble is itself the observed window) | item taken 1/1 | item taken 4/4 |
| TextEdit colour-well popover, all modes | ok, landed in the text beneath, 15/15 | refused by popover 15/15 |
| Chrome status bubble (click-through), shared frontmost | landed on the control under it 5/5 | landed 5/5 |
| tab hover card (click-through), shared frontmost | landed on the control under it 5/5 | landed 5/5 |
| `<select>` and TextEdit font menus (layer 101), all modes | ok, item not taken, 30/30 | the same (#454) |
| save panel (itself the observed window), shared frontmost | ok, Cancel not taken, 5/5 | the same |
| two windows of the app (Chrome; TextEdit), all modes | refused `noScreenshotForCoordinates` 60/60 | the same |

**Outside clicks land on both heads in every cell that has an outside control.** On a native menu, an outside click only closes the menu, on both heads.

**Earlier heads:**

- The first head, `5f85ffcc`, used the window list alone. It refused both click-through cells, status bubble and hover card (10 of 10), and missed the datalist.
- `023a3bee` refused the save panel, because the AX hit was an AXSheet whose parent is the document window. The final head places a hit under an observed sheet in that window.

## Cost

| Lane | Head | `stalePoint.ms` p50 / p95 | `hitMs` p50 / p95 |
|---|---|---|---|
| Chrome | main | 1.67 / 7.91 | not recorded |
| Chrome | fix | 1.72 / 5.22 | 2.53 / 4.93 |
| TextEdit | main | 1.25 / 3.33 | not recorded |
| TextEdit | fix | 1.00 / 2.07 | 0.81 / 1.89 |

`hitMs` times main's own hit-test, which main also runs. It is not counted inside `stalePoint.ms`.

## Limits

- **Menus answer a false ok.** A click on a layer-101 pop-up menu item (Chrome's `<select>`, TextEdit's font menu) answers ok, but the item isn't taken. This happens on both heads and is tracked as #454.
- **One cell couldn't be built.** The case where the observed window sits behind another window of the same app can't be set up: writing a back window as the app's AXFocusedWindow does nothing in Chrome or TextEdit. Raising the other window after the observation makes both heads refuse `noScreenshotForCoordinates` before any overlay rule.
- **The fix refuses rather than delivers.** Delivering the click to the overlay's own window is #453.
- **A popup that opens during the element route's post-wait recheck is pressed under.** This is the same as main, and is recorded in `tech-debt-tracker.md`.
- **Thin rows.** The datalist, status bubble and hover card appear only with Chrome frontmost. Permission prompts appeared in 1 to 4 of 5 rows.
