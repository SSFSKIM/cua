# Item 187's second re-slot, 2026-11-05: how it ran

The slot ran on the MacBook at the design session's GO (07:2xZ; the hold extended to 09:00Z at 08:24Z, after the owner's
answers came at 08:23Z). The AFTER half ran on build 1f73143d1fb0 (source tree 27686ced, = e02938e6 on fix/187-3b-slot;
the kit at 8b26be3e), approved 07:29:41Z. The BEFORE half ran on the owner's dd7a092358850cc6, restored 08:31:45Z.
`item-187.md` is the judge's report: **DOES NOT LAND**.

| time (Z) | step |
|---|---|
| 07:22–07:23 | fixtures, Swift tools, dry runs (806 / 131 / 15), dd7a saved to `engine-before-reslot2` (engine.json absent); the owner's front app was their Chrome (pid 28419) |
| 07:23–07:26 | the premise part: its first run stopped at the relaunch (the recorded window 64065 was not Chrome's one on-screen window, 64056). Fixed in 8b26be3e (Chrome's up waits for an on-screen window). The re-run: 3 of 3 relaunches settled in 537–602 ms; AXPress appeared **351, 100 and 87 ms** after each fresh Chrome's first observation, on dd7a |
| 07:28 | ci-gate GREEN on de795a81 (run 41985806339); the owner asked; the build and approval (no prompts) |
| 08:23 | the owner's answers (consent yes, source ABC; Mac ready); 8b26be3e's gate GREEN (run 41987256383) |
| 08:24 | the preflight (no refusals), the scenes up; load spiked to 92.9 with the launches |
| 08:26:24 | load gate open (34.3 / 34.4); the hands-off notice |
| 08:27–08:31 | the drive: place, the cell's AFTER half, place-again, composing, the controls, #259's cell, 187-end |
| 08:31:45 | dd7a restored, approved, matching the save |
| 08:31–08:33 | the BEFORE half on dd7a, 187-end |
| 08:33:44 | judge, the source restored and read back (ABC), the scenes down: the put-back done |

No row or repetition was person-touched. The owner's own Chrome was relaunched at 08:24:15, before the drive, and was
in front at the put-back.

## What the bar missed, and why

- **The cell's AFTER half** delivered both pastes in 3 of 3 repetitions (the background paste's activation click
  `outsideFrame`, the inert click `inertOutside activationPoint early`). The bar's "key held" failed on every
  repetition: `keyHeld` requires the run window's own AXFocused, which read **no on every Chrome reading of the slot, on
  both builds** (the composing rows read "not key × 18" and delivered 18). The app's AXFocusedWindow was the run window,
  AXMain yes, frontmost yes and `document.hasFocus()` yes after `open -a`, on both builds.
- **The BEFORE half** on dd7a delivered **neither** paste in 3 of 3 repetitions. Each failed with "Computer Use server
  error -10005: Timed out waiting for the application to read the clipboard", which is #187's failure. dd7a's error
  carries no `stage` meta, so the judge's "read timeout" check read "no stage" and did not count them as failing as
  predicted. Its key readings after `open -a` were the same as the AFTER half's. That sentence names no stage: dd7a's
  lineage threw it for a read timeout and an effect timeout alike (7a24390b Paste.swift:166, :168), so the BEFORE stage
  is unknown. The re-judgment (`item-187-rejudge.md`, corrected at 4c4d373d after its independent review) is DOES NOT
  LAND on that alone; what it shows is delivery, AFTER 3 of 3 both pastes and BEFORE 3 of 3 neither.
- **chrome/composing@textedit** delivered 18 of 18 (the baseline: 0 of 99), read back exact, with 0 raises and 0 menus.
  One row (`#1.6`, the `lines` string, block 2) carried 1 per-line record for its 2 lines; the same string's row in
  block 1 carried both.
- The controls delivered 18 of 18 each. The longest watcher gap was 40.1 ms.
- The AXPress route (reported only): the AFTER repetition clicked on the action plan (AXPress advertised after 1671 ms),
  and its paste delivered. The BEFORE repetition was premise not met: dd7a records no click plan.
