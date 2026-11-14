# #187: paste behind a composition, and the activation before ⌘V (scripts/cursor-sitting/item-187.mjs)

A row is delivered only when the engine's read-back is exact and the page's own beacon, sent after the act, reports the expected length. A background row whose act carried no `activationGuardMs` acted under a held activation and is invalid. Page counts are the counters page's deltas over the act (window and textarea focus/blur, document-level mousedown and click); raises are the 5 ms order watcher's; the clipboard is the type-list digest before and after. Arm B lands only if every B row delivers, with no page mousedown or click, no menu opened, no raise, no front app change, the composition kept, every clipboard restore intact, the arm confirmed by the engine, and no control regressing under B. Arm A is diagnostic; the vendor's rows are recorded only.

## Overall: DOES NOT LAND

- 1 of 18 valid B row(s) not delivered exactly (0 with the engine's read-back and the page's beacon disagreeing)

The owner's input source: restored (com.apple.inputmethod.Korean.2SetKorean, read back).

## Arm B: DOES NOT LAND

- 1 of 18 valid B row(s) not delivered exactly (0 with the engine's read-back and the page's beacon disagreeing)

Part A's controls are incomplete: the electron/composing@textedit control under arm A: the order watcher's longest gap was 213.3 ms, past 50; the textedit/composing@electron control under arm A: the order watcher's longest gap was 184.8 ms, past 50.

Part A (end-early rule): 0 of Part A's 36 rows delivered; Part B runs.

Part A's undelivered rows by paste stage: read: read timeout, effect – × 36.

Per-paste act time in Part B, median over valid rows: arm A 2122.8 ms, arm B 186.4 ms; added by B -1936.4 ms.


| item | rows | arm | recorded / target | valid | delivered | read-back exact | page agrees | disagree | page counts (sum) | raises | front changes | userKept / lost | clipboard changed | menu opened | arm unconfirmed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 187-A1 | chrome/composing@textedit | A | 36 / 36 | 36 | **0** | 0 | 0 | 0 | windowFocus × 0, windowBlur × 0, textFocus × 0, textBlur × 0, mousedown × 0, click × 0 | 0 | 0 | 36 / 0 | 0 | 0 | 0 |
| 187-electron-composing-A | electron/composing@textedit | A | 18 / 18 | 18 | **18** | 18 | 0 | 0 | – | 0 | 0 | 18 / 0 | 0 | 0 | 0 |
| 187-textedit-composing-A | textedit/composing@electron | A | 18 / 18 | 18 | **18** | 18 | 0 | 0 | – | 0 | 0 | 18 / 0 | 0 | 0 | 0 |
| 187-chrome-korean-A | chrome/korean | A | 18 / 18 | 18 | **0** | 0 | 0 | 0 | windowFocus × 0, windowBlur × 0, textFocus × 0, textBlur × 0, mousedown × 0, click × 0 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 187-B | chrome/composing@textedit | A | 27 / 36 | 27 | **0** | 0 | 0 | 0 | windowFocus × 0, windowBlur × 0, textFocus × 0, textBlur × 0, mousedown × 0, click × 0 | 0 | 0 | 27 / 0 | 0 | 0 | 0 |
| 187-B | chrome/composing@textedit | B | 18 / 36 | 18 | **17** | 17 | 17 | 0 | windowFocus × 18, windowBlur × 18, textFocus × 18, textBlur × 18, mousedown × 0, click × 0 | 0 | 0 | 18 / 0 | 0 | 0 | 0 |
| 187-electron-composing-B | electron/composing@textedit | B | 18 / 18 | 18 | **18** | 18 | 0 | 0 | – | 0 | 0 | 18 / 0 | 0 | 0 | 0 |
| 187-textedit-composing-B | textedit/composing@electron | B | 18 / 18 | 18 | **18** | 18 | 0 | 0 | – | 0 | 0 | 18 / 0 | 0 | 0 | 0 |
| 187-chrome-korean-B | chrome/korean | B | 18 / 18 | 18 | **17** | 17 | 17 | 0 | windowFocus × 0, windowBlur × 0, textFocus × 0, textBlur × 0, mousedown × 0, click × 0 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |
| 187-vendor | chrome/composing@textedit | vendor | 9 / 9 | 9 | **9** | 9 | 9 | 0 | windowFocus × 1, windowBlur × 0, textFocus × 1, textBlur × 0, mousedown × 0, click × 0 | 0 | 0 | 9 / 0 | 0 | 0 | 0 |
| 187-vendor-chrome-korean | chrome/korean | vendor | 9 / 9 | 9 | **0** | 0 | 0 | 0 | windowFocus × 0, windowBlur × 0, textFocus × 0, textBlur × 0, mousedown × 0, click × 0 | 0 | 0 | 0 / 0 | 0 | 0 | 0 |

