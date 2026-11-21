# #456: hosted macOS evidence for the element route's recheck under an own-app popup

Every run in this document happened on GitHub-hosted macOS, in kit `probe/456-qual` (workflow `probe-456.yml`, cut from `probe/337-measure`). The kit's README, `scripts/probe-456/README.md` at `fdf9c192`, holds every table, labelled with both heads. The engines were built unmodified: main `edbfbd23` and fix `6f1224e7`.

## The bug on main

The element route waits before it presses: the focus hold, #359's action-name wait, or a field route's pending-click wait. It then rechecks the point with the tree alone (`stalePointRecheck`). If a popup of the app's own opens during that wait, such as Chrome's omnibox suggestion list, the recheck sees nothing wrong. The press then lands on the page control under the popup while the popup is still up. #452's same-app overlay rule covered only the first check.

## The fix

The recheck uses the timed hit-test (`hitTestOutcome`) and #452's `guardedPointVerdict`, unchanged, at both the early check after the action-name wait and the final check after the focus hold. The field routes' pending-click wait also leads to a recheck. The gate's record adds up the costs of every check, and its `hitMs` is the last hit's. The refusal is #452's sentence. After the focus hold it reads "The app was activated in the background, but nothing was pressed."

## Results

Runs: smokes [44882947657](https://github.com/SSFSKIM/cua/actions/runs/44882947657), [44887358549](https://github.com/SSFSKIM/cua/actions/runs/44887358549) and [44898160974](https://github.com/SSFSKIM/cua/actions/runs/44898160974); full run [44917004422](https://github.com/SSFSKIM/cua/actions/runs/44917004422) (256 race rows and 40 parity rows); race top-up [44921009991](https://github.com/SSFSKIM/cua/actions/runs/44921009991) (72 rows).

In the race cell, Chrome sits behind TextEdit in shared mode. The omnibox is focused by ⌘L before the observation, and a second connection types into it during the click's focus hold. A second process, `racer.swift`, reads the window list every ~2 ms, so each row can be classed by when the popup showed against the wait.

| Cell | Main | Fix |
|---|---|---|
| popup during the wait, 84 rows each | in-window 18, late 54, no popup 12 | in-window 38, late 32, no popup 14 |
| in-window rows | **pressed under the popup 18/18** (kept `noHit`, popup still up) | **refused 37/38**: `appWindowOverPoint`, `rechecked: true`, `by: axHit`, `overWindow` = the popup; nothing pressed |
| control, no keys | pressed 8/8 | pressed 8/8 |
| parity, a plain button | pressed 8/8 | pressed 8/8 |
| parity, the status bubble and hover card, inside and outside | landed 20/20 | landed 20/20 |

Nothing main kept was refused by the fix. The 38 in-window fix rows include 9 where the recheck's own hit saw the popup just before the window list showed it.

**Dropped as unreliable:** the field route's pending-click wait cell. That wait lasts 50–250 ms, while the popup shows 150–450 ms after ⌘L. In 144 attempts, main never landed in the window; the fix had 6 in-window rows, all refused, with the field not focused. The fake tests cover this path.

## Residuals (#464; main presses in every such case)

- **1/38: the popup was still at alpha 0 at the recheck.** The hit took 267 ms. The popup was listed at 219 ms and shown at 380 ms, and the press went out at 408 ms. #452's covering check requires alpha above 0, so the click was kept.
- **3 field rows: the popup opened after the recheck.** It opened 2–28 ms before the focus write, during 100–200 ms of caret reads that run between the recheck and the write. Main wrote under the popup in 1 such row.
