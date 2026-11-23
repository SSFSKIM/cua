# linux-engine-diff summary

## drag-20261108T032918 (experiment drag)

Every engine drags the same path 6 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest drag ms | cua drag ms | cua:0ms drag ms | pinned drag ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Firefox | handle-canvas | 6/6 | 6/6 | 1/6 | 0/6 | 293.5 | 96.8 | 54.8 | 299.9 | **changed** | control (no press) took 0/6; received (raw/moves, median): pinned 32/16, newest 30/16, cua 22.5/2.5, cua:0ms 7.5/2 | cua **FAIL**, cua:0ms **FAIL** |
| Firefox | handle-dnd | 6/6 | 6/6 | 1/6 | 0/6 | 183 | 120.1 | 87 | 182.7 | **changed** | control (no press) took 0/6; received (raw/moves, median): pinned 3/1, newest 3/1, cua 3.5/0.5, cua:0ms 3.5/0 | cua **FAIL**, cua:0ms **FAIL** |

Cells where a cua lane missed a run the pinned build took: firefox handle-canvas (cua, cua:0ms); firefox handle-dnd (cua, cua:0ms).

The judges' verdict for `cua`: **FAIL**: firefox handle-canvas: cua missed runs 1 2 3 4 5; firefox handle-dnd: cua missed runs 0 1 2 4 5.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 1274 requests, 237 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

