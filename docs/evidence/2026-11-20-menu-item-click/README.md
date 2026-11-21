# #454: hosted macOS evidence for a coordinate click on an open menu's item

Every run in this document happened only on GitHub-hosted macOS, in kit `probe/454-measure` (workflow `probe-454.yml`). The kit's README, `scripts/probe-337/README.md` at `5c706331` (the #454 sections), holds every table, each labelled with its head. Engines were built unmodified. Main is `fdd285dd`, and the PR head is `cf916249`. There are 5 rows per head, cell and mode, and three modes: shared behind, shared frontmost and dedicated.

## The bug on main

A coordinate click on an item of an open pop-up menu was posted and answered ok. The menu closed, and the item was taken 0 times out of 45: Chrome `<select>`, TextEdit's font pop-up and Script Editor's language pop-up, in all three modes ([run 44848863214](https://github.com/SSFSKIM/cua/actions/runs/44848863214)).

Every menu is a layer-101 window of the app's own, over the point. The observation lists the item as an AXMenuItem with AXPress/AXPick (150 of 150 rows), and the app's hit-test answers that item (315 of 315).

Kit-side posts show why a pointer click can't take the item. The menu follows the real cursor and needs a mouse move onto the item. A post stamped to the menu's own window took it 0 times out of 30. The engine never moves the person's cursor.

On main, two other routes took the item 45 of 45 each: the element click on the listed item, and the keys (arrows, then Return).

## The fix

When the app's hit-test and the observation agree on an enabled AXMenuItem of an open native menu, the engine performs that item's AXPick (or its AXPress) instead of posting. This holds in every mode, and no pointer event is ever posted.

The effect is then confirmed. The menu must close, and the opener's selection must move from another value to the item. Otherwise the answer is `clickUnconfirmed`; the return value of the AX action is never taken as proof.

The engine refuses with `appWindowOverPoint`, sending nothing, in these cases:
- the item disagrees with the record (`notRecorded`, `notHit`, `relabelled`);
- the item is disabled or has no action;
- the accessibility record holds no item of the menu at the point (`unobserved`, which covers menu-bar menus and submenus).

## Results, main against the PR head `cf916249`

The fix ran in [run 44869514420](https://github.com/SSFSKIM/cua/actions/runs/44869514420), 300 rows, fix-only against main's data. Main's data comes from runs 44848863214, 44856543463 and 44863373571. The earlier head `74c99b92` ([44866341695](https://github.com/SSFSKIM/cua/actions/runs/44866341695)) matched cell for cell.

| Cell (inside click, all three modes) | Main | Fix |
|---|---|---|
| TextEdit font pop-up | ok, item not taken, 15/15 | ok, confirmed, taken 15/15 |
| Script Editor language pop-up | ok, item not taken, 15/15 | ok, confirmed, taken 15/15 |
| Chrome `<select>`, another option | ok, item not taken, 15/15 | `clickUnconfirmed` (`value: "unread"`), taken 15/15 (#461) |
| TextEdit context menu, Copy | ok, item not taken, 15/15 | `clickUnconfirmed`, taken 15/15: no opener to read |
| Already-selected item (TextEdit, Script Editor, Chrome) | ok, menu closed, 45/45 | `clickUnconfirmed`, menu closed, selection unchanged, 45/45 |
| TextEdit Edit menu from the menu bar, and the Format › Font submenu | ok, item not taken, 30/30 | refused `unobserved`, nothing sent, 30/30 |
| Chrome page context menu, Reload | refused `screenChangedSinceScreenshot` 15/15 | the same, 15/15 (main's path: its items hang under the web area) |

**Outside clicks only close the menu on both heads, 150/150 each.**

**The engine's screenshot doesn't show menu-bar menus or submenus,** and the observation lists none of their items, so the refusal there is honest.

**Two of the qualification's findings were fixed before this head:**
- `c83ed846` refused Chrome's already-selected option and gave a wrong sentence for menu-bar menus.
- `74c99b92` and `cf916249` fixed both.

## Cost

`menuItemClick.ms`, p50/p95:
- **Confirmed:** about 413–431 / 485–488.
- **Unconfirmed:** about 1017–1032 / 1051–1069. The confirmation polls for up to 1 s.

`stalePoint.ms` and `hitMs` stay within about 0.2 ms of main at p50. `stalePoint.ms` p95 had two outliers: 13.95 ms on `<select>` and 6.41 ms on the TextEdit context menu.

## Limits

- **#461:** Chrome's `<select>` item is taken but answers unconfirmed, because its parentless menu isn't tied to its control.
- **An already-selected item answers unconfirmed,** where main answered ok. The selection is unchanged, which is the state the model asked for. Nothing independent shows the item was taken, so the answer is not upgraded to ok.
- **Context menus answer unconfirmed:** there is no opener to read.
- **Unconfirmed answers cost about 1 s** more than main's false ok.
- **Ways out of a menu-bar menu or submenu with the app behind:** keys don't take the item (20/20 stayed up), so the refusal points only to the element route. That route was not part of this kit.
- **#458:** a background click on a *closed* pop-up button answers ok and opens nothing. It is out of scope here.
- **Runner images differ:** the `cf916249` run had Chrome 156 and image 20261102; main ran on Chrome 157 and image 20261117.