| item | arm | act ms, valid rows | act ms, delivered | read after ⌘V, ms | activation → ⌘V, ms | click → ⌘V, ms | activation point | lifted clicks | routes | activation clicks | key focus at ⌘V |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 187-A1 | A | 2226.2 (2102.5–2564.7, n 36) | – | – | 60.6 (45.5–111.4, n 36) | – | outside × 36 | 0 | paste × 36 | outsideFrame × 36 | does not hold × 36 |
| 187-electron-composing-A | A | 212.3 (131.5–331.5, n 18) | 212.3 (131.5–331.5, n 18) | 25.9 (12.4–111.8, n 18) | 87.3 (61.1–181.8, n 18) | 77.2 (55.4–161.0, n 18) | inside × 18 | 0 | paste × 18 | posted × 18 | does not hold × 18 |
| 187-textedit-composing-A | A | 154.4 (99.2–321.3, n 18) | 154.4 (99.2–321.3, n 18) | 12.9 (7.9–112.4, n 18) | 80.8 (52.7–161.4, n 18) | 63.7 (45.5–129.3, n 18) | inside × 18 | 0 | paste × 18 | posted × 18 | does not hold × 18 |
| 187-chrome-korean-A | A | 2101.6 (2031.0–2231.1, n 18) | – | – | – | – | none × 18 | 0 | paste × 18 | none × 18 | holds × 18 |
| 187-B | A | 2122.8 (2072.7–2326.8, n 27) | – | – | 57.6 (42.7–133.1, n 27) | – | outside × 27 | 0 | paste × 27 | outsideFrame × 27 | does not hold × 27 |
| 187-B | B | 186.4 (130.0–615.2, n 18) | 179.2 (130.0–615.2, n 17) | 25.3 (11.6–72.9, n 18) | 106.0 (59.5–259.8, n 18) | 101.5 (58.7–257.3, n 18) | outside × 18 | 18 | paste × 18 | posted × 18 | does not hold × 18 |
| 187-electron-composing-B | B | 127.9 (107.4–159.5, n 18) | 127.9 (107.4–159.5, n 18) | 13.1 (10.3–34.5, n 18) | 64.5 (52.1–97.1, n 18) | 57.5 (48.9–92.0, n 18) | inside × 18 | 0 | paste × 18 | posted × 18 | does not hold × 18 |
| 187-textedit-composing-B | B | 117.3 (97.1–153.6, n 18) | 117.3 (97.1–153.6, n 18) | 11.6 (5.7–34.7, n 18) | 73.1 (63.2–105.2, n 18) | 54.5 (42.9–80.1, n 18) | inside × 18 | 0 | paste × 18 | posted × 18 | does not hold × 18 |
| 187-chrome-korean-B | B | 62.0 (50.1–80.7, n 18) | 61.9 (50.1–80.7, n 17) | 16.2 (10.4–39.0, n 18) | – | – | none × 18 | 0 | paste × 18 | none × 18 | holds × 18 |
| 187-vendor | vendor | 60.6 (48.9–168.9, n 9) | 60.6 (48.9–168.9, n 9) | – | – | – | none × 9 | 0 | none × 9 | none × 9 | none × 9 |
| 187-vendor-chrome-korean | vendor | 2197.9 (2144.0–2401.4, n 9) | – | – | – | – | none × 9 | 0 | none × 9 | none × 9 | none × 9 |

## 187-A1 (chrome/composing@textedit, arm A)

- undelivered by paste stage: read: read timeout, effect – × 36
- input source readings after each refocus: com.apple.inputmethod.Korean.2SetKorean / com.apple.keylayout.2SetHangul, per-context false; com.apple.inputmethod.Korean.2SetKorean / com.apple.keylayout.2SetHangul, per-context false
- engine status arm per block: A, A
- processes that could read the clipboard: cmux-paste-text-worker, keyboardservicesd, pboard, runningboardd
- order watcher: 0 raise(s) over the item (setup included), longest gap 283.9 ms

## 187-electron-composing-A (electron/composing@textedit, arm A)

- the Electron fixture's counters over the acts (sum): appDidBecomeActive × 18, appDidResignActive × 18, windowFocus × 18, windowBlur × 18, pageFocus × 18, pageBlur × 18, textFocus × 18, textBlur × 18
- input source readings after each refocus: com.apple.inputmethod.Korean.2SetKorean / com.apple.keylayout.2SetHangul, per-context false
- engine status arm per block: A
- processes that could read the clipboard: cmux-paste-text-worker, keyboardservicesd, pboard, runningboardd
- order watcher: 0 raise(s) over the item (setup included), longest gap 213.3 ms

## 187-textedit-composing-A (textedit/composing@electron, arm A)

