# linux-engine-diff summary

## m5-dev-D3-pilot (experiment drag; development run, not a release gate)

Every engine drags the same path 2 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Firefox | select | 2/2 | 2/2 | 2/2 | 2/2 | 321.4 | 121.8 | 28.4 | 460.8 | clean | received, coalesced samples (events), raw/moves, median: pinned 190 (190)/190 (16), newest 44 (44)/44 (7), cua 115 (115)/115 (5), cua:0ms 9 (9)/9 (2) | cua PASS, cua:0ms PASS |
| Firefox | range | 2/2 | 2/2 | 2/2 | 2/2 | 321.9 | 120.7 | 22.9 | 450.3 | clean | received, coalesced samples (events), raw/moves, median: pinned 223 (223)/223 (19), newest 53 (53)/53 (7), cua 141.5 (141.5)/141.5 (6), cua:0ms 44 (44)/44 (2.5) | cua PASS, cua:0ms PASS |
| Firefox | scroller | 2/2 | 2/2 | 2/2 | 2/2 | 263.5 | 81.2 | 10.1 | 282.5 | clean | received, coalesced samples (events), raw/moves, median: pinned 46 (46)/0 (0), newest 11.5 (11.5)/0 (0), cua 3.5 (3.5)/0 (0), cua:0ms 4 (4)/0 (0) | cua PASS, cua:0ms PASS |
| Firefox | dnd | 2/2 | 2/2 | 2/2 | 0/2 | 350.4 | 139.4 | 28.2 | 512.4 | clean | received, coalesced samples (events), raw/moves, median: pinned 10 (10)/3.5 (2), newest 8 (8)/2 (1.5), cua 3.5 (3.5)/1 (1), cua:0ms 17 (17)/10 (1) | cua PASS, cua:0ms **FAIL** |
| Firefox | canvas | 2/2 | 1/2 | 2/2 | 0/2 | 516.3 | 355.4 | 85.7 | 1201.4 | clean | speed (warm): cua **undetermined**: cua: 1 usable samples of 2, fewer than 20; cua:0ms **undetermined**: cua:0ms: 0 usable samples of 2, fewer than 20; received, coalesced samples (events), raw/moves, median: pinned 742 (742)/742 (58), newest 175.5 (175.5)/175.5 (18), cua 607.5 (607.5)/607.5 (19), cua:0ms 218.5 (218.5)/218.5 (5) | cua speed unjudged (a pilot), cua:0ms **FAIL** |

Cells where a cua lane missed a run the pinned build took: firefox dnd (cua:0ms); firefox canvas (cua:0ms).

The judges' verdict for `cua`: no FAIL; unjudged in this pilot (not a pass): 1 speed.

Unjudged in this pilot (no top-up; not passes): firefox canvas: cua speed unjudged (a pilot takes no top-up): cua: 1 usable samples of 2, fewer than 20.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00c0000c; the harness's own trace: 1191 requests, 237 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

