# linux-engine-diff summary

## drag-20261108T134707 (experiment drag)

Every engine drags the same path 30 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | newest warm ms | cua warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---|---|---|
| Chrome | handle-canvas | 30/30 | 30/30 | 19/30 | 292.7 | 63.8 | 300 | **changed** | control (no press) took 0/30; received, coalesced samples (events), raw/moves, median: pinned 33 (33)/33 (17), newest 30 (30)/30 (17), cua 33 (30)/33 (3) | cua **FAIL** |
| Chrome | handle-dnd | 30/30 | 30/30 | 24/30 | 182.3 | 83.9 | 183.2 | **changed** | control (no press) took 0/30; received, coalesced samples (events), raw/moves, median: pinned 3 (3)/3 (2), newest 2 (2)/2 (1), cua 3 (2)/3 (1) | cua **FAIL** |
| Electron (cua fixture) | handle-canvas | 30/30 | 30/30 | 16/30 | 291.6 | 62.8 | 299.3 | **changed** | control (no press) took 0/30; received, coalesced samples (events), raw/moves, median: pinned 33 (33)/33 (17), newest 30 (30)/30 (17), cua 33 (31)/33 (3) | cua **FAIL** |
| Electron (cua fixture) | handle-dnd | 30/30 | 30/30 | 23/30 | 182.1 | 84.1 | 183.4 | **changed** | control (no press) took 0/30; received, coalesced samples (events), raw/moves, median: pinned 2 (2)/2 (1), newest 2 (2)/2 (1), cua 3 (3)/3 (1) | cua **FAIL** |

Cells where a cua lane missed a run the pinned build took: chrome handle-canvas (cua); chrome handle-dnd (cua); electron handle-canvas (cua); electron handle-dnd (cua).

The judges' verdict for `cua`: **FAIL**: chrome handle-canvas: cua missed runs 0 6 7 12 15 17 23 24 26 28 29; chrome handle-dnd: cua missed runs 0 3 16 20 21 27; electron handle-canvas: cua missed runs 0 2 4 8 10 11 17 20 22 23 25 27 28 29; electron handle-dnd: cua missed runs 1 7 10 19 20 24 26.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 7813 requests, 1580 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

