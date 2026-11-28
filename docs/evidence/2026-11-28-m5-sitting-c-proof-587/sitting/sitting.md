## Sitting C (full): the native matrix, three runs a side, with the Korean and Unicode rows, the concurrent-use and intervention cells, Acceptance 3's keystroke witness and the window-order oracle; #212's save-sheet cell (proof run: 7 cells, no base)

Proves: the proof run's 7 cells alone, judged pairwise on this build's runs (ruling 1248); none of the sitting's acceptance.

| step | kind | status | exit | time | sitting so far | job so far | note |
|---|---|---|---|---|---|---|---|
| jobs-check | verdict | PASS | 0 | 0 s | 0 min | 3 min | |
| summary | verdict | PASS | 0 | 0 s | 0 min | 3 min | |
| compare | verdict | PASS | 0 | 0 s | 0 min | 3 min | |
| key-route | diagnostic | INFO | 0 | 79 s | 1 min | 4 min | a diagnostic, recorded: vendor: Escape posted to pid 22917 by pid 23616, seen by the panelService tap, the panel closed by it; cua: Escape posted to pid 25837 by pid 26205, seen by the panelService tap, the panel closed by it |

**PASS** (exit 0): 3 PASS, 0 FAIL, 0 NO VERDICT, 0 OWNER, 1 INFO, 0 SKIP, 0 PENDING.

Wall time: the sitting 1 min so far, the job 4 min of its 360.

## Per-cell counts

Per cell: the runs on each side every sample of which has a verdict (of the runs that hold the cell), each run's verdict samples of its samples, the side's samples NO VERDICT `alert` (an alert in front or key, or a cell the alert guard refused unsent, ruling 1154) and NO VERDICT `keyWindow` (a click or key cell refused unsent because its scene's app did not hold the scene window as its key window, ruling 1169's addition), its key cells guarded with their key reading not taken (`key cells guarded unread`: unguarded against the alert holding the key) and its click or key cells sent with their key window unread (`cells key window unread`); a harness cell on its own line. A sample without a verdict is never a pass and never a fail. Complete pairs are the judge's (three qualify a cell); `-` for a cell judged on its own.

| cell | source | vendor: complete runs | vendor: verdicts by run | vendor: NO VERDICT alert | vendor: NO VERDICT keyWindow | vendor: key cells guarded unread | vendor: cells key window unread | cua: complete runs | cua: verdicts by run | cua: NO VERDICT alert | cua: NO VERDICT keyWindow | cua: key cells guarded unread | cua: cells key window unread | complete pairs |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| method finder/frontmost/typeText.typeSelect | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | - |
| method finder/background/typeText.typeSelect@textedit | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | - |
| method finder/background/typeText.typeSelect@electron | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | - |
| method openPanel/background/getAXState.panel@finder | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | - |
| method openPanel/background/click.cancel@finder | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | - |
| concurrent textedit/concurrent.sheet@electron | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | - |
| unicode textedit/latin/typeText.latin | matrix | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | 3 of 3 | 1: 1/1, 2: 1/1, 3: 1/1 | 0 | 0 | 0 | 0 | - |
| harness row:7 | matrix | 0 of 0 | - | 0 | 0 | 0 | 15 (Accessibility lists no window at the scene window's bounds, and shows it as no sheet of the window behind it 15) | 0 of 0 | - | 0 | 0 | 0 | 6 (Accessibility lists no window at the scene window's bounds, and shows it as no sheet of the window behind it 6) | - |

## By the lane that ran first (ruling 1226)

Run numbers by the lane that ran first: vendor first 2, cua first 1. Failed samples: 0 in vendor-first runs, 0 in cua-first runs; samples without a verdict: 0 and 0. Recorded, never judged.

## Run job attempts (every one found; the latest of each run judged)

- m5-sitting-c-run-1-1
- m5-sitting-c-run-2-1
- m5-sitting-c-run-2-2
- m5-sitting-c-run-3-1


## The run jobs (ruling 1228)

| job | runs | run id | attempt | image | VM | hardware | scenes | save sheet |
|---|---|---|---|---|---|---|---|---|
| /Users/runner/work/_temp/m5-jobs/m5-sitting-c-run-1-1/sitting | 1 | 46095539139 | 1 | macos27 20261123.0387.2 | 7689eda3-e656-4565-89c4-05b9ea79125d | model VirtualMac2,1, cpu Apple M1 (Virtual), cpus 3, memoryGB 7, macOS 27.0.1, image macos27 20261123.0387.2 | textedit, finder, electron | - |
| /Users/runner/work/_temp/m5-jobs/m5-sitting-c-run-2-2/sitting | 2 | 46095539139 | 2 | macos27 20261123.0387.2 | a443c934-403d-4255-abf1-dc4f51ad33cf | model VirtualMac2,1, cpu Apple M1 (Virtual), cpus 3, memoryGB 7, macOS 27.0.1, image macos27 20261123.0387.2 | textedit, finder, electron | - |
| /Users/runner/work/_temp/m5-jobs/m5-sitting-c-run-3-1/sitting | 3 | 46095539139 | 1 | macos27 20261123.0387.2 | 0be28e93-0ebd-4664-84db-d8b36b09231b | model VirtualMac2,1, cpu Apple M1 (Virtual), cpus 3, memoryGB 7, macOS 27.0.1, image macos27 20261123.0387.2 | textedit, finder, electron | - |

