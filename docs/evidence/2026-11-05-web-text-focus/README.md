# #283's live A/B: a background click into a Chrome page's text field, on a GitHub-hosted macOS runner

**This is #283's live proof** (the design session's acceptance, 1ea561bc a9607cd9, item 6). It ran on a hosted runner, with no owner and no MacBook slot.

- **The probe:** the `probe/283-hosted` branch (`scripts/probe-283/ab.mjs`, `scripts/probe-283/ax.swift`, `.github/workflows/probe-283.yml` with `script=ab`). It stays off main.
- **The final run:** https://github.com/SSFSKIM/cua/actions/runs/42155227806. The fix is at af4bd331; main is at 5fd8915b. Both engines were built on the runner from those commits.
- **The records:** `rep1/results.json` and `rep2/results.json`, one runner each. Each carries the config and, for every cell, the engine's full click and type_text answers (meta, note, error), the point, the page's state before the click, after it and after typing, the window order and the frontmost app. The password field's value is never sent by the page or recorded: only its length.
- **The repeat run:** https://github.com/SSFSKIM/cua/actions/runs/42155231373 (`repeat/rep1`, `repeat/rep2`), at af4bd331. It made only the branch's fresh clicks on the input, the textarea, the prior-selection input and past a textarea line's end, 4 times each per rep.
- **The reps agree in every cell.**
- **After the run:** the branch adds 6ba2aaa6. In the check for boxes still arriving, it counts a surrogate pair as one character. Unit tests cover it, and no cell here holds a supplementary character.
- **The earlier runs** (`earlier/`): 42152333871 and its repeat 42153771431 at 2c016f7b found the two bugs below, which af4bd331 fixes.

**The measured config:**
- Rep 1 of the final run and both reps of the repeat run: GitHub's macos26 image 20261026.0455.2, macOS 26.6.2 (25G83), Chrome for Testing 156.0.8078.47.
- Rep 2 of the final run: image 20261102.0473.1, macOS 26.7.2 (25G332), Chrome for Testing 156.0.8078.80.
- Stable Chrome on the owner's Mac is unmeasured.

**The grants.** As in #282's evidence: the image grants Accessibility, PostEvent and Screen Recording to `/bin/bash`, and an unbundled debug `cua-engine` run as a child of the job's shell inherits them.

**The setup.**
- Each cell gets a fresh Chrome for Testing, a fresh engine and a fresh connection, in shared mode (`ping` names no desktop).
- TextEdit sits frontmost beside Chrome.
- The page holds an input, a textarea (4 lines), a one-node contenteditable (ce), the multi-node contenteditable of #283's round 2 (mce: `alpha bravo <b>charlie delta</b><br>echo foxtrot <span>golf hotel</span> india`) and a password input. It counts pointer, mouse, key and input events on the document, and it reports each field's selection, the active element and the values (for the password field, its length only).
- The engine's first `get_app_state` with a screenshot, then `click {pid, x, y}` in that screenshot's pixels. The point is the left 30% of a character in the middle of a word, from the page's own layout: input offset 14 (in "charlie"); textarea line 2, column 14 (offset 38); ce offset 19 (in "juliet"); mce t1 in its 2nd text node, in "charlie" (node 1, offset 3; region offset 15); mce t2 in its 3rd text node, after the `<br>`, in "foxtrot" (node 2, offset 7; region offset 33).
- Then `type_text` of a two-character marker, and where it landed.
- **Cells:**
  - **fresh:** the click about 0.1 s after the first observation ends, while every character box is still empty.
  - **late:** the click 3 s after it.
  - **prior:** the input with its selection set by the page on load to 6, without focus.
  - **past-end:** the textarea's line 2 clicked at column 40, past its 28 characters, both fresh and late. The expected caret is that line's end, offset 52.
  - **padding:** the input clicked in its left padding, left of its first character. The expected answer is focused but not placed, `pointOutsideText`.
- **"Latency"** is the click call's wall time.

## Results (rep1 / rep2)

