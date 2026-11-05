# #187: the re-judgment addendum (item-187-rejudge.md)

An offline re-judgment of this out directory's records, by the judge's predicates as amended on 2026-11-05 (the kit at faf584858940), after the slot and before this judgment ran. `item-187.md` stays exactly as the slot's judge computed it; this file is beside it. The amendments, each with its reason:

- **(a) The read stage.** When a paste threw with no stage meta, its read-stage timeout is taken from the error itself: code -10005 with "Timed out waiting for the application to read the clipboard". The saved engine (dd7a) never emits the stage meta, on any paste, so this does not depend on the outcome; only that code with that message counts, nothing broader.
- **(b) The key.** The run window's own AXFocused is no longer part of the key reading: it read no on 66 of 66 Chrome key-window readings, both builds (the shipping build 51 of 51, the saved engine 15 of 15), so it carries no information.
- **(c) The bar.** The key-window conditions leave the bar for the mechanism section. The cell's discrimination rests on delivery alone, as both halves pre-registered it: AFTER both pastes delivered; BEFORE the background paste timing out at the read stage and the frontmost paste not delivered. The mechanism section reports the key readings per half (frontmost, AXMain, AXFocusedWindow, hasFocus) and judges the "Chrome frontmost with no key window" prediction as it was stated. The AXPress route stays reported only.
- **(e) The per-line record.** typeText still needs one record per line, each confirmed by its own change, every later line opened by a settled Return. paste needs exactly one record: the engine sends the whole text, newlines included, as one part in one ⌘V (Paste.swift:720) and counts its lines as 1 plus its Return parts (:487), so a paste is one act with one record, confirmed by its own change. The bar had asked a paste for a record per line of its text.

**What these are.** (a), (b) and (e) are judge predicates that no run could meet: the saved engine never emits the stage meta, AXFocused read no on every Chrome reading on both builds, and a paste never makes more than one record. Correcting them changes what the judge can read, not what the slot did. (c) is different: the "Chrome frontmost with no key window" prediction was tested, and the readings refute it. It is a refuted prediction, recorded as wrong, not restated, and it leaves the bar because the pre-registered discrimination of both halves is delivery.

## Re-judged: LANDS, on the background paste

- every condition held

The prediction "Chrome frontmost with no key window" (the saved engine, after `open -a`) was tested and is NOT supported: the key readings after `open -a` were identical on both builds.

---

# #187: the re-slot, paste behind a composition on the shipping build (scripts/cursor-sitting/item-187.mjs)

A row is delivered only when the engine's read-back is exact and the page's own beacon, sent after the act, reports the expected length. A background row whose act carried no `activationGuardMs` acted under a held activation and is invalid. Page counts are the counters page's deltas over the act (window and textarea focus/blur, document-level mousedown and click); raises are the 5 ms order watcher's; the clipboard is the type-list digest before and after; the key at the act is the driven app's primary window AXFocused and AXMain, the app's AXFrontmost, and on Chrome the page's hasFocus(), read right before it.

**The bar**: chrome/composing@textedit 18/18 with every line confirmed by its own change (`cua/paste.perLine`); the three controls 18/18; the background-paste cell, latin on purpose, on 3 counted repetitions a half: AFTER (the shipping build) both pastes delivered, and BEFORE (the saved engine, in the same slot) the background paste timing out at the read stage and the frontmost paste not delivered (a BEFORE that delivers: NO VERDICT, the cell does not discriminate); the key-window readings are reported in the mechanism section, never the bar; every watcher whole with its longest gap within 50 ms; no raise and no menu opened; nothing else on the person's side touched; the put-back verified (the owner's source read back, the saved engine installed and approved). A person-touched row or repetition is invalid. The AXPress route is reported, never the bar. Anything less is DOES NOT LAND.

## Overall: LANDS, on the background paste

- every condition held

The baseline, cited and not re-run: on 6226f2698ab0 as built (the slot of 2026-11-01's arm A, 187-A1 (36, twice) and 187-B's arm A blocks (27)), 0 of 99 valid rows delivered, every one stopping at the read (timeout) stage (docs/evidence/2026-10-30-macos-agent-cursor/item-187/item-187.md).

The put-back: the owner's input source restored (com.apple.keylayout.ABC, read back); the engine put back (build dd7a092358850cc6769f2acf3aaff1655543f9f0872ff05c3b42a1ebe0179e62, approved, the save's).

## The confirming cell: the background paste (the bar's route)

