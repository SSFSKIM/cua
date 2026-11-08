# linux-engine-diff summary

## drag-20261108T102855 (experiment drag)

Every engine drags the same path 30 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:h1 took | cua:h2 took | cua:h4 took | cua:h6 took | cua:h8 took | cua:h4L took | cua:h8L took | newest warm ms | cua warm ms | cua:h1 warm ms | cua:h2 warm ms | cua:h4 warm ms | cua:h6 warm ms | cua:h8 warm ms | cua:h4L warm ms | cua:h8L warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Firefox | handle-canvas | 30/30 | 30/30 | 7/30 | 9/30 | 10/30 | 15/30 | 16/30 | 22/30 | 27/30 | 30/30 | 291.8 | 89.4 | 108.1 | 134.6 | 188.7 | 243.3 | 297.8 | 201.7 | 322.6 | 299.4 | **changed** | control (no press) took 0/30; received, coalesced samples (events), raw/moves, median: pinned 32 (32)/32 (16), newest 30 (30)/30 (16), cua 22.5 (22.5)/22.5 (3), cua:h1 23 (23)/23 (3), cua:h2 26 (26)/26 (5), cua:h4 28.5 (28.5)/28.5 (8), cua:h6 30 (30)/30 (12), cua:h8 30 (30)/30 (15), cua:h4L 31 (31)/31 (9), cua:h8L 32 (32)/32 (16) | cua **FAIL**, cua:h1 **FAIL**, cua:h2 **FAIL**, cua:h4 **FAIL**, cua:h6 **FAIL**, cua:h8 **FAIL**, cua:h4L **FAIL**, cua:h8L PASS |
| Firefox | handle-dnd | 30/30 | 30/30 | 2/30 | 11/30 | 26/30 | 30/30 | 30/30 | 30/30 | 30/30 | 30/30 | 182 | 112.7 | 119.2 | 129.8 | 149 | 169.2 | 188.9 | 157.5 | 206.4 | 183.5 | **changed** | control (no press) took 0/30; received, coalesced samples (events), raw/moves, median: pinned 3 (3)/1 (1), newest 3 (3)/1 (1), cua 10.5 (10.5)/0 (0), cua:h1 9 (9)/2 (1), cua:h2 6 (6)/1.5 (1), cua:h4 4 (4)/1 (1), cua:h6 3 (3)/1 (1), cua:h8 2.5 (2.5)/1 (1), cua:h4L 2 (2)/1 (1), cua:h8L 3 (3)/1 (1) | cua **FAIL**, cua:h1 **FAIL**, cua:h2 **FAIL**, cua:h4 PASS, cua:h6 PASS, cua:h8 PASS, cua:h4L PASS, cua:h8L PASS |

Cells where a cua lane missed a run the pinned build took: firefox handle-canvas (cua, cua:h1, cua:h2, cua:h4, cua:h6, cua:h8, cua:h4L); firefox handle-dnd (cua, cua:h1, cua:h2).

The judges' verdict for `cua`: **FAIL**: firefox handle-canvas: cua missed runs 0 1 2 3 4 6 7 8 9 10 13 14 15 16 17 18 20 21 22 24 25 28 29; firefox handle-dnd: cua missed runs 0 1 2 3 4 5 6 7 8 9 11 12 13 14 15 16 18 19 20 21 22 23 24 25 26 27 28 29.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 10860 requests, 2171 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

