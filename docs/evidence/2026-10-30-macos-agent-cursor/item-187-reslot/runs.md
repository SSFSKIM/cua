# Item 187's re-slot, 2026-11-05: how it ran

The slot ran on the MacBook at the design session's GO (04:00Z; again 06:08Z after the owner's O7 sitting), on build
1f73143d1fb0 (ce555a73, fix/187-3b-slot rebased onto main; built twice, same hash), approved 06:11:36Z. It stopped after
the confirming cell, and the design session stopped the slot there: no composing block, control, #259 cell or BEFORE
half ran. `item-187.md` is the judge's report of what ran (DOES NOT LAND: nothing reached the bar).

| time (Z) | step |
|---|---|
| 04:00–04:53 | first GO: rebase, the fixtures and dry runs (755 / 80 steps), dd7a saved (engine.json absent), the build and approval. The owner left for another sitting before the consent; put back 04:53 (dd7a, nothing driven) |
| 06:08 | second GO: the owner's yes to the Korean switch and the Mac ready; consent recorded (owner source ABC) |
| 06:09–06:11 | the build again (same hash) and approval |
| 06:12–06:15 | load gate paused: 1-min load 200.8 at 06:12, the design session's bound wait; under 40 with the 5-min falling at 06:15:52 (35.6 / 71.2) |
| 06:16:00–06:16:38 | preflight (no refusals), the scenes up (TextEdit, Chrome for Testing on the counters page, Electron) |
| 06:16:38 | the drive started (load 39.1 / 66.5) |
| 06:17:30 | the drive stopped at 187-place-again; 187-end selected and read back the owner's source |
| 06:17–06:18:57 | the design session's STOP; dd7a restored and approved, the source read back (ABC), the scenes down |

## The confirming cell's AFTER half, as it ran

| rep | what happened | counts as |
|---|---|---|
| 1 (06:16:40–53) | Chrome relaunched (window 63928); the session's open refused: Chrome's front window was 63919, not the run window. The front app was cmux (pid 95245) at the cleanup | stopped, nothing sent |
| 2 (06:16:55–17:14) | the textarea's element click took the **synthesized** plan (reason `noAction`: the freshly relaunched Chrome advertised neither AXPress nor AXPick), `activationClick` outsideFrame, `activationClickKind` {action, consumedByAction}. Activity Monitor was activated at 06:17:06.916 (the person at the Mac); the owner's own Chrome terminated at 06:17:08.567. After `open -a`: frontmost yes, AXMain yes, AXFocused no, `document.hasFocus()` yes (1200 ms); the paste delivered, read back exact | premise not met (a pointer click, the same events on dd7a); touched by the person |
| 3 (06:17:15–24) | synthesized again (`noAction`); `open -a` made Chrome frontmost at 06:17:21.34 (379 ms), but at the key read (06:17:22.43) it was no longer frontmost, and the key guard saw cmux front at 06:17:23.05 | stopped, nothing sent |

Then 187-place-again read Chrome at (51, 97) against its target (24, 130), and the drive stopped there.

Nothing in the kit or the engine activates cmux. The kit's one reactivation is the put-back's last step, which never ran,
and the unified log has no front-change line to attribute the two cmux activations. The best reading is the person at
the Mac: Activity Monitor activated mid-cell, then their own Chrome quit.
