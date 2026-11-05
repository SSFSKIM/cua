# #187: the re-slot, paste behind a composition on the shipping build (scripts/cursor-sitting/item-187.mjs)

A row is delivered only when the engine's read-back is exact and the page's own beacon, sent after the act, reports the expected length. A background row whose act carried no `activationGuardMs` acted under a held activation and is invalid. Page counts are the counters page's deltas over the act (window and textarea focus/blur, document-level mousedown and click); raises are the 5 ms order watcher's; the clipboard is the type-list digest before and after; the key at the act is the driven app's primary window AXFocused and AXMain, the app's AXFrontmost, and on Chrome the page's hasFocus(), read right before it.

**The bar**: chrome/composing@textedit 18/18 with every line confirmed by its own change (`cua/paste.perLine`); the three controls 18/18; the cell's AFTER half key and delivered 3/3; every watcher whole with its longest gap within 50 ms; no raise and no menu opened; nothing else on the person's side touched; the put-back verified (the owner's source read back, the saved engine installed and approved). Anything less is DOES NOT LAND.

## Overall: DOES NOT LAND

- chrome/composing@textedit: not recorded
- the electron/composing@textedit control: not recorded
- the textedit/composing@electron control: not recorded
- the chrome/korean control: not recorded
- the cell's AFTER half: 0 of 3 repetitions key and delivered (1: stopped: s: refused, nothing sent: the chrome app's front window is window 63919, not the run's window 63928; nothing more is sent on this session; 2: the click's plan was synthesized, not the action plan; the key was not held after the activation; 3: stopped: s: refused, nothing sent: keys for chrome need its run window on top of the frontmost application (#162's key guard): {"bundleId":"com.cmuxterm.app","pid":95245,"topWindow":{"bounds":{"height":846,"width":1438,"x":34,"y":84},"number":19462,"onScreen":true,"ownerPid":95245}}; nothing more is sent on this session)
- the engine put-back was not read (the before part, with --saved, has not run)

The baseline, cited and not re-run: on 6226f2698ab0 as built (the slot of 2026-11-01's arm A, 187-A1 (36, twice) and 187-B's arm A blocks (27)), 0 of 99 valid rows delivered, every one stopping at the read (timeout) stage (docs/evidence/2026-10-30-macos-agent-cursor/item-187/item-187.md).

The put-back: the owner's input source restored (com.apple.keylayout.ABC, read back); the engine put-back not read.

## The confirming cell

Per repetition: Chrome for Testing relaunched clean, TextEdit in front under ABC; the page's textarea clicked by its index in the background (the action plan); one observation of TextEdit; Chrome activated by `open -a`; the key-window state read; one frontmost paste whose prepare clicks nothing. Predicted: AFTER (the shipping build) key and delivered 3/3; BEFORE (the engine put back) keyless and the read timing out.

| half | rep | click plan (action, reason) | activation click | field focused after the click | key before open -a | key after open -a | paste | stage | read wait |
|---|---|---|---|---|---|---|---|---|---|
| after | 1 | stopped: s: refused, nothing sent: the chrome app's front window is window 63919, not the run's window 63928; nothing more is sent on this session | – | – | – | – | – | – | – |
| after | 2 | synthesized | action consumedByAction | yes | frontmost no, AXFocused no, AXMain yes, focused window run, hasFocus no | frontmost yes, AXFocused no, AXMain yes, focused window run, hasFocus yes (1200 ms) | delivered | effect | handedOver |
| after | 3 | stopped: s: refused, nothing sent: keys for chrome need its run window on top of the frontmost application (#162's key guard): {"bundleId":"com.cmuxterm.app","pid":95245,"topWindow":{"bounds":{"height":846,"width":1438,"x":34,"y":84},"number":19462,"onScreen":true,"ownerPid":95245}}; nothing more is sent on this session | – | – | – | – | – | – | – |
| before | 1 | not recorded | – | – | – | – | – | – | – |
| before | 2 | not recorded | – | – | – | – | – | – | – |
| before | 3 | not recorded | – | – | – | – | – | – | – |

AFTER: 0 of 3 repetitions key and delivered (predicted 3).
BEFORE: not recorded (`--part before`, once the owner's engine is put back).

| item | rows | recorded / target | valid | delivered | read-back exact | page agrees | disagree | lines confirmed (rows) | page counts (sum) | raises | front changes | userKept / lost | clipboard changed | menu opened |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|

| item | act ms, valid rows | act ms, delivered | read after ⌘V, ms | activation → ⌘V, ms | click → ⌘V, ms | activation clicks | routes | key at the act | key focus at ⌘V | delivery guard restores |
|---|---|---|---|---|---|---|---|---|---|---|

## #259 diagnostic cell: (ii) with the caret at the start (cua only, recorded only, never counted for #187 or #188)

NOT RUN

## #188 rows (counted for #188, never for #187): NOT RUN

## #188 cell 3, the click and the selection (recorded only): NOT RUN

