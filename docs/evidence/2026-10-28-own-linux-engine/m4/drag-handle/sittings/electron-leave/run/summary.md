# linux-engine-diff summary

## t73-electron-leave (experiment drag)

Every engine drags the same path 15 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | cua:d took | cua:d warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---|---|---|
| Electron (cua fixture) | handle-dnd | 15/15 | 0/15 | 142.3 | 182.9 | **changed** | control (no press) took 0/15; received, coalesced samples (events), raw/moves, median: pinned 3 (3)/3 (2), cua:d 3 (2)/3 (1) | cua:d **FAIL** |

Cells where a cua lane missed a run the pinned build took: electron handle-dnd (cua:d).

No shipped `cua` lane: measured, not judged.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x0100000c; the harness's own trace: 953 requests, 172 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

