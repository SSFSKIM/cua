## Sitting C (full): the native matrix, three runs a side, with the Korean and Unicode rows, the concurrent-use and intervention cells, Acceptance 3's keystroke witness and the window-order oracle; #212's save-sheet cell

Proves: Acceptance 3, 4 and 7.

| step | kind | status | exit | time | sitting so far | job so far | note |
|---|---|---|---|---|---|---|---|
| jobs-check | verdict | PASS | 0 | 0 s | 0 min | 4 min | |
| combine | verdict | PASS | 0 | 0 s | 0 min | 4 min | |
| summary | verdict | PASS | 1 | 0 s | 0 min | 4 min | written; exit 1 is its verdict, which the judge step gives |
| compare | verdict | FAIL | 1 | 0 s | 0 min | 4 min | |
| save-sheet | verdict | PASS | 0 | 0 s | 0 min | 4 min | |
| key-route | diagnostic | INFO | 0 | 120 s | 2 min | 6 min | a diagnostic, recorded: vendor: Escape posted to pid 7505 by pid 8838, seen by the panelService tap, the panel closed by it; cua: Escape posted to pid 11259 by pid 12017, seen by the panelService tap, the panel closed by it |

**FAIL** (exit 1): 4 PASS, 1 FAIL, 0 NO VERDICT, 0 OWNER, 1 INFO, 0 SKIP, 0 PENDING.

Wall time: the sitting 2 min so far, the job 6 min of its 360.

## Per-cell counts

Per cell: the runs on each side every sample of which has a verdict (of the runs that hold the cell), each run's verdict samples of its samples, the side's samples NO VERDICT `alert` (an alert in front or key, or a cell the alert guard refused unsent, ruling 1154) and NO VERDICT `keyWindow` (a click or key cell refused unsent because its scene's app did not hold the scene window as its key window, ruling 1169's addition), its key cells guarded with their key reading not taken (`key cells guarded unread`: unguarded against the alert holding the key) and its click or key cells sent with their key window unread (`cells key window unread`); a harness cell on its own line. A sample without a verdict is never a pass and never a fail. Complete pairs are the judge's (three qualify a cell); `-` for a cell judged on its own.

