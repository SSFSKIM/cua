# linux-engine-diff summary

## t73-chrome-none (experiment drag)

Every engine drags the same path 30 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | cua took | cua warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---|---|---|
| Chrome | handle-canvas | 30/30 | 30/30 | 186.4 | 298.6 | **changed** | control (no press) took 0/30; received, coalesced samples (events), raw/moves, median: pinned 33 (33)/33 (17), cua 36 (35)/36 (9) | cua PASS |
| Chrome | handle-dnd | 30/30 | 30/30 | 179.7 | 183 | **changed** | control (no press) took 0/30; received, coalesced samples (events), raw/moves, median: pinned 2.5 (2.5)/3 (2), cua 3 (2)/3 (1) | cua PASS |
| Chrome | handle-select | 30/30 | 30/30 | 87.9 | 109.2 | **changed** | control (no press) took 15/30; received, coalesced samples (events), raw/moves, median: pinned 11 (11)/11 (6), cua 13 (12)/13 (3.5) | cua PASS |
| Chrome | handle-range | 30/30 | 30/30 | 71 | 84.5 | **changed** | control (no press) took 15/30; received, coalesced samples (events), raw/moves, median: pinned 11 (11)/11 (6), cua 13 (12)/13 (3) | cua PASS |

No cua lane missed a run the pinned build took.

The judges' verdict for `cua`: **FAIL**: chrome handle-select: CONTROL NON-DISCRIMINATING: the no-press control took 15 of 30; chrome handle-range: CONTROL NON-DISCRIMINATING: the no-press control took 15 of 30.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x0100000c; the harness's own trace: 5735 requests, 1169 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

