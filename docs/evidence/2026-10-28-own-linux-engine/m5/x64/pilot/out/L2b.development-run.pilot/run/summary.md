# linux-engine-diff summary

## m4-dev-L2b-pilot (experiment drag; development run, not a release gate)

Every engine drags the same path 2 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Electron (cua fixture) | select | 2/2 | 2/2 | 2/2 | 2/2 | 319.4 | 255.1 | 257 | 451.7 | clean | received, coalesced samples (events), raw/moves, median: pinned 189 (189)/189 (16.5), newest 39.5 (39.5)/39.5 (6.5), cua 170 (161.5)/170 (13.5), cua:0ms 109 (105)/109 (16) | cua PASS, cua:0ms PASS |
| Electron (cua fixture) | dnd | 2/2 | 2/2 | 2/2 | 2/2 | 342.3 | 379.1 | 372 | 507.2 | clean | received, coalesced samples (events), raw/moves, median: pinned 10.5 (10.5)/10.5 (1), newest 3 (3)/3 (1), cua 30 (30)/30.5 (1.5), cua:0ms 49.5 (48.5)/50.5 (1) | cua PASS, cua:0ms PASS |
| Electron (cua fixture) | canvas | 2/2 | 1/2 | 2/2 | 0/2 | 516.9 | 479.4 | 255.8 | 1179.3 | clean | received, coalesced samples (events), raw/moves, median: pinned 768 (767.5)/768 (59), newest 196 (196)/196 (19), cua 765 (758)/765 (28.5), cua:0ms 769.5 (671)/769.5 (16) | cua PASS, cua:0ms **FAIL** |

Cells where a cua lane missed a run the pinned build took: electron canvas (cua:0ms).

The judges' verdict for `cua`: PASS.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 732 requests, 133 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