- the Electron fixture's counters over the acts (sum): appDidBecomeActive × 0, appDidResignActive × 0, windowFocus × 0, windowBlur × 0, pageFocus × 0, pageBlur × 0, textFocus × 0, textBlur × 0
- input source readings after each refocus: com.apple.inputmethod.Korean.2SetKorean / com.apple.keylayout.2SetHangul, per-context false
- engine status arm per block: A
- processes that could read the clipboard: cmux-paste-text-worker, keyboardservicesd, pboard, runningboardd
- order watcher: 0 raise(s) over the item (setup included), longest gap 184.8 ms

## 187-chrome-korean-A (chrome/korean, arm A)

- undelivered by paste stage: read: read timeout, effect – × 18
- input source readings after each refocus: com.apple.inputmethod.Korean.2SetKorean / com.apple.keylayout.2SetHangul, per-context false
- engine status arm per block: A
- processes that could read the clipboard: cmux-paste-text-worker, keyboardservicesd, pboard, runningboardd

## 187-B (chrome/composing@textedit, arm A)

- undelivered by paste stage: read: read timeout, effect – × 27
- input source readings after each refocus: com.apple.inputmethod.Korean.2SetKorean / com.apple.keylayout.2SetHangul, per-context false; com.apple.inputmethod.Korean.2SetKorean / com.apple.keylayout.2SetHangul, per-context false; com.apple.inputmethod.Korean.2SetKorean / com.apple.keylayout.2SetHangul, per-context false; com.apple.inputmethod.Korean.2SetKorean / com.apple.keylayout.2SetHangul, per-context false; com.apple.inputmethod.Korean.2SetKorean / com.apple.keylayout.2SetHangul, per-context false; com.apple.inputmethod.Korean.2SetKorean / com.apple.keylayout.2SetHangul, per-context false
- engine status arm per block: A, B, A, B, A, B
- processes that could read the clipboard: cmux-paste-text-worker, keyboardservicesd, pboard, runningboardd
- stopped: 187-compose refused: the user window's field did not read the composed jamo after the probe's key (it read empty)

## 187-B (chrome/composing@textedit, arm B)

- undelivered by paste stage: effect: read handedOver, effect reading × 1
- input source readings after each refocus: com.apple.inputmethod.Korean.2SetKorean / com.apple.keylayout.2SetHangul, per-context false; com.apple.inputmethod.Korean.2SetKorean / com.apple.keylayout.2SetHangul, per-context false; com.apple.inputmethod.Korean.2SetKorean / com.apple.keylayout.2SetHangul, per-context false; com.apple.inputmethod.Korean.2SetKorean / com.apple.keylayout.2SetHangul, per-context false; com.apple.inputmethod.Korean.2SetKorean / com.apple.keylayout.2SetHangul, per-context false; com.apple.inputmethod.Korean.2SetKorean / com.apple.keylayout.2SetHangul, per-context false
- engine status arm per block: A, B, A, B, A, B
- processes that could read the clipboard: cmux-paste-text-worker, keyboardservicesd, pboard, runningboardd
- stopped: 187-compose refused: the user window's field did not read the composed jamo after the probe's key (it read empty)

## 187-electron-composing-B (electron/composing@textedit, arm B)

- the Electron fixture's counters over the acts (sum): appDidBecomeActive × 18, appDidResignActive × 18, windowFocus × 18, windowBlur × 18, pageFocus × 18, pageBlur × 18, textFocus × 18, textBlur × 18
- input source readings after each refocus: com.apple.inputmethod.Korean.2SetKorean / com.apple.keylayout.2SetHangul, per-context false
- engine status arm per block: B
- processes that could read the clipboard: cmux-paste-text-worker, keyboardservicesd, pboard, runningboardd
- order watcher: 0 raise(s) over the item (setup included), longest gap 29.8 ms

## 187-textedit-composing-B (textedit/composing@electron, arm B)

- the Electron fixture's counters over the acts (sum): appDidBecomeActive × 0, appDidResignActive × 0, windowFocus × 0, windowBlur × 0, pageFocus × 0, pageBlur × 0, textFocus × 0, textBlur × 0
- input source readings after each refocus: com.apple.inputmethod.Korean.2SetKorean / com.apple.keylayout.2SetHangul, per-context false
- engine status arm per block: B
- processes that could read the clipboard: cmux-paste-text-worker, keyboardservicesd, pboard, runningboardd
- order watcher: 0 raise(s) over the item (setup included), longest gap 34.1 ms

## 187-chrome-korean-B (chrome/korean, arm B)

- undelivered by paste stage: effect: read handedOver, effect reading × 1
- input source readings after each refocus: com.apple.inputmethod.Korean.2SetKorean / com.apple.keylayout.2SetHangul, per-context false
- engine status arm per block: B
- processes that could read the clipboard: cmux-paste-text-worker, keyboardservicesd, pboard, runningboardd

## 187-vendor (chrome/composing@textedit, arm vendor)

