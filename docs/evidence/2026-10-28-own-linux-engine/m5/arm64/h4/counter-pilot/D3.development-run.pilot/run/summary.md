# linux-engine-diff summary

## m5-dev-D3-pilot (experiment drag; development run, not a release gate)

Every engine drags the same path 2 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Firefox | select | 2/2 | 2/2 | 2/2 | 2/2 | 311.9 | 119.4 | 7.6 | 418.9 | clean | received, coalesced samples (events), raw/moves, median: pinned 186 (186)/186 (14), newest 43.5 (43.5)/43.5 (7), cua 135.5 (135.5)/135.5 (5.5), cua:0ms 3 (3)/3 (1) | cua PASS, cua:0ms PASS |
| Firefox | range | 2/2 | 2/2 | 2/2 | 1/2 | 312 | 119.5 | 9.9 | 435.8 | clean | received, coalesced samples (events), raw/moves, median: pinned 220.5 (220.5)/220.5 (17), newest 51 (51)/51 (7), cua 162 (162)/162 (6), cua:0ms 3 (3)/3 (1.5) | cua PASS, cua:0ms **FAIL** |
| Firefox | scroller | 2/2 | 2/2 | 2/2 | 2/2 | 257.9 | 79.9 | 3.8 | 270.1 | clean | received, coalesced samples (events), raw/moves, median: pinned 45 (45)/0 (0), newest 9 (9)/0 (0), cua 4 (4)/0 (0), cua:0ms 2.5 (2.5)/0 (0) | cua PASS, cua:0ms PASS |
| Firefox | dnd | 2/2 | 2/2 | 2/2 | 0/2 | 329.3 | 137.4 | 10 | 482.9 | clean | received, coalesced samples (events), raw/moves, median: pinned 17.5 (17.5)/3 (2), newest 11 (11)/3 (2), cua 3 (3)/1 (1), cua:0ms 3.5 (3.5)/0 (0) | cua PASS, cua:0ms **FAIL** |
| Firefox | canvas | 2/2 | 0/2 | 2/2 | 0/2 | 489.9 | 351.8 | 24.4 | 1064.8 | clean | speed (warm): cua **undetermined**: cua: 1 usable samples of 2, fewer than 20; cua:0ms **undetermined**: cua:0ms: 0 usable samples of 2, fewer than 20; received, coalesced samples (events), raw/moves, median: pinned 752.5 (752.5)/752.5 (51.5), newest 178 (178)/178 (17), cua 693.5 (693.5)/693.5 (19), cua:0ms 4 (4)/4 (2) | cua speed unjudged (a pilot), cua:0ms **FAIL** |

Cells where a cua lane missed a run the pinned build took: firefox range (cua:0ms); firefox dnd (cua:0ms); firefox canvas (cua:0ms).

The judges' verdict for `cua`: no FAIL; unjudged in this pilot (not a pass): 1 speed.

Unjudged in this pilot (no top-up; not passes): firefox canvas: cua speed unjudged (a pilot takes no top-up): cua: 1 usable samples of 2, fewer than 20.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00c0000c; the harness's own trace: 1204 requests, 237 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

