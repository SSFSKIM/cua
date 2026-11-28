## Sitting C (full): the native matrix, three runs a side, with the Korean and Unicode rows, the concurrent-use and intervention cells, Acceptance 3's keystroke witness and the window-order oracle; #212's save-sheet cell

Proves: Acceptance 3, 4 and 7.

| step | kind | status | exit | time | sitting so far | job so far | note |
|---|---|---|---|---|---|---|---|
| witness-tap | diagnostic | INFO | 0 | 3 s | 0 min | 3 min | R3's witness tap built and granted Input Monitoring (ruling 1225) |
| matrix-vendor-3 | run | PASS | 0 | 873 s | 15 min | 18 min | |
| matrix-cua-3 | run | PASS | 0 | 623 s | 25 min | 28 min | |

**PASS** (exit 0): 2 PASS, 0 FAIL, 0 NO VERDICT, 0 OWNER, 1 INFO, 0 SKIP, 0 PENDING.

Wall time: the sitting 25 min so far, the job 28 min of its 360.

## The run job (ruling 1228)

No harness or infrastructure stop: the job passes; its verdicts above go to the judging job.

## The alert guard

Per step and cell: the cells the alert guard refused unsent (NO VERDICT `alert` or `unread`) and those the key-window requirement refused (NO VERDICT `keyWindow`: the scene's app held another key window, or none), the key cells guarded with their key reading not taken (`key cells guarded unread`: unguarded against the alert holding the key, which the key guard's front check cannot see), the click or key cells sent with their key window read (`cells key window read`), and those sent with it unread (`cells key window unread`, with why: an untrusted reader means the key-window requirement went unobserved).

