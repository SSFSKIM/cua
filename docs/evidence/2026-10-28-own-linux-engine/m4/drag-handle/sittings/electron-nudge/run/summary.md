# linux-engine-diff summary

## t73-electron-nudge (experiment drag)

Every engine drags the same path 10 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | cua:d took | cua:d warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---|---|---|
| Electron (cua fixture) | handle-dnd | 10/10 | 10/10 | 180.3 | 183 | **changed** | control (no press) took 0/10; received, coalesced samples (events), raw/moves, median: pinned 3 (3)/3 (2), cua:d 3.5 (3)/3.5 (2) | cua:d PASS |
| Electron (cua fixture) | handle-select | 10/10 | 10/10 | 89.2 | 109.2 | **changed** | control (no press) took 5/10; received, coalesced samples (events), raw/moves, median: pinned 11 (11)/11 (6), cua:d 15 (14)/15 (5) | cua:d PASS |
| Electron (cua fixture) | handle-range | 10/10 | 10/10 | 73.5 | 84 | **changed** | control (no press) took 5/10; received, coalesced samples (events), raw/moves, median: pinned 11 (11)/11 (6), cua:d 14 (14)/14 (5) | cua:d PASS |

No cua lane missed a run the pinned build took.

No shipped `cua` lane: measured, not judged.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 1640 requests, 315 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