Per repetition: Chrome for Testing relaunched clean and placed at the left, TextEdit over its right half and in front under ABC; one background paste of the one-line Latin string into the page's textarea, its prepare clicking nothing. **The cell is latin on purpose**: no composition, so it isolates the activation's arm; the composing part covers the titled rows. Then Chrome activated by `open -a`, the key-window state read, and one frontmost paste whose prepare clicks nothing. The premise: the background paste's activation click skipped (`activationClick` outsideFrame), so only the shipping build's inert click, or nothing on the saved engine, can consume the arm; a repetition whose activation point lies inside the frame posts a click of its own, which consumes the arm on either engine, and is premise not met, never counted. Predicted, and judged on delivery alone: AFTER (the shipping build) both pastes delivered; BEFORE (the saved engine) the background paste timing out at the read stage and the frontmost paste not delivered. A BEFORE repetition that delivers means the cell does not discriminate: NO VERDICT. The key-window readings are in the mechanism section below.

| half | rep | status | background: activation click / click kind | background paste | its stage / read | key before open -a | key after open -a | frontmost paste | its stage / read |
|---|---|---|---|---|---|---|---|---|---|
| after | 1 | counted | outsideFrame / inertOutside activationPoint early | delivered | effect / handedOver | frontmost no, AXFocused no, AXMain yes, focused window run, hasFocus no | frontmost yes, AXFocused no, AXMain yes, focused window run, hasFocus yes (1029 ms) | delivered | effect / handedOver |
| after | 2 | counted | outsideFrame / inertOutside activationPoint early | delivered | effect / handedOver | frontmost no, AXFocused no, AXMain yes, focused window run, hasFocus no | frontmost yes, AXFocused no, AXMain yes, focused window run, hasFocus yes (1040 ms) | delivered | effect / handedOver |
| after | 3 | counted | outsideFrame / inertOutside activationPoint early | delivered | effect / handedOver | frontmost no, AXFocused no, AXMain yes, focused window run, hasFocus no | frontmost yes, AXFocused no, AXMain yes, focused window run, hasFocus yes (1175 ms) | delivered | effect / handedOver |
| before | 1 | counted | outsideFrame / – | not delivered | – | frontmost no, AXFocused no, AXMain yes, focused window run, hasFocus no | frontmost yes, AXFocused no, AXMain yes, focused window run, hasFocus yes (1123 ms) | not delivered | – |
| before | 2 | counted | outsideFrame / – | not delivered | – | frontmost no, AXFocused no, AXMain yes, focused window run, hasFocus no | frontmost yes, AXFocused no, AXMain yes, focused window run, hasFocus yes (1123 ms) | not delivered | – |
| before | 3 | counted | outsideFrame / – | not delivered | – | frontmost no, AXFocused no, AXMain yes, focused window run, hasFocus no | frontmost yes, AXFocused no, AXMain yes, focused window run, hasFocus yes (1124 ms) | not delivered | – |

AFTER: 3 of 3 counted repetitions with both pastes delivered (3 needed).
BEFORE: 3 of 3 counted repetitions failing as predicted (3 needed).

## The mechanism: the key-window readings (reported, never the bar)