| step | cell | NO VERDICT alert | NO VERDICT unread | NO VERDICT keyWindow | key cells guarded unread | cells key window read | cells key window unread |
|---|---|---|---|---|---|---|---|
| matrix-vendor-3 | row:0 | 0 | 0 | 0 | 0 | 6 | 0 |
| matrix-vendor-3 | row:1 | 0 | 0 | 0 | 0 | 9 | 0 |
| matrix-vendor-3 | row:2 | 0 | 0 | 0 | 0 | 9 | 0 |
| matrix-vendor-3 | row:3 | 0 | 0 | 0 | 0 | 3 | 0 |
| matrix-vendor-3 | keys:super+o | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-3 | row:5 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:5:1 | 0 | 0 | 0 | 0 | 3 | 0 |
| matrix-vendor-3 | row:6 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | row:7 | 0 | 0 | 0 | 0 | 142 | 5 (Accessibility lists no window at the scene window's bounds, and shows it as no sheet of the window behind it 5) |
| matrix-vendor-3 | row:7:1 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-vendor-3 | unicode:prepare:textedit | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-vendor-3 | unicode:prepare:electron | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-3 | row:0 | 0 | 0 | 0 | 0 | 6 | 0 |
| matrix-cua-3 | row:1 | 0 | 0 | 0 | 0 | 9 | 0 |
| matrix-cua-3 | row:2 | 0 | 0 | 0 | 0 | 9 | 0 |
| matrix-cua-3 | row:3 | 0 | 0 | 0 | 0 | 3 | 0 |
| matrix-cua-3 | keys:super+o | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-3 | row:5 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:5:1 | 0 | 0 | 0 | 0 | 3 | 0 |
| matrix-cua-3 | row:6 | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | row:7 | 0 | 0 | 0 | 0 | 145 | 2 (Accessibility lists no window at the scene window's bounds, and shows it as no sheet of the window behind it 2) |
| matrix-cua-3 | row:7:1 | 0 | 0 | 0 | 0 | 1 | 0 |
| matrix-cua-3 | unicode:prepare:textedit | 0 | 0 | 0 | 0 | 2 | 0 |
| matrix-cua-3 | unicode:prepare:electron | 0 | 0 | 0 | 0 | 1 | 0 |

## The key-window requirement

In this sitting's records: 365 click or key cells sent with the key window read; 0 refused NO VERDICT keyWindow; 7 sent with the key window unread (Accessibility lists no window at the scene window's bounds, and shows it as no sheet of the window behind it 7).
Setup's reading of the reader's grant over the loopback ssh: trusted. Context only: the verdict below is the sitting's own readings.

Observed, except for the 7 cells sent unread.

## TextEdit and the Open panel, read back (ruling 1169)

Where each step's TextEdit windows and Open panels stood, against what the venue planned, and whether an alert the venue read overlapped them (the alert guard then refused the cells there). A panel the run resized as well as moved (ruling 1199) says so.

| step | window | planned | actual | overlaps an alert |
|---|---|---|---|---|
| matrix-vendor-3 | textedit | view 480x792, left of x 830 | 213,78 507x877 | no |
| matrix-vendor-3 | panel:openPanel/background@finder | -58,80 880x448 | -58,80 880x448 | no |
| matrix-cua-3 | textedit | view 480x792, left of x 830 | 213,78 507x877 | no |
| matrix-cua-3 | panel:openPanel/background@finder | -58,80 880x448 | -58,80 880x448 | no |

## The screen at the end

2 alert windows; the display 1920x1080 (mode 10).

## The venue (ruling 1169)

The alert windows after the mode switch: alert 60 (893,244 260x364), alert 33 (830,188 260x348). TextEdit's preferences (com.apple.TextEdit, read back from its container's plist): WidthInChars read back (written through the container: the domain's write did not reach it), NSRequiresOpenUntitledWindowAtLaunch read back, ApplePersistenceIgnoreState read back, NSWindow Frame NSNavPanelAutosaveName read back, NSNavPanelExpandedSizeForOpenMode read back. TextEdit's saved application state: none at /Users/runner/Library/Saved Application State/com.apple.TextEdit.savedState.

Input sources (ruling 1189): enabled through TISEnableInputSource (./input-sources.swift), read back from TIS's enabled list after 1 read; the preference's value (com.apple.HIToolbox AppleEnabledInputSources) recorded beside it; restored: nothing: the VM is thrown away (ruling 1189). Every source the runs select held.

| source | enable | TIS's enabled list | the preference | held |
|---|---|---|---|---|
| com.apple.keylayout.ABC | status 0 | in TIS's enabled list, enabled, selectable | listed | yes |
| com.apple.inputmethod.Korean | status 0 | in TIS's enabled list, enabled (the input method its mode needs) | listed | yes |
| com.apple.inputmethod.Korean.2SetKorean | status 0 | in TIS's enabled list, enabled, selectable | listed | yes |

| scene | the mini | hosted | why | grounding | cells resting on it |
|---|---|---|---|---|---|
| chrome | 80,60 1000x760 | 22,60 800x760 | the capture alerts read fresh after the mode switch: alert 60 (893,244 260x364), alert 33 (830,188 260x348); the mini's 80,60 1000x760 would overlap them; Chrome is 800x760 on a hosted runner (ruling 1169); the frame 22,60 800x760 | window points grounded on the notes field's frame as read in the run's window, toolbar and infobars whatever they are (../native-matrix/plan.mjs chromeDragFromField, ruling 1226); a frame not read leaves the drag invalid | chrome/frontmost/drag.select, chrome/background/drag.select@textedit, native-mac chrome (its tree: the page in the window, both lanes alike) |
| electron | 140,100 720x560 | 102,100 720x560 | the capture alerts read fresh after the mode switch: alert 60 (893,244 260x364), alert 33 (830,188 260x348); the mini's 140,100 720x560 would overlap them; the frame 102,100 720x560 | window points on the fixture's size, unchanged at 720x560: its drag's layout (ELECTRON_FIELD_LAYOUT) holds as it is; #259's point is grounded on the field's frame as read (../native-matrix/plan.mjs electronPointFromField, ruling 1228); only the origin moved | electron/frontmost/drag.select, electron/frontmost/click.point, electron/background/drag.select@finder, native-mac electron (its tree) |
| finder | 80,80 920x520 | 22,80 800x520 | the capture alerts read fresh after the mode switch: alert 60 (893,244 260x364), alert 33 (830,188 260x348); the mini's 80,80 920x520 would overlap them; the frame 22,80 800x520 | element-addressed rows; the height is the mini's, so the same rows are visible | finder/frontmost/click.row, finder/frontmost/pressKey.down, finder/frontmost/typeText.typeSelect, finder/frontmost/scroll.down, finder/frontmost/performSecondaryAction.down, finder/background/click.row@textedit, finder/background/pressKey.down@textedit, finder/background/typeText.typeSelect@textedit, finder/background/scroll.down@textedit, finder/background/performSecondaryAction.down@textedit, finder/background/click.row@electron, finder/background/pressKey.down@electron, finder/background/typeText.typeSelect@electron, finder/background/scroll.down@electron, finder/background/performSecondaryAction.down@electron, native-mac finder (its tree: the rows its height shows; the diff pairs equal frames only) |
| textedit | WidthInChars 75, NSRequiresOpenUntitledWindowAtLaunch YES (AppKit's default), ApplePersistenceIgnoreState NO (AppKit's default: windows restored) | WidthInChars 60, NSRequiresOpenUntitledWindowAtLaunch NO, ApplePersistenceIgnoreState YES, saved application state to be removed after the warm-ups, outside the container (venue.textEdit.savedState says what was) | the capture alerts read fresh after the mode switch: alert 60 (893,244 260x364), alert 33 (830,188 260x348); at 1920x1080 TextEdit's default width put its new document at 242,107 603x505 (pilot A, run 45252131587), over alert 31; its origin is AppKit's cascade, read back by each run; the untitled document AppKit opens at launch stood at 241,87 586x488 on the runner's first TextEdit launch and 213,78 387x505 on the next (pilot A, run 45272465181), so none is opened (the design session); vv-1's launch window again stood at 241,87 586x488 with that key in force and its new document took 603x505, the default width, though the domain read WidthInChars 60 back (pilot A's re-run, run 45277221729): a window the warm-ups' saved state restored, and a domain write the sandboxed TextEdit does not read, so restoration is turned off, removing the saved state outside the container is attempted (venue.textEdit.savedState records the outcome) and every key is read back from TextEdit's container | fractions of the document window (its drag) and its own rows: valid at any width the text view fills, the prepare's clicks proving each end | textedit/frontmost/drag.select, textedit/background/drag.select@finder, textedit/background/drag.select@chrome, native-mac textedit (its tree) |
| textedit document | view size none: TextEdit takes the paper's width, sha256 default e3703ac3a303696332910efb44330a6604f403849695ca011bfacf2a23ad4a76, sha256 wide-page e228c76974983f74cbd27e31eefca527584ceb5eac25771eecab205446a391a3 | view size 480x792 (\vieww9600\viewh15840), sha256 default dff8383ef0c0a5142279fd1d536a562bff45a4f06be68bbd5d603e270e988ffd, sha256 wide-page f32e9d20e9a2c43fe0f76ebb08e70a0b7e14dbc3b2629e7c913a8af9248e08ef | the scene's cua-scene.rtf, opened as a file with no view size, stood at 213,78 627x877 on both sides (pilot B, run 45274556933): the paper's width, which WidthInChars does not change, its right edge 840 over alert 31; a view 480 wide ends left of the strip's 822 from the cascade origins read so far, one step more; its origin is AppKit's cascade, read back by each run | the window's size only: the file is the mini's with the view size inserted, so its text and attribute runs are the mini's (textutil's text and HTML of both files are equal, test/repl-parity/scenes-mac.test.mjs); the cells' fractions and rows hold as for TextEdit's preferences; the wide page stays wider than the window (its 200% zoom) | textedit/frontmost/drag.select, textedit/background/drag.select@finder, textedit/background/drag.select@chrome, native-mac textedit (its tree), hscroll/textedit-wide-page/right (the wide-page layout: its page wider than the window) |
| openPanel | AppKit's: centred on the screen | 80,80 720x440 | the capture alerts read fresh after the mode switch: alert 60 (893,244 260x364), alert 33 (830,188 260x348); the mini leaves the panel centred, where the alerts are; the frame 80,80 720x440 | element-addressed (its Cancel, its search field, the Save sheet's name field, A's New Document): the frame decides only whether the guard refuses them; on a hosted runner the matrix moves each opening into the strip by Accessibility (ruling 1195), and a read-back outside it is NO VERDICT venue | openPanel/frontmost/getAXState.panel, openPanel/frontmost/typeText.search, openPanel/frontmost/pressKey.escape, openPanel/frontmost/click.cancel, openPanel/background/getAXState.panel@finder, openPanel/background/click.cancel@finder, savePanel/frontmost/pressKey.escape, savePanel/frontmost/typeText.name, savePanel/frontmost/setValue.name, native-baseline setup.newDocument (the panel at TextEdit's launch, where one shows: the mini's) |