| cell | source | vendor: complete runs | vendor: verdicts by run | vendor: NO VERDICT alert | vendor: NO VERDICT keyWindow | vendor: key cells guarded unread | vendor: cells key window unread | cua: complete runs | cua: verdicts by run | cua: NO VERDICT alert | cua: NO VERDICT keyWindow | cua: key cells guarded unread | cua: cells key window unread | complete pairs |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| method textedit/frontmost/getAXState.tree | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method textedit/frontmost/listApps.running | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method textedit/frontmost/click.element | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method textedit/frontmost/click.control | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method textedit/frontmost/typeText.replace | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method textedit/frontmost/pressKey.selectAll | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method textedit/frontmost/selectText.line | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method textedit/frontmost/paste.replace | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method textedit/frontmost/setValue.document | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method textedit/frontmost/scroll.down | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method textedit/frontmost/performSecondaryAction.down | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method textedit/frontmost/drag.select | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method textedit/frontmost/selectText.notText | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method textedit/frontmost/setValue.notSettable | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method textedit/frontmost/click.invalidIndex | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method openPanel/frontmost/getAXState.panel | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method openPanel/frontmost/pressKey.escape | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method openPanel/frontmost/click.cancel | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method savePanel/frontmost/pressKey.escape | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method savePanel/frontmost/typeText.name | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method savePanel/frontmost/setValue.name | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method finder/frontmost/getAXState.tree | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method finder/frontmost/listApps.running | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method finder/frontmost/click.row | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method finder/frontmost/pressKey.down | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method finder/frontmost/typeText.typeSelect | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method finder/frontmost/selectText.notText | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method finder/frontmost/scroll.down | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method finder/frontmost/performSecondaryAction.down | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method chrome/frontmost/getAXState.tree | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method chrome/frontmost/listApps.running | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method chrome/frontmost/click.checkbox | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method chrome/frontmost/typeText.replace | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method chrome/frontmost/pressKey.tab | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method chrome/frontmost/setValue.name | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method chrome/frontmost/selectText.name | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method chrome/frontmost/paste.replace | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method chrome/frontmost/click.apply | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method chrome/frontmost/drag.select | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method chrome/frontmost/setValue.notSettable | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method chrome/frontmost/selectText.notText | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method chrome/frontmost/click.pointerdown | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method electron/frontmost/getAXState.tree | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method electron/frontmost/listApps.running | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method electron/frontmost/click.button | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method electron/frontmost/typeText.replace | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method electron/frontmost/pressKey.tab | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method electron/frontmost/setValue.text | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method electron/frontmost/selectText.text | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method electron/frontmost/paste.replace | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method electron/frontmost/drag.select | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method electron/frontmost/setValue.notSettable | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method electron/frontmost/click.selection | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method electron/frontmost/click.point | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method electron/frontmost/click.pointerdown | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method textedit/background/getAXState.tree@finder | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method textedit/background/listApps.running@finder | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method textedit/background/click.element@finder | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method textedit/background/click.control@finder | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method textedit/background/typeText.replace@finder | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method textedit/background/pressKey.selectAll@finder | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method textedit/background/selectText.line@finder | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method textedit/background/paste.replace@finder | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method textedit/background/setValue.document@finder | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method textedit/background/scroll.down@finder | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method textedit/background/performSecondaryAction.down@finder | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method textedit/background/drag.select@finder | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method textedit/background/selectText.notText@finder | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method textedit/background/setValue.notSettable@finder | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method textedit/background/click.invalidIndex@finder | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method finder/background/getAXState.tree@textedit | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method finder/background/listApps.running@textedit | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method finder/background/click.row@textedit | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method finder/background/pressKey.down@textedit | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method finder/background/typeText.typeSelect@textedit | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method finder/background/selectText.notText@textedit | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method finder/background/scroll.down@textedit | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method finder/background/performSecondaryAction.down@textedit | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method chrome/background/getAXState.tree@textedit | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method chrome/background/listApps.running@textedit | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method chrome/background/click.checkbox@textedit | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method chrome/background/typeText.replace@textedit | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method chrome/background/pressKey.tab@textedit | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method chrome/background/setValue.name@textedit | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method chrome/background/selectText.name@textedit | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method chrome/background/paste.replace@textedit | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method chrome/background/click.apply@textedit | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method chrome/background/drag.select@textedit | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method chrome/background/setValue.notSettable@textedit | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method chrome/background/selectText.notText@textedit | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method textedit/background/getAXState.tree@chrome | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method textedit/background/listApps.running@chrome | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method textedit/background/click.element@chrome | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method textedit/background/click.control@chrome | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method textedit/background/typeText.replace@chrome | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method textedit/background/pressKey.selectAll@chrome | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method textedit/background/selectText.line@chrome | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method textedit/background/paste.replace@chrome | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method textedit/background/setValue.document@chrome | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method textedit/background/scroll.down@chrome | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method textedit/background/performSecondaryAction.down@chrome | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method textedit/background/drag.select@chrome | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method textedit/background/selectText.notText@chrome | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method textedit/background/setValue.notSettable@chrome | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method textedit/background/click.invalidIndex@chrome | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method electron/background/getAXState.tree@finder | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method electron/background/listApps.running@finder | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method electron/background/click.button@finder | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method electron/background/typeText.replace@finder | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method electron/background/pressKey.tab@finder | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method electron/background/setValue.text@finder | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method electron/background/selectText.text@finder | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method electron/background/paste.replace@finder | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method electron/background/drag.select@finder | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method electron/background/setValue.notSettable@finder | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method finder/background/getAXState.tree@electron | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method finder/background/listApps.running@electron | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method finder/background/click.row@electron | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method finder/background/pressKey.down@electron | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method finder/background/typeText.typeSelect@electron | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method finder/background/selectText.notText@electron | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method finder/background/scroll.down@electron | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method finder/background/performSecondaryAction.down@electron | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method openPanel/background/getAXState.panel@finder | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method openPanel/background/click.cancel@finder | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| method windowless/background/getAXState.noWindow@finder | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| speed textedit/getAXState | matrix | 3 of 3 | 1: 10/10, 2: 10/10, 3: 10/10 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 10/10, 2: 10/10, 3: 10/10 | 0 | 0 | 0 | 0 | 3 |
| speed textedit/getScreenshot | matrix | 3 of 3 | 1: 10/10, 2: 10/10, 3: 10/10 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 10/10, 2: 10/10, 3: 10/10 | 0 | 0 | 0 | 0 | 3 |
| speed textedit/listApps | matrix | 3 of 3 | 1: 10/10, 2: 10/10, 3: 10/10 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 10/10, 2: 10/10, 3: 10/10 | 0 | 0 | 0 | 0 | 3 |
| speed finder/getAXState | matrix | 3 of 3 | 1: 10/10, 2: 10/10, 3: 10/10 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 10/10, 2: 10/10, 3: 10/10 | 0 | 0 | 0 | 0 | 3 |
| speed finder/getScreenshot | matrix | 3 of 3 | 1: 10/10, 2: 10/10, 3: 10/10 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 10/10, 2: 10/10, 3: 10/10 | 0 | 0 | 0 | 0 | 3 |
| speed finder/listApps | matrix | 3 of 3 | 1: 10/10, 2: 10/10, 3: 10/10 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 10/10, 2: 10/10, 3: 10/10 | 0 | 0 | 0 | 0 | 3 |
| speed chrome/getAXState | matrix | 3 of 3 | 1: 10/10, 2: 10/10, 3: 10/10 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 10/10, 2: 10/10, 3: 10/10 | 0 | 0 | 0 | 0 | 3 |
| speed chrome/getScreenshot | matrix | 3 of 3 | 1: 10/10, 2: 10/10, 3: 10/10 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 10/10, 2: 10/10, 3: 10/10 | 0 | 0 | 0 | 0 | 3 |
| speed chrome/listApps | matrix | 3 of 3 | 1: 10/10, 2: 10/10, 3: 10/10 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 10/10, 2: 10/10, 3: 10/10 | 0 | 0 | 0 | 0 | 3 |
| speed electron/getAXState | matrix | 3 of 3 | 1: 10/10, 2: 10/10, 3: 10/10 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 10/10, 2: 10/10, 3: 10/10 | 0 | 0 | 0 | 0 | 3 |
| speed electron/getScreenshot | matrix | 3 of 3 | 1: 10/10, 2: 10/10, 3: 10/10 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 10/10, 2: 10/10, 3: 10/10 | 0 | 0 | 0 | 0 | 3 |
| speed electron/listApps | matrix | 3 of 3 | 1: 10/10, 2: 10/10, 3: 10/10 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 10/10, 2: 10/10, 3: 10/10 | 0 | 0 | 0 | 0 | 3 |
| speed textedit/method.getAXState.tree | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| speed textedit/method.listApps.running | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| speed textedit/method.click.element | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| speed textedit/method.click.control | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| speed textedit/method.typeText.replace | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| speed textedit/method.pressKey.selectAll | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| speed textedit/method.selectText.line | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| speed textedit/method.paste.replace | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| speed textedit/method.setValue.document | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| speed textedit/method.scroll.down | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| speed textedit/method.performSecondaryAction.down | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| speed textedit/method.drag.select | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| speed textedit/method.selectText.notText | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| speed textedit/method.setValue.notSettable | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| speed textedit/method.click.invalidIndex | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| speed textedit/method.panel.getAXState.panel | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| speed textedit/method.panel.pressKey.escape | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| speed textedit/method.panel.click.cancel | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| speed textedit/method.savePanel.pressKey.escape | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| speed textedit/method.savePanel.setValue.name | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| speed finder/method.getAXState.tree | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| speed finder/method.listApps.running | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| speed finder/method.click.row | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| speed finder/method.pressKey.down | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| speed finder/method.typeText.typeSelect | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| speed finder/method.selectText.notText | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| speed finder/method.scroll.down | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| speed finder/method.performSecondaryAction.down | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| speed chrome/method.getAXState.tree | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| speed chrome/method.listApps.running | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| speed chrome/method.click.checkbox | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| speed chrome/method.typeText.replace | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| speed chrome/method.pressKey.tab | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| speed chrome/method.setValue.name | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| speed chrome/method.selectText.name | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| speed chrome/method.paste.replace | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| speed chrome/method.click.apply | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| speed chrome/method.drag.select | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| speed chrome/method.setValue.notSettable | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| speed chrome/method.selectText.notText | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| speed chrome/method.click.pointerdown | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| speed electron/method.getAXState.tree | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| speed electron/method.listApps.running | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| speed electron/method.click.button | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| speed electron/method.typeText.replace | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| speed electron/method.pressKey.tab | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| speed electron/method.setValue.text | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| speed electron/method.selectText.text | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| speed electron/method.paste.replace | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| speed electron/method.drag.select | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| speed electron/method.setValue.notSettable | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| speed electron/method.click.selection | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| speed electron/method.click.point | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| speed electron/method.click.pointerdown | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| finding textedit/target.document | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| finding textedit/target.window | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| finding textedit/target.styles | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| finding textedit/target.alignment | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| finding textedit/target.spacing | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| finding textedit/target.lists | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| finding textedit/target.close | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| finding textedit/target.minimize | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| finding textedit/target.fullScreen | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| finding textedit/target.scrollBar | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| finding textedit/lines | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| finding textedit/ids | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| finding finder/target.file001 | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| finding finder/target.file002 | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| finding finder/target.file050 | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| finding finder/target.file100 | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| finding finder/target.file125 | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| finding finder/target.file150 | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| finding finder/target.file199 | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| finding finder/target.file200 | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| finding finder/target.window | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| finding finder/target.close | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| finding finder/lines | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| finding finder/ids | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| finding chrome/target.heading | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| finding chrome/target.notes | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| finding chrome/target.name | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| finding chrome/target.apply | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| finding chrome/target.option | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| finding chrome/target.modeA | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| finding chrome/target.modeB | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| finding chrome/target.choice | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| finding chrome/target.section | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| finding chrome/target.status | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| finding chrome/lines | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| finding chrome/ids | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| finding electron/target.text | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| finding electron/target.list | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| finding electron/target.optionAlpha | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| finding electron/target.optionBravo | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| finding electron/target.optionCharlie | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| finding electron/target.optionDelta | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| finding electron/target.optionEcho | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| finding electron/target.optionFoxtrot | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| finding electron/target.button | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| finding electron/target.status | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| finding electron/lines | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| finding electron/ids | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| launch electron/background/launch@finder | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| concurrent finder/concurrent@textedit | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| concurrent chrome/concurrent@textedit | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 3 (Accessibility lists no window at the scene window's bounds, and shows it as no sheet of the window behind it 3) | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 3 (Accessibility lists no window at the scene window's bounds, and shows it as no sheet of the window behind it 3) | 3 |
| concurrent textedit/concurrent.sheet@electron | matrix | 0 of 3 | 1: 0/1, 2: 0/1, 3: 0/1 | 0 | 0 | 0 | 0 | 0 of 3 | 1: 0/1, 2: 0/1, 3: 0/1 | 0 | 0 | 0 | 0 | 0 |
| intervention textedit/intervention.fires | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 2 (Accessibility lists no window at the scene window's bounds, and shows it as no sheet of the window behind it 2) | 3 |
| intervention textedit/intervention.preAction | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode textedit/latin/typeText.latin | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 3 (Accessibility lists no window at the scene window's bounds, and shows it as no sheet of the window behind it 3) | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 3 (Accessibility lists no window at the scene window's bounds, and shows it as no sheet of the window behind it 3) | 3 |
| unicode textedit/latin/paste.latin | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode textedit/latin/typeText.hangul | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode textedit/latin/paste.hangul | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode textedit/latin/typeText.jamo | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode textedit/latin/paste.jamo | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode textedit/latin/typeText.mixed | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode textedit/latin/paste.mixed | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode textedit/latin/typeText.emoji | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode textedit/latin/paste.emoji | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode textedit/latin/typeText.combining | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode textedit/latin/paste.combining | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 3 (Accessibility lists no window at the scene window's bounds, and shows it as no sheet of the window behind it 3) | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 3 (Accessibility lists no window at the scene window's bounds, and shows it as no sheet of the window behind it 3) | 3 |
| unicode textedit/latin/typeText.kanji | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode textedit/latin/paste.kanji | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode textedit/latin/typeText.lines | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode textedit/latin/paste.lines | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode textedit/latin/typeText.acceptance4 | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode textedit/latin/paste.acceptance4 | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode textedit/latin/pressKey.rk | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode chrome/latin/typeText.latin | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode chrome/latin/paste.latin | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode chrome/latin/typeText.hangul | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode chrome/latin/paste.hangul | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode chrome/latin/typeText.jamo | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode chrome/latin/paste.jamo | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode chrome/latin/typeText.mixed | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode chrome/latin/paste.mixed | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode chrome/latin/typeText.emoji | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode chrome/latin/paste.emoji | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode chrome/latin/typeText.combining | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode chrome/latin/paste.combining | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode chrome/latin/typeText.kanji | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode chrome/latin/paste.kanji | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode chrome/latin/typeText.lines | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode chrome/latin/paste.lines | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode chrome/latin/typeText.acceptance4 | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode chrome/latin/paste.acceptance4 | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode chrome/latin/pressKey.rk | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode electron/latin/typeText.latin | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode electron/latin/paste.latin | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode electron/latin/typeText.hangul | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode electron/latin/paste.hangul | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode electron/latin/typeText.jamo | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode electron/latin/paste.jamo | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode electron/latin/typeText.mixed | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode electron/latin/paste.mixed | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode electron/latin/typeText.emoji | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode electron/latin/paste.emoji | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode electron/latin/typeText.combining | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode electron/latin/paste.combining | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode electron/latin/typeText.kanji | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode electron/latin/paste.kanji | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode electron/latin/typeText.lines | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode electron/latin/paste.lines | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode electron/latin/typeText.acceptance4 | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode electron/latin/paste.acceptance4 | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode electron/latin/pressKey.rk | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode textedit/midSwitch/typeText.long | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 2 of 3 | 1: 1/1, 2: 1/1, 3: 0/1 | 0 | 0 | 0 | 0 | 2 |
| unicode chrome/midSwitch/typeText.long | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode electron/midSwitch/typeText.long | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode textedit/korean/typeText.latin | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode textedit/korean/paste.latin | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode textedit/korean/typeText.hangul | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode textedit/korean/paste.hangul | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode textedit/korean/typeText.jamo | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode textedit/korean/paste.jamo | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode textedit/korean/typeText.mixed | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode textedit/korean/paste.mixed | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode textedit/korean/typeText.emoji | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode textedit/korean/paste.emoji | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode textedit/korean/typeText.combining | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode textedit/korean/paste.combining | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 3 (Accessibility lists no window at the scene window's bounds, and shows it as no sheet of the window behind it 3) | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode textedit/korean/typeText.kanji | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode textedit/korean/paste.kanji | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode textedit/korean/typeText.lines | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode textedit/korean/paste.lines | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode textedit/korean/typeText.acceptance4 | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode textedit/korean/paste.acceptance4 | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode textedit/korean/pressKey.rk | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode chrome/korean/typeText.latin | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode chrome/korean/paste.latin | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode chrome/korean/typeText.hangul | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode chrome/korean/paste.hangul | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode chrome/korean/typeText.jamo | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode chrome/korean/paste.jamo | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode chrome/korean/typeText.mixed | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode chrome/korean/paste.mixed | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode chrome/korean/typeText.emoji | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode chrome/korean/paste.emoji | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode chrome/korean/typeText.combining | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode chrome/korean/paste.combining | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode chrome/korean/typeText.kanji | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode chrome/korean/paste.kanji | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode chrome/korean/typeText.lines | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode chrome/korean/paste.lines | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode chrome/korean/typeText.acceptance4 | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode chrome/korean/paste.acceptance4 | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode chrome/korean/pressKey.rk | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode electron/korean/typeText.latin | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode electron/korean/paste.latin | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode electron/korean/typeText.hangul | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode electron/korean/paste.hangul | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode electron/korean/typeText.jamo | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode electron/korean/paste.jamo | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode electron/korean/typeText.mixed | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode electron/korean/paste.mixed | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode electron/korean/typeText.emoji | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode electron/korean/paste.emoji | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode electron/korean/typeText.combining | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode electron/korean/paste.combining | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode electron/korean/typeText.kanji | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode electron/korean/paste.kanji | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode electron/korean/typeText.lines | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode electron/korean/paste.lines | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode electron/korean/typeText.acceptance4 | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode electron/korean/paste.acceptance4 | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode electron/korean/pressKey.rk | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode textedit/composing@electron/typeText.latin | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode textedit/composing@electron/paste.latin | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode textedit/composing@electron/typeText.hangul | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode textedit/composing@electron/paste.hangul | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode textedit/composing@electron/typeText.jamo | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode textedit/composing@electron/paste.jamo | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode textedit/composing@electron/typeText.mixed | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode textedit/composing@electron/paste.mixed | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode textedit/composing@electron/typeText.emoji | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode textedit/composing@electron/paste.emoji | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode textedit/composing@electron/typeText.combining | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode textedit/composing@electron/paste.combining | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 3 (Accessibility lists no window at the scene window's bounds, and shows it as no sheet of the window behind it 3) | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode textedit/composing@electron/typeText.kanji | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode textedit/composing@electron/paste.kanji | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode textedit/composing@electron/typeText.lines | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode textedit/composing@electron/paste.lines | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode textedit/composing@electron/typeText.acceptance4 | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode textedit/composing@electron/paste.acceptance4 | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode chrome/composing@textedit/typeText.latin | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode chrome/composing@textedit/paste.latin | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode chrome/composing@textedit/typeText.hangul | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode chrome/composing@textedit/paste.hangul | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode chrome/composing@textedit/typeText.jamo | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode chrome/composing@textedit/paste.jamo | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode chrome/composing@textedit/typeText.mixed | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode chrome/composing@textedit/paste.mixed | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode chrome/composing@textedit/typeText.emoji | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode chrome/composing@textedit/paste.emoji | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode chrome/composing@textedit/typeText.combining | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode chrome/composing@textedit/paste.combining | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode chrome/composing@textedit/typeText.kanji | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode chrome/composing@textedit/paste.kanji | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode chrome/composing@textedit/typeText.lines | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode chrome/composing@textedit/paste.lines | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode chrome/composing@textedit/typeText.acceptance4 | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode chrome/composing@textedit/paste.acceptance4 | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode electron/composing@textedit/typeText.latin | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode electron/composing@textedit/paste.latin | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode electron/composing@textedit/typeText.hangul | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode electron/composing@textedit/paste.hangul | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode electron/composing@textedit/typeText.jamo | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode electron/composing@textedit/paste.jamo | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode electron/composing@textedit/typeText.mixed | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode electron/composing@textedit/paste.mixed | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode electron/composing@textedit/typeText.emoji | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode electron/composing@textedit/paste.emoji | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode electron/composing@textedit/typeText.combining | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode electron/composing@textedit/paste.combining | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode electron/composing@textedit/typeText.kanji | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode electron/composing@textedit/paste.kanji | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode electron/composing@textedit/typeText.lines | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode electron/composing@textedit/paste.lines | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode electron/composing@textedit/typeText.acceptance4 | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| unicode electron/composing@textedit/paste.acceptance4 | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| intervention textedit/intervention.saveSheet | intervention-save-sheet | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | - |

## Not judged

What a ruling put out of the judged matrix: it runs and is reported, and counts as neither pass nor fail, nor as missing proof. Each entry names its reason and its ticket or the recorded evidence it rests on (ruling 1222); one with neither is missing proof instead. For rows, cua ok/valid, then the vendor's; "not recorded" where that lane has no sample of the row, which is distinct from an invalid sample.

### perContext

out of M5's judged matrix (ruling 1119, #185): a stored per-context preference does not show live behaviour, and establishing it would mean focusing each window, which non-interference forbids

Ticket: #577.

Of the invalid samples, `venue` (an input source the runner's setup could not enable, ruling 1189, or the sources enabled and the per-context context not reading Korean after its reactivation, #577): cua 162, vendor 162.

| row | cua ok | vendor ok |
|---|---|---|
| chrome/perContext@textedit/paste.acceptance4 | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| chrome/perContext@textedit/paste.combining | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| chrome/perContext@textedit/paste.emoji | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| chrome/perContext@textedit/paste.hangul | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| chrome/perContext@textedit/paste.jamo | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| chrome/perContext@textedit/paste.kanji | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| chrome/perContext@textedit/paste.latin | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| chrome/perContext@textedit/paste.lines | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| chrome/perContext@textedit/paste.mixed | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| chrome/perContext@textedit/typeText.acceptance4 | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| chrome/perContext@textedit/typeText.combining | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| chrome/perContext@textedit/typeText.emoji | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| chrome/perContext@textedit/typeText.hangul | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| chrome/perContext@textedit/typeText.jamo | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| chrome/perContext@textedit/typeText.kanji | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| chrome/perContext@textedit/typeText.latin | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| chrome/perContext@textedit/typeText.lines | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| chrome/perContext@textedit/typeText.mixed | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| electron/perContext@textedit/paste.acceptance4 | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| electron/perContext@textedit/paste.combining | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| electron/perContext@textedit/paste.emoji | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| electron/perContext@textedit/paste.hangul | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| electron/perContext@textedit/paste.jamo | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| electron/perContext@textedit/paste.kanji | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| electron/perContext@textedit/paste.latin | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| electron/perContext@textedit/paste.lines | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| electron/perContext@textedit/paste.mixed | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| electron/perContext@textedit/typeText.acceptance4 | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| electron/perContext@textedit/typeText.combining | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| electron/perContext@textedit/typeText.emoji | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| electron/perContext@textedit/typeText.hangul | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| electron/perContext@textedit/typeText.jamo | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| electron/perContext@textedit/typeText.kanji | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| electron/perContext@textedit/typeText.latin | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| electron/perContext@textedit/typeText.lines | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| electron/perContext@textedit/typeText.mixed | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| textedit/perContext@electron/paste.acceptance4 | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| textedit/perContext@electron/paste.combining | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| textedit/perContext@electron/paste.emoji | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| textedit/perContext@electron/paste.hangul | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| textedit/perContext@electron/paste.jamo | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| textedit/perContext@electron/paste.kanji | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| textedit/perContext@electron/paste.latin | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| textedit/perContext@electron/paste.lines | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| textedit/perContext@electron/paste.mixed | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| textedit/perContext@electron/typeText.acceptance4 | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| textedit/perContext@electron/typeText.combining | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| textedit/perContext@electron/typeText.emoji | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| textedit/perContext@electron/typeText.hangul | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| textedit/perContext@electron/typeText.jamo | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| textedit/perContext@electron/typeText.kanji | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| textedit/perContext@electron/typeText.latin | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| textedit/perContext@electron/typeText.lines | 0/0 (+3 invalid) | 0/0 (+3 invalid) |
| textedit/perContext@electron/typeText.mixed | 0/0 (+3 invalid) | 0/0 (+3 invalid) |

### openPanelSearch

out of M5's judged matrix (ruling 1222): typeText into the Open panel's search field is a known product defect, #588, run and reported until it is fixed

Ticket: #588.

| row | cua ok | vendor ok |
|---|---|---|
| openPanel/frontmost/typeText.search | 0/0 (+3 invalid) | 0/0 (+3 invalid) |

### openPanelSearchTiming

out of M5's judged matrix (ruling 1235): typeText into the Open panel's search field is #588's known defect; neither engine does the op, so its timing has nothing to compare

Ticket: #588.

| row | cua ok | vendor ok |
|---|---|---|
| textedit/method.panel.typeText.search | 0/0 (+3 invalid) | 0/0 (+3 invalid) |

### savePanelNameTiming

out of M5's judged matrix (ruling 1231): the Save sheet name case's timing stays unmeasured: filtered reruns record no timing; the vendor's prepare failed in the base

Ticket: #592.

| row | cua ok | vendor ok |
|---|---|---|
| textedit/method.savePanel.typeText.name | 3/3 | 3/3 |

### Shared not-interfering failures

Cells where a cua sample failed not interfering with its own paired vendor sample (rulings 1219 and 1222): a product defect both engines share, with its ticket, or the venue's, on the evidence recorded.

| row | reason | ticket or evidence | samples |
|---|---|---|---|
| electron/background/launch@finder | cua failed not interfering with its paired vendor sample, and nothing of the person's moved (a target window above the user's): the venue's (rulings 1219 and 1222) | evidence: cua run 1 sample 1: electron/background/launch@finder's interference.windowOrder.after; vendor run 1 sample 1: electron/background/launch@finder's interference.windowOrder.after; cua run 2 sample 2: electron/background/launch@finder's interference.windowOrder.after; vendor run 2 sample 2: electron/background/launch@finder's interference.windowOrder.after; cua run 3 sample 3: electron/background/launch@finder's interference.windowOrder.after; vendor run 3 sample 3: electron/background/launch@finder's interference.windowOrder.after | 3 |

## By the lane that ran first (ruling 1226)

Run numbers by the lane that ran first: vendor first 2, cua first 1. Failed samples: 156 in vendor-first runs, 78 in cua-first runs; samples without a verdict: 229 and 114. Recorded, never judged.

| cell | engine | failed, vendor first | failed, cua first | no verdict, vendor first | no verdict, cua first |
|---|---|---|---|---|---|
| concurrent textedit/concurrent.sheet@electron | cua | 0 | 0 | 2 | 1 |
| concurrent textedit/concurrent.sheet@electron | vendor | 0 | 0 | 2 | 1 |
| intervention textedit/intervention.fires | vendor | 2 | 1 | 0 | 0 |
| intervention textedit/intervention.preAction | vendor | 2 | 1 | 0 | 0 |
| launch electron/background/launch@finder | cua | 2 | 1 | 0 | 0 |
| launch electron/background/launch@finder | vendor | 2 | 1 | 0 | 0 |
| method chrome/background/drag.select@textedit | cua | 2 | 1 | 0 | 0 |
| method electron/frontmost/click.point | cua | 2 | 1 | 0 | 0 |
| method electron/frontmost/click.point | vendor | 2 | 1 | 0 | 0 |
| method openPanel/frontmost/typeText.search | cua | 0 | 0 | 2 | 1 |
| method openPanel/frontmost/typeText.search | vendor | 0 | 0 | 2 | 1 |
| speed textedit/method.panel.typeText.search | cua | 0 | 0 | 2 | 1 |
| speed textedit/method.panel.typeText.search | vendor | 0 | 0 | 2 | 1 |
| unicode chrome/composing@textedit/typeText.acceptance4 | vendor | 2 | 1 | 0 | 0 |
| unicode chrome/composing@textedit/typeText.combining | vendor | 2 | 1 | 0 | 0 |
| unicode chrome/composing@textedit/typeText.emoji | vendor | 2 | 1 | 0 | 0 |
| unicode chrome/composing@textedit/typeText.hangul | vendor | 2 | 1 | 0 | 0 |
| unicode chrome/composing@textedit/typeText.kanji | vendor | 2 | 1 | 0 | 0 |
| unicode chrome/composing@textedit/typeText.lines | vendor | 2 | 1 | 0 | 0 |
| unicode chrome/composing@textedit/typeText.mixed | vendor | 2 | 1 | 0 | 0 |
| unicode chrome/korean/pressKey.rk | cua | 0 | 1 | 0 | 0 |
| unicode chrome/korean/pressKey.rk | vendor | 2 | 0 | 0 | 0 |
| unicode chrome/korean/typeText.acceptance4 | vendor | 2 | 1 | 0 | 0 |
| unicode chrome/korean/typeText.combining | vendor | 2 | 1 | 0 | 0 |
| unicode chrome/korean/typeText.emoji | vendor | 2 | 1 | 0 | 0 |
| unicode chrome/korean/typeText.hangul | vendor | 2 | 1 | 0 | 0 |
| unicode chrome/korean/typeText.kanji | vendor | 2 | 1 | 0 | 0 |
| unicode chrome/korean/typeText.lines | vendor | 2 | 1 | 0 | 0 |
| unicode chrome/korean/typeText.mixed | vendor | 2 | 1 | 0 | 0 |
| unicode chrome/latin/typeText.acceptance4 | vendor | 2 | 1 | 0 | 0 |
| unicode chrome/latin/typeText.combining | vendor | 2 | 1 | 0 | 0 |
| unicode chrome/latin/typeText.emoji | vendor | 2 | 1 | 0 | 0 |
| unicode chrome/latin/typeText.hangul | vendor | 2 | 1 | 0 | 0 |
| unicode chrome/latin/typeText.jamo | vendor | 2 | 1 | 0 | 0 |
| unicode chrome/latin/typeText.kanji | vendor | 2 | 1 | 0 | 0 |
| unicode chrome/latin/typeText.lines | vendor | 2 | 1 | 0 | 0 |
| unicode chrome/latin/typeText.mixed | vendor | 2 | 1 | 0 | 0 |
| unicode chrome/midSwitch/typeText.long | vendor | 2 | 1 | 0 | 0 |
| unicode chrome/perContext@textedit/paste.acceptance4 | cua | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/paste.acceptance4 | vendor | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/paste.combining | cua | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/paste.combining | vendor | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/paste.emoji | cua | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/paste.emoji | vendor | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/paste.hangul | cua | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/paste.hangul | vendor | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/paste.jamo | cua | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/paste.jamo | vendor | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/paste.kanji | cua | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/paste.kanji | vendor | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/paste.latin | cua | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/paste.latin | vendor | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/paste.lines | cua | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/paste.lines | vendor | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/paste.mixed | cua | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/paste.mixed | vendor | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/typeText.acceptance4 | cua | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/typeText.acceptance4 | vendor | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/typeText.combining | cua | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/typeText.combining | vendor | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/typeText.emoji | cua | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/typeText.emoji | vendor | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/typeText.hangul | cua | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/typeText.hangul | vendor | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/typeText.jamo | cua | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/typeText.jamo | vendor | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/typeText.kanji | cua | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/typeText.kanji | vendor | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/typeText.latin | cua | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/typeText.latin | vendor | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/typeText.lines | cua | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/typeText.lines | vendor | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/typeText.mixed | cua | 0 | 0 | 2 | 1 |
| unicode chrome/perContext@textedit/typeText.mixed | vendor | 0 | 0 | 2 | 1 |
| unicode electron/composing@textedit/typeText.acceptance4 | vendor | 2 | 1 | 0 | 0 |
| unicode electron/composing@textedit/typeText.combining | vendor | 2 | 1 | 0 | 0 |
| unicode electron/composing@textedit/typeText.emoji | vendor | 2 | 1 | 0 | 0 |
| unicode electron/composing@textedit/typeText.hangul | vendor | 2 | 1 | 0 | 0 |
| unicode electron/composing@textedit/typeText.kanji | vendor | 2 | 1 | 0 | 0 |
| unicode electron/composing@textedit/typeText.lines | vendor | 2 | 1 | 0 | 0 |
| unicode electron/composing@textedit/typeText.mixed | vendor | 2 | 1 | 0 | 0 |
| unicode electron/korean/pressKey.rk | cua | 0 | 1 | 0 | 0 |
| unicode electron/korean/pressKey.rk | vendor | 2 | 0 | 0 | 0 |
| unicode electron/korean/typeText.acceptance4 | vendor | 2 | 1 | 0 | 0 |
| unicode electron/korean/typeText.combining | vendor | 2 | 1 | 0 | 0 |
| unicode electron/korean/typeText.emoji | vendor | 2 | 1 | 0 | 0 |
| unicode electron/korean/typeText.hangul | vendor | 2 | 1 | 0 | 0 |
| unicode electron/korean/typeText.kanji | vendor | 2 | 1 | 0 | 0 |
| unicode electron/korean/typeText.lines | vendor | 2 | 1 | 0 | 0 |
| unicode electron/korean/typeText.mixed | vendor | 2 | 1 | 0 | 0 |
| unicode electron/latin/typeText.acceptance4 | vendor | 2 | 1 | 0 | 0 |
| unicode electron/latin/typeText.combining | vendor | 2 | 1 | 0 | 0 |
| unicode electron/latin/typeText.emoji | vendor | 2 | 1 | 0 | 0 |
| unicode electron/latin/typeText.hangul | vendor | 2 | 1 | 0 | 0 |
| unicode electron/latin/typeText.jamo | vendor | 2 | 1 | 0 | 0 |
| unicode electron/latin/typeText.kanji | vendor | 2 | 1 | 0 | 0 |
| unicode electron/latin/typeText.lines | vendor | 2 | 1 | 0 | 0 |
| unicode electron/latin/typeText.mixed | vendor | 2 | 1 | 0 | 0 |
| unicode electron/midSwitch/typeText.long | vendor | 2 | 1 | 0 | 0 |
| unicode electron/perContext@textedit/paste.acceptance4 | cua | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/paste.acceptance4 | vendor | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/paste.combining | cua | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/paste.combining | vendor | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/paste.emoji | cua | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/paste.emoji | vendor | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/paste.hangul | cua | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/paste.hangul | vendor | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/paste.jamo | cua | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/paste.jamo | vendor | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/paste.kanji | cua | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/paste.kanji | vendor | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/paste.latin | cua | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/paste.latin | vendor | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/paste.lines | cua | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/paste.lines | vendor | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/paste.mixed | cua | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/paste.mixed | vendor | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/typeText.acceptance4 | cua | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/typeText.acceptance4 | vendor | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/typeText.combining | cua | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/typeText.combining | vendor | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/typeText.emoji | cua | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/typeText.emoji | vendor | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/typeText.hangul | cua | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/typeText.hangul | vendor | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/typeText.jamo | cua | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/typeText.jamo | vendor | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/typeText.kanji | cua | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/typeText.kanji | vendor | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/typeText.latin | cua | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/typeText.latin | vendor | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/typeText.lines | cua | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/typeText.lines | vendor | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/typeText.mixed | cua | 0 | 0 | 2 | 1 |
| unicode electron/perContext@textedit/typeText.mixed | vendor | 0 | 0 | 2 | 1 |
| unicode textedit/composing@electron/typeText.acceptance4 | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/composing@electron/typeText.combining | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/composing@electron/typeText.emoji | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/composing@electron/typeText.hangul | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/composing@electron/typeText.kanji | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/composing@electron/typeText.lines | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/composing@electron/typeText.mixed | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/korean/typeText.acceptance4 | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/korean/typeText.combining | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/korean/typeText.emoji | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/korean/typeText.hangul | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/korean/typeText.kanji | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/korean/typeText.lines | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/korean/typeText.mixed | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/latin/typeText.acceptance4 | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/latin/typeText.combining | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/latin/typeText.emoji | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/latin/typeText.hangul | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/latin/typeText.jamo | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/latin/typeText.kanji | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/latin/typeText.lines | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/latin/typeText.mixed | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/midSwitch/typeText.long | cua | 0 | 0 | 1 | 0 |
| unicode textedit/midSwitch/typeText.long | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/perContext@electron/paste.acceptance4 | cua | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/paste.acceptance4 | vendor | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/paste.combining | cua | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/paste.combining | vendor | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/paste.emoji | cua | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/paste.emoji | vendor | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/paste.hangul | cua | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/paste.hangul | vendor | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/paste.jamo | cua | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/paste.jamo | vendor | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/paste.kanji | cua | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/paste.kanji | vendor | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/paste.latin | cua | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/paste.latin | vendor | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/paste.lines | cua | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/paste.lines | vendor | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/paste.mixed | cua | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/paste.mixed | vendor | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/typeText.acceptance4 | cua | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/typeText.acceptance4 | vendor | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/typeText.combining | cua | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/typeText.combining | vendor | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/typeText.emoji | cua | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/typeText.emoji | vendor | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/typeText.hangul | cua | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/typeText.hangul | vendor | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/typeText.jamo | cua | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/typeText.jamo | vendor | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/typeText.kanji | cua | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/typeText.kanji | vendor | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/typeText.latin | cua | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/typeText.latin | vendor | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/typeText.lines | cua | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/typeText.lines | vendor | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/typeText.mixed | cua | 0 | 0 | 2 | 1 |
| unicode textedit/perContext@electron/typeText.mixed | vendor | 0 | 0 | 2 | 1 |

## Run job attempts (every one found; the latest of each run judged)

- m5-sitting-c-run-1-1
- m5-sitting-c-run-2-1
- m5-sitting-c-run-3-1


## The run jobs (ruling 1228)

| job | runs | run id | attempt | image | VM | hardware | scenes | save sheet |
|---|---|---|---|---|---|---|---|---|
| /Users/runner/work/_temp/m5-jobs/m5-sitting-c-run-1-1/sitting | 1 | 46165236186 | 1 | macos27 20261123.0387.2 | 63591d6e-e6df-4c77-a8d7-d672aecb4288 | model VirtualMac2,1, cpu Apple M1 (Virtual), cpus 3, memoryGB 7, macOS 27.0.1, image macos27 20261123.0387.2 | textedit, finder, chrome, electron | save-sheet-vendor-1 PASS, save-sheet-cua-1 PASS |
| /Users/runner/work/_temp/m5-jobs/m5-sitting-c-run-2-1/sitting | 2 | 46165236186 | 1 | macos27 20261123.0387.2 | b32ae11e-3ce1-4cdf-8a75-e932b6ed70fd | model VirtualMac2,1, cpu Apple M1 (Virtual), cpus 3, memoryGB 7, macOS 27.0.1, image macos27 20261123.0387.2 | textedit, finder, chrome, electron | save-sheet-cua-2 PASS, save-sheet-vendor-2 PASS |
| /Users/runner/work/_temp/m5-jobs/m5-sitting-c-run-3-1/sitting | 3 | 46165236186 | 1 | macos27 20261123.0387.2 | a84699a0-bdc0-4a34-9c9b-09e9d80995a2 | model VirtualMac2,1, cpu Apple M1 (Virtual), cpus 3, memoryGB 7, macOS 27.0.1, image macos27 20261123.0387.2 | textedit, finder, chrome, electron | save-sheet-vendor-3 PASS, save-sheet-cua-3 PASS |

Harness commits: the jobs 4a0a82b13fd6dc06e1095c29690348e483bed153.

The cua engine against the last judged sitting C (docs/evidence/2026-11-28-m5-sitting-c-proof-587): 0.3.1 build 4c3b5768105094fad946513cd755bbf639287bf4a63d899fc87541d478e1ffb3 then, 0.3.3 build 30101ea8bbe09a50f5c0de23c390b2918bd8bf4156b38dd4c09865607c56204a in these jobs: a new build (recorded, never refused; ruling 1248).

## The alert guard

No refusal, no key cell guarded unread and no key-window reading in this sitting's records.

## The key-window requirement

In this sitting's records: 0 click or key cells sent with the key window read; 0 refused NO VERDICT keyWindow; 0 sent with the key window unread.
Setup's reading of the reader's grant over the loopback ssh: trusted. Context only: the verdict below is the sitting's own readings.

No key-window reading was taken: the requirement was not observed in this sitting.

## TextEdit and the Open panel, read back (ruling 1169)

No TextEdit window or Open panel was read back in this sitting's records.

## The screen at the end

2 alert windows; the display 1920x1080 (mode 10).

## The venue (ruling 1169)

The alert windows after the mode switch: alert 62 (893,244 260x364), alert 34 (830,188 260x348). TextEdit's preferences (com.apple.TextEdit, read back from its container's plist): WidthInChars read back, NSRequiresOpenUntitledWindowAtLaunch read back, ApplePersistenceIgnoreState read back, NSWindow Frame NSNavPanelAutosaveName read back, NSNavPanelExpandedSizeForOpenMode read back. TextEdit's saved application state: none at /Users/runner/Library/Saved Application State/com.apple.TextEdit.savedState.

