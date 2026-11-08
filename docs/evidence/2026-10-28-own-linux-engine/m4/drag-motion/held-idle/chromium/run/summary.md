# linux-engine-diff summary

## drag-20261108T142622 (experiment drag)

Every engine drags the same path 30 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:before took | newest warm ms | cua warm ms | cua:before warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Chrome | handle-canvas | 30/30 | 30/30 | 30/30 | 22/30 | 291.8 | 144.6 | 62.6 | 299.3 | **changed** | control (no press) took 0/30; received, coalesced samples (events), raw/moves, median: pinned 33 (33)/33 (17), newest 30 (30)/30 (17), cua 37 (34.5)/37 (8), cua:before 33 (31)/33 (3) | cua PASS, cua:before **FAIL** |
| Chrome | handle-dnd | 30/30 | 30/30 | 30/30 | 27/30 | 182.2 | 145 | 84.2 | 182.8 | **changed** | control (no press) took 0/30; received, coalesced samples (events), raw/moves, median: pinned 3 (3)/3 (2), newest 2 (2)/2 (1), cua 3 (2)/3 (1), cua:before 3 (3)/3 (1) | cua PASS, cua:before **FAIL** |
| Electron (cua fixture) | handle-canvas | 30/30 | 30/30 | 30/30 | 17/30 | 291.6 | 144.3 | 63.7 | 299.1 | **changed** | control (no press) took 0/30; received, coalesced samples (events), raw/moves, median: pinned 33 (33)/33 (17), newest 30 (30)/30 (17), cua 36 (35)/36 (8), cua:before 33 (31)/33 (3.5) | cua PASS, cua:before **FAIL** |
| Electron (cua fixture) | handle-dnd | 30/30 | 30/30 | 30/30 | 24/30 | 182.4 | 144.8 | 84.6 | 183.5 | **changed** | control (no press) took 0/30; received, coalesced samples (events), raw/moves, median: pinned 3 (3)/3 (2), newest 2 (2)/2 (1), cua 3 (2)/3 (1), cua:before 3 (2)/3 (1) | cua PASS, cua:before **FAIL** |

Cells where a cua lane missed a run the pinned build took: chrome handle-canvas (cua:before); chrome handle-dnd (cua:before); electron handle-canvas (cua:before); electron handle-dnd (cua:before).

The judges' verdict for `cua`: PASS.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 9793 requests, 1977 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

