# #187: the re-slot, paste behind a composition on the shipping build (scripts/cursor-sitting/item-187.mjs)

A row is delivered only when the engine's read-back is exact and the page's own beacon, sent after the act, reports the expected length. A background row whose act carried no `activationGuardMs` acted under a held activation and is invalid. Page counts are the counters page's deltas over the act (window and textarea focus/blur, document-level mousedown and click); raises are the 5 ms order watcher's; the clipboard is the type-list digest before and after; the key at the act is the driven app's primary window AXFocused and AXMain, the app's AXFrontmost, and on Chrome the page's hasFocus(), read right before it.

**The bar**: chrome/composing@textedit 18/18 with every line confirmed by its own change (`cua/paste.perLine`); the three controls 18/18; the background-paste cell, latin on purpose, on 3 counted repetitions a half: AFTER (the shipping build) both pastes delivered and the key held after `open -a`, and BEFORE (the saved engine, in the same slot) the background paste timing out at the read stage with Chrome keyless after `open -a` (a BEFORE that delivers: NO VERDICT, the cell does not discriminate); every watcher whole with its longest gap within 50 ms; no raise and no menu opened; nothing else on the person's side touched; the put-back verified (the owner's source read back, the saved engine installed and approved). A person-touched row or repetition is invalid. The AXPress route is reported, never the bar. Anything less is DOES NOT LAND.

## Overall: DOES NOT LAND

- chrome/composing@textedit: 1 row(s) whose lines were not each confirmed by their own change (187-chrome-composing#1.6: 1 per-line record(s) for 2 line(s))
- the background-paste cell's AFTER half: 0 of 3 counted repetitions with the background paste delivered, the key held after open -a and the frontmost paste delivered (3 counted; after-0: the key was not held after the activation; after-1: the key was not held after the activation; after-2: the key was not held after the activation)
- the background-paste cell's BEFORE half: 0 of 3 counted repetitions failing as predicted (the background paste timing out at the read stage, the key not held after open -a, the frontmost paste not delivered) (3 counted; before-0: the background paste stopped at no stage (read –), not a read timeout; before-1: the background paste stopped at no stage (read –), not a read timeout; before-2: the background paste stopped at no stage (read –), not a read timeout)

The baseline, cited and not re-run: on 6226f2698ab0 as built (the slot of 2026-11-01's arm A, 187-A1 (36, twice) and 187-B's arm A blocks (27)), 0 of 99 valid rows delivered, every one stopping at the read (timeout) stage (docs/evidence/2026-10-30-macos-agent-cursor/item-187/item-187.md).

The put-back: the owner's input source restored (com.apple.keylayout.ABC, read back); the engine put back (build dd7a092358850cc6769f2acf3aaff1655543f9f0872ff05c3b42a1ebe0179e62, approved, the save's).

## The confirming cell: the background paste (the bar's route)

Per repetition: Chrome for Testing relaunched clean and placed at the left, TextEdit over its right half and in front under ABC; one background paste of the one-line Latin string into the page's textarea, its prepare clicking nothing. **The cell is latin on purpose**: no composition, so it isolates the activation's arm; the composing part covers the titled rows. Then Chrome activated by `open -a`, the key-window state read, and one frontmost paste whose prepare clicks nothing. The premise: the background paste's activation click skipped (`activationClick` outsideFrame), so only the shipping build's inert click, or nothing on the saved engine, can consume the arm; a repetition whose activation point lies inside the frame posts a click of its own, which consumes the arm on either engine, and is premise not met, never counted. Predicted: AFTER (the shipping build) both pastes delivered and the key held; BEFORE (the saved engine) the background paste timing out at the read stage and Chrome keyless after `open -a`. A BEFORE repetition that delivers means the cell does not discriminate: NO VERDICT.

| half | rep | status | background: activation click / click kind | background paste | its stage / read | key before open -a | key after open -a | frontmost paste | its stage / read |
|---|---|---|---|---|---|---|---|---|---|
| after | 1 | counted | outsideFrame / inertOutside activationPoint early | delivered | effect / handedOver | frontmost no, AXFocused no, AXMain yes, focused window run, hasFocus no | frontmost yes, AXFocused no, AXMain yes, focused window run, hasFocus yes (1029 ms) | delivered | effect / handedOver |
| after | 2 | counted | outsideFrame / inertOutside activationPoint early | delivered | effect / handedOver | frontmost no, AXFocused no, AXMain yes, focused window run, hasFocus no | frontmost yes, AXFocused no, AXMain yes, focused window run, hasFocus yes (1040 ms) | delivered | effect / handedOver |
| after | 3 | counted | outsideFrame / inertOutside activationPoint early | delivered | effect / handedOver | frontmost no, AXFocused no, AXMain yes, focused window run, hasFocus no | frontmost yes, AXFocused no, AXMain yes, focused window run, hasFocus yes (1175 ms) | delivered | effect / handedOver |
| before | 1 | counted | outsideFrame / – | not delivered | – | frontmost no, AXFocused no, AXMain yes, focused window run, hasFocus no | frontmost yes, AXFocused no, AXMain yes, focused window run, hasFocus yes (1123 ms) | not delivered | – |
| before | 2 | counted | outsideFrame / – | not delivered | – | frontmost no, AXFocused no, AXMain yes, focused window run, hasFocus no | frontmost yes, AXFocused no, AXMain yes, focused window run, hasFocus yes (1123 ms) | not delivered | – |
| before | 3 | counted | outsideFrame / – | not delivered | – | frontmost no, AXFocused no, AXMain yes, focused window run, hasFocus no | frontmost yes, AXFocused no, AXMain yes, focused window run, hasFocus yes (1124 ms) | not delivered | – |

