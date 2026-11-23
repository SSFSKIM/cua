# linux-engine-diff summary

## m4-dev-D3-pilot (experiment drag; development run, not a release gate)

Every engine drags the same path 2 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Firefox | select | 2/2 | 2/2 | 2/2 | 2/2 | 321.5 | 123.8 | 25.8 | 445.2 | clean | received, coalesced samples (events), raw/moves, median: pinned 189 (189)/189 (16), newest 46.5 (46.5)/46.5 (7), cua 124 (124)/124 (5), cua:0ms 5 (5)/5 (2) | cua PASS, cua:0ms PASS |
| Firefox | range | 2/2 | 2/2 | 2/2 | 1/2 | 330.1 | 122.3 | 31.3 | 452.9 | clean | received, coalesced samples (events), raw/moves, median: pinned 207.5 (207.5)/207.5 (19), newest 52 (52)/52 (7.5), cua 147 (147)/147 (5.5), cua:0ms 36 (36)/36 (3) | cua PASS, cua:0ms **FAIL** |
| Firefox | scroller | 2/2 | 2/2 | 2/2 | 2/2 | 262.4 | 81.4 | 14.4 | 287 | clean | received, coalesced samples (events), raw/moves, median: pinned 43.5 (43.5)/0 (0), newest 11.5 (11.5)/0 (0), cua 3.5 (3.5)/0 (0), cua:0ms 3 (3)/0 (0) | cua PASS, cua:0ms PASS |
| Firefox | dnd | 2/2 | 2/2 | 2/2 | 0/2 | 339 | 139.2 | 26.2 | 533.1 | clean | received, coalesced samples (events), raw/moves, median: pinned 12 (12)/2.5 (2), newest 9 (9)/2 (1), cua 27.5 (27.5)/4 (1.5), cua:0ms 3 (3)/1 (1) | cua PASS, cua:0ms **FAIL** |
| Firefox | canvas | 40/40 | 26/40 | 40/40 | 1/40 | 519.1 | 354.6 | 84.9 | 1169.9 | clean | speed (warm): cua faster [-163.9, -160.2], 354.6 ms against newest's 516.05 ms; cua:0ms **fail**: cua:0ms: 0 usable samples of 40, fewer than 20; received, coalesced samples (events), raw/moves, median: pinned 754 (754)/754 (57), newest 181 (181)/181 (18), cua 623.5 (623.5)/623.5 (19), cua:0ms 291 (291)/291 (5) | cua PASS, cua:0ms **FAIL** |

Cells where a cua lane missed a run the pinned build took: firefox range (cua:0ms); firefox dnd (cua:0ms); firefox canvas (cua:0ms).

The judges' verdict for `cua`: PASS.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 4080 requests, 901 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