| Cell | After obs | Engine answer | Latency (ms) | Focused | Expected caret | Page caret | Typed at | Pointer events | Frontmost |
|---|---|---|---|---|---|---|---|---|---|
| main, fresh, input | 0.32 / 0.14 s | `backgroundClickRefused`, walkStopped editable | 13 / 9 | no | 14 | 0 | nowhere | 0 | TextEdit |
| main, fresh, textarea | 0.17 / 0.14 s | `backgroundClickRefused` | 6 | no | 38 | 0 | nowhere | 0 | TextEdit |
| main, fresh, ce | 0.14 / 0.15 s | `backgroundClickRefused` | 7 / 6 | no | 19 | none | nowhere | 0 | TextEdit |
| main, fresh, mce t1 | 0.19 / 0.14 s | `backgroundClickRefused` | 10 / 6 | no | 15 | none | nowhere | 0 | TextEdit |
| main, fresh, mce t2 | 0.14 / 0.15 s | `backgroundClickRefused` | 7 / 5 | no | 33 | none | nowhere | 0 | TextEdit |
| main, fresh, password | 0.13 / 0.15 s | `backgroundClickRefused` | 6 / 4 | no | focus only | 0 | length unchanged | 0 | TextEdit |
| main, fresh, prior | 0.17 / 0.14 s | `backgroundClickRefused` | 5 / 6 | no | 14 | 6 | nowhere | 0 | TextEdit |
| main, late, each of the same seven | 3.03–3.12 s | `backgroundClickRefused`, walkStopped editable | 3–22 | no | as above | as above | nowhere | 0 | TextEdit |
| branch, fresh, input | 0.14 / 0.13 s | success, focusField, caret placed | 1691 / 1817 | yes | 14 | 14 | 14 | 0 | TextEdit |
| branch, fresh, textarea | 0.14 s | success, focusField placed | 1610 / 1814 | yes | 38 | 38 | 38 | 0 | TextEdit |
| branch, fresh, ce | 0.14 s | success, focusField placed | 1538 / 1781 | yes | 19 | 19 | 19 | 0 | TextEdit |
| branch, fresh, mce t1 | 0.14 s | success, focusField placed | 1499 / 1793 | yes | 15 | 15 (node 1, 3) | 15 | 0 | TextEdit |
| branch, fresh, mce t2 | 0.14 s | success, focusField placed | 1634 / 1842 | yes | 33 | 33 (node 2, 7) | 33 | 0 | TextEdit |
| branch, fresh, password | 0.14 / 0.13 s | success, focusedNotPlaced secure | 82 / 96 | yes | focus only | 0 | length +2 | 0 | TextEdit |
| branch, fresh, prior | 0.14 / 0.13 s | success, focusField placed | 1720 / 1873 | yes | 14 | 14 | 14 | 0 | TextEdit |
| branch, fresh, past-end | 0.14 / 0.13 s | success, focusField placed | 1609 / 1839 | yes | 52 | 52 | 52 | 0 | TextEdit |
| branch, late, input | 3.06 / 3.05 s | success, focusField placed | 148 / 79 | yes | 14 | 14 | 14 | 0 | TextEdit |
| branch, late, textarea | 3.06 / 3.04 s | success, focusField placed | 87 / 93 | yes | 38 | 38 | 38 | 0 | TextEdit |
| branch, late, ce | 3.06 / 3.04 s | success, focusField placed | 199 / 86 | yes | 19 | 19 | 19 | 0 | TextEdit |
| branch, late, mce t1 | 3.09 / 3.05 s | success, focusField placed | 140 / 101 | yes | 15 | 15 (node 1, 3) | 15 | 0 | TextEdit |
| branch, late, mce t2 | 3.08 / 3.04 s | success, focusField placed | 156 / 120 | yes | 33 | 33 (node 2, 7) | 33 | 0 | TextEdit |
| branch, late, password | 3.04 / 3.03 s | success, focusedNotPlaced secure | 58 / 75 | yes | focus only | 0 | length +2 | 0 | TextEdit |
| branch, late, prior | 3.04 / 3.05 s | success, focusField placed | 140 / 55 | yes | 14 | 14 | 14 | 0 | TextEdit |
| branch, late, past-end | 3.07 / 3.04 s | success, focusField placed | 114 / 94 | yes | 52 | 52 | 52 | 0 | TextEdit |
| branch, late, padding | 3.06 / 3.04 s | success, focusedNotPlaced pointOutsideText | 75 | yes | not placed | 0 (its start) | 0 | 0 | TextEdit |