AFTER: 0 of 3 counted repetitions with both pastes delivered and the key held (3 needed).
BEFORE: 0 of 3 counted repetitions failing as predicted (3 needed).

## The AXPress element click (reported for the mechanism, never the bar)

It runs only when the premise part saw the textarea advertise AXPress within 5000 ms of every sample's first observation, and each repetition waits up to as long for it again; without it the repetition is PRECONDITION UNMET and posts nothing, and a click whose plan is not action/AXPress is premise not met. The kit's earlier claim that Chromium advertises AXPress on the textarea was never verified on Chrome: the slot of 2026-11-05 clicked it on the synthesized plan (`noAction`), 0.3 s after the session's first observation of a fresh Chrome.

The premise part (engine dd7a092358850cc6769f2acf3aaff1655543f9f0872ff05c3b42a1ebe0179e62, approved): AXPress appeared after 351 ms, 100 ms, 87 ms; the route runs.

| half | rep | status | AXPress after | click plan (action, reason) | activation click | key before open -a | key after open -a | paste | stage / read |
|---|---|---|---|---|---|---|---|---|---|
| after | 1 | counted | 1671 ms | action (AXPress, advertised) | inertOutside activationPoint early | frontmost no, AXFocused no, AXMain yes, focused window run, hasFocus no | frontmost yes, AXFocused no, AXMain yes, focused window run, hasFocus yes (1035 ms) | delivered | effect / handedOver |
| before | 1 | premise not met (the click's plan was unread, not action/AXPress) | 96 ms | – | – | frontmost no, AXFocused no, AXMain yes, focused window run, hasFocus no | frontmost yes, AXFocused no, AXMain yes, focused window run, hasFocus yes (1004 ms) | not delivered | – |

AFTER: 0 of 1 counted repetition(s) key and delivered.
BEFORE: 0 of 0 counted repetition(s) keyless with the read timing out, as predicted.
Not counted: 187-press-before-0 premise not met (the click's plan was unread, not action/AXPress).

| item | rows | recorded / target | valid | delivered | read-back exact | page agrees | disagree | lines confirmed (rows) | page counts (sum) | raises | front changes | userKept / lost | clipboard changed | menu opened |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 187-chrome-composing | chrome/composing@textedit | 18 / 18 | 18 | **18** | 18 | 18 | 0 | 17 | windowFocus × 18, windowBlur × 18, textFocus × 18, textBlur × 18, mousedown × 0, click × 0 | 0 | 0 | 18 / 0 | 0 | 0 |
| 187-electron-composing | electron/composing@textedit | 18 / 18 | 18 | **18** | 18 | 0 | 0 | 17 | – | 0 | 0 | 18 / 0 | 0 | 0 |
| 187-textedit-composing | textedit/composing@electron | 18 / 18 | 18 | **18** | 18 | 0 | 0 | 17 | – | 0 | 0 | 18 / 0 | 0 | 0 |
| 187-chrome-korean | chrome/korean | 18 / 18 | 18 | **18** | 18 | 18 | 0 | 17 | windowFocus × 0, windowBlur × 0, textFocus × 0, textBlur × 0, mousedown × 0, click × 0 | 0 | 0 | 0 / 0 | 0 | 0 |

| item | act ms, valid rows | act ms, delivered | read after ⌘V, ms | activation → ⌘V, ms | click → ⌘V, ms | activation clicks | routes | key at the act | key focus at ⌘V | delivery guard restores |
|---|---|---|---|---|---|---|---|---|---|---|
| 187-chrome-composing | 105.3 (92.1–229.8, n 18) | 105.3 (92.1–229.8, n 18) | 13.1 (5.9–18.6, n 18) | 29.3 (20.6–174.7, n 18) | 28.4 (20.3–174.4, n 18) | inertOutside activationPoint early × 18 | paste × 18 | not key × 18 | does not hold × 18 | 0 |
| 187-electron-composing | 114.1 (97.6–239.3, n 18) | 114.1 (97.6–239.3, n 18) | 14.1 (10.3–77.4, n 18) | 31.1 (24.1–177.0, n 18) | 27.4 (20.3–176.3, n 18) | activationPoint early × 18 | paste × 18 | not key × 18 | does not hold × 18 | 0 |
| 187-textedit-composing | 135.2 (114.4–213.3, n 18) | 135.2 (114.4–213.3, n 18) | 11.3 (4.8–36.8, n 18) | 45.4 (22.7–179.7, n 18) | 29.6 (19.4–163.0, n 18) | activationPoint early × 18 | paste × 18 | not key × 18 | does not hold × 18 | 0 |
| 187-chrome-korean | 61.3 (39.8–200.7, n 18) | 61.3 (39.8–200.7, n 18) | 14.1 (8.7–45.7, n 18) | – | – | none × 18 | paste × 18 | front, not key × 18 | holds × 18 | 0 |

## 187-chrome-composing (chrome/composing@textedit)

- lines not each confirmed by their own change: 187-chrome-composing#1.6 (1 per-line record(s) for 2 line(s))
- input source readings after each refocus: com.apple.inputmethod.Korean.2SetKorean / com.apple.keylayout.2SetHangul, per-context false; com.apple.inputmethod.Korean.2SetKorean / com.apple.keylayout.2SetHangul, per-context false
- processes that could read the clipboard: cmux-paste-text-worker, keyboardservicesd, pboard, runningboardd
- order watcher: 0 raise(s) over the item (0 in the kit's own setup), longest gap 40.1 ms

## 187-electron-composing (electron/composing@textedit)

- the Electron fixture's counters over the acts (sum): appDidBecomeActive × 18, appDidResignActive × 18, windowFocus × 18, windowBlur × 18, pageFocus × 18, pageBlur × 18, textFocus × 18, textBlur × 18
- input source readings after each refocus: com.apple.inputmethod.Korean.2SetKorean / com.apple.keylayout.2SetHangul, per-context false
- processes that could read the clipboard: cmux-paste-text-worker, keyboardservicesd, pboard, runningboardd
- order watcher: 0 raise(s) over the item (0 in the kit's own setup), longest gap 26.6 ms

## 187-textedit-composing (textedit/composing@electron)

- the Electron fixture's counters over the acts (sum): appDidBecomeActive × 0, appDidResignActive × 0, windowFocus × 0, windowBlur × 0, pageFocus × 0, pageBlur × 0, textFocus × 0, textBlur × 0
- input source readings after each refocus: com.apple.inputmethod.Korean.2SetKorean / com.apple.keylayout.2SetHangul, per-context false
- processes that could read the clipboard: cmux-paste-text-worker, keyboardservicesd, pboard, runningboardd
- order watcher: 0 raise(s) over the item (0 in the kit's own setup), longest gap 26.8 ms

## 187-chrome-korean (chrome/korean)

- input source readings after each refocus: com.apple.inputmethod.Korean.2SetKorean / com.apple.keylayout.2SetHangul, per-context false
- processes that could read the clipboard: cmux-paste-text-worker, keyboardservicesd, pboard, runningboardd

## #259 diagnostic cell: (ii) with the caret at the start (cua only, recorded only, never counted for #187 or #188)

The fixture's field given (ii)'s value with the caret at its end, its geometry read through Accessibility (its frame and each line's first character's top: numbers only), the caret moved to offset 0 and the geometry read again, then the same coordinate click. The first line's offset from the field's top is the field's inset less its scroll, so the end's offset against the start's is how far the caret at the end scrolled the field. The line under the posted point is read off the start geometry's line tops; lines are 0-based.

| | value |
|---|---|
| ABC before and after | yes |
| before the click (expected) | 0+0 (0+0) |
| outcome | moved to the click point |
| target | offsets 20..33 (line 2) |
| landed | line 2, column 5 |
| the line under the posted point (AX geometry) | line 2, where the caret landed |
| first line's offset from the field's top, caret at the end / at the start (pt) | 3 / 3 |
| the field scrolled by the caret at the end (pt) | 0 |
| field frame (AX, the start's) | (156, 148, 426 × 99) |
| screenshotPoint (px) | (120, 168) |
| windowPoint (pt) | (60, 84) |
| postedLocation (global pt) | (200, 184) |
| postedWindowLocation (pt) | (60, 84) |
| windowFrame | (140, 100, 720 × 560) |
| frameBeforePost | (140, 100, 720 × 560) |
| route, click ms | 3, 8.2 |

## #188 rows (counted for #188, never for #187): NOT RUN

## #188 cell 3, the click and the selection (recorded only): NOT RUN

