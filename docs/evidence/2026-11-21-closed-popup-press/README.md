# #458: hosted macOS evidence for a click on a closed pop-up button

Every run in this document happened on GitHub-hosted macOS (image 20261117.0516.1, Chrome 157), with the engines built unmodified from exact SHAs. The kits are `probe/458-measure`, `probe/458-restore` and `probe/458-qual`. Every table is in `scripts/probe-337/README.md` on `probe/458-qual` at `44a91ee1`, in the sections "#458", "#458's restore" and "#458 qual" 1, 2 and 3, each labelled with its head.

## The bug on main

The test case is a coordinate click on a closed pop-up button (TextEdit's font menu, Script Editor's language menu, Chrome's `<select>`) in an app behind the person's window.
- In shared mode the click answers ok on route 3. The menu opens 110–260 ms in, and route 3's own hold-and-restore, which puts the person's window back on top, closes it again. No menu is showing at 1.8 s (10/10). A 10 ms window-list sampler showed every open and close.
- In dedicated mode the click answers ok and nothing stays open.
- TextEdit's font-size combo box answers ok and opens nothing.

Measurement run: [44877626226](https://github.com/SSFSKIM/cua/actions/runs/44877626226), 475 rows.

## The fix

A coordinate click on a closed pop-up button is carried by the control's own AXPress, in every mode, instead of being posted. That applies when the app's hit-test and the observation agree on an enabled, closed AXPopUpButton, including Chrome's closed `<select>` (the recorded option under it, at the point). It also applies to a combo box's arrow (the AXButton child at its trailing edge). The press goes through the element route, so no pointer-delivery guard runs to close the menu. #282's route for a page behind takes the same check.

- **Confirmed** when a new window of the app's own opens at the control within 1.5 s. That is a layer-101 menu for pop-ups, and a window above the app's document for the combo's list.
- **`clickUnconfirmed`** when no such window opens.
- **`backgroundClickRefused`** for a combo box whose arrow has no action, while the app isn't frontmost.
- **The restore (ruling 1005):** opening a menu of a background app raises the app's window above the person's windows. Once the open is confirmed, the person's focused window is raised back over it with one AXRaise inside a screen-update hold. That is route 3's existing repair. No other window is raised; the person's other covered windows are counted as `restored.leftCovered`. The restore stops on the person's input, has a 500 ms cutoff, and raises nothing if the focused window can't be identified by its AX window number.

## Results

Main `aebd0eb4` ([44936682259](https://github.com/SSFSKIM/cua/actions/runs/44936682259)) against the fix. The fix runs were [44941888406](https://github.com/SSFSKIM/cua/actions/runs/44941888406) on `67cf8b26` for delivery and parity, and [44949635594](https://github.com/SSFSKIM/cua/actions/runs/44949635594) on the final restore `e7fc289a`.

| Cell | Main | Fix |
|---|---|---|
| font and language, behind | ok, opened 0/40 | confirmed, opened and item taken 40/40 |
| `<select>`, behind | opened 10/20 (#282, shared only) | opened 20/20, item taken 20/20 |
| combo arrow, behind | opened 0/20 | confirmed 20/20 |
| all four, frontmost | opened 40/40 | confirmed 40/40 |
| parity: a plain button, an open menu's item (#454), the combo's text | — | same answer and route as main, 20/20 |

False confirmed 0, false unconfirmed 0. Chrome's `<select>` items answer `clickUnconfirmed` after the pick, as on main (#461).

**The restore on `e7fc289a`** (30 rows each; key-window watch on Finder's AXFocusedWindow and AXMainWindow):

| Layout | Focus off F1, transient / end | F1 back above the app | Left covered | Activation | Cover p50 / max |
|---|---|---|---|---|---|
| a: F1 > F2 > app, shared-behind | 0/30 / 0/30 | 30/30 | 1 (F2) | none | 30–44 / 100 ms |
| a, dedicated-behind | 0/30 / 0/30 | 30/30 | 1 | none | 27–51 / 84 ms |
| c: F1 > F2 > Calculator > F3 > app | 0/30 / 0/30 | 30/30 | 3 (F2, Calculator, F3) | none | 32–47 / 77 ms |

The watch asked for 5 ms samples, but the reads made its real interval about 22 ms, so a focus change shorter than about 20 ms could pass unseen.

## Limits

- **The person's other windows stay covered** by the app's window after a background open (a: 1 window, 30/30; c: 3 windows, 30/30). That includes a third app's window that was above the app's.
- **A full-order restore was tried and dropped.** Raising each of the person's windows once, back to front with the focused window last, put the whole order back in layouts a and d. But it moved Finder's focused window to another window for 13–49 ms: 38/80 behind rows on `67cf8b26` and 13/30 on `2bd74c6e`. AXRaise also can't put a third app's window above the active app's (b and c, 0/20). That work is #466.
- **The 1.5 s wait on an unconfirmed answer.** A press accepted with no menu (a `<select>` whose mousedown the page cancels) answers `clickUnconfirmed` about 1.57 s later than main at p50, 1.73 s at worst.
- **Another session's repair watch** can close a just-opened menu (a rare two-session race, in `tech-debt-tracker.md`).
- **Not measured:** pixels or flashing. The restore always runs inside the screen-update hold.
