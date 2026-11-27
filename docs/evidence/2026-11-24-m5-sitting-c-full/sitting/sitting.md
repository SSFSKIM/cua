## Sitting C (full): the native matrix, three runs a side, with the Korean and Unicode rows, the concurrent-use and intervention cells, Acceptance 3's keystroke witness and the window-order oracle; #212's save-sheet cell

Proves: Acceptance 3, 4 and 7.

| step | kind | status | exit | time | sitting so far | job so far | note |
|---|---|---|---|---|---|---|---|
| witness-tap | diagnostic | INFO | 0 | 5 s | 0 min | 4 min | R3's witness tap built and granted Input Monitoring (ruling 1225) |
| matrix-vendor-1 | run | PASS | 1 | 3495 s | 58 min | 62 min | recorded complete; exit 1 is the run's own outcome, which its judge reads |
| matrix-cua-1 | run | PASS | 1 | 2410 s | 99 min | 102 min | recorded complete; exit 1 is the run's own outcome, which its judge reads; projected before it ran to finish the job's run steps at 703 min of its 360 (past the 300-min warning line) |
| matrix-cua-2 | run | PASS | 1 | 2415 s | 139 min | 143 min | recorded complete; exit 1 is the run's own outcome, which its judge reads; projected before it ran to finish the job's run steps at 595 min of its 360 (past the 300-min warning line) |
| matrix-vendor-2 | run | PASS | 1 | 3460 s | 196 min | 200 min | recorded complete; exit 1 is the run's own outcome, which its judge reads; projected before it ran to finish the job's run steps at 577 min of its 360 (past the 300-min warning line) |
| matrix-vendor-3 | run | PASS | 1 | 3544 s | 256 min | 259 min | recorded complete; exit 1 is the run's own outcome, which its judge reads; projected before it ran to finish the job's run steps at 593 min of its 360 (past the 300-min warning line) |
| matrix-cua-3 | run | PASS | 1 | 2917 s | 304 min | 308 min | recorded complete; exit 1 is the run's own outcome, which its judge reads; projected before it ran to finish the job's run steps at 606 min of its 360 (past the 300-min warning line) |
| save-sheet-vendor-1 | run | PASS | 0 | 205 s | 308 min | 311 min | 1 sample over 1 run: vendor run-1 sample 1 PASS; the run's folder empty; AXDocument none, AXEdited false (closeButton); Go To closed (Escape 0x); projected before it ran to finish the job's run steps at 612 min of its 360 (past the 300-min warning line) |
| save-sheet-cua-1 | run | NO VERDICT | 1 | 303 s | 313 min | 317 min | 1 sample over 1 run: cua run-1 sample 1 NO VERDICT (set_value returned before the probe's event was seen); the run's folder empty; AXDocument none, AXEdited false (closeButton); Go To closed (Escape 0x); projected before it ran to finish the job's run steps at 450 min of its 360 (past the 300-min warning line) |
| save-sheet-cua-2 | run | NO VERDICT | 1 | 298 s | 318 min | 321 min | 1 sample over 1 run: cua run-2 sample 2 NO VERDICT (set_value returned before the probe's event was seen); the run's folder empty; AXDocument none, AXEdited false (closeButton); Go To closed (Escape 0x); projected before it ran to finish the job's run steps at 333 min of its 360 (past the 300-min warning line) |
| save-sheet-vendor-2 | run | PASS | 0 | 239 s | 322 min | 325 min | 1 sample over 1 run: vendor run-2 sample 2 PASS; the run's folder empty; AXDocument none, AXEdited false (closeButton); Go To closed (Escape 0x); projected before it ran to finish the job's run steps at 333 min of its 360 (past the 300-min warning line) |
| save-sheet-vendor-3 | run | PASS | 0 | 253 s | 326 min | 330 min | 1 sample over 1 run: vendor run-3 sample 3 PASS; the run's folder empty; AXDocument none, AXEdited false (closeButton); Go To closed (Escape 0x); projected before it ran to finish the job's run steps at 334 min of its 360 (past the 300-min warning line) |
| save-sheet-cua-3 | run | NO VERDICT | 1 | 348 s | 332 min | 335 min | 1 sample over 1 run: cua run-3 sample 3 NO VERDICT (set_value returned before the probe's event was seen); the run's folder empty; AXDocument none, AXEdited false (closeButton); Go To closed (Escape 0x); projected before it ran to finish the job's run steps at 335 min of its 360 (past the 300-min warning line) |
| summary | verdict | PASS | 1 | 0 s | 332 min | 335 min | written; exit 1 is its verdict, which the judge step gives |
| compare | verdict | FAIL | 1 | 0 s | 332 min | 335 min | |
| key-route | diagnostic | INFO | 0 | 0 s | 332 min | 335 min | a diagnostic, recorded: skipped: the job's time left (570 s before C must publish) does not fit the set-up and the cleanup (1620 s) |

**FAIL** (exit 1): 10 PASS, 1 FAIL, 3 NO VERDICT, 0 OWNER, 2 INFO, 0 SKIP, 0 PENDING.

Wall time: the sitting 332 min so far, the job 335 min of its 360.

Projected finish: past 300 min before matrix-cua-1 (703 min of the job's 360).

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
| method savePanel/frontmost/typeText.name | matrix | 0 of 3 | 1: 0/1, 2: 0/1, 3: 0/1 | 0 | 0 | 0 | 0 | 0 of 3 | 1: 0/1, 2: 0/1, 3: 0/1 | 0 | 0 | 0 | 0 | 0 |
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
| method openPanel/background/getAXState.panel@finder | matrix | 2 of 3 | 1: 1/1, 2: 0/1, 3: 1/1 | 0 | 0 | 0 | 0 | 2 of 3 | 1: 1/1, 2: 0/1, 3: 1/1 | 0 | 0 | 0 | 0 | 2 |
| method openPanel/background/click.cancel@finder | matrix | 2 of 3 | 1: 1/1, 2: 0/1, 3: 1/1 | 0 | 0 | 0 | 0 | 2 of 3 | 1: 1/1, 2: 0/1, 3: 1/1 | 0 | 0 | 0 | 0 | 2 |
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
| speed textedit/method.panel.typeText.search | matrix | 0 of 3 | 1: 0/1, 2: 0/1, 3: 0/1 | 0 | 0 | 0 | 0 | 0 of 3 | 1: 0/1, 2: 0/1, 3: 0/1 | 0 | 0 | 0 | 0 | 0 |
| speed textedit/method.panel.pressKey.escape | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| speed textedit/method.panel.click.cancel | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| speed textedit/method.savePanel.pressKey.escape | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| speed textedit/method.savePanel.typeText.name | matrix | 0 of 3 | 1: 0/1, 2: 0/1, 3: 0/1 | 0 | 0 | 0 | 0 | 0 of 3 | 1: 0/1, 2: 0/1, 3: 0/1 | 0 | 0 | 0 | 0 | 0 |
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
| intervention textedit/intervention.fires | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
| intervention textedit/intervention.preAction | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 2 of 3 | 1: 1/1, 2: 0/1, 3: 1/1 | 0 | 0 | 0 | 0 | 2 |
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
| unicode textedit/midSwitch/typeText.long | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 |
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
| unicode textedit/composing@electron/typeText.latin | matrix | 1 of 3 | 1: 1/1, 2: 0/1, 3: 0/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 1 |
| unicode textedit/composing@electron/paste.latin | matrix | 1 of 3 | 1: 1/1, 2: 0/1, 3: 0/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 1 |
| unicode textedit/composing@electron/typeText.hangul | matrix | 1 of 3 | 1: 1/1, 2: 0/1, 3: 0/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 1 |
| unicode textedit/composing@electron/paste.hangul | matrix | 1 of 3 | 1: 1/1, 2: 0/1, 3: 0/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 1 |
| unicode textedit/composing@electron/typeText.jamo | matrix | 1 of 3 | 1: 1/1, 2: 0/1, 3: 0/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 1 |
| unicode textedit/composing@electron/paste.jamo | matrix | 1 of 3 | 1: 1/1, 2: 0/1, 3: 0/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 1 |
| unicode textedit/composing@electron/typeText.mixed | matrix | 1 of 3 | 1: 1/1, 2: 0/1, 3: 0/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 1 |
| unicode textedit/composing@electron/paste.mixed | matrix | 1 of 3 | 1: 1/1, 2: 0/1, 3: 0/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 1 |
| unicode textedit/composing@electron/typeText.emoji | matrix | 1 of 3 | 1: 1/1, 2: 0/1, 3: 0/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 1 |
| unicode textedit/composing@electron/paste.emoji | matrix | 1 of 3 | 1: 1/1, 2: 0/1, 3: 0/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 1 |
| unicode textedit/composing@electron/typeText.combining | matrix | 1 of 3 | 1: 1/1, 2: 0/1, 3: 0/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 1 |
| unicode textedit/composing@electron/paste.combining | matrix | 1 of 3 | 1: 1/1, 2: 0/1, 3: 0/1 | 0 | 0 | 0 | 1 (Accessibility lists no window at the scene window's bounds, and shows it as no sheet of the window behind it 1) | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 1 |
| unicode textedit/composing@electron/typeText.kanji | matrix | 1 of 3 | 1: 1/1, 2: 0/1, 3: 0/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 1 |
| unicode textedit/composing@electron/paste.kanji | matrix | 1 of 3 | 1: 1/1, 2: 0/1, 3: 0/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 1 |
| unicode textedit/composing@electron/typeText.lines | matrix | 1 of 3 | 1: 1/1, 2: 0/1, 3: 0/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 1 |
| unicode textedit/composing@electron/paste.lines | matrix | 1 of 3 | 1: 1/1, 2: 0/1, 3: 0/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 1 |
| unicode textedit/composing@electron/typeText.acceptance4 | matrix | 1 of 3 | 1: 1/1, 2: 0/1, 3: 0/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 1 |
| unicode textedit/composing@electron/paste.acceptance4 | matrix | 1 of 3 | 1: 1/1, 2: 0/1, 3: 0/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 1 |
| unicode chrome/composing@textedit/typeText.latin | matrix | 2 of 3 | 1: 1/1, 2: 1/1, 3: 0/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 2 |
| unicode chrome/composing@textedit/paste.latin | matrix | 2 of 3 | 1: 1/1, 2: 1/1, 3: 0/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 2 |
| unicode chrome/composing@textedit/typeText.hangul | matrix | 2 of 3 | 1: 1/1, 2: 1/1, 3: 0/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 2 |
| unicode chrome/composing@textedit/paste.hangul | matrix | 2 of 3 | 1: 1/1, 2: 1/1, 3: 0/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 2 |
| unicode chrome/composing@textedit/typeText.jamo | matrix | 2 of 3 | 1: 1/1, 2: 1/1, 3: 0/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 2 |
| unicode chrome/composing@textedit/paste.jamo | matrix | 2 of 3 | 1: 1/1, 2: 1/1, 3: 0/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 2 |
| unicode chrome/composing@textedit/typeText.mixed | matrix | 2 of 3 | 1: 1/1, 2: 1/1, 3: 0/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 2 |
| unicode chrome/composing@textedit/paste.mixed | matrix | 2 of 3 | 1: 1/1, 2: 1/1, 3: 0/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 2 |
| unicode chrome/composing@textedit/typeText.emoji | matrix | 2 of 3 | 1: 1/1, 2: 1/1, 3: 0/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 2 |
| unicode chrome/composing@textedit/paste.emoji | matrix | 2 of 3 | 1: 1/1, 2: 1/1, 3: 0/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 2 |
| unicode chrome/composing@textedit/typeText.combining | matrix | 2 of 3 | 1: 1/1, 2: 1/1, 3: 0/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 2 |
| unicode chrome/composing@textedit/paste.combining | matrix | 2 of 3 | 1: 1/1, 2: 1/1, 3: 0/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 2 |
| unicode chrome/composing@textedit/typeText.kanji | matrix | 2 of 3 | 1: 1/1, 2: 1/1, 3: 0/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 2 |
| unicode chrome/composing@textedit/paste.kanji | matrix | 2 of 3 | 1: 1/1, 2: 1/1, 3: 0/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 2 |
| unicode chrome/composing@textedit/typeText.lines | matrix | 2 of 3 | 1: 1/1, 2: 1/1, 3: 0/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 2 |
| unicode chrome/composing@textedit/paste.lines | matrix | 2 of 3 | 1: 1/1, 2: 1/1, 3: 0/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 2 |
| unicode chrome/composing@textedit/typeText.acceptance4 | matrix | 2 of 3 | 1: 1/1, 2: 1/1, 3: 0/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 2 |
| unicode chrome/composing@textedit/paste.acceptance4 | matrix | 2 of 3 | 1: 1/1, 2: 1/1, 3: 0/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 2 |
| unicode electron/composing@textedit/typeText.latin | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 2 of 3 | 1: 1/1, 2: 0/1, 3: 1/1 | 0 | 0 | 0 | 0 | 2 |
| unicode electron/composing@textedit/paste.latin | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 2 of 3 | 1: 1/1, 2: 0/1, 3: 1/1 | 0 | 0 | 0 | 0 | 2 |
| unicode electron/composing@textedit/typeText.hangul | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 2 of 3 | 1: 1/1, 2: 0/1, 3: 1/1 | 0 | 0 | 0 | 0 | 2 |
| unicode electron/composing@textedit/paste.hangul | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 2 of 3 | 1: 1/1, 2: 0/1, 3: 1/1 | 0 | 0 | 0 | 0 | 2 |
| unicode electron/composing@textedit/typeText.jamo | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 2 of 3 | 1: 1/1, 2: 0/1, 3: 1/1 | 0 | 0 | 0 | 0 | 2 |
| unicode electron/composing@textedit/paste.jamo | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 2 of 3 | 1: 1/1, 2: 0/1, 3: 1/1 | 0 | 0 | 0 | 0 | 2 |
| unicode electron/composing@textedit/typeText.mixed | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 2 of 3 | 1: 1/1, 2: 0/1, 3: 1/1 | 0 | 0 | 0 | 0 | 2 |
| unicode electron/composing@textedit/paste.mixed | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 2 of 3 | 1: 1/1, 2: 0/1, 3: 1/1 | 0 | 0 | 0 | 0 | 2 |
| unicode electron/composing@textedit/typeText.emoji | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 2 of 3 | 1: 1/1, 2: 0/1, 3: 1/1 | 0 | 0 | 0 | 0 | 2 |
| unicode electron/composing@textedit/paste.emoji | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 2 of 3 | 1: 1/1, 2: 0/1, 3: 1/1 | 0 | 0 | 0 | 0 | 2 |
| unicode electron/composing@textedit/typeText.combining | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 2 of 3 | 1: 1/1, 2: 0/1, 3: 1/1 | 0 | 0 | 0 | 0 | 2 |
| unicode electron/composing@textedit/paste.combining | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 2 of 3 | 1: 1/1, 2: 0/1, 3: 1/1 | 0 | 0 | 0 | 0 | 2 |
| unicode electron/composing@textedit/typeText.kanji | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 2 of 3 | 1: 1/1, 2: 0/1, 3: 1/1 | 0 | 0 | 0 | 0 | 2 |
| unicode electron/composing@textedit/paste.kanji | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 2 of 3 | 1: 1/1, 2: 0/1, 3: 1/1 | 0 | 0 | 0 | 0 | 2 |
| unicode electron/composing@textedit/typeText.lines | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 2 of 3 | 1: 1/1, 2: 0/1, 3: 1/1 | 0 | 0 | 0 | 0 | 2 |
| unicode electron/composing@textedit/paste.lines | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 2 of 3 | 1: 1/1, 2: 0/1, 3: 1/1 | 0 | 0 | 0 | 0 | 2 |
| unicode electron/composing@textedit/typeText.acceptance4 | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 2 of 3 | 1: 1/1, 2: 0/1, 3: 1/1 | 0 | 0 | 0 | 0 | 2 |
| unicode electron/composing@textedit/paste.acceptance4 | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 2 of 3 | 1: 1/1, 2: 0/1, 3: 1/1 | 0 | 0 | 0 | 0 | 2 |
| intervention textedit/intervention.saveSheet | intervention-save-sheet | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 0 of 3 | 1: 0/1, 2: 0/1, 3: 0/1 | 0 | 0 | 0 | 0 | - |

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

### Shared not-interfering failures

Cells where a cua sample failed not interfering with its own paired vendor sample (rulings 1219 and 1222): a product defect both engines share, with its ticket, or the venue's, on the evidence recorded.

| row | reason | ticket or evidence | samples |
|---|---|---|---|
| electron/background/launch@finder | cua failed not interfering with its paired vendor sample, and nothing of the person's moved (a target window above the user's): the venue's (rulings 1219 and 1222) | evidence: cua run 1 sample 1: electron/background/launch@finder's interference.windowOrder.after; vendor run 1 sample 1: electron/background/launch@finder's interference.windowOrder.after; cua run 2 sample 2: electron/background/launch@finder's interference.windowOrder.after; vendor run 2 sample 2: electron/background/launch@finder's interference.windowOrder.after; cua run 3 sample 3: electron/background/launch@finder's interference.windowOrder.after; vendor run 3 sample 3: electron/background/launch@finder's interference.windowOrder.after | 3 |

## By the lane that ran first (ruling 1226)

Runs by the lane that ran first in their run number: vendor first 8, cua first 4. Failed samples: 148 in vendor-first runs, 72 in cua-first runs; samples without a verdict: 270 and 154. Recorded, never judged.

| cell | engine | failed, vendor first | failed, cua first | no verdict, vendor first | no verdict, cua first |
|---|---|---|---|---|---|
| concurrent textedit/concurrent.sheet@electron | cua | 0 | 0 | 2 | 1 |
| concurrent textedit/concurrent.sheet@electron | vendor | 0 | 0 | 2 | 1 |
| intervention textedit/intervention.fires | vendor | 2 | 1 | 0 | 0 |
| intervention textedit/intervention.preAction | cua | 0 | 0 | 0 | 1 |
| intervention textedit/intervention.preAction | vendor | 2 | 1 | 0 | 0 |
| intervention textedit/intervention.saveSheet | cua | 0 | 0 | 2 | 1 |
| launch electron/background/launch@finder | cua | 2 | 1 | 0 | 0 |
| launch electron/background/launch@finder | vendor | 2 | 1 | 0 | 0 |
| method chrome/background/drag.select@textedit | cua | 2 | 1 | 0 | 0 |
| method electron/frontmost/click.point | cua | 2 | 1 | 0 | 0 |
| method electron/frontmost/click.point | vendor | 2 | 1 | 0 | 0 |
| method finder/background/typeText.typeSelect@electron | cua | 2 | 1 | 0 | 0 |
| method finder/background/typeText.typeSelect@textedit | cua | 2 | 1 | 0 | 0 |
| method finder/frontmost/typeText.typeSelect | cua | 2 | 1 | 0 | 0 |
| method openPanel/frontmost/typeText.search | cua | 0 | 0 | 2 | 1 |
| method openPanel/frontmost/typeText.search | vendor | 0 | 0 | 2 | 1 |
| method savePanel/frontmost/typeText.name | vendor | 0 | 0 | 2 | 1 |
| speed textedit/method.panel.typeText.search | cua | 0 | 0 | 2 | 1 |
| speed textedit/method.panel.typeText.search | vendor | 0 | 0 | 2 | 1 |
| speed textedit/method.savePanel.typeText.name | vendor | 0 | 0 | 2 | 1 |
| unicode chrome/composing@textedit/paste.acceptance4 | vendor | 0 | 0 | 1 | 0 |
| unicode chrome/composing@textedit/paste.combining | vendor | 0 | 0 | 1 | 0 |
| unicode chrome/composing@textedit/paste.emoji | vendor | 0 | 0 | 1 | 0 |
| unicode chrome/composing@textedit/paste.hangul | vendor | 0 | 0 | 1 | 0 |
| unicode chrome/composing@textedit/paste.jamo | vendor | 0 | 0 | 1 | 0 |
| unicode chrome/composing@textedit/paste.kanji | vendor | 0 | 0 | 1 | 0 |
| unicode chrome/composing@textedit/paste.latin | vendor | 0 | 0 | 1 | 0 |
| unicode chrome/composing@textedit/paste.lines | vendor | 0 | 0 | 1 | 0 |
| unicode chrome/composing@textedit/paste.mixed | vendor | 0 | 0 | 1 | 0 |
| unicode chrome/composing@textedit/typeText.acceptance4 | vendor | 1 | 1 | 1 | 0 |
| unicode chrome/composing@textedit/typeText.combining | vendor | 1 | 1 | 1 | 0 |
| unicode chrome/composing@textedit/typeText.emoji | vendor | 1 | 1 | 1 | 0 |
| unicode chrome/composing@textedit/typeText.hangul | vendor | 1 | 1 | 1 | 0 |
| unicode chrome/composing@textedit/typeText.jamo | vendor | 0 | 0 | 1 | 0 |
| unicode chrome/composing@textedit/typeText.kanji | vendor | 1 | 1 | 1 | 0 |
| unicode chrome/composing@textedit/typeText.latin | vendor | 0 | 0 | 1 | 0 |
| unicode chrome/composing@textedit/typeText.lines | vendor | 1 | 1 | 1 | 0 |
| unicode chrome/composing@textedit/typeText.mixed | vendor | 1 | 1 | 1 | 0 |
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
| unicode electron/composing@textedit/paste.acceptance4 | cua | 0 | 0 | 0 | 1 |
| unicode electron/composing@textedit/paste.combining | cua | 0 | 0 | 0 | 1 |
| unicode electron/composing@textedit/paste.emoji | cua | 0 | 0 | 0 | 1 |
| unicode electron/composing@textedit/paste.hangul | cua | 0 | 0 | 0 | 1 |
| unicode electron/composing@textedit/paste.jamo | cua | 0 | 0 | 0 | 1 |
| unicode electron/composing@textedit/paste.kanji | cua | 0 | 0 | 0 | 1 |
| unicode electron/composing@textedit/paste.latin | cua | 0 | 0 | 0 | 1 |
| unicode electron/composing@textedit/paste.lines | cua | 0 | 0 | 0 | 1 |
| unicode electron/composing@textedit/paste.mixed | cua | 0 | 0 | 0 | 1 |
| unicode electron/composing@textedit/typeText.acceptance4 | cua | 0 | 0 | 0 | 1 |
| unicode electron/composing@textedit/typeText.acceptance4 | vendor | 2 | 1 | 0 | 0 |
| unicode electron/composing@textedit/typeText.combining | cua | 0 | 0 | 0 | 1 |
| unicode electron/composing@textedit/typeText.combining | vendor | 2 | 1 | 0 | 0 |
| unicode electron/composing@textedit/typeText.emoji | cua | 0 | 0 | 0 | 1 |
| unicode electron/composing@textedit/typeText.emoji | vendor | 2 | 1 | 0 | 0 |
| unicode electron/composing@textedit/typeText.hangul | cua | 0 | 0 | 0 | 1 |
| unicode electron/composing@textedit/typeText.hangul | vendor | 2 | 1 | 0 | 0 |
| unicode electron/composing@textedit/typeText.jamo | cua | 0 | 0 | 0 | 1 |
| unicode electron/composing@textedit/typeText.kanji | cua | 0 | 0 | 0 | 1 |
| unicode electron/composing@textedit/typeText.kanji | vendor | 2 | 1 | 0 | 0 |
| unicode electron/composing@textedit/typeText.latin | cua | 0 | 0 | 0 | 1 |
| unicode electron/composing@textedit/typeText.lines | cua | 0 | 0 | 0 | 1 |
| unicode electron/composing@textedit/typeText.lines | vendor | 2 | 1 | 0 | 0 |
| unicode electron/composing@textedit/typeText.mixed | cua | 0 | 0 | 0 | 1 |
| unicode electron/composing@textedit/typeText.mixed | vendor | 2 | 1 | 0 | 0 |
| unicode electron/korean/pressKey.rk | vendor | 1 | 0 | 0 | 0 |
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
| unicode textedit/composing@electron/paste.acceptance4 | vendor | 0 | 0 | 1 | 1 |
| unicode textedit/composing@electron/paste.combining | vendor | 0 | 0 | 1 | 1 |
| unicode textedit/composing@electron/paste.emoji | vendor | 0 | 0 | 1 | 1 |
| unicode textedit/composing@electron/paste.hangul | vendor | 0 | 0 | 1 | 1 |
| unicode textedit/composing@electron/paste.jamo | vendor | 0 | 0 | 1 | 1 |
| unicode textedit/composing@electron/paste.kanji | vendor | 0 | 0 | 1 | 1 |
| unicode textedit/composing@electron/paste.latin | vendor | 0 | 0 | 1 | 1 |
| unicode textedit/composing@electron/paste.lines | vendor | 0 | 0 | 1 | 1 |
| unicode textedit/composing@electron/paste.mixed | vendor | 0 | 0 | 1 | 1 |
| unicode textedit/composing@electron/typeText.acceptance4 | vendor | 1 | 0 | 1 | 1 |
| unicode textedit/composing@electron/typeText.combining | vendor | 1 | 0 | 1 | 1 |
| unicode textedit/composing@electron/typeText.emoji | vendor | 1 | 0 | 1 | 1 |
| unicode textedit/composing@electron/typeText.hangul | vendor | 1 | 0 | 1 | 1 |
| unicode textedit/composing@electron/typeText.jamo | vendor | 0 | 0 | 1 | 1 |
| unicode textedit/composing@electron/typeText.kanji | vendor | 1 | 0 | 1 | 1 |
| unicode textedit/composing@electron/typeText.latin | vendor | 0 | 0 | 1 | 1 |
| unicode textedit/composing@electron/typeText.lines | vendor | 1 | 0 | 1 | 1 |
| unicode textedit/composing@electron/typeText.mixed | vendor | 1 | 0 | 1 | 1 |
| unicode textedit/korean/typeText.acceptance4 | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/korean/typeText.combining | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/korean/typeText.emoji | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/korean/typeText.hangul | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/korean/typeText.kanji | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/korean/typeText.lines | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/korean/typeText.mixed | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/latin/typeText.acceptance4 | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/latin/typeText.combining | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/latin/typeText.emoji | cua | 2 | 0 | 0 | 0 |
| unicode textedit/latin/typeText.emoji | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/latin/typeText.hangul | cua | 1 | 0 | 0 | 0 |
| unicode textedit/latin/typeText.hangul | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/latin/typeText.jamo | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/latin/typeText.kanji | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/latin/typeText.lines | vendor | 2 | 1 | 0 | 0 |
| unicode textedit/latin/typeText.mixed | vendor | 2 | 1 | 0 | 0 |
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

## The alert guard

Per step and cell: the cells the alert guard refused unsent (NO VERDICT `alert` or `unread`) and those the key-window requirement refused (NO VERDICT `keyWindow`: the scene's app held another key window, or none), the key cells guarded with their key reading not taken (`key cells guarded unread`: unguarded against the alert holding the key, which the key guard's front check cannot see), the click or key cells sent with their key window read (`cells key window read`), and those sent with it unread (`cells key window unread`, with why: an untrusted reader means the key-window requirement went unobserved).

| step | cell | NO VERDICT alert | NO VERDICT unread | NO VERDICT keyWindow | key cells guarded unread | cells key window read | cells key window unread |
|---|---|---|---|---|---|---|---|
| matrix-vendor-1 | row:46 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-1 | row:48 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:50 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:52 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:56 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:60 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:62 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-1 | row:64 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:70 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-1 | keys:super+o | 0 | 0 | 0 | 0 | 5 | 0 |
| matrix-vendor-1 | keys:super+n | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-1 | keys:super+s | 0 | 0 | 0 | 0 | 3 | 0 |
| matrix-vendor-1 | save-panel:untitled | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:116 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-1 | row:132 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:134 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:136 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:140 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:142 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-1 | row:190 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-1 | row:192 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:194 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:200 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:202 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-1 | row:204 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:210 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-1 | row:258 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-1 | row:260 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:262 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:268 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:270 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:274 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:276 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:278 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-1 | row:282 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-1 | row:283 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:284 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:285 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:287 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:289 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:290 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-1 | row:291 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:294 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-1 | row:297 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:298 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:299 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:301 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:302 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-1 | row:305 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-1 | row:306 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:307 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:310 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:311 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-1 | row:312 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:317 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-1 | row:318 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:319 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:320 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:322 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:324 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:325 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-1 | row:326 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:329 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-1 | row:332 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-1 | row:333 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:334 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:337 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:338 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:342 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:343 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:344 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:346 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:347 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-1 | row:351 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:351:1 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-1 | row:352 | 0 | 0 | 0 | 0 | 1 | 1 (Accessibility lists no window at the scene window's bounds, and shows it as no sheet of the window behind it 1) |
| matrix-vendor-1 | row:352:1 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-1 | row:353 | 0 | 0 | 0 | 0 | 6 | 0 |
| matrix-vendor-1 | row:353:1 | 0 | 0 | 0 | 0 | 3 | 0 |
| matrix-vendor-1 | row:353:2 | 0 | 0 | 0 | 0 | 3 | 0 |
| matrix-vendor-1 | row:353:3 | 0 | 0 | 0 | 0 | 3 | 0 |
| matrix-vendor-1 | row:354 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-1 | row:354:1 | 0 | 0 | 0 | 0 | 3 | 0 |
| matrix-vendor-1 | row:355 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-1 | row:355:1 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-1 | row:356 | 0 | 0 | 0 | 0 | 1 | 1 (Accessibility lists no window at the scene window's bounds, and shows it as no sheet of the window behind it 1) |
| matrix-vendor-1 | row:357 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:358 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:359 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:360 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:361 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:362 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:363 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:364 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:365 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:366 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:367 | 0 | 0 | 0 | 0 | 1 | 1 (Accessibility lists no window at the scene window's bounds, and shows it as no sheet of the window behind it 1) |
| matrix-vendor-1 | row:368 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:369 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:370 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:371 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:372 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:373 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:374 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:375 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:376 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:377 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:378 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:379 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:380 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:381 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:382 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:383 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:384 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:385 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:386 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:387 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:388 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:389 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:390 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:391 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:392 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:393 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:394 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:395 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:396 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:397 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:398 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:399 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:400 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:401 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:402 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:403 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:404 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:405 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:406 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:407 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:408 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:409 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:410 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:411 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:412 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:413 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-1 | row:413:1 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-1 | row:414 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-1 | row:414:1 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-1 | row:415 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-1 | row:415:1 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-1 | row:416 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:417 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:418 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:419 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:420 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:421 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:422 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:423 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:424 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:425 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:426 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:427 | 0 | 0 | 0 | 0 | 1 | 1 (Accessibility lists no window at the scene window's bounds, and shows it as no sheet of the window behind it 1) |
| matrix-vendor-1 | row:428 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:429 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:430 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:431 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:432 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:433 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:434 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:435 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:436 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:437 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:438 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:439 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:440 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:441 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:442 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:443 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:444 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:445 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:446 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:447 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:448 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:449 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:450 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:451 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:452 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:453 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:454 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:455 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:456 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:457 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:458 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:459 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:460 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:461 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:462 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:463 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:464 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:465 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:466 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:467 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:468 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:469 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:470 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:471 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:472 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | unicode:prepare:textedit | 0 | 0 | 0 | 0 | 4 | 0 |
| matrix-vendor-1 | unicode:prepare:electron | 0 | 0 | 0 | 0 | 3 | 0 |
| matrix-vendor-1 | row:473 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:474 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:475 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:476 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:477 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:478 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:479 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:480 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:481 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:482 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:483 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:484 | 0 | 0 | 0 | 0 | 1 | 1 (Accessibility lists no window at the scene window's bounds, and shows it as no sheet of the window behind it 1) |
| matrix-vendor-1 | row:485 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:486 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:487 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:488 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:489 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:490 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | unicode:prepare:chrome | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:491 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:492 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:493 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:494 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:495 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:496 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:497 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:498 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:499 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:500 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:501 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:502 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:503 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:504 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:505 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:506 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:507 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:508 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:509 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:510 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:511 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:512 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:513 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:514 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:515 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:516 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:517 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:518 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:519 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:520 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:521 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:522 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:523 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:524 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:525 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:526 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:527 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:528 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:529 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:530 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:531 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:532 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:533 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:534 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:535 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:536 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:537 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:538 | 0 | 0 | 0 | 0 | 1 | 1 (Accessibility lists no window at the scene window's bounds, and shows it as no sheet of the window behind it 1) |
| matrix-vendor-1 | row:539 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:540 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:541 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:542 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:543 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:544 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:545 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:546 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:547 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:548 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:549 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:550 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:551 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:552 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:553 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:554 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:555 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:556 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:557 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:558 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:559 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:560 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:561 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:562 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:563 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:564 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:565 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:566 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:567 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:568 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:569 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:570 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:571 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:572 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:573 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:574 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:575 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:576 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:577 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:578 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:579 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-1 | row:580 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:46 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-1 | row:48 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:50 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:52 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:56 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:60 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:62 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-1 | row:64 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:70 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-1 | keys:super+o | 0 | 0 | 0 | 0 | 5 | 0 |
| matrix-cua-1 | keys:super+n | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-1 | keys:super+s | 0 | 0 | 0 | 0 | 3 | 0 |
| matrix-cua-1 | save-panel:untitled | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:116 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-1 | row:132 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:134 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:136 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:140 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:142 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-1 | row:190 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-1 | row:192 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:194 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:200 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:202 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-1 | row:204 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:210 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-1 | row:258 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-1 | row:260 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:262 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:268 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:270 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:274 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:276 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:278 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-1 | row:282 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-1 | row:283 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:284 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:285 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:287 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:289 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:290 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-1 | row:291 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:294 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-1 | row:297 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:298 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:299 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:301 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:302 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-1 | row:305 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-1 | row:306 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:307 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:310 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:311 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-1 | row:312 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:317 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-1 | row:318 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:319 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:320 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:322 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:324 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:325 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-1 | row:326 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:329 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-1 | row:332 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-1 | row:333 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:334 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:337 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:338 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:342 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:343 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:344 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:346 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:347 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-1 | row:351 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:351:1 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-1 | row:352 | 0 | 0 | 0 | 0 | 1 | 1 (Accessibility lists no window at the scene window's bounds, and shows it as no sheet of the window behind it 1) |
| matrix-cua-1 | row:352:1 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-1 | row:353 | 0 | 0 | 0 | 0 | 6 | 0 |
| matrix-cua-1 | row:353:1 | 0 | 0 | 0 | 0 | 3 | 0 |
| matrix-cua-1 | row:353:2 | 0 | 0 | 0 | 0 | 3 | 0 |
| matrix-cua-1 | row:353:3 | 0 | 0 | 0 | 0 | 3 | 0 |
| matrix-cua-1 | row:354 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-1 | row:354:1 | 0 | 0 | 0 | 0 | 3 | 0 |
| matrix-cua-1 | row:355 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-1 | row:355:1 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-1 | row:356 | 0 | 0 | 0 | 0 | 1 | 1 (Accessibility lists no window at the scene window's bounds, and shows it as no sheet of the window behind it 1) |
| matrix-cua-1 | row:357 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:358 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:359 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:360 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:361 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:362 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:363 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:364 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:365 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:366 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:367 | 0 | 0 | 0 | 0 | 1 | 1 (Accessibility lists no window at the scene window's bounds, and shows it as no sheet of the window behind it 1) |
| matrix-cua-1 | row:368 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:369 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:370 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:371 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:372 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:373 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:374 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:375 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:376 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:377 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:378 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:379 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:380 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:381 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:382 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:383 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:384 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:385 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:386 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:387 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:388 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:389 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:390 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:391 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:392 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:393 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:394 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:395 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:396 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:397 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:398 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:399 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:400 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:401 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:402 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:403 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:404 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:405 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:406 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:407 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:408 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:409 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:410 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:411 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:412 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:413 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-1 | row:413:1 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-1 | row:414 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-1 | row:414:1 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-1 | row:415 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-1 | row:415:1 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-1 | row:416 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:417 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:418 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:419 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:420 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:421 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:422 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:423 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:424 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:425 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:426 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:427 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:428 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:429 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:430 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:431 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:432 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:433 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:434 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:435 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:436 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:437 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:438 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:439 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:440 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:441 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:442 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:443 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:444 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:445 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:446 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:447 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:448 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:449 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:450 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:451 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:452 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:453 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:454 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:455 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:456 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:457 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:458 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:459 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:460 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:461 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:462 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:463 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:464 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:465 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:466 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:467 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:468 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:469 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:470 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:471 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:472 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | unicode:prepare:textedit | 0 | 0 | 0 | 0 | 4 | 0 |
| matrix-cua-1 | unicode:prepare:electron | 0 | 0 | 0 | 0 | 3 | 0 |
| matrix-cua-1 | row:473 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:474 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:475 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:476 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:477 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:478 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:479 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:480 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:481 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:482 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:483 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:484 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:485 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:486 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:487 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:488 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:489 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:490 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | unicode:prepare:chrome | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:491 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:492 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:493 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:494 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:495 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:496 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:497 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:498 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:499 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:500 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:501 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:502 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:503 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:504 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:505 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:506 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:507 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:508 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:509 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:510 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:511 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:512 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:513 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:514 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:515 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:516 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:517 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:518 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:519 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:520 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:521 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:522 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:523 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:524 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:525 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:526 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:527 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:528 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:529 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:530 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:531 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:532 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:533 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:534 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:535 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:536 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:537 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:538 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:539 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:540 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:541 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:542 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:543 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:544 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:545 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:546 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:547 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:548 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:549 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:550 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:551 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:552 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:553 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:554 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:555 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:556 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:557 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:558 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:559 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:560 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:561 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:562 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:563 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:564 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:565 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:566 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:567 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:568 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:569 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:570 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:571 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:572 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:573 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:574 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:575 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:576 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:577 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:578 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:579 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-1 | row:580 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:46 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | row:48 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:50 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:52 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:56 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:60 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:62 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | row:64 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:70 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | keys:super+o | 0 | 0 | 0 | 0 | 5 | 0 |
| matrix-cua-2 | keys:super+n | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | keys:super+s | 0 | 0 | 0 | 0 | 3 | 0 |
| matrix-cua-2 | save-panel:untitled | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:116 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | row:132 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:134 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:136 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:140 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:142 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | row:190 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | row:192 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:194 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:200 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:202 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | row:204 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:210 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | row:258 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | row:260 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:262 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:268 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:270 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:274 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:276 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:278 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | row:282 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | row:283 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:284 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:285 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:287 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:289 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:290 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | row:291 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:294 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | row:297 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:298 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:299 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:301 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:302 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | row:305 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | row:306 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:307 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:310 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:311 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | row:312 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:317 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | row:318 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:319 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:320 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:322 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:324 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:325 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | row:326 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:329 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | row:332 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | row:333 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:334 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:337 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:338 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:342 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:343 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:344 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:346 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:347 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | row:351 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:351:1 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | row:352 | 0 | 0 | 0 | 0 | 1 | 1 (Accessibility lists no window at the scene window's bounds, and shows it as no sheet of the window behind it 1) |
| matrix-cua-2 | row:352:1 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | row:353 | 0 | 0 | 0 | 0 | 6 | 0 |
| matrix-cua-2 | row:353:1 | 0 | 0 | 0 | 0 | 3 | 0 |
| matrix-cua-2 | row:353:2 | 0 | 0 | 0 | 0 | 3 | 0 |
| matrix-cua-2 | row:353:3 | 0 | 0 | 0 | 0 | 3 | 0 |
| matrix-cua-2 | row:354 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | row:354:1 | 0 | 0 | 0 | 0 | 3 | 0 |
| matrix-cua-2 | row:356 | 0 | 0 | 0 | 0 | 1 | 1 (Accessibility lists no window at the scene window's bounds, and shows it as no sheet of the window behind it 1) |
| matrix-cua-2 | row:357 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:358 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:359 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:360 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:361 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:362 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:363 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:364 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:365 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:366 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:367 | 0 | 0 | 0 | 0 | 1 | 1 (Accessibility lists no window at the scene window's bounds, and shows it as no sheet of the window behind it 1) |
| matrix-cua-2 | row:368 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:369 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:370 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:371 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:372 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:373 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:374 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:375 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:376 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:377 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:378 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:379 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:380 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:381 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:382 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:383 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:384 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:385 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:386 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:387 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:388 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:389 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:390 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:391 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:392 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:393 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:394 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:395 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:396 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:397 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:398 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:399 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:400 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:401 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:402 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:403 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:404 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:405 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:406 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:407 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:408 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:409 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:410 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:411 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:412 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:413 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | row:413:1 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | row:414 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | row:414:1 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | row:415 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | row:415:1 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-2 | row:416 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:417 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:418 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:419 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:420 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:421 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:422 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:423 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:424 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:425 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:426 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:427 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:428 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:429 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:430 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:431 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:432 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:433 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:434 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:435 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:436 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:437 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:438 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:439 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:440 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:441 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:442 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:443 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:444 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:445 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:446 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:447 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:448 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:449 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:450 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:451 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:452 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:453 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:454 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:455 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:456 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:457 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:458 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:459 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:460 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:461 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:462 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:463 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:464 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:465 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:466 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:467 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:468 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:469 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:470 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:471 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:472 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | unicode:prepare:textedit | 0 | 0 | 0 | 0 | 4 | 0 |
| matrix-cua-2 | unicode:prepare:electron | 0 | 0 | 0 | 0 | 3 | 0 |
| matrix-cua-2 | row:473 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:474 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:475 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:476 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:477 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:478 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:479 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:480 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:481 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:482 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:483 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:484 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:485 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:486 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:487 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:488 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:489 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:490 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | unicode:prepare:chrome | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:491 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:492 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:493 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:494 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:495 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:496 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:497 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:498 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:499 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:500 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:501 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:502 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:503 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:504 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:505 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:506 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:507 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:508 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:527 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:528 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:529 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:530 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:531 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:532 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:533 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:534 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:535 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:536 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:537 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:538 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:539 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:540 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:541 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:542 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:543 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:544 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:545 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:546 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:547 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:548 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:549 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:550 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:551 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:552 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:553 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:554 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:555 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:556 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:557 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:558 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:559 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:560 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:561 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:562 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:563 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:564 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:565 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:566 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:567 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:568 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:569 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:570 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:571 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:572 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:573 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:574 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:575 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:576 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:577 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:578 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:579 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-2 | row:580 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:46 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | row:48 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:50 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:52 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:56 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:60 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:62 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | row:64 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:70 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | keys:super+o | 0 | 0 | 0 | 0 | 5 | 0 |
| matrix-vendor-2 | keys:super+n | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | keys:super+s | 0 | 0 | 0 | 0 | 3 | 0 |
| matrix-vendor-2 | save-panel:untitled | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:116 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | row:132 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:134 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:136 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:140 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:142 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | row:190 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | row:192 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:194 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:200 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:202 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | row:204 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:210 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | row:258 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | row:260 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:262 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:268 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:270 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:274 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:276 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:278 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | row:282 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | row:283 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:284 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:285 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:287 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:289 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:290 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | row:291 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:294 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | row:297 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:298 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:299 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:301 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:302 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | row:305 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | row:306 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:307 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:310 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:311 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | row:312 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:317 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | row:318 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:319 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:320 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:322 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:324 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:325 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | row:326 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:329 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | row:332 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | row:333 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:334 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:337 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:338 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:342 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:343 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:344 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:346 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:347 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | row:351 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:351:1 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | row:352 | 0 | 0 | 0 | 0 | 1 | 1 (Accessibility lists no window at the scene window's bounds, and shows it as no sheet of the window behind it 1) |
| matrix-vendor-2 | row:352:1 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | row:353 | 0 | 0 | 0 | 0 | 6 | 0 |
| matrix-vendor-2 | row:353:1 | 0 | 0 | 0 | 0 | 3 | 0 |
| matrix-vendor-2 | row:353:2 | 0 | 0 | 0 | 0 | 3 | 0 |
| matrix-vendor-2 | row:353:3 | 0 | 0 | 0 | 0 | 3 | 0 |
| matrix-vendor-2 | row:354 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | row:354:1 | 0 | 0 | 0 | 0 | 3 | 0 |
| matrix-vendor-2 | row:355 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | row:355:1 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | row:356 | 0 | 0 | 0 | 0 | 1 | 1 (Accessibility lists no window at the scene window's bounds, and shows it as no sheet of the window behind it 1) |
| matrix-vendor-2 | row:357 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:358 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:359 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:360 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:361 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:362 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:363 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:364 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:365 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:366 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:367 | 0 | 0 | 0 | 0 | 1 | 1 (Accessibility lists no window at the scene window's bounds, and shows it as no sheet of the window behind it 1) |
| matrix-vendor-2 | row:368 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:369 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:370 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:371 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:372 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:373 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:374 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:375 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:376 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:377 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:378 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:379 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:380 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:381 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:382 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:383 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:384 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:385 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:386 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:387 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:388 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:389 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:390 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:391 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:392 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:393 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:394 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:395 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:396 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:397 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:398 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:399 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:400 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:401 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:402 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:403 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:404 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:405 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:406 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:407 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:408 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:409 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:410 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:411 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:412 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:413 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | row:413:1 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | row:414 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | row:414:1 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | row:415 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | row:415:1 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-2 | row:416 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:417 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:418 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:419 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:420 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:421 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:422 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:423 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:424 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:425 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:426 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:427 | 0 | 0 | 0 | 0 | 1 | 1 (Accessibility lists no window at the scene window's bounds, and shows it as no sheet of the window behind it 1) |
| matrix-vendor-2 | row:428 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:429 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:430 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:431 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:432 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:433 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:434 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:435 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:436 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:437 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:438 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:439 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:440 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:441 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:442 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:443 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:444 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:445 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:446 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:447 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:448 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:449 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:450 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:451 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:452 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:453 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:454 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:455 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:456 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:457 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:458 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:459 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:460 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:461 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:462 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:463 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:464 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:465 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:466 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:467 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:468 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:469 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:470 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:471 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:472 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | unicode:prepare:textedit | 0 | 0 | 0 | 0 | 4 | 0 |
| matrix-vendor-2 | unicode:prepare:electron | 0 | 0 | 0 | 0 | 3 | 0 |
| matrix-vendor-2 | unicode:prepare:chrome | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:491 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:492 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:493 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:494 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:495 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:496 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:497 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:498 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:499 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:500 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:501 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:502 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:503 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:504 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:505 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:506 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:507 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:508 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:509 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:510 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:511 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:512 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:513 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:514 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:515 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:516 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:517 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:518 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:519 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:520 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:521 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:522 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:523 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:524 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:525 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:526 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:527 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:528 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:529 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:530 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:531 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:532 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:533 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:534 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:535 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:536 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:537 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:538 | 0 | 0 | 0 | 0 | 1 | 1 (Accessibility lists no window at the scene window's bounds, and shows it as no sheet of the window behind it 1) |
| matrix-vendor-2 | row:539 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:540 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:541 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:542 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:543 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:544 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:545 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:546 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:547 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:548 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:549 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:550 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:551 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:552 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:553 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:554 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:555 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:556 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:557 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:558 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:559 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:560 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:561 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:562 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:563 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:564 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:565 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:566 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:567 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:568 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:569 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:570 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:571 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:572 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:573 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:574 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:575 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:576 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:577 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:578 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:579 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-2 | row:580 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:46 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-3 | row:48 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:50 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:52 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:56 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:60 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:62 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-3 | row:64 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:70 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-3 | keys:super+o | 0 | 0 | 0 | 0 | 5 | 0 |
| matrix-vendor-3 | keys:super+n | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-3 | keys:super+s | 0 | 0 | 0 | 0 | 3 | 0 |
| matrix-vendor-3 | save-panel:untitled | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:116 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-3 | row:132 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:134 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:136 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:140 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:142 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-3 | row:190 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-3 | row:192 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:194 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:200 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:202 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-3 | row:204 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:210 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-3 | row:258 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-3 | row:260 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:262 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:268 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:270 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:274 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:276 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:278 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-3 | row:282 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-3 | row:283 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:284 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:285 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:287 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:289 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:290 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-3 | row:291 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:294 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-3 | row:297 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:298 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:299 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:301 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:302 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-3 | row:305 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-3 | row:306 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:307 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:310 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:311 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-3 | row:312 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:317 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-3 | row:318 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:319 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:320 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:322 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:324 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:325 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-3 | row:326 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:329 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-3 | row:332 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-3 | row:333 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:334 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:337 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:338 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:342 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:343 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:344 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:346 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:347 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-3 | row:351 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:351:1 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-3 | row:352 | 0 | 0 | 0 | 0 | 1 | 1 (Accessibility lists no window at the scene window's bounds, and shows it as no sheet of the window behind it 1) |
| matrix-vendor-3 | row:352:1 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-3 | row:353 | 0 | 0 | 0 | 0 | 6 | 0 |
| matrix-vendor-3 | row:353:1 | 0 | 0 | 0 | 0 | 3 | 0 |
| matrix-vendor-3 | row:353:2 | 0 | 0 | 0 | 0 | 3 | 0 |
| matrix-vendor-3 | row:353:3 | 0 | 0 | 0 | 0 | 3 | 0 |
| matrix-vendor-3 | row:354 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-3 | row:354:1 | 0 | 0 | 0 | 0 | 3 | 0 |
| matrix-vendor-3 | row:355 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-3 | row:355:1 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-3 | row:356 | 0 | 0 | 0 | 0 | 1 | 1 (Accessibility lists no window at the scene window's bounds, and shows it as no sheet of the window behind it 1) |
| matrix-vendor-3 | row:357 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:358 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:359 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:360 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:361 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:362 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:363 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:364 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:365 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:366 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:367 | 0 | 0 | 0 | 0 | 1 | 1 (Accessibility lists no window at the scene window's bounds, and shows it as no sheet of the window behind it 1) |
| matrix-vendor-3 | row:368 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:369 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:370 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:371 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:372 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:373 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:374 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:375 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:376 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:377 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:378 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:379 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:380 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:381 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:382 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:383 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:384 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:385 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:386 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:387 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:388 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:389 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:390 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:391 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:392 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:393 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:394 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:395 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:396 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:397 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:398 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:399 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:400 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:401 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:402 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:403 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:404 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:405 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:406 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:407 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:408 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:409 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:410 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:411 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:412 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:413 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-3 | row:413:1 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-3 | row:414 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-3 | row:414:1 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-3 | row:415 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-3 | row:415:1 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-3 | row:416 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:417 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:418 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:419 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:420 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:421 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:422 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:423 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:424 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:425 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:426 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:427 | 0 | 0 | 0 | 0 | 1 | 1 (Accessibility lists no window at the scene window's bounds, and shows it as no sheet of the window behind it 1) |
| matrix-vendor-3 | row:428 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:429 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:430 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:431 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:432 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:433 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:434 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:435 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:436 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:437 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:438 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:439 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:440 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:441 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:442 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:443 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:444 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:445 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:446 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:447 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:448 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:449 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:450 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:451 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:452 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:453 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:454 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:455 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:456 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:457 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:458 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:459 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:460 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:461 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:462 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:463 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:464 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:465 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:466 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:467 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:468 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:469 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:470 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:471 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:472 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | unicode:prepare:textedit | 0 | 0 | 0 | 0 | 4 | 0 |
| matrix-vendor-3 | unicode:prepare:electron | 0 | 0 | 0 | 0 | 3 | 0 |
| matrix-vendor-3 | unicode:prepare:chrome | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:509 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:510 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:511 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:512 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:513 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:514 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:515 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:516 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:517 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:518 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:519 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:520 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:521 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:522 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:523 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:524 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:525 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:526 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:527 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:528 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:529 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:530 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:531 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:532 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:533 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:534 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:535 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:536 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:537 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:538 | 0 | 0 | 0 | 0 | 1 | 1 (Accessibility lists no window at the scene window's bounds, and shows it as no sheet of the window behind it 1) |
| matrix-vendor-3 | row:539 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:540 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:541 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:542 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:543 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:544 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:545 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:546 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:547 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:548 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:549 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:550 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:551 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:552 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:553 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:554 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:555 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:556 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:557 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:558 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:559 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:560 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:561 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:562 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:563 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:564 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:565 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:566 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:567 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:568 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:569 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:570 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:571 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:572 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:573 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:574 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:575 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:576 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:577 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:578 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:579 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:580 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:46 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-3 | row:48 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:50 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:52 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:56 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:60 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:62 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-3 | row:64 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:70 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-3 | keys:super+o | 0 | 0 | 0 | 0 | 5 | 0 |
| matrix-cua-3 | keys:super+n | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-3 | keys:super+s | 0 | 0 | 0 | 0 | 3 | 0 |
| matrix-cua-3 | save-panel:untitled | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:116 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-3 | row:132 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:134 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:136 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:140 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:142 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-3 | row:190 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-3 | row:192 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:194 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:200 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:202 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-3 | row:204 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:210 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-3 | row:258 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-3 | row:260 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:262 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:268 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:270 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:274 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:276 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:278 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-3 | row:282 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-3 | row:283 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:284 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:285 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:287 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:289 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:290 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-3 | row:291 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:294 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-3 | row:297 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:298 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:299 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:301 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:302 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-3 | row:305 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-3 | row:306 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:307 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:310 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:311 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-3 | row:312 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:317 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-3 | row:318 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:319 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:320 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:322 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:324 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:325 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-3 | row:326 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:329 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-3 | row:332 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-3 | row:333 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:334 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:337 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:338 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:342 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:343 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:344 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:346 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:347 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-3 | row:351 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:351:1 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-3 | row:352 | 0 | 0 | 0 | 0 | 1 | 1 (Accessibility lists no window at the scene window's bounds, and shows it as no sheet of the window behind it 1) |
| matrix-cua-3 | row:352:1 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-3 | row:353 | 0 | 0 | 0 | 0 | 6 | 0 |
| matrix-cua-3 | row:353:1 | 0 | 0 | 0 | 0 | 3 | 0 |
| matrix-cua-3 | row:353:2 | 0 | 0 | 0 | 0 | 3 | 0 |
| matrix-cua-3 | row:353:3 | 0 | 0 | 0 | 0 | 3 | 0 |
| matrix-cua-3 | row:354 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-3 | row:354:1 | 0 | 0 | 0 | 0 | 3 | 0 |
| matrix-cua-3 | row:355 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-3 | row:355:1 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-3 | row:356 | 0 | 0 | 0 | 0 | 1 | 1 (Accessibility lists no window at the scene window's bounds, and shows it as no sheet of the window behind it 1) |
| matrix-cua-3 | row:357 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:358 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:359 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:360 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:361 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:362 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:363 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:364 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:365 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:366 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:367 | 0 | 0 | 0 | 0 | 1 | 1 (Accessibility lists no window at the scene window's bounds, and shows it as no sheet of the window behind it 1) |
| matrix-cua-3 | row:368 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:369 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:370 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:371 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:372 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:373 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:374 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:375 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:376 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:377 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:378 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:379 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:380 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:381 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:382 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:383 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:384 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:385 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:386 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:387 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:388 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:389 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:390 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:391 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:392 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:393 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:394 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:395 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:396 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:397 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:398 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:399 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:400 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:401 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:402 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:403 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:404 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:405 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:406 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:407 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:408 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:409 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:410 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:411 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:412 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:413 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-3 | row:413:1 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-3 | row:414 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-3 | row:414:1 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-3 | row:415 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-3 | row:415:1 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-3 | row:416 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:417 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:418 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:419 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:420 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:421 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:422 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:423 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:424 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:425 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:426 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:427 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:428 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:429 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:430 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:431 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:432 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:433 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:434 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:435 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:436 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:437 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:438 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:439 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:440 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:441 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:442 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:443 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:444 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:445 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:446 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:447 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:448 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:449 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:450 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:451 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:452 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:453 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:454 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:455 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:456 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:457 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:458 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:459 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:460 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:461 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:462 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:463 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:464 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:465 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:466 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:467 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:468 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:469 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:470 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:471 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:472 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | unicode:prepare:textedit | 0 | 0 | 0 | 0 | 4 | 0 |
| matrix-cua-3 | unicode:prepare:electron | 0 | 0 | 0 | 0 | 3 | 0 |
| matrix-cua-3 | row:473 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:474 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:475 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:476 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:477 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:478 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:479 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:480 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:481 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:482 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:483 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:484 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:485 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:486 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:487 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:488 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:489 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:490 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | unicode:prepare:chrome | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:491 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:492 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:493 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:494 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:495 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:496 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:497 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:498 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:499 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:500 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:501 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:502 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:503 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:504 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:505 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:506 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:507 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:508 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:509 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:510 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:511 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:512 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:513 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:514 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:515 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:516 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:517 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:518 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:519 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:520 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:521 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:522 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:523 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:524 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:525 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:526 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:527 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:528 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:529 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:530 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:531 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:532 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:533 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:534 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:535 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:536 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:537 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:538 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:539 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:540 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:541 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:542 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:543 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:544 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:545 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:546 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:547 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:548 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:549 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:550 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:551 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:552 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:553 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:554 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:555 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:556 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:557 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:558 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:559 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:560 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:561 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:562 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:563 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:564 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:565 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:566 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:567 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:568 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:569 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:570 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:571 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:572 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:573 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:574 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:575 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:576 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:577 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:578 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:579 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:580 | 0 | 0 | 0 | 0 | 2 | 0 |
| save-sheet-vendor-1 | row:0:1 | 0 | 0 | 0 | 0 | 7 | 0 |
| save-sheet-vendor-1 | row:0 | 0 | 0 | 0 | 0 | 1 | 0 |
| save-sheet-vendor-1 | row:1 | 0 | 0 | 0 | 0 | 1 | 0 |
| save-sheet-cua-1 | row:0:1 | 0 | 0 | 0 | 0 | 7 | 0 |
| save-sheet-cua-1 | row:0 | 0 | 0 | 0 | 0 | 5 | 0 |
| save-sheet-cua-1 | row:0:2 | 0 | 0 | 0 | 0 | 7 | 0 |
| save-sheet-cua-1 | row:0:3 | 0 | 0 | 0 | 0 | 7 | 0 |
| save-sheet-cua-1 | row:1 | 0 | 0 | 0 | 0 | 1 | 0 |
| save-sheet-cua-2 | row:0:1 | 0 | 0 | 0 | 0 | 7 | 0 |
| save-sheet-cua-2 | row:0 | 0 | 0 | 0 | 0 | 5 | 0 |
| save-sheet-cua-2 | row:0:2 | 0 | 0 | 0 | 0 | 7 | 0 |
| save-sheet-cua-2 | row:0:3 | 0 | 0 | 0 | 0 | 7 | 0 |
| save-sheet-cua-2 | row:1 | 0 | 0 | 0 | 0 | 1 | 0 |
| save-sheet-vendor-2 | row:0:1 | 0 | 0 | 0 | 0 | 7 | 0 |
| save-sheet-vendor-2 | row:0 | 0 | 0 | 0 | 0 | 1 | 0 |
| save-sheet-vendor-2 | row:1 | 0 | 0 | 0 | 0 | 1 | 0 |
| save-sheet-vendor-3 | row:0:1 | 0 | 0 | 0 | 0 | 7 | 0 |
| save-sheet-vendor-3 | row:0 | 0 | 0 | 0 | 0 | 1 | 0 |
| save-sheet-vendor-3 | row:1 | 0 | 0 | 0 | 0 | 1 | 0 |
| save-sheet-cua-3 | row:0:1 | 0 | 0 | 0 | 0 | 7 | 0 |
| save-sheet-cua-3 | row:0 | 0 | 0 | 0 | 0 | 5 | 0 |
| save-sheet-cua-3 | row:0:2 | 0 | 0 | 0 | 0 | 7 | 0 |
| save-sheet-cua-3 | row:0:3 | 0 | 0 | 0 | 0 | 7 | 0 |
| save-sheet-cua-3 | row:1 | 0 | 0 | 0 | 0 | 1 | 0 |

## The key-window requirement

In this sitting's records: 3621 click or key cells sent with the key window read; 0 refused NO VERDICT keyWindow; 25 sent with the key window unread (Accessibility lists no window at the scene window's bounds, and shows it as no sheet of the window behind it 25).
Setup's reading of the reader's grant over the loopback ssh: trusted. Context only: the verdict below is the sitting's own readings.

Observed, except for the 25 cells sent unread.

## TextEdit and the Open panel, read back (ruling 1169)

Where each step's TextEdit windows and Open panels stood, against what the venue planned, and whether an alert the venue read overlapped them (the alert guard then refused the cells there). A panel the run resized as well as moved (ruling 1199) says so.

| step | window | planned | actual | overlaps an alert |
|---|---|---|---|---|
| matrix-vendor-1 | textedit | view 480x792, left of x 830 | 213,78 507x877 | no |
| matrix-vendor-1 | panel:openPanel/frontmost/getAXState.panel | -58,80 880x448 | -58,80 880x448 | no |
| matrix-vendor-1 | panel:openPanel/frontmost/typeText.search | -58,80 880x448 | -58,80 880x448 | no |
| matrix-vendor-1 | panel:openPanel/frontmost/pressKey.escape | -58,80 880x448 | -58,80 880x448 | no |
| matrix-vendor-1 | panel:openPanel/frontmost/click.cancel | -58,80 880x448 | -58,80 880x448 | no |
| matrix-vendor-1 | panel:savePanel/frontmost/pressKey.escape | 80,80 720x440 | 241,250 390x218 | no |
| matrix-vendor-1 | panel:savePanel/frontmost/typeText.name | 80,80 720x440 | 241,250 390x218 | no |
| matrix-vendor-1 | panel:savePanel/frontmost/setValue.name | 80,80 720x440 | 241,250 390x218 | no |
| matrix-vendor-1 | panel:openPanel/background@finder | -58,80 880x448 | -58,80 880x448 | no |
| matrix-cua-1 | textedit | view 480x792, left of x 830 | 213,78 507x877 | no |
| matrix-cua-1 | panel:openPanel/frontmost/getAXState.panel | -58,80 880x448 | -58,80 880x448 | no |
| matrix-cua-1 | panel:openPanel/frontmost/typeText.search | -58,80 880x448 | -58,80 880x448 | no |
| matrix-cua-1 | panel:openPanel/frontmost/pressKey.escape | -58,80 880x448 | -58,80 880x448 | no |
| matrix-cua-1 | panel:openPanel/frontmost/click.cancel | -58,80 880x448 | -58,80 880x448 | no |
| matrix-cua-1 | panel:savePanel/frontmost/pressKey.escape | 80,80 720x440 | 241,250 390x218 | no |
| matrix-cua-1 | panel:savePanel/frontmost/typeText.name | 80,80 720x440 | 241,250 390x218 | no |
| matrix-cua-1 | panel:savePanel/frontmost/setValue.name | 80,80 720x440 | 241,250 390x218 | no |
| matrix-cua-1 | panel:openPanel/background@finder | -58,80 880x448 | -58,80 880x448 | no |
| matrix-cua-2 | textedit | view 480x792, left of x 830 | 213,78 507x877 | no |
| matrix-cua-2 | panel:openPanel/frontmost/getAXState.panel | -58,80 880x448 | -58,80 880x448 | no |
| matrix-cua-2 | panel:openPanel/frontmost/typeText.search | -58,80 880x448 | -58,80 880x448 | no |
| matrix-cua-2 | panel:openPanel/frontmost/pressKey.escape | -58,80 880x448 | -58,80 880x448 | no |
| matrix-cua-2 | panel:openPanel/frontmost/click.cancel | -58,80 880x448 | -58,80 880x448 | no |
| matrix-cua-2 | panel:savePanel/frontmost/pressKey.escape | 80,80 720x440 | 241,250 390x218 | no |
| matrix-cua-2 | panel:savePanel/frontmost/typeText.name | 80,80 720x440 | 241,250 390x218 | no |
| matrix-cua-2 | panel:savePanel/frontmost/setValue.name | 80,80 720x440 | 241,250 390x218 | no |
| matrix-cua-2 | panel:openPanel/background@finder | -58,80 880x448 | -58,80 880x448 | no |
| matrix-vendor-2 | textedit | view 480x792, left of x 830 | 213,78 507x877 | no |
| matrix-vendor-2 | panel:openPanel/frontmost/getAXState.panel | -58,80 880x448 | -58,80 880x448 | no |
| matrix-vendor-2 | panel:openPanel/frontmost/typeText.search | -58,80 880x448 | -58,80 880x448 | no |
| matrix-vendor-2 | panel:openPanel/frontmost/pressKey.escape | -58,80 880x448 | -58,80 880x448 | no |
| matrix-vendor-2 | panel:openPanel/frontmost/click.cancel | -58,80 880x448 | -58,80 880x448 | no |
| matrix-vendor-2 | panel:savePanel/frontmost/pressKey.escape | 80,80 720x440 | 241,250 390x218 | no |
| matrix-vendor-2 | panel:savePanel/frontmost/typeText.name | 80,80 720x440 | 241,250 390x218 | no |
| matrix-vendor-2 | panel:savePanel/frontmost/setValue.name | 80,80 720x440 | 241,250 390x218 | no |
| matrix-vendor-2 | panel:openPanel/background@finder | -58,80 880x448 | -60,80 880x448 | no |
| matrix-vendor-3 | textedit | view 480x792, left of x 830 | 213,78 507x877 | no |
| matrix-vendor-3 | panel:openPanel/frontmost/getAXState.panel | -58,80 880x448 | -58,80 880x448 | no |
| matrix-vendor-3 | panel:openPanel/frontmost/typeText.search | -58,80 880x448 | -58,80 880x448 | no |
| matrix-vendor-3 | panel:openPanel/frontmost/pressKey.escape | -58,80 880x448 | -58,80 880x448 | no |
| matrix-vendor-3 | panel:openPanel/frontmost/click.cancel | -58,80 880x448 | -58,80 880x448 | no |
| matrix-vendor-3 | panel:savePanel/frontmost/pressKey.escape | 80,80 720x440 | 241,250 390x218 | no |
| matrix-vendor-3 | panel:savePanel/frontmost/typeText.name | 80,80 720x440 | 241,250 390x218 | no |
| matrix-vendor-3 | panel:savePanel/frontmost/setValue.name | 80,80 720x440 | 241,250 390x218 | no |
| matrix-vendor-3 | panel:openPanel/background@finder | -58,80 880x448 | -58,80 880x448 | no |
| matrix-cua-3 | textedit | view 480x792, left of x 830 | 213,78 507x877 | no |
| matrix-cua-3 | panel:openPanel/frontmost/getAXState.panel | -58,80 880x448 | -58,80 880x448 | no |
| matrix-cua-3 | panel:openPanel/frontmost/typeText.search | -58,80 880x448 | -58,80 880x448 | no |
| matrix-cua-3 | panel:openPanel/frontmost/pressKey.escape | -58,80 880x448 | -58,80 880x448 | no |
| matrix-cua-3 | panel:openPanel/frontmost/click.cancel | -58,80 880x448 | -58,80 880x448 | no |
| matrix-cua-3 | panel:savePanel/frontmost/pressKey.escape | 80,80 720x440 | 241,250 390x218 | no |
| matrix-cua-3 | panel:savePanel/frontmost/typeText.name | 80,80 720x440 | 241,250 390x218 | no |
| matrix-cua-3 | panel:savePanel/frontmost/setValue.name | 80,80 720x440 | 241,250 390x218 | no |
| matrix-cua-3 | panel:openPanel/background@finder | -58,80 880x448 | -58,80 880x448 | no |
| save-sheet-vendor-1 | textedit | view 480x792, left of x 830 | 213,78 507x877 | no |
| save-sheet-cua-1 | textedit | view 480x792, left of x 830 | 213,78 507x877 | no |
| save-sheet-cua-2 | textedit | view 480x792, left of x 830 | 213,78 507x877 | no |
| save-sheet-vendor-2 | textedit | view 480x792, left of x 830 | 213,78 507x877 | no |
| save-sheet-vendor-3 | textedit | view 480x792, left of x 830 | 213,78 507x877 | no |
| save-sheet-cua-3 | textedit | view 480x792, left of x 830 | 213,78 507x877 | no |

## The screen at the end

2 alert windows; the display 1920x1080 (mode 10).

## The venue (ruling 1169)

The alert windows after the mode switch: alert 59 (893,244 260x364), alert 32 (830,188 260x348). TextEdit's preferences (com.apple.TextEdit, read back from its container's plist): WidthInChars read back, NSRequiresOpenUntitledWindowAtLaunch read back, ApplePersistenceIgnoreState read back, NSWindow Frame NSNavPanelAutosaveName read back, NSNavPanelExpandedSizeForOpenMode read back. TextEdit's saved application state: none at /Users/runner/Library/Saved Application State/com.apple.TextEdit.savedState.

Input sources (ruling 1189): enabled through TISEnableInputSource (./input-sources.swift), read back from TIS's enabled list after 1 read; the preference's value (com.apple.HIToolbox AppleEnabledInputSources) recorded beside it; restored: nothing: the VM is thrown away (ruling 1189). Every source the runs select held.

| source | enable | TIS's enabled list | the preference | held |
|---|---|---|---|---|
| com.apple.keylayout.ABC | status 0 | in TIS's enabled list, enabled, selectable | listed | yes |
| com.apple.inputmethod.Korean | status 0 | in TIS's enabled list, enabled (the input method its mode needs) | listed | yes |
| com.apple.inputmethod.Korean.2SetKorean | status 0 | in TIS's enabled list, enabled, selectable | listed | yes |

| scene | the mini | hosted | why | grounding | cells resting on it |
|---|---|---|---|---|---|
| chrome | 80,60 1000x760 | 22,60 800x760 | the capture alerts read fresh after the mode switch: alert 59 (893,244 260x364), alert 32 (830,188 260x348); the mini's 80,60 1000x760 would overlap them; Chrome is 800x760 on a hosted runner (ruling 1169); the frame 22,60 800x760 | window points grounded on the notes field's frame as read in the run's window, toolbar and infobars whatever they are (../native-matrix/plan.mjs chromeDragFromField, ruling 1226); a frame not read leaves the drag invalid | chrome/frontmost/drag.select, chrome/background/drag.select@textedit, native-mac chrome (its tree: the page in the window, both lanes alike) |
| electron | 140,100 720x560 | 102,100 720x560 | the capture alerts read fresh after the mode switch: alert 59 (893,244 260x364), alert 32 (830,188 260x348); the mini's 140,100 720x560 would overlap them; the frame 102,100 720x560 | window points on the fixture's size, unchanged at 720x560: its layout (ELECTRON_FIELD_LAYOUT, #259's point) holds as it is; only the origin moved | electron/frontmost/drag.select, electron/frontmost/click.point, electron/background/drag.select@finder, native-mac electron (its tree) |
| finder | 80,80 920x520 | 22,80 800x520 | the capture alerts read fresh after the mode switch: alert 59 (893,244 260x364), alert 32 (830,188 260x348); the mini's 80,80 920x520 would overlap them; the frame 22,80 800x520 | element-addressed rows; the height is the mini's, so the same rows are visible | finder/frontmost/click.row, finder/frontmost/pressKey.down, finder/frontmost/typeText.typeSelect, finder/frontmost/scroll.down, finder/frontmost/performSecondaryAction.down, finder/background/click.row@textedit, finder/background/pressKey.down@textedit, finder/background/typeText.typeSelect@textedit, finder/background/scroll.down@textedit, finder/background/performSecondaryAction.down@textedit, finder/background/click.row@electron, finder/background/pressKey.down@electron, finder/background/typeText.typeSelect@electron, finder/background/scroll.down@electron, finder/background/performSecondaryAction.down@electron, native-mac finder (its tree: the rows its height shows; the diff pairs equal frames only) |
| textedit | WidthInChars 75, NSRequiresOpenUntitledWindowAtLaunch YES (AppKit's default), ApplePersistenceIgnoreState NO (AppKit's default: windows restored) | WidthInChars 60, NSRequiresOpenUntitledWindowAtLaunch NO, ApplePersistenceIgnoreState YES, saved application state to be removed after the warm-ups, outside the container (venue.textEdit.savedState says what was) | the capture alerts read fresh after the mode switch: alert 59 (893,244 260x364), alert 32 (830,188 260x348); at 1920x1080 TextEdit's default width put its new document at 242,107 603x505 (pilot A, run 45252131587), over alert 31; its origin is AppKit's cascade, read back by each run; the untitled document AppKit opens at launch stood at 241,87 586x488 on the runner's first TextEdit launch and 213,78 387x505 on the next (pilot A, run 45272465181), so none is opened (the design session); vv-1's launch window again stood at 241,87 586x488 with that key in force and its new document took 603x505, the default width, though the domain read WidthInChars 60 back (pilot A's re-run, run 45277221729): a window the warm-ups' saved state restored, and a domain write the sandboxed TextEdit does not read, so restoration is turned off, removing the saved state outside the container is attempted (venue.textEdit.savedState records the outcome) and every key is read back from TextEdit's container | fractions of the document window (its drag) and its own rows: valid at any width the text view fills, the prepare's clicks proving each end | textedit/frontmost/drag.select, textedit/background/drag.select@finder, textedit/background/drag.select@chrome, native-mac textedit (its tree) |
| textedit document | view size none: TextEdit takes the paper's width, sha256 default e3703ac3a303696332910efb44330a6604f403849695ca011bfacf2a23ad4a76, sha256 wide-page e228c76974983f74cbd27e31eefca527584ceb5eac25771eecab205446a391a3 | view size 480x792 (\vieww9600\viewh15840), sha256 default dff8383ef0c0a5142279fd1d536a562bff45a4f06be68bbd5d603e270e988ffd, sha256 wide-page f32e9d20e9a2c43fe0f76ebb08e70a0b7e14dbc3b2629e7c913a8af9248e08ef | the scene's cua-scene.rtf, opened as a file with no view size, stood at 213,78 627x877 on both sides (pilot B, run 45274556933): the paper's width, which WidthInChars does not change, its right edge 840 over alert 31; a view 480 wide ends left of the strip's 822 from the cascade origins read so far, one step more; its origin is AppKit's cascade, read back by each run | the window's size only: the file is the mini's with the view size inserted, so its text and attribute runs are the mini's (textutil's text and HTML of both files are equal, test/repl-parity/scenes-mac.test.mjs); the cells' fractions and rows hold as for TextEdit's preferences; the wide page stays wider than the window (its 200% zoom) | textedit/frontmost/drag.select, textedit/background/drag.select@finder, textedit/background/drag.select@chrome, native-mac textedit (its tree), hscroll/textedit-wide-page/right (the wide-page layout: its page wider than the window) |
| openPanel | AppKit's: centred on the screen | 80,80 720x440 | the capture alerts read fresh after the mode switch: alert 59 (893,244 260x364), alert 32 (830,188 260x348); the mini leaves the panel centred, where the alerts are; the frame 80,80 720x440 | element-addressed (its Cancel, its search field, the Save sheet's name field, A's New Document): the frame decides only whether the guard refuses them; on a hosted runner the matrix moves each opening into the strip by Accessibility (ruling 1195), and a read-back outside it is NO VERDICT venue | openPanel/frontmost/getAXState.panel, openPanel/frontmost/typeText.search, openPanel/frontmost/pressKey.escape, openPanel/frontmost/click.cancel, openPanel/background/getAXState.panel@finder, openPanel/background/click.cancel@finder, savePanel/frontmost/pressKey.escape, savePanel/frontmost/typeText.name, savePanel/frontmost/setValue.name, native-baseline setup.newDocument (the panel at TextEdit's launch, where one shows: the mini's) |

## The key-route diagnostic (ruling 1198)

Skipped before it read, built, granted or held anything: the job's time left (570 s before C must publish) does not fit the set-up and the cleanup (1620 s). A diagnostic: INFO, never this sitting's verdict.
