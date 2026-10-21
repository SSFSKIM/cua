# #117 own native engine — M2a execution report

This is the executor's account of milestone M2a ("The full method set, settle, intervention") of `docs/doperpowers/specs/2026-10-18-own-native-engine-design.md` (the spec). The work is on branch `feat/117-m2a` in SSFSKIM/cua, cut from origin/main 5941e988.

Where the rest of the record lives:
- The spec carries the decisions: its Progress section (M2a.1–M2a.5), its Decision Log entries ("M2a pre-flight", "M2a vendor reading", "M2a.1", "M2a.4", "M2a.2", "M2a.3", "M2a integration", "whole-M2a review", "M2a.5 hold") and its Surprises.
- The ledger has every base, head, reviewer and hold time: `.doperpowers/sde/2026-10-18-own-native-engine-design/progress.md` (gitignored, M2a section).
- The per-task executor reports are in the same directory: `m2a-1-report.md` to `m2a-5a-report.md`.
- The vendor decompile stays local and is never committed. The repo cites addresses and `F-helper-logic.md` sections only.

## Status

_Draft, 2026-10-21 10:20Z: the code is integrated and its fix waves are in flight; the hold has not run._

| Task | State |
|---|---|
| M2a.1: intervention, the lock screen, route 4's override, `--probe` | Reviewed clean, ticked |
| M2a.2: set_value, select_text, perform_secondary_action, scroll, drag, the menu bar | Reviewed clean, ticked. The menu activation switch was added after integration (reviewed clean) |
| M2a.3: paste, clipboard snapshot and restore, rich text, type_text's paste route | Reviewed clean after four rounds, ticked |
| M2a.4: settle, enablement, the minimized primary window, `cua/serviceMs` | Reviewed clean, ticked |
| Whole-milestone reviewer-high | Round 1: three Important findings and one Minor; fix waves in flight |
| M2a.5: live on the mini | Pending a hold |

## Lanes and integration

M2a ran as parallel lanes, each in its own worktree and Swift scratch path, and was then integrated on feat:

| Lane | Branch | Merged onto feat |
|---|---|---|
| Vendor reading (docs) | m2a/docs | 81406f04 |
| M2a.1 | feat (direct) | — |
| M2a.2 | m2a/methods | ef303a88; the switch at f088b551 |
| M2a.4 | m2a/settle | aca8c704; wiring at ca2aa113; fixes at 62235d71 |
| M2a.3 | m2a/paste | eb498351 |
| M2a.5a (the hold harness) | m2a/live | pending |

## Reviews

- **M2a.1:** four Important findings and the attribution, fixed in 277ca253; then clean.
- **M2a.2:** three findings, fixed in 2fbd31b1 together with the wrapper names; then clean. The menu switch had one finding (the guard time was dropped on failure), fixed in 7334f854 and 1764fb86; then clean.
- **M2a.3**, four rounds:
  1. A failed write lost the restore; a multiline write overwrote a human copy; markdown dropped images and ordered-list starts.
  2. The conflict check moved to the write boundary; a structural sanitizer replaced the regex.
  3. CSS was dropped, which cost the RTF its formatting; it is now kept and sanitized.
  4. Comment stripping was not string-aware, which let a `url(` through; it now is.
- **M2a.4:** three enablement findings, fixed in f9daa446; then clean.
- **Integration:** the element scroll positioned before the minimized refusal, and the focus test was missing. Both fixed in 62235d71; then clean.
- **Whole-milestone reviewer-high**, 5941e988..eb498351:
  - (P1) The clipboard restore checked ownership and cleared in two separate main-thread steps.
  - (P1) Preparatory AX writes ran ahead of the in-flight intervention check.
  - (P2) A route-4 failure after posting skipped the deferred settle.
  - (P3) Paste lost `activationGuardMs` when its guard failed.
  - maws-3f corrected the preparation ruling: the synthesized focus-click fallback counts as posting.
- **The hold harness**, f088b551..2b31600b: one Critical finding (window data could leave the device) and nine Important ones. In a fix round.

## The live hold (M2a.5)

_Pending._

## HID-tap keys and the input method

_Pending the hold._ The question, asked for MAWS P4-B2: do keys posted at the HID tap by the engine's `--probe keystroke` (EventPoster.toHIDTap) go through the Korean 2-Set input method? The row types r then k into the scene's TextEdit and reads whether it got 가, rk or ㄱㅏ. It runs only when the scene's TextEdit is frontmost.

The invocation is `cua-engine --probe keystroke --user-pid <pid> --user-bounds <x,y,w,h> rk` (Probe.swift:54). The probe re-checks the front window before each unit and aborts with status 4 if it is not the named one.

Caveat for reading the result: each event also carries `CGEventKeyboardSetUnicodeString` with its character. A result of "rk" may therefore mean the input method used that string, not that the HID path bypasses the input method. A key-code-only variant would settle this; it would be a later probe change, not part of M2a.

## Residue

- **Route 4's live check.** Per maws-3f, route 4 stays out of the M2a hold, and the owner's `~/.config/cua/engine.json` is never written on the mini. Unit coverage exists (RouteFourTests). The live check belongs to M2b's matrix route cells.
- **`menuClosed` clearing is not built.** The vendor clears its recorded menu root when the menu closes. cua keeps the record until the next observation replaces it.
- **No AXPress for a menu under a coordinate.** A coordinate click or drag that lands on an open menu item is posted as a pointer event. The vendor's AXPress of the item under the point is not built.
- _Hold outcomes: pending._

## Validation

_Pending._