The background-paste cell's counted repetitions: Chrome's run window and page read by half (`ax-state.swift window`, value-free, and the counters page's `document.hasFocus()`).

| half | before `open -a` | after `open -a` |
|---|---|---|
| after | frontmost no, AXMain yes, AXFocusedWindow run, hasFocus no × 3 | frontmost yes, AXMain yes, AXFocusedWindow run, hasFocus yes × 3 |
| before | frontmost no, AXMain yes, AXFocusedWindow run, hasFocus no × 3 | frontmost yes, AXMain yes, AXFocusedWindow run, hasFocus yes × 3 |

The prediction "Chrome frontmost with no key window" (the saved engine, after `open -a`) was tested and is NOT supported: the key readings after `open -a` were identical on both builds.

The run window's own AXFocused read no on 66 of 66 Chrome key-window readings, both builds (the shipping build 51 of 51, the saved engine 15 of 15); it is no part of the key reading.

## The AXPress element click (reported for the mechanism, never the bar)

It runs only when the premise part saw the textarea advertise AXPress within 5000 ms of every sample's first observation, and each repetition waits up to as long for it again; without it the repetition is PRECONDITION UNMET and posts nothing, and a click whose plan is not action/AXPress is premise not met. The kit's earlier claim that Chromium advertises AXPress on the textarea was never verified on Chrome: the slot of 2026-11-05 clicked it on the synthesized plan (`noAction`), 0.3 s after the session's first observation of a fresh Chrome.

The premise part (engine dd7a092358850cc6769f2acf3aaff1655543f9f0872ff05c3b42a1ebe0179e62, approved): AXPress appeared after 351 ms, 100 ms, 87 ms; the route runs.

| half | rep | status | AXPress after | click plan (action, reason) | activation click | key before open -a | key after open -a | paste | stage / read |
|---|---|---|---|---|---|---|---|---|---|
| after | 1 | counted | 1671 ms | action (AXPress, advertised) | inertOutside activationPoint early | frontmost no, AXFocused no, AXMain yes, focused window run, hasFocus no | frontmost yes, AXFocused no, AXMain yes, focused window run, hasFocus yes (1035 ms) | delivered | effect / handedOver |
| before | 1 | premise not met (the click's plan was unread, not action/AXPress) | 96 ms | – | – | frontmost no, AXFocused no, AXMain yes, focused window run, hasFocus no | frontmost yes, AXFocused no, AXMain yes, focused window run, hasFocus yes (1004 ms) | not delivered | – |

AFTER: 1 of 1 counted repetition(s) key and delivered.
BEFORE: 0 of 0 counted repetition(s) with the paste's read timing out, as predicted.
Not counted: 187-press-before-0 premise not met (the click's plan was unread, not action/AXPress).

| item | rows | recorded / target | valid | delivered | read-back exact | page agrees | disagree | lines confirmed (rows) | page counts (sum) | raises | front changes | userKept / lost | clipboard changed | menu opened |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 187-chrome-composing | chrome/composing@textedit | 18 / 18 | 18 | **18** | 18 | 18 | 0 | 18 | windowFocus × 18, windowBlur × 18, textFocus × 18, textBlur × 18, mousedown × 0, click × 0 | 0 | 0 | 18 / 0 | 0 | 0 |
| 187-electron-composing | electron/composing@textedit | 18 / 18 | 18 | **18** | 18 | 0 | 0 | 18 | – | 0 | 0 | 18 / 0 | 0 | 0 |
| 187-textedit-composing | textedit/composing@electron | 18 / 18 | 18 | **18** | 18 | 0 | 0 | 18 | – | 0 | 0 | 18 / 0 | 0 | 0 |
| 187-chrome-korean | chrome/korean | 18 / 18 | 18 | **18** | 18 | 18 | 0 | 18 | windowFocus × 0, windowBlur × 0, textFocus × 0, textBlur × 0, mousedown × 0, click × 0 | 0 | 0 | 0 / 0 | 0 | 0 |

| item | act ms, valid rows | act ms, delivered | read after ⌘V, ms | activation → ⌘V, ms | click → ⌘V, ms | activation clicks | routes | key at the act | key focus at ⌘V | delivery guard restores |
|---|---|---|---|---|---|---|---|---|---|---|
| 187-chrome-composing | 105.3 (92.1–229.8, n 18) | 105.3 (92.1–229.8, n 18) | 13.1 (5.9–18.6, n 18) | 29.3 (20.6–174.7, n 18) | 28.4 (20.3–174.4, n 18) | inertOutside activationPoint early × 18 | paste × 18 | not key × 18 | does not hold × 18 | 0 |
| 187-electron-composing | 114.1 (97.6–239.3, n 18) | 114.1 (97.6–239.3, n 18) | 14.1 (10.3–77.4, n 18) | 31.1 (24.1–177.0, n 18) | 27.4 (20.3–176.3, n 18) | activationPoint early × 18 | paste × 18 | not key × 18 | does not hold × 18 | 0 |
| 187-textedit-composing | 135.2 (114.4–213.3, n 18) | 135.2 (114.4–213.3, n 18) | 11.3 (4.8–36.8, n 18) | 45.4 (22.7–179.7, n 18) | 29.6 (19.4–163.0, n 18) | activationPoint early × 18 | paste × 18 | not key × 18 | does not hold × 18 | 0 |
| 187-chrome-korean | 61.3 (39.8–200.7, n 18) | 61.3 (39.8–200.7, n 18) | 14.1 (8.7–45.7, n 18) | – | – | none × 18 | paste × 18 | key × 18 | holds × 18 | 0 |

## 187-chrome-composing (chrome/composing@textedit)

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
