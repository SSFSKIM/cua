# #117 own native engine — M2a execution report

This is the executor's account of milestone M2a ("The full method set, settle, intervention") of `docs/doperpowers/specs/2026-10-18-own-native-engine-design.md` (the spec). The work is on branch `feat/117-m2a` in SSFSKIM/cua, cut from origin/main 5941e988.

Where the rest of the record lives:
- The spec carries the decisions: its Progress section (M2a.1–M2a.5), its Decision Log entries ("M2a pre-flight", "M2a vendor reading", "M2a.1", "M2a.4", "M2a.2", "M2a.3", "M2a integration", "whole-M2a review", "M2a.5 hold") and its Surprises.
- The ledger has every base, head, reviewer and hold time: `.doperpowers/sde/2026-10-18-own-native-engine-design/progress.md` (gitignored, M2a section).
- The per-task executor reports are in the same directory: `m2a-1-report.md` to `m2a-5a-report.md`.
- The vendor decompile stays local and is never committed. The repo cites addresses and `F-helper-logic.md` sections only.

## Status

_Draft, 2026-10-21 11:56Z: everything is integrated and reviewed. The hold commit is e2ad3dbb (ci-gate GREEN, run 39593249861), and the hold is planned for ~16:30Z._

| Task | State |
|---|---|
| M2a.1: intervention, the lock screen, route 4's override, `--probe` | Reviewed clean, ticked |
| M2a.2: set_value, select_text, perform_secondary_action, scroll, drag, the menu bar | Reviewed clean, ticked. The menu activation switch was added after integration (reviewed clean) |
| M2a.3: paste, clipboard snapshot and restore, rich text, type_text's paste route | Reviewed clean after four rounds, ticked |
| M2a.4: settle, enablement, the minimized primary window, `cua/serviceMs` | Reviewed clean, ticked |
| Whole-milestone reviewer-high | Round 1 found three Important and one Minor. All fixed (53e6c7f5, ef4d1336); re-review **correct** at 9c71da8e |
| M2a.5a: the hold harness | Six review rounds, merged at 1912d2d9. One abort-path gap is left open as tech debt by the agreed stopping rule |
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
| M2a.5a (the hold harness) | m2a/live | 6ac56803 (round 5), 1912d2d9 (round 6) |

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
- **The hold harness**, six rounds:
  - **Round 1** (f088b551..2b31600b) found one Critical: owner window titles and text could leave the device, and the alert watch could observe arbitrary apps. It also found nine Important:
    - no put-back on a signal;
    - unbounded SSH;
    - the protected front app (resolved by the coordinator's ruling: restore by activation only);
    - minimized and menu verdicts built on invalid evidence;
    - the Korean precondition;
    - the clipboard claim (relabelled as a type-topology check);
    - the Finder observation.
  - **Rounds 4 to 6** closed those, then tightened the recovery: it acts only on journaled processes, waits out scene startups and probes, and confirms that a timed-out step's process group is empty.
  - **Stopping rule**, agreed with the coordinator: after round 6, abort-path gaps go to tech debt. The hold is attended, and phase 4 checks each put-back item independently. One gap stayed open: recovery does not wait for a probe launch that is still pending. It is logged at e2ad3dbb, and the runbook re-reads the input source and the front app after any recovery.

## The live hold (M2a.5)

**Window.** CI-opt held the mini from 12:28Z to 13:43Z. The runner was disabled and the quiet flag was up throughout.
- Phase 0 (12:28–12:29Z) brought the mini's checkout to e57aa75c, clean, with the lock unchanged, and built the release engine in 27 s.
- It also read the put-back baseline:
  - macOS 27.0;
  - Finder: ShowSidebar=1, ShowStatusBar and ShowPathbar unset;
  - input source ABC, per-context preference 0;
  - front app Terminal;
  - no TextEdit, no Chrome for Testing, no engine running.

**Build and approve (12:29Z).** Build 1ec58faab897 was signed silently and approved at 12:29:33Z without an Enter. The engine holds all three grants.

**Comparison A (12:29–12:42Z).** Three vv and three vc runs, all complete with no leftovers. `compare --engines` gave VERDICT: PASS (`m2a/comparison-a/comparison.md`).

| Row | vv judged | vc judged | Verdict |
|---|---|---|---|
| task.act | 1160.2 | 926.3 | pass |
| task.verify | 523.2 | 504.8 | pass |
| task.close | 2704.5 | 1634.9 | pass |
| task.total | 4384.0 | 3126.0 | pass |

Load was 3.5 to 3.8 throughout. A Python process that belonged to neither CI nor CI-opt used about 22% CPU. The verdict holds under that load, so nothing was re-run.

**Live checks (12:42–12:54Z).** Every command's put-back was ok and left the front app as it was.

- **minimized.** No screenshot was taken (`screenshotOmitted: windowMinimized`). Click and scroll were refused as `windowMinimized`.
  - set_value landed by route 1.
  - select_text answered ok, but the selection did not read back.
  - type_text reported `entered: 6`, but the window's value did not change.
  - ⌘A had no effect.
  - The harness's `setValueNoClick` and `selectTextNoClick` failures are a misreading. It took a route-1 write's interval for a click; that is fixed at 08eb2d17. The decision: refuse plain keys, ⌘ chords and paste.
- **menu.** Run against a background TextEdit.
  - The vendor's Select All and Bold act and read enabled.
  - cua with the switch off: Select All reads disabled, and Bold is not found.
  - cua with the switch on: both have no effect (route 1, guard 36 and 54 ms).
  - Per-action activation is not enough, so the switch is removed. The route for background menus is a fork brought to maws-3f.
- **input-source.** PASS.
- **enablement.** Not released: the prior read "false" first and "true" second.
- **paste and hidComposition.** Not run. A SecurityAgent prompt was on screen from 12:34:35Z, during vv run 3. The coordinator traced it in the log to the owner's ClaudeUsage menubar app, after another Claude CLI's keychain reads. It was not the hold's. The paste section's alert watch aborted at its first read, untouched, with put-back ok. No word came by the 13:22Z cutoff, so the rerun was skipped.

**Phase 4 (13:21:41Z).** Everything matched phase 0:
- the engine was stopped;
- no TextEdit or Chrome for Testing was running (the only Electron process was the owner's Claude Desktop crashpad helper);
- Finder's keys, ABC with per-context 0, and the front app Terminal were all as before;
- the mini's checkout was clean.

The readings went to the coordinator at 13:22Z.

## HID-tap keys and the input method

**Not run in the M2a hold.** The paste section, which hosts this row, aborted on an unrelated SecurityAgent prompt (see the hold above). The row is ready for M2b's first hold. The question, asked for MAWS P4-B2: do keys posted at the HID tap by the engine's `--probe keystroke` (EventPoster.toHIDTap) go through the Korean 2-Set input method? The row types r then k into the scene's TextEdit and reads whether it got 가, rk or ㄱㅏ. It runs only when the scene's TextEdit is frontmost.

The invocation is `cua-engine --probe keystroke --user-pid <pid> --user-bounds <x,y,w,h> rk` (Probe.swift:54). The probe re-checks the front window before each unit and aborts with status 4 if it is not the named one.

Caveat for reading the result: each event also carries `CGEventKeyboardSetUnicodeString` with its character. A result of "rk" may therefore mean the input method used that string, not that the HID path bypasses the input method. A key-code-only variant would settle this; it would be a later probe change, not part of M2a.

## Residue

Each item is work left for its own ticket or for M2b.

- **Route 4's live check.** Per maws-3f, route 4 stayed out of the M2a hold, and the owner's `~/.config/cua/engine.json` was never written on the mini. RouteFourTests gives unit coverage. The live check belongs to M2b's matrix route cells.
- **paste and hidComposition, live.** Not run in this hold because of an unrelated SecurityAgent prompt. Both are ready in the harness for M2b's first hold. hidComposition is MAWS P4-B2's question.
- **select_text in a minimized window.** It answers ok, but the selection did not read back. Whether the write or the read failed is open. A second live read in M2b decides between refusing it and verifying the write after the fact.
- **Enablement release on Chromium.** After the engine wrote it back, the attribute read "true" on the next connection (research pending). The release is a declared difference beyond the vendor, which never unsets.
- **Menu items in a background app.** The route is the coordinator's fork; see the Decision Log, M2a.5 hold item 3.
- **No `menuClosed` clearing (vendor parity; tech-debt-tracker.md).** The vendor clears its recorded menu root when the menu closes. cua keeps the record until the next observation replaces it.
- **No AXPress for a menu item under a coordinate (vendor parity; tech-debt-tracker.md).** The vendor presses the AX menu item under the point. cua posts the pointer events instead.
- **A key-code-only variant of `--probe keystroke`.** It would settle hidComposition's caveat: the events carry `CGEventKeyboardSetUnicodeString`. It is a later probe change.

## Validation

_Pending._
