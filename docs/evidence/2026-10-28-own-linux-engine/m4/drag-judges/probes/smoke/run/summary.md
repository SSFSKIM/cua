# linux-engine-diff summary

## drag-20261108T032030 (experiment drag)

Every engine drags the same path 3 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest drag ms | cua drag ms | cua:0ms drag ms | pinned drag ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Chrome | scroller | 3/3 | 3/3 | 3/3 | 1/3 | 261.7 | 144.8 | 111.4 | 277.6 | clean | reach (pinned mean 135.3 px): cua 1/3 (shortest 105, mean 117.3), cua:0ms 0/3 (shortest 40, mean 79); received (raw/moves, median): pinned 58/0, newest 17/0, cua 54/0, cua:0ms 40/0 | cua **FAIL**, cua:0ms **FAIL** |
| Firefox | scroller | 3/3 | 3/3 | 3/3 | 3/3 | 263.8 | 165 | 109.9 | 285.2 | clean | received (raw/moves, median): pinned 44/0, newest 10/0, cua 21/0, cua:0ms 2/0 | cua PASS, cua:0ms PASS |
| Firefox | handle-canvas | 3/3 | 2/3 | 0/3 | 0/3 | 294.2 | 97.1 | 58.6 | 298.8 | **changed** | control (no press) took 0/3; received (raw/moves, median): pinned 32/15, newest 29/14, cua 4/2, cua:0ms 4/1 | cua **FAIL**, cua:0ms **FAIL** |
| Firefox | handle-dnd | 3/3 | 3/3 | 0/3 | 0/3 | 182.3 | 121.2 | 86.3 | 184.5 | **changed** | control (no press) took 0/3; received (raw/moves, median): pinned 4/2, newest 4/1, cua 2/1, cua:0ms 2/0 | cua **FAIL**, cua:0ms **FAIL** |
| LibreOffice Writer (gtk3) | select-unprimed | 0/3 | 0/3 | 0/3 | 0/3 | 313.1 | 131.4 | 119.9 | 389.4 | clean | – | cua **FAIL**, cua:0ms **FAIL** |

Cells where a cua lane missed a run the pinned build took: chrome scroller (cua:0ms); firefox handle-canvas (cua, cua:0ms); firefox handle-dnd (cua, cua:0ms).

The judges' verdict for `cua`: **FAIL**: chrome scroller: cua short of the pinned build's mean distance (135.3 px) on 2 of 3 runs (shortest 105 px, mean 117.3 px); firefox handle-canvas: cua missed runs 0 1 2; firefox handle-dnd: cua missed runs 0 1 2; writer select-unprimed: cua missed runs 0 1 2.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 3190 requests, 415 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