Harness commits: the jobs 3f3792de469aa14854c75dfb62e66e404454ef53.

The cua engine against the last judged sitting C (docs/evidence/2026-11-27-m5-sitting-c-split): 0.3.0 build 2de28fcc909d75779e8fea9563aae6551d5ec7c5d7809922f1f77158a0bc949e then, 0.3.1 build 4c3b5768105094fad946513cd755bbf639287bf4a63d899fc87541d478e1ffb3 in these jobs: a new build (recorded, never refused; ruling 1248).

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

The alert windows after the mode switch: alert 59 (893,244 260x364), alert 32 (830,188 260x348). TextEdit's preferences (com.apple.TextEdit, read back from its container's plist): WidthInChars read back (written through the container: the domain's write did not reach it), NSRequiresOpenUntitledWindowAtLaunch read back, ApplePersistenceIgnoreState read back, NSWindow Frame NSNavPanelAutosaveName read back, NSNavPanelExpandedSizeForOpenMode read back. TextEdit's saved application state: none at /Users/runner/Library/Saved Application State/com.apple.TextEdit.savedState.

Input sources (ruling 1189): enabled through TISEnableInputSource (./input-sources.swift), read back from TIS's enabled list after 1 read; the preference's value (com.apple.HIToolbox AppleEnabledInputSources) recorded beside it; restored: nothing: the VM is thrown away (ruling 1189). Every source the runs select held.

| source | enable | TIS's enabled list | the preference | held |
|---|---|---|---|---|
| com.apple.keylayout.ABC | status 0 | in TIS's enabled list, enabled, selectable | listed | yes |
| com.apple.inputmethod.Korean | status 0 | in TIS's enabled list, enabled (the input method its mode needs) | listed | yes |
| com.apple.inputmethod.Korean.2SetKorean | status 0 | in TIS's enabled list, enabled, selectable | listed | yes |

| scene | the mini | hosted | why | grounding | cells resting on it |
|---|---|---|---|---|---|
| chrome | 80,60 1000x760 | 22,60 800x760 | the capture alerts read fresh after the mode switch: alert 59 (893,244 260x364), alert 32 (830,188 260x348); the mini's 80,60 1000x760 would overlap them; Chrome is 800x760 on a hosted runner (ruling 1169); the frame 22,60 800x760 | window points grounded on the notes field's frame as read in the run's window, toolbar and infobars whatever they are (../native-matrix/plan.mjs chromeDragFromField, ruling 1226); a frame not read leaves the drag invalid | chrome/frontmost/drag.select, chrome/background/drag.select@textedit, native-mac chrome (its tree: the page in the window, both lanes alike) |
| electron | 140,100 720x560 | 102,100 720x560 | the capture alerts read fresh after the mode switch: alert 59 (893,244 260x364), alert 32 (830,188 260x348); the mini's 140,100 720x560 would overlap them; the frame 102,100 720x560 | window points on the fixture's size, unchanged at 720x560: its drag's layout (ELECTRON_FIELD_LAYOUT) holds as it is; #259's point is grounded on the field's frame as read (../native-matrix/plan.mjs electronPointFromField, ruling 1228); only the origin moved | electron/frontmost/drag.select, electron/frontmost/click.point, electron/background/drag.select@finder, native-mac electron (its tree) |
| finder | 80,80 920x520 | 22,80 800x520 | the capture alerts read fresh after the mode switch: alert 59 (893,244 260x364), alert 32 (830,188 260x348); the mini's 80,80 920x520 would overlap them; the frame 22,80 800x520 | element-addressed rows; the height is the mini's, so the same rows are visible | finder/frontmost/click.row, finder/frontmost/pressKey.down, finder/frontmost/typeText.typeSelect, finder/frontmost/scroll.down, finder/frontmost/performSecondaryAction.down, finder/background/click.row@textedit, finder/background/pressKey.down@textedit, finder/background/typeText.typeSelect@textedit, finder/background/scroll.down@textedit, finder/background/performSecondaryAction.down@textedit, finder/background/click.row@electron, finder/background/pressKey.down@electron, finder/background/typeText.typeSelect@electron, finder/background/scroll.down@electron, finder/background/performSecondaryAction.down@electron, native-mac finder (its tree: the rows its height shows; the diff pairs equal frames only) |
| textedit | WidthInChars 75, NSRequiresOpenUntitledWindowAtLaunch YES (AppKit's default), ApplePersistenceIgnoreState NO (AppKit's default: windows restored) | WidthInChars 60, NSRequiresOpenUntitledWindowAtLaunch NO, ApplePersistenceIgnoreState YES, saved application state to be removed after the warm-ups, outside the container (venue.textEdit.savedState says what was) | the capture alerts read fresh after the mode switch: alert 59 (893,244 260x364), alert 32 (830,188 260x348); at 1920x1080 TextEdit's default width put its new document at 242,107 603x505 (pilot A, run 45252131587), over alert 31; its origin is AppKit's cascade, read back by each run; the untitled document AppKit opens at launch stood at 241,87 586x488 on the runner's first TextEdit launch and 213,78 387x505 on the next (pilot A, run 45272465181), so none is opened (the design session); vv-1's launch window again stood at 241,87 586x488 with that key in force and its new document took 603x505, the default width, though the domain read WidthInChars 60 back (pilot A's re-run, run 45277221729): a window the warm-ups' saved state restored, and a domain write the sandboxed TextEdit does not read, so restoration is turned off, removing the saved state outside the container is attempted (venue.textEdit.savedState records the outcome) and every key is read back from TextEdit's container | fractions of the document window (its drag) and its own rows: valid at any width the text view fills, the prepare's clicks proving each end | textedit/frontmost/drag.select, textedit/background/drag.select@finder, textedit/background/drag.select@chrome, native-mac textedit (its tree) |
| textedit document | view size none: TextEdit takes the paper's width, sha256 default e3703ac3a303696332910efb44330a6604f403849695ca011bfacf2a23ad4a76, sha256 wide-page e228c76974983f74cbd27e31eefca527584ceb5eac25771eecab205446a391a3 | view size 480x792 (\vieww9600\viewh15840), sha256 default dff8383ef0c0a5142279fd1d536a562bff45a4f06be68bbd5d603e270e988ffd, sha256 wide-page f32e9d20e9a2c43fe0f76ebb08e70a0b7e14dbc3b2629e7c913a8af9248e08ef | the scene's cua-scene.rtf, opened as a file with no view size, stood at 213,78 627x877 on both sides (pilot B, run 45274556933): the paper's width, which WidthInChars does not change, its right edge 840 over alert 31; a view 480 wide ends left of the strip's 822 from the cascade origins read so far, one step more; its origin is AppKit's cascade, read back by each run | the window's size only: the file is the mini's with the view size inserted, so its text and attribute runs are the mini's (textutil's text and HTML of both files are equal, test/repl-parity/scenes-mac.test.mjs); the cells' fractions and rows hold as for TextEdit's preferences; the wide page stays wider than the window (its 200% zoom) | textedit/frontmost/drag.select, textedit/background/drag.select@finder, textedit/background/drag.select@chrome, native-mac textedit (its tree), hscroll/textedit-wide-page/right (the wide-page layout: its page wider than the window) |
| openPanel | AppKit's: centred on the screen | 80,80 720x440 | the capture alerts read fresh after the mode switch: alert 59 (893,244 260x364), alert 32 (830,188 260x348); the mini leaves the panel centred, where the alerts are; the frame 80,80 720x440 | element-addressed (its Cancel, its search field, the Save sheet's name field, A's New Document): the frame decides only whether the guard refuses them; on a hosted runner the matrix moves each opening into the strip by Accessibility (ruling 1195), and a read-back outside it is NO VERDICT venue | openPanel/frontmost/getAXState.panel, openPanel/frontmost/typeText.search, openPanel/frontmost/pressKey.escape, openPanel/frontmost/click.cancel, openPanel/background/getAXState.panel@finder, openPanel/background/click.cancel@finder, savePanel/frontmost/pressKey.escape, savePanel/frontmost/typeText.name, savePanel/frontmost/setValue.name, native-baseline setup.newDocument (the panel at TextEdit's launch, where one shows: the mini's) |

## The key-route diagnostic (ruling 1198)

A diagnostic: its status is INFO and never changes this sitting's verdict; only a cleanup failure, named, is a FAIL. Where `pressKey("Escape")` lands while TextEdit's Open panel is focused, per engine through its own lane; fields 40 and 41 are the event's target and source unix pids as the listen-only taps saw them, read only inside the press's own window ("unavailable": a field the event did not carry).

| engine | Escape sent | posted to (field 40) | posted by (field 41) | seen by tap | panel closed by the Escape | note |
|---|---|---|---|---|---|---|
| vendor | yes | 22917 | 23616 | panelService | yes | |
| cua | yes | 25837 | 26205 | panelService | yes | |

### vendor's lane: TextEdit pid 22901

| cua's keyboardTarget (native/engine/Sources/Engine/KeyTarget.swift:100, #582), predicted from the observed chain | the focused element's public AXUIElementGetPid owner (cua's target before #582) | the focused element's ActualPid | the selected ancestor (the static reading's walk) | the static reading's rule |
|---|---|---|---|---|
| 22917 | 22901 | 22917 | depth 0, pid 22917 | 22917 |

| depth | role | AXUIElementGetPid | _AXUIElementGetActualPid | owner | activation policy | finished launching |
|---|---|---|---|---|---|---|
| 0 | AXList | 22901 | 22917 | com.apple.appkit.xpc.openAndSavePanelService | prohibited | yes |
| 1 | AXScrollArea | 22901 | 22917 | com.apple.appkit.xpc.openAndSavePanelService | prohibited | yes |
| 2 | AXScrollArea | 22901 | 22917 | com.apple.appkit.xpc.openAndSavePanelService | prohibited | yes |
| 3 | AXBrowser | 22901 | 22917 | com.apple.appkit.xpc.openAndSavePanelService | prohibited | yes |
| 4 | AXSplitGroup | 22901 | 22917 | com.apple.appkit.xpc.openAndSavePanelService | prohibited | yes |
| 5 | AXSplitGroup | 22901 | 22917 | com.apple.appkit.xpc.openAndSavePanelService | prohibited | yes |
| 6 | AXWindow | 22901 | 22901 | com.apple.TextEdit | regular | yes |
| 7 | AXApplication | 22901 | 22901 | com.apple.TextEdit | regular | yes |

| route | read | pids | matches ActualPid | matches the selected ancestor |
|---|---|---|---|---|
| windowListAtPanelFrame | yes | 22901 | no | no |
| windowListTopAtPanelCenter | yes | 22901 | no | no |
| frontmostWindowOwner | yes | 22901 | no | no |
| runningApplicationsPanelService | yes | 22917 | yes | yes |
| axWindowPid | yes | none | no | no |
| appFocusedWindowPid | yes | 22901 | no | no |
| systemWideFocusedElementPid | yes | 22901 | no | no |
| systemWideFocusedApplicationPid | yes | 22901 | no | no |
| frontmostApplication | yes | 22901 | no | no |

### cua's lane: TextEdit pid 25518

| cua's keyboardTarget (native/engine/Sources/Engine/KeyTarget.swift:100, #582), predicted from the observed chain | the focused element's public AXUIElementGetPid owner (cua's target before #582) | the focused element's ActualPid | the selected ancestor (the static reading's walk) | the static reading's rule |
|---|---|---|---|---|
| 25837 | 25518 | 25837 | depth 0, pid 25837 | 25837 |

| depth | role | AXUIElementGetPid | _AXUIElementGetActualPid | owner | activation policy | finished launching |
|---|---|---|---|---|---|---|
| 0 | AXList | 25518 | 25837 | com.apple.appkit.xpc.openAndSavePanelService | prohibited | yes |
| 1 | AXScrollArea | 25518 | 25837 | com.apple.appkit.xpc.openAndSavePanelService | prohibited | yes |
| 2 | AXScrollArea | 25518 | 25837 | com.apple.appkit.xpc.openAndSavePanelService | prohibited | yes |
| 3 | AXBrowser | 25518 | 25837 | com.apple.appkit.xpc.openAndSavePanelService | prohibited | yes |
| 4 | AXSplitGroup | 25518 | 25837 | com.apple.appkit.xpc.openAndSavePanelService | prohibited | yes |
| 5 | AXSplitGroup | 25518 | 25837 | com.apple.appkit.xpc.openAndSavePanelService | prohibited | yes |
| 6 | AXWindow | 25518 | 25518 | com.apple.TextEdit | regular | yes |
| 7 | AXApplication | 25518 | 25518 | com.apple.TextEdit | regular | yes |

| route | read | pids | matches ActualPid | matches the selected ancestor |
|---|---|---|---|---|
| windowListAtPanelFrame | yes | 25518 | no | no |
| windowListTopAtPanelCenter | yes | 25518 | no | no |
| frontmostWindowOwner | yes | 25518 | no | no |
| runningApplicationsPanelService | yes | 25837 | yes | yes |
| axWindowPid | yes | none | no | no |
| appFocusedWindowPid | yes | 25518 | no | no |
| systemWideFocusedElementPid | yes | 25518 | no | no |
| systemWideFocusedApplicationPid | yes | 25518 | no | no |
| frontmostApplication | yes | 25518 | no | no |

Input Monitoring granted to io.github.ssfskim.cua.key-route-tap: yes. The engines' TCC rows: unchanged (8 rows).

Cleanup: confirmed.
