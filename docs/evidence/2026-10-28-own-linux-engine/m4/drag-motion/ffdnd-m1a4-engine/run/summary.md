# linux-engine-diff summary

## drag-20261108T091628 (experiment drag)

Every engine drags the same path 30 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | cua took | cua warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---|---|---|
| Firefox | dnd | 30/30 | 21/30 | 274 | 516.4 | clean | received, coalesced samples (events), raw/moves, median: pinned 14 (14)/3 (2), cua 29.5 (29.5)/4 (2) | cua **FAIL** |

Cells where a cua lane missed a run the pinned build took: firefox dnd (cua).

The judges' verdict for `cua`: **FAIL**: firefox dnd: cua missed runs 6 9 12 14 17 20 23 24 25.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 1098 requests, 219 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

