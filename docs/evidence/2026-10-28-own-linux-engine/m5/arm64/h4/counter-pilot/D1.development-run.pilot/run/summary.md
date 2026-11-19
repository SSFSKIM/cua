# linux-engine-diff summary

## m5-dev-D1-pilot (experiment drag; development run, not a release gate)

Every engine drags the same path 2 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Chrome | select | 2/2 | 2/2 | 2/2 | 2/2 | 311.5 | 126 | 7.3 | 416.2 | clean | received, coalesced samples (events), raw/moves, median: pinned 181 (180.5)/181 (14), newest 46 (46)/46 (7), cua 197.5 (194)/197.5 (7.5), cua:0ms 75 (66)/75 (1) | cua PASS, cua:0ms PASS |
| Chrome | range | 2/2 | 2/2 | 2/2 | 2/2 | 311.2 | 126.1 | 7.4 | 414 | clean | received, coalesced samples (events), raw/moves, median: pinned 239.5 (239.5)/239.5 (16.5), newest 60 (60)/60 (7), cua 233.5 (231.5)/233.5 (9), cua:0ms 109 (97.5)/109 (1.5) | cua PASS, cua:0ms PASS |
| Chrome | scroller | 2/2 | 0/2 | 0/2 | 0/2 | 257.9 | 60.1 | 3.3 | 269 | clean | reach (pinned mean 111 px): cua 2/2 (shortest 146, mean 146), cua:0ms 0/2 (shortest 0, mean 0); received, coalesced samples (events), raw/moves, median: pinned 59.5 (59.5)/0 (0), newest 17 (17)/0 (0), cua 53.5 (53.5)/0 (0), cua:0ms 1 (1)/0 (0) | cua **FAIL**, cua:0ms **FAIL** |
| Chrome | dnd | 2/2 | 2/2 | 2/2 | 2/2 | 328.2 | 354.7 | 354.6 | 480.3 | **changed** | speed (warm): cua **undetermined**: cua: 1 usable samples of 2, fewer than 20; cua:0ms **undetermined**: cua:0ms: 1 usable samples of 2, fewer than 20; received, coalesced samples (events), raw/moves, median: pinned 10 (9.5)/10 (2), newest 5.5 (5.5)/5.5 (1), cua 2 (1)/2.5 (1), cua:0ms 14 (1.5)/16 (1) | cua speed unjudged (a pilot), cua:0ms speed unjudged (a pilot) |
| Chrome | canvas | 2/2 | 2/2 | 2/2 | 0/2 | 484 | 473.4 | 22.8 | 1042.3 | clean | speed (warm): cua **undetermined**: cua: 1 usable samples of 2, fewer than 20; cua:0ms **undetermined**: cua:0ms: 0 usable samples of 2, fewer than 20; received, coalesced samples (events), raw/moves, median: pinned 763.5 (763.5)/763.5 (51.5), newest 196 (195)/196 (18), cua 761.5 (761)/761.5 (28.5), cua:0ms 457.5 (416)/457.5 (2) | cua speed unjudged (a pilot), cua:0ms **FAIL** |

Cells where a cua lane missed a run the pinned build took: chrome scroller (cua, cua:0ms); chrome canvas (cua:0ms).

The judges' verdict for `cua`: **FAIL**: chrome scroller: cua missed runs 0 1.

Unjudged in this pilot (no top-up; not passes): chrome dnd: cua speed unjudged (a pilot takes no top-up): cua: 1 usable samples of 2, fewer than 20; chrome canvas: cua speed unjudged (a pilot takes no top-up): cua: 1 usable samples of 2, fewer than 20.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00c0000c; the harness's own trace: 1196 requests, 225 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

