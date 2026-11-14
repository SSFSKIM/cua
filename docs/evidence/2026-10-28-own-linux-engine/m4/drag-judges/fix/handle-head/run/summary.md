# linux-engine-diff summary

## t65-fix-handle-head (experiment drag)

Every engine drags the same path 30 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | cua:nolead took | newest warm ms | cua warm ms | cua:0ms warm ms | cua:nolead warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Firefox | handle-canvas | 30/30 | 30/30 | 5/30 | 0/30 | 2/30 | 293 | 88.9 | 46.2 | 89.7 | 299.5 | **changed** | control (no press) took 0/30; received, coalesced samples (events), raw/moves, median: pinned 32 (32)/32 (16), newest 30 (30)/30 (16), cua 23 (23)/23 (2), cua:0ms 6.5 (6.5)/6.5 (2), cua:nolead 21 (21)/21 (2) | cua **FAIL**, cua:0ms **FAIL**, cua:nolead **FAIL** |
| Firefox | handle-dnd | 30/30 | 30/30 | 4/30 | 1/30 | 3/30 | 182.8 | 112.5 | 77.5 | 111.5 | 183.2 | **changed** | control (no press) took 0/30; received, coalesced samples (events), raw/moves, median: pinned 3 (3)/1 (1), newest 3 (3)/1 (1), cua 12 (12)/0 (0), cua:0ms 2 (2)/0 (0), cua:nolead 9 (9)/0 (0) | cua **FAIL**, cua:0ms **FAIL**, cua:nolead **FAIL** |

Cells where a cua lane missed a run the pinned build took: firefox handle-canvas (cua, cua:0ms, cua:nolead); firefox handle-dnd (cua, cua:0ms, cua:nolead).

The judges' verdict for `cua`: **FAIL**: firefox handle-canvas: cua missed runs 0 1 3 4 5 6 8 9 10 11 13 14 15 16 17 18 19 20 21 22 24 25 27 28 29; firefox handle-dnd: cua missed runs 0 1 2 3 4 5 6 7 8 9 10 12 15 16 17 18 19 20 21 22 23 24 25 26 27 29.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 5940 requests, 1186 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

