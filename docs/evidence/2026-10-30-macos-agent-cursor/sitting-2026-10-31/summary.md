# The agent cursor's sitting: what each item recorded

## Item 1-check

0 cell(s), 0 failed; 1 task(s), 1 failed.

- task record-start failed: {"ok":false,"region":{"x":9,"y":33,"width":1486,"height":861},"windows":{"textedit":{"height":860,"width":663,"x":832,"y":33},"chrome":{"height":861,"width":822,"x":9,"y":33}},"uncovered":[{"x":831,"y":33,"width":1,"height":860},{"x":831,"y":893,"width":1,"height":1},{"x":832,"y":893,"width":663,"height":1}],"frontmost":{"pid":25295,"bundleId":"io.github.ssfskim.cua.fixture.electron"},"problem":"the frontmost app's window 46727 (720 × 560 pt at (140, 100)) overlaps the recording region 1486 × 861 pt at (9, 33): move it off the harness windows"}

## Item 3

5 cell(s), 0 failed; 0 task(s), 0 failed.

- watch `thinking`: once it settles the arrow rocks gently (thinking) — **pass** (owner ticked it (second run; the owner missed the first))
- watch `fade`: about 5 s after the click it fades out over about 0.44 s — **pass** (owner ticked it (second run; the owner missed the first))
- watch `fade-in`: it fades back in at the new target (no glide in from where it faded) — **pass** (owner ticked it (second run; the owner missed the first))
- watch `taken-over`: from your click the cursor is half-transparent and still, until it fades at 5 s — **pass** (owner ticked it (second run; the owner missed the first))
- watch `taken-over-cleared`: the agent's next action shows it at full opacity again — **pass** (owner ticked it (second run; the owner missed the first))
- watch `end-task`: end_task fades it at once (not 5 s later) — **pass** (owner ticked it (second run; the owner missed the first))

## Item 5

10 cell(s), 0 failed; 5 task(s), 1 failed.

- task focus failed: {"ok":false,"label":"with the cursor shown","reading":{"focusedApp":{"bundleId":"io.github.ssfskim.cua.fixture.electron","pid":25295},"focusedWindow":{"pid":25295,"bounds":{"height":560,"x":140,"width":720,"y":100}},"named":true,"valueHash":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"},"equalTo":"before the cursor","same":false,"bounds":{"height":560,"width":720,"x":140,"y":100},"accessibility":{"enabled":true,"waitedMs":0,"primed":false,"since":1793461702066}}
- watch `taken-over`: when you clicked, the cursor turned half-transparent — **pass** (owner ticked: half-transparent on their click)
- watch `screenshot`: the cursor is on screen over the fixture now, and the saved screenshot (the item's image file) has no cursor in it — **pass** (owner: cursor on screen over the fixture at the end; the agent's screenshot item-5-step-24-0.jpg has no cursor (checked by the operator))
- watch `recording`: the cursor appears in a screen recording: item 1's clip (screencapture -v), seen in its frames — **no verdict recorded**

## Item 12-legacyLayers

40 cell(s), 0 failed; 9 task(s), 0 failed.


## Item 12-noBackdrop

40 cell(s), 0 failed; 9 task(s), 0 failed.


## Item 12-panelOut

40 cell(s), 0 failed; 9 task(s), 0 failed.


## Item 12-source-2SetKorean

40 cell(s), 0 failed; 5 task(s), 0 failed.


## Item 12

40 cell(s), 0 failed; 4 task(s), 0 failed.


## Item 13-legacyLayers

160 cell(s), 0 failed; 9 task(s), 0 failed.

- watch `route-3-lag`: on the fixture's button presses (route 3), the cursor may start up to 100 ms after the click — **pass** (the owner watched the clicks block's first minute (the fallback; item 1's clip could not be made): 'Looked prompt')

## Item 13

160 cell(s), 2 failed; 4 task(s), 0 failed.

- off: element click off 2 failed: Computer Use server error -10016: The user is still interacting with '/Users/new/Library/Caches/cua-harness/electron-fixture/44.9.0-faee60a202d5/cua Electron Fixture.app'. Wait 5 seconds and retry.
- on: element click on 4 failed: Computer Use server error -10016: The user is still interacting with '/Users/new/Library/Caches/cua-harness/electron-fixture/44.9.0-faee60a202d5/cua Electron Fixture.app'. Wait 5 seconds and retry.
- watch `route-3-lag`: on the fixture's button presses (route 3), the cursor may start up to 100 ms after the click — **pass** (the owner watched the clicks block's first minute (the fallback; item 1's clip could not be made): 'Looked prompt')

# Acceptance 12 and 13: timing, cursor on against cursor off

Judged by #171's noise rule (scripts/cursor-sitting/stats.mjs): the bootstrap 95 % interval of median(on) − median(off) must include 0, or lie wholly below it, with its upper end at most max(5 % of the off median, 1 ms), whatever the medians.

## Acceptance 12 (typing): FAIL

Input source: ABC (com.apple.keylayout.ABC; keys translated with com.apple.keylayout.ABC).

| series | n on / off | median on (ms) | median off (ms) | 95 % interval of the difference (ms) | bound (ms) | verdict |
|---|---|---|---|---|---|---|
| type_text | 20 / 20 | 547.47 | 544.38 | [-16.85, 18.66] | 27.22 | same within noise |
| press_key x30 | 20 / 20 | 301.23 | 269.09 | [16.32, 61.77] | 13.45 | slower |

## Acceptance 13 (clicks): FAIL

Input source: ABC (com.apple.keylayout.ABC; keys translated with com.apple.keylayout.ABC).

| series | n on / off | median on (ms) | median off (ms) | 95 % interval of the difference (ms) | bound (ms) | verdict |
|---|---|---|---|---|---|---|
| coordinate click | 40 / 40 | 5.79 | 3.92 | [-0.70, 3.20] | 1.00 | undetermined (take more samples) |
| element click | 39 / 39 | 53.45 | 56.62 | [-6.31, 2.56] | 2.83 | same within noise |
| drag | 40 / 40 | 5.79 | 4.80 | [-0.77, 3.25] | 1.00 | undetermined (take more samples) |

Each series is taken from the last run that covers it: coordinate click from the run started 2026-10-31T15:59:23.892Z; element click from the run started 2026-10-31T16:11:15.283Z; drag from the run started 2026-10-31T15:59:23.892Z.

2 timed call(s) failed and are not in the samples (item-13.jsonl has their errors).

The element clicks' routes: route 3 × 78, route none × 2.