**More on the answers:**
- The branch's answers carry `inputRoute 1` and `elementClick {plan action, action AXFocused, pressedRole, pressed, walk}`:
  - walk `[AXTextField]` or `[AXTextArea]` for the fields themselves, with `pressed hit`;
  - walk `[AXStaticText, AXTextArea]` for both contenteditables, with `pressed ancestor`.
- Each success carries the result's `note`: the placed sentence ("…focused through accessibility, with the caret at the point. No mouse event was sent, so the page saw no click.") or the not-placed one ("…the caret could not be placed at the point: typing goes to the field's existing selection, or to its start if it had none…").
- Main's refusals carry `elementClick {reason webArea, walk [AXTextField | AXTextArea | AXStaticText], walkStopped editable}`.
- The page's active element changed 5 to 24 ms after the branch's click was sent (5 to 43 ms in the repeat run). It never changed on main.
- Every type_text took route 2′. On main nothing was inserted: the keydowns reached the page's body.
- In the CGWindowList order, TextEdit's window stayed first and Chrome's own window kept its place after the branch's clicks. The order shows one new window between them, owned by `cua-engine`: the agent cursor's overlay. Chrome was never raised above TextEdit.
- No answer is wrong against the page: every `placed` had the page caret at the expected offset, and every `focusedNotPlaced` had it at the field's existing selection or start.

**The repeat run** (32 fresh clicks: input, textarea, prior and past-end, 4 each per rep): every one answered focusField placed, with the page caret at the expected offset and typing landing there. The latency was 160 to 1,683 ms. The fresh past-end clicks answered in 1,251 to 1,634 ms: they were placed once the boxes arrived, without waiting out the 2 s.

## What it shows

- **On main, a click into a background Chrome text field is refused** (`backgroundClickRefused`, walkStopped editable), with nothing posted. The field stays unfocused and typed text goes nowhere.
- **On the branch, the click focuses the field through AXFocused** for all five kinds:
  - with no pointer or mouse event (all counters 0, through typing);
  - with TextEdit frontmost and Chrome not raised;
  - with the page's active element set within 43 ms.
- **The caret goes to the point** in the input, the textarea and both contenteditables (in the multi-node one, in the 2nd and the 3rd text node, after the `<br>`), including over a prior selection and past a line's end (the line's end). type_text lands there.
  - 3 s after the first observation the answer takes 55 to 199 ms.
  - 0.1 s after it, the boxes are still empty, and the bounded re-read places the caret with the answer at 0.16 to 1.87 s.
- **A point in the padding is not placed:** `pointOutsideText`, with the caret left at the field's start. That is the ruling's "a point in no box is not placed".
- **The password field is focused only** (`secure`), and the marker typed into it lengthens its value by 2.

## The earlier runs (`earlier/`, at 2c016f7b)

https://github.com/SSFSKIM/cua/actions/runs/42152333871 (`earlier/rep1`, `earlier/rep2`; macOS 26.7.2, Chrome for Testing 156.0.8078.80) and its repeat https://github.com/SSFSKIM/cua/actions/runs/42153771431 (`earlier/repeat/`). They found two bugs. The engine's answers were honest in both (it said not placed, and the page agreed), and af4bd331 fixes both:

1. **A contenteditable region's caret was never placed, even 3 s after the first observation.** ce, mce t1 and mce t2 answered `focusedNotPlaced noCharacterBoxes` in 12 of 12 cells, each after about 2.1 to 2.3 s.
   - The scan honored the AXStaticText hit's AXVisibleCharacterRange, which Chromium reads as {0, 0}, so it read no box.
   - af4bd331 no longer reads that range.
2. **A fresh textarea click could end not placed while its boxes were arriving.** 1 of 10 fresh textarea clicks answered `focusedNotPlaced pointOutsideText` after 1,440 ms, with the page caret at 0.
   - The re-read took the first answer other than `noCharacterBoxes` as final.
   - af4bd331 re-reads a fresh miss whose boxes are incomplete within the same 2 s, while a miss over complete boxes answers at once.
   - At af4bd331, 10 of 10 fresh textarea clicks were placed: 2 in the final run and 8 in the repeat run.