Input sources (ruling 1189): enabled through TISEnableInputSource (./input-sources.swift), read back from TIS's enabled list after 1 read; the preference's value (com.apple.HIToolbox AppleEnabledInputSources) recorded beside it; restored: nothing: the VM is thrown away (ruling 1189). Every source the runs select held.

| source | enable | TIS's enabled list | the preference | held |
|---|---|---|---|---|
| com.apple.keylayout.ABC | status 0 | in TIS's enabled list, enabled, selectable | listed | yes |
| com.apple.inputmethod.Korean | status 0 | in TIS's enabled list, enabled (the input method its mode needs) | listed | yes |
| com.apple.inputmethod.Korean.2SetKorean | status 0 | in TIS's enabled list, enabled, selectable | listed | yes |

| scene | the mini | hosted | why | grounding | cells resting on it |
|---|---|---|---|---|---|
| chrome | 80,60 1000x760 | 22,60 800x760 | the capture alerts read fresh after the mode switch: alert 62 (893,244 260x364), alert 34 (830,188 260x348); the mini's 80,60 1000x760 would overlap them; Chrome is 800x760 on a hosted runner (ruling 1169); the frame 22,60 800x760 | window points grounded on the notes field's frame as read in the run's window, toolbar and infobars whatever they are (../native-matrix/plan.mjs chromeDragFromField, ruling 1226); a frame not read leaves the drag invalid | chrome/frontmost/drag.select, chrome/background/drag.select@textedit, native-mac chrome (its tree: the page in the window, both lanes alike) |
| electron | 140,100 720x560 | 102,100 720x560 | the capture alerts read fresh after the mode switch: alert 62 (893,244 260x364), alert 34 (830,188 260x348); the mini's 140,100 720x560 would overlap them; the frame 102,100 720x560 | window points on the fixture's size, unchanged at 720x560: its drag's layout (ELECTRON_FIELD_LAYOUT) holds as it is; #259's point is grounded on the field's frame as read (../native-matrix/plan.mjs electronPointFromField, ruling 1228); only the origin moved | electron/frontmost/drag.select, electron/frontmost/click.point, electron/background/drag.select@finder, native-mac electron (its tree) |
| finder | 80,80 920x520 | 22,80 800x520 | the capture alerts read fresh after the mode switch: alert 62 (893,244 260x364), alert 34 (830,188 260x348); the mini's 80,80 920x520 would overlap them; the frame 22,80 800x520 | element-addressed rows; the height is the mini's, so the same rows are visible | finder/frontmost/click.row, finder/frontmost/pressKey.down, finder/frontmost/typeText.typeSelect, finder/frontmost/scroll.down, finder/frontmost/performSecondaryAction.down, finder/background/click.row@textedit, finder/background/pressKey.down@textedit, finder/background/typeText.typeSelect@textedit, finder/background/scroll.down@textedit, finder/background/performSecondaryAction.down@textedit, finder/background/click.row@electron, finder/background/pressKey.down@electron, finder/background/typeText.typeSelect@electron, finder/background/scroll.down@electron, finder/background/performSecondaryAction.down@electron, native-mac finder (its tree: the rows its height shows; the diff pairs equal frames only) |
| textedit | WidthInChars 75, NSRequiresOpenUntitledWindowAtLaunch YES (AppKit's default), ApplePersistenceIgnoreState NO (AppKit's default: windows restored) | WidthInChars 60, NSRequiresOpenUntitledWindowAtLaunch NO, ApplePersistenceIgnoreState YES, saved application state to be removed after the warm-ups, outside the container (venue.textEdit.savedState says what was) | the capture alerts read fresh after the mode switch: alert 62 (893,244 260x364), alert 34 (830,188 260x348); at 1920x1080 TextEdit's default width put its new document at 242,107 603x505 (pilot A, run 45252131587), over alert 31; its origin is AppKit's cascade, read back by each run; the untitled document AppKit opens at launch stood at 241,87 586x488 on the runner's first TextEdit launch and 213,78 387x505 on the next (pilot A, run 45272465181), so none is opened (the design session); vv-1's launch window again stood at 241,87 586x488 with that key in force and its new document took 603x505, the default width, though the domain read WidthInChars 60 back (pilot A's re-run, run 45277221729): a window the warm-ups' saved state restored, and a domain write the sandboxed TextEdit does not read, so restoration is turned off, removing the saved state outside the container is attempted (venue.textEdit.savedState records the outcome) and every key is read back from TextEdit's container | fractions of the document window (its drag) and its own rows: valid at any width the text view fills, the prepare's clicks proving each end | textedit/frontmost/drag.select, textedit/background/drag.select@finder, textedit/background/drag.select@chrome, native-mac textedit (its tree) |
| textedit document | view size none: TextEdit takes the paper's width, sha256 default e3703ac3a303696332910efb44330a6604f403849695ca011bfacf2a23ad4a76, sha256 wide-page e228c76974983f74cbd27e31eefca527584ceb5eac25771eecab205446a391a3 | view size 480x792 (\vieww9600\viewh15840), sha256 default dff8383ef0c0a5142279fd1d536a562bff45a4f06be68bbd5d603e270e988ffd, sha256 wide-page f32e9d20e9a2c43fe0f76ebb08e70a0b7e14dbc3b2629e7c913a8af9248e08ef | the scene's cua-scene.rtf, opened as a file with no view size, stood at 213,78 627x877 on both sides (pilot B, run 45274556933): the paper's width, which WidthInChars does not change, its right edge 840 over alert 31; a view 480 wide ends left of the strip's 822 from the cascade origins read so far, one step more; its origin is AppKit's cascade, read back by each run | the window's size only: the file is the mini's with the view size inserted, so its text and attribute runs are the mini's (textutil's text and HTML of both files are equal, test/repl-parity/scenes-mac.test.mjs); the cells' fractions and rows hold as for TextEdit's preferences; the wide page stays wider than the window (its 200% zoom) | textedit/frontmost/drag.select, textedit/background/drag.select@finder, textedit/background/drag.select@chrome, native-mac textedit (its tree), hscroll/textedit-wide-page/right (the wide-page layout: its page wider than the window) |
| openPanel | AppKit's: centred on the screen | 80,80 720x440 | the capture alerts read fresh after the mode switch: alert 62 (893,244 260x364), alert 34 (830,188 260x348); the mini leaves the panel centred, where the alerts are; the frame 80,80 720x440 | element-addressed (its Cancel, its search field, the Save sheet's name field, A's New Document): the frame decides only whether the guard refuses them; on a hosted runner the matrix moves each opening into the strip by Accessibility (ruling 1195), and a read-back outside it is NO VERDICT venue | openPanel/frontmost/getAXState.panel, openPanel/frontmost/typeText.search, openPanel/frontmost/pressKey.escape, openPanel/frontmost/click.cancel, openPanel/background/getAXState.panel@finder, openPanel/background/click.cancel@finder, savePanel/frontmost/pressKey.escape, savePanel/frontmost/typeText.name, savePanel/frontmost/setValue.name, native-baseline setup.newDocument (the panel at TextEdit's launch, where one shows: the mini's) |

## The key-route diagnostic (ruling 1198)

A diagnostic: its status is INFO and never changes this sitting's verdict; only a cleanup failure, named, is a FAIL. Where `pressKey("Escape")` lands while TextEdit's Open panel is focused, per engine through its own lane; fields 40 and 41 are the event's target and source unix pids as the listen-only taps saw them, read only inside the press's own window ("unavailable": a field the event did not carry).

| engine | Escape sent | posted to (field 40) | posted by (field 41) | seen by tap | panel closed by the Escape | note |
|---|---|---|---|---|---|---|
| vendor | yes | 7505 | 8838 | panelService | yes | |
| cua | yes | 11259 | 12017 | panelService | yes | |

### vendor's lane: TextEdit pid 7390

| cua's keyboardTarget (native/engine/Sources/Engine/KeyTarget.swift:100, #582), predicted from the observed chain | the focused element's public AXUIElementGetPid owner (cua's target before #582) | the focused element's ActualPid | the selected ancestor (the static reading's walk) | the static reading's rule |
|---|---|---|---|---|
| 7505 | 7390 | 7505 | depth 0, pid 7505 | 7505 |

| depth | role | AXUIElementGetPid | _AXUIElementGetActualPid | owner | activation policy | finished launching |
|---|---|---|---|---|---|---|
| 0 | AXList | 7390 | 7505 | com.apple.appkit.xpc.openAndSavePanelService | prohibited | yes |
| 1 | AXScrollArea | 7390 | 7505 | com.apple.appkit.xpc.openAndSavePanelService | prohibited | yes |
| 2 | AXScrollArea | 7390 | 7505 | com.apple.appkit.xpc.openAndSavePanelService | prohibited | yes |
| 3 | AXBrowser | 7390 | 7505 | com.apple.appkit.xpc.openAndSavePanelService | prohibited | yes |
| 4 | AXSplitGroup | 7390 | 7505 | com.apple.appkit.xpc.openAndSavePanelService | prohibited | yes |
| 5 | AXSplitGroup | 7390 | 7505 | com.apple.appkit.xpc.openAndSavePanelService | prohibited | yes |
| 6 | AXWindow | 7390 | 7390 | com.apple.TextEdit | regular | yes |
| 7 | AXApplication | 7390 | 7390 | com.apple.TextEdit | regular | yes |

| route | read | pids | matches ActualPid | matches the selected ancestor |
|---|---|---|---|---|
| windowListAtPanelFrame | yes | 7390 | no | no |
| windowListTopAtPanelCenter | yes | 7390 | no | no |
| frontmostWindowOwner | yes | 7390 | no | no |
| runningApplicationsPanelService | yes | 7505 | yes | yes |
| axWindowPid | yes | none | no | no |
| appFocusedWindowPid | yes | 7390 | no | no |
| systemWideFocusedElementPid | yes | 7390 | no | no |
| systemWideFocusedApplicationPid | yes | 7390 | no | no |
| frontmostApplication | yes | 7390 | no | no |

### cua's lane: TextEdit pid 11240

| cua's keyboardTarget (native/engine/Sources/Engine/KeyTarget.swift:100, #582), predicted from the observed chain | the focused element's public AXUIElementGetPid owner (cua's target before #582) | the focused element's ActualPid | the selected ancestor (the static reading's walk) | the static reading's rule |
|---|---|---|---|---|
| 11259 | 11240 | 11259 | depth 0, pid 11259 | 11259 |

| depth | role | AXUIElementGetPid | _AXUIElementGetActualPid | owner | activation policy | finished launching |
|---|---|---|---|---|---|---|
| 0 | AXList | 11240 | 11259 | com.apple.appkit.xpc.openAndSavePanelService | prohibited | yes |
| 1 | AXScrollArea | 11240 | 11259 | com.apple.appkit.xpc.openAndSavePanelService | prohibited | yes |
| 2 | AXScrollArea | 11240 | 11259 | com.apple.appkit.xpc.openAndSavePanelService | prohibited | yes |
| 3 | AXBrowser | 11240 | 11259 | com.apple.appkit.xpc.openAndSavePanelService | prohibited | yes |
| 4 | AXSplitGroup | 11240 | 11259 | com.apple.appkit.xpc.openAndSavePanelService | prohibited | yes |
| 5 | AXSplitGroup | 11240 | 11259 | com.apple.appkit.xpc.openAndSavePanelService | prohibited | yes |
| 6 | AXWindow | 11240 | 11240 | com.apple.TextEdit | regular | yes |
| 7 | AXApplication | 11240 | 11240 | com.apple.TextEdit | regular | yes |

| route | read | pids | matches ActualPid | matches the selected ancestor |
|---|---|---|---|---|
| windowListAtPanelFrame | yes | 11240 | no | no |
| windowListTopAtPanelCenter | yes | 11240 | no | no |
| frontmostWindowOwner | yes | 11240 | no | no |
| runningApplicationsPanelService | yes | 11259 | yes | yes |
| axWindowPid | yes | none | no | no |
| appFocusedWindowPid | yes | 11240 | no | no |
| systemWideFocusedElementPid | yes | 11240 | no | no |
| systemWideFocusedApplicationPid | yes | 11240 | no | no |
| frontmostApplication | yes | 11240 | no | no |

Input Monitoring granted to io.github.ssfskim.cua.key-route-tap: yes. The engines' TCC rows: unchanged (8 rows).

Cleanup: confirmed.