- input source readings after each refocus: com.apple.inputmethod.Korean.2SetKorean / com.apple.keylayout.2SetHangul, per-context false
- processes that could read the clipboard: cmux-paste-text-worker, keyboardservicesd, pboard, runningboardd
- order watcher: 0 raise(s) over the item (setup included), longest gap 46.9 ms

## 187-vendor-chrome-korean (chrome/korean, arm vendor)

- undelivered by paste stage: no stage: read –, effect – × 9
- input source readings after each refocus: com.apple.inputmethod.Korean.2SetKorean / com.apple.keylayout.2SetHangul, per-context false
- processes that could read the clipboard: cmux-paste-text-worker, keyboardservicesd, pboard, runningboardd

The vendor's chrome/korean lane (recorded only, Chrome frontmost): 0 of 9 paste rows delivered.

The vendor's lane (recorded only): 9 of 9 paste rows delivered.

## #188 rows (counted for #188, never for #187): PASS on cua (4 of 4)

The native matrix's four Electron rows #255 repaired, run as plan.mjs defines them (its prepares, the focus judged by `focusVerdict`), under ABC, judged as the matrix judges a row: valid, delivered (the check's exact post-state) and, in the background (behind the run's Finder window), not interfering (front app, top window, the user window's keyboard focus, no activation outside the kit's own, no route 4). The vendor's rows are the comparison, not judged.

| row | cua | vendor |
|---|---|---|
| electron/frontmost/paste.replace | PASS | PASS |
| electron/background/typeText.replace@finder | PASS | PASS |
| electron/background/pressKey.tab@finder | PASS | PASS |
| electron/background/paste.replace@finder | PASS | PASS |

- cua electron/frontmost/paste.replace: prepared with no stated step; focus read by observation (focusedRole AXTextArea); route paste, paste stage effect; element click not in the row's meta (the prepare's click is not its cell's last call; cell 3 records the field's); activations 0
- cua electron/background/typeText.replace@finder: prepared with no stated step; focus read by observation (focusedRole AXTextArea); route 2'; element click not in the row's meta (the prepare's click is not its cell's last call; cell 3 records the field's); oracle: frontmost true, top window true, focus true, activations 0, route 4 false
- cua electron/background/pressKey.tab@finder: prepared with no stated step; focus read by observation (focusedRole AXTextArea); route 2'; element click not in the row's meta (the prepare's click is not its cell's last call; cell 3 records the field's); oracle: frontmost true, top window true, focus true, activations 0, route 4 false
- cua electron/background/paste.replace@finder: prepared with no stated step; focus read by observation (focusedRole AXTextArea); route paste, paste stage effect; element click not in the row's meta (the prepare's click is not its cell's last call; cell 3 records the field's); oracle: frontmost true, top window true, focus true, activations 0, route 4 false
- vendor electron/frontmost/paste.replace: prepared with no stated step; focus read by trailer; route –; element click not in the row's meta (the prepare's click is not its cell's last call; cell 3 records the field's); activations 0
- vendor electron/background/typeText.replace@finder: prepared with no stated step; focus read by trailer; route –; element click not in the row's meta (the prepare's click is not its cell's last call; cell 3 records the field's); oracle: frontmost true, top window true, focus true, activations 0, route 4 false
- vendor electron/background/pressKey.tab@finder: prepared with no stated step; focus read by trailer; route –; element click not in the row's meta (the prepare's click is not its cell's last call; cell 3 records the field's); oracle: frontmost true, top window true, focus true, activations 0, route 4 false
- vendor electron/background/paste.replace@finder: prepared with no stated step; focus read by trailer; route –; element click not in the row's meta (the prepare's click is not its cell's last call; cell 3 records the field's); oracle: frontmost true, top window true, focus true, activations 0, route 4 false

## #188 cell 3, the click and the selection (recorded only, never counted for #187 or #188)

(i) the field holding the known value with one word selected, then an element click by index; (ii) the caret at the value's end, then a coordinate click mid-text (the facade's `click([x, y])`). The range is the approved bundle's AXSelectedTextRange read (`location+length`), the expected one before the click shown first.

| engine | part | before (expected) | after | outcome | route | element click (plan, action, reason, hit) | focus on the field after | ABC | target line range (0-based line) and where the caret landed |
|---|---|---|---|---|---|---|---|---|---|
| cua | i | 20+7 (20+7) | 20+7 | kept | 1 | action, AXPress, advertised, element | true | yes | – |
| cua | ii | 89+0 (89+0) | 39+0 | moved elsewhere | 3 | – | true | yes | – |
| vendor | i | 20+7 (20+7) | 44+0 | collapsed elsewhere | – | – | true | yes | – |
| vendor | ii | 89+0 (89+0) | 25+0 | moved to the click point | – | – | true | yes | 20..33 (line 2); landed line 2, column 5 |

