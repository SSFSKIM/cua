# linux-engine-diff summary

## m4-dev-L2c-pilot (experiment drag; development run, not a release gate)

Every engine drags the same path 2 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Firefox | select | 2/2 | 2/2 | 2/2 | 2/2 | 323.7 | 121.6 | 24 | 441.4 | clean | received, coalesced samples (events), raw/moves, median: pinned 189.5 (189.5)/189.5 (15.5), newest 45 (45)/45 (6), cua 121.5 (121.5)/121.5 (5), cua:0ms 3 (3)/3 (2) | cua PASS, cua:0ms PASS |
| Firefox | range | 2/2 | 2/2 | 2/2 | 2/2 | 320.6 | 122.1 | 28.1 | 445.2 | clean | received, coalesced samples (events), raw/moves, median: pinned 195.5 (195.5)/195.5 (18.5), newest 50 (50)/50 (7), cua 145.5 (145.5)/145.5 (5.5), cua:0ms 19 (19)/19 (2) | cua PASS, cua:0ms PASS |
| Firefox | scroller | 2/2 | 2/2 | 2/2 | 2/2 | 266.7 | 81.9 | 8 | 280.2 | clean | received, coalesced samples (events), raw/moves, median: pinned 46.5 (46.5)/0 (0), newest 11 (11)/0 (0), cua 4.5 (4.5)/0 (0), cua:0ms 4 (4)/0 (0) | cua PASS, cua:0ms PASS |
| Firefox | dnd | 2/2 | 2/2 | 2/2 | 0/2 | 338.1 | 139.6 | 58 | 509.2 | clean | received, coalesced samples (events), raw/moves, median: pinned 16.5 (16.5)/3 (2), newest 11.5 (11.5)/2 (1.5), cua 3 (3)/1 (1), cua:0ms 3.5 (3.5)/1 (1) | cua PASS, cua:0ms **FAIL** |
| Firefox | canvas | 40/40 | 29/40 | 40/40 | 1/40 | 518.3 | 354.8 | 83.2 | 1158.8 | clean | speed (warm): cua faster [-163.85, -158.05], 354.8 ms against newest's 515.7 ms; cua:0ms **fail**: cua:0ms: 1 usable samples of 40, fewer than 20; received, coalesced samples (events), raw/moves, median: pinned 753.5 (753.5)/753.5 (57), newest 181 (181)/181 (18), cua 645 (645)/645 (19), cua:0ms 247.5 (247.5)/247.5 (5) | cua PASS, cua:0ms **FAIL** |

Cells where a cua lane missed a run the pinned build took: firefox dnd (cua:0ms); firefox canvas (cua:0ms).

The judges' verdict for `cua`: PASS.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 4082 requests, 901 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

