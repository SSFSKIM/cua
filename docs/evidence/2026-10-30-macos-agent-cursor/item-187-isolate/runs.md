# #187's isolating slot, 2026-11-05 (the MacBook, attended)

The kit is main 1c4b7e69 (#280), run from the README's section "Item 187: the isolating slot". The verdict, as the judge
computed it, is [item-187-isolate.md](item-187-isolate.md). The design session gave GO (1ea561bc:411, again as a
message at 21:2x). The owner was at the console, chose `--end keep-merged`, and said yes to the Korean switch.

| time (UTC) | what |
|---|---|
| 19:44 | GO read; the owner's steps asked, async |
| 19:45–19:48 | the owner's engine (dd7a092358850cc6) saved as `engine-owner`. The shipping build 375d42a25333 and the control build 9ef3c2598aff were built (warm, about 1 min each), approved with no prompts and saved as `engine-after` and `engine-control`. The owner's engine was put back. Fixtures and Swift tools ready, dry run 1137 steps (as the runbook expects), front app cmux |
| 19:48–21:23 | waiting on the owner's answer. The design session, seeing no line from the operator, released the hold for a while |
| 21:23 | the owner's yes and "all done"; consent recorded (the owner's source 2-Set Korean); preflight clean; the scenes up (TextEdit, Chrome for Testing on the counters page, Electron, Finder) |
| 21:24 | the 1-minute load was 32.5. The top processes were mobileassetd, naturallanguaged and cmux, most likely macOS fetching language assets after the source switch, not a held session. The hands-off notice went to the owner at 21:25 |
| 21:25:41 | load 18.3, under the gate of 20 |
| 21:26–21:35 | the drive, exit 0: 7 swaps, all attested and none prompting; blocks 1–6, block 7 (#188, C2, C3), the tail (C4 b, c), the owner's source, then the cleanup (keep-merged: engine-after restored and attested, 375d42a25333, no variant) |
| 21:35 | judge (LANDS); `source restore` read back 2-Set Korean; the HIToolbox key still absent; scenes down (Finder after its teardown steps); cmux in front; `engine-identity` read 375d42a25333 with no variant |

## What it shows

- **The verdict is LANDS**, on both parts and on every counted repetition and row: 0 premise failures, 0 person-touched, all 7 swaps counted.
  - **The cell:** AFTER delivered both pastes 6 of 6, stage `effect`. On BEFORE, the control of the same source with only the inert click cut, the background paste timed out at stage `read` 6 of 6. The frontmost paste after `open -a` also timed out at `read` 6 of 6.
  - **Composing:** AFTER delivered 9 of 9 behind the Hangul composition; BEFORE timed out at `read` 9 of 9.
  - So the inert click is the cause of #187's fix. The control differs from the shipping build by that click alone, attested from each running engine's ping.
- **The mechanism readings** (reported only) were identical on both halves, as on 11-05:
  - before `open -a`: frontmost no, AXMain yes, AXFocusedWindow the run window, hasFocus no;
  - after `open -a`: frontmost yes, hasFocus yes;
  - the window's AXFocused: never.

  The missing click is what leaves the paste unread, not a missing key window. On the control, the paste fails even after `open -a` has made Chrome frontmost with its page focused.
- **#188's 4 rows:** PASS on cua, 4 of 4; the vendor's rows also passed. Cell 3, recorded only: on cua the element click kept the selection (i), and the coordinate click moved the caret one line below its target (ii). The vendor's cell 3 stopped, because the electron run window was not on top (Finder's 65111 was).
- **C2, keys-then-click: FAIL.**
  - Repetition 1 was counted: the click's join was `rearmed` (#261's hold join live), with no raise, no repairs, and TextEdit frontmost throughout. But the page saw no click, and the click kind reads `action consumedByAction`.
  - Repetitions 2 and 3 stopped at the target guard before sending: Chrome's front window was a second window (65503 against the run's 65501, then 65521 against 65519), so the relaunch left two windows.
  - Both are open for investigation.
- **C3, the popup: INCOMPLETE**, 0 of 3 counted.
  - The premise was not met: the click's join was `shared`, because the popup's activation posted its click at an activation point inside its frame (`activationPoint early`). That is the in-frame case where #261 doesn't swap, by design. The premise was written for an outside-frame window.
  - Uncounted, the release readings were good 3 of 3: after the hold ended, the page's hasFocus was false with 1 blur, AXFrontmost false, TextEdit in front, settled in 335–376 ms. Subtype 2, stamped with the closed popup's window, left Chrome not believing it is active.
- **C4, #279's cases, measured:**
  - (b): no menu read open. The click's join was `fresh` 3 of 3, with 0 raises and 0 repairs. This supports the static reading that a coordinate click ends the menu span before it on one connection.
  - (c): TextEdit in-frame: the click joined `shared` 3 of 3, with 0 raises, 0 repairs, and nothing out of place after the hold.

## Frictions

- The runbook's offline build step needs `CUA_SIGNING_IDENTITY` (no engine.json here). Without it, `engine build` refuses with `engine_identity_missing`. The identity was the one the 11-01 sitting used.
- The design session's first GO went out by `say` and did not wake this session. The operator also sent no line during the long wait for the owner, so the slot looked unstarted.
