# linux-engine-diff summary

## t73-pilot-check (experiment drag)

Every engine drags the same path 2 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | cua:d took | cua:d warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---|---|---|
| Chrome | handle-dnd | 2/2 | 2/2 | 107 | 183 | **changed** | control (no press) took 0/2; received, coalesced samples (events), raw/moves, median: pinned 2.5 (2.5)/2.5 (1.5), cua:d 2 (2)/2 (1) | cua:d PASS |
| Chrome | handle-select | 2/2 | 2/2 | 70.9 | 108.8 | **changed** | control (no press) took 1/2; received, coalesced samples (events), raw/moves, median: pinned 11 (11)/11 (6), cua:d 13 (11.5)/13 (4) | cua:d PASS |

No cua lane missed a run the pinned build took.

No shipped `cua` lane: measured, not judged.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x0100000c; the harness's own trace: 506 requests, 81 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

