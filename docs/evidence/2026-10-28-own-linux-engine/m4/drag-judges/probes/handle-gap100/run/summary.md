# linux-engine-diff summary

## drag-20261108T032613 (experiment drag)

Every engine drags the same path 6 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest drag ms | cua drag ms | cua:0ms drag ms | pinned drag ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Firefox | handle-canvas | 6/6 | 6/6 | 6/6 | 6/6 | 293.6 | 97 | 55.2 | 300.1 | **changed** | control (no press) took 0/6; received (raw/moves, median): pinned 33/21, newest 30/18.5, cua 33/6.5, cua:0ms 8.5/6 | cua PASS, cua:0ms PASS |
| Firefox | handle-dnd | 6/6 | 6/6 | 0/6 | 5/6 | 182.1 | 121 | 85.3 | 183.3 | **changed** | control (no press) took 0/6; received (raw/moves, median): pinned 3/2, newest 2/1, cua 4/2, cua:0ms 3/1.5 | cua **FAIL**, cua:0ms **FAIL** |

Cells where a cua lane missed a run the pinned build took: firefox handle-dnd (cua, cua:0ms).

The judges' verdict for `cua`: **FAIL**: firefox handle-dnd: cua missed runs 0 1 2 3 4 5.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 1273 requests, 237 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

