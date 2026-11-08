# linux-engine-diff summary

## drag-20261108T105132 (experiment drag)

Every engine drags the same path 30 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:h6L took | cua:h7L took | cua:h8L took | cua:r10 took | cua:r20 took | cua:r20L took | newest warm ms | cua warm ms | cua:h6L warm ms | cua:h7L warm ms | cua:h8L warm ms | cua:r10 warm ms | cua:r20 warm ms | cua:r20L warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Firefox | handle-canvas | 30/30 | 30/30 | 4/30 | 30/30 | 30/30 | 30/30 | 22/30 | 30/30 | 30/30 | 291.7 | 89.7 | 261.1 | 292.6 | 322.4 | 118.8 | 149.9 | 149.9 | 299.3 | **changed** | control (no press) took 0/30; received, coalesced samples (events), raw/moves, median: pinned 32 (32)/32 (16), newest 30 (30)/30 (16), cua 23 (23)/23 (2), cua:h6L 32 (32)/32 (13), cua:h7L 32 (32)/32 (14), cua:h8L 32 (32)/32 (16), cua:r10 24 (24)/24 (4), cua:r20 25 (25)/25 (6), cua:r20L 26 (26)/26 (6) | cua **FAIL**, cua:h6L PASS, cua:h7L PASS, cua:h8L PASS, cua:r10 **FAIL**, cua:r20 PASS, cua:r20L PASS |
| Firefox | handle-dnd | 30/30 | 30/30 | 6/30 | 30/30 | 30/30 | 30/30 | 23/30 | 30/30 | 30/30 | 181.6 | 112.1 | 181.3 | 193.9 | 205.3 | 132.4 | 152.4 | 154.3 | 183.5 | **changed** | control (no press) took 0/30; received, coalesced samples (events), raw/moves, median: pinned 3 (3)/1 (1), newest 3 (3)/1 (1), cua 7 (7)/0 (0), cua:h6L 3 (3)/1 (1), cua:h7L 3 (3)/1 (1), cua:h8L 3 (3)/1 (1), cua:r10 3 (3)/1 (1), cua:r20 2 (2)/1 (1), cua:r20L 2 (2)/1 (1) | cua **FAIL**, cua:h6L PASS, cua:h7L PASS, cua:h8L PASS, cua:r10 **FAIL**, cua:r20 PASS, cua:r20L PASS |

Cells where a cua lane missed a run the pinned build took: firefox handle-canvas (cua, cua:r10); firefox handle-dnd (cua, cua:r10).

The judges' verdict for `cua`: **FAIL**: firefox handle-canvas: cua missed runs 0 2 3 4 5 6 7 9 10 11 12 13 14 15 16 17 19 20 22 23 24 25 26 27 28 29; firefox handle-dnd: cua missed runs 0 1 2 3 4 5 6 7 8 9 10 14 15 17 18 19 20 21 22 24 25 26 27 29.

desktop: started with 0x0060000c active (foreign), ended with 0x0060000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 9876 requests, 1974 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

