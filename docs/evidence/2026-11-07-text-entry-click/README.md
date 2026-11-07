# #313: an element click on a text field outside Chromium (hosted macOS, 2026-11-07)

All runs used GitHub-hosted macOS runners: macOS 26.7.2, Safari 27.2, Firefox 159.0, Chrome for Testing and stable Chrome 156.0.8078.80. Each run had 2 reps, the head order alternating by rep, and one engine process per cell, with TextEdit frontmost.

Every cell records the frontmost app and the window order before and after the click. Under ruling c4108490, any raise in shared mode fails the cell.

The kit is `probe/313-ab` (d5099cb5); it stays off main. Per-job results are under `~/.local/share/probe-313/` on the MacBook.

## The first build (AXFocused write) was overturned

**Run:** https://github.com/SSFSKIM/cua/actions/runs/42402098567. Raw-write controls: https://github.com/SSFSKIM/cua/actions/runs/42403579705 and https://github.com/SSFSKIM/cua/actions/runs/42407476270.

- **Safari:** WebKit takes an AXFocused write by activating Safari. Safari goes frontmost and its window rises over TextEdit within 0–240 ms. A bare write with no engine action does the same.
- **Firefox:** the AXFocused write does nothing in a background Firefox, so 10 text cells that main focused through AXPress answered `clickUnconfirmed`.
- **What worked without a raise:**
  - writing AXSelectedTextRange on Safari's textarea;
  - AXPress on Safari's text field;
  - AXPress on Firefox's fields.

## Firefox's focus read-back latency after AXPress

**Run:** https://github.com/SSFSKIM/cua/actions/runs/42408737311. 152 clicks by token, shared and dedicated, on the textarea and the text field.

- AXFocused first read true at p50 71 ms, p99 234 ms and max 271 ms. All 152 fell within 300 ms, so the settle stays at 300 ms.
- TextEdit stayed frontmost on every click.

## The amended rule: main b27ceb36 against 8d1025c1

**Run:** https://github.com/SSFSKIM/cua/actions/runs/42409596011.

| Cell | Main | The fix |
|---|---|---|
| Safari textarea, by token, shared and dedicated | success, but nothing focused, and type_text lands nowhere: **a false success** | focused by the caret step (`focus: readBack`, `focusStep: selection`, `caret: placed`); type_text lands; Safari stays behind TextEdit |
| Safari text field | success through AXPress | the same (`readBack`, `press`); no raise |
| Firefox textarea and text field (10 cells) | success through AXPress | the same (`readBack`, `press`) |
| Buttons and checkboxes, Safari and Firefox | success | identical |
| Native fields: an AppKit probe app, TextEdit, System Settings' search | success, synthesized click | identical; none advertises AXPress |
| Chromium: web cells, #282's textarea cell, and #283's focus cells | – | identical |

- **Shared mode:** 0 raised cells on either head.
- **Dedicated mode:** the target's window rises over TextEdit's equally often on both heads. That predates the fix.
- **Held activation:** the AXSelectedTextRange write, coming after the AXPress inside the engine's held activation, left Safari behind in all 6 such cells.

## The caret read-back: main against e29191c2, Safari only

**Runs:** https://github.com/SSFSKIM/cua/actions/runs/42410937006 and https://github.com/SSFSKIM/cua/actions/runs/42412283946.

- **The read-back went unexercised live.** A Safari textarea that holds text has an inner AXStaticText or AXGroup at its centre, so the click by token takes the synthesized path on both heads, and #313's code doesn't run. The caret step runs only on an empty textarea, where the caret is 0 by construction. The read-back's `selectionMismatch` and `caretWriteError` are proven by unit tests only.
- **The text field:** Safari's AXPress selects the whole value on both heads, so type_text replaces it.
- **A shared-mode raise on the unchanged synthesized path,** 1 of 2 on each head: Safari's window moves above TextEdit's while TextEdit stays frontmost. It isn't #313's code, and it is ticket #321.
