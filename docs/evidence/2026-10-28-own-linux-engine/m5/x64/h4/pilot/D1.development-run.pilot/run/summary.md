# linux-engine-diff summary

## m5-dev-D1-pilot (experiment drag; development run, not a release gate)

Every engine drags the same path 2 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Chrome | select | 2/2 | 2/2 | 2/2 | 2/2 | 324.7 | 128.7 | 25.1 | 443.3 | clean | received, coalesced samples (events), raw/moves, median: pinned 191.5 (191)/191.5 (16.5), newest 53 (53)/53 (7.5), cua 198 (188)/198 (8), cua:0ms 178 (158.5)/178 (2) | cua PASS, cua:0ms PASS |
| Chrome | range | 2/2 | 2/2 | 2/2 | 2/2 | 319.4 | 128.8 | 20.7 | 448.3 | clean | received, coalesced samples (events), raw/moves, median: pinned 239 (239)/239 (19), newest 62 (62)/62 (7.5), cua 235 (229.5)/235 (9), cua:0ms 210 (184)/210 (2) | cua PASS, cua:0ms PASS |
| Chrome | scroller | 2/2 | 2/2 | 2/2 | 0/2 | 265.3 | 62.2 | 10.7 | 283.8 | clean | reach (pinned mean 135.5 px): cua 2/2 (shortest 146, mean 146.5), cua:0ms 0/2 (shortest 78, mean 79.5); received, coalesced samples (events), raw/moves, median: pinned 59.5 (59.5)/0 (0), newest 17 (17)/0 (0), cua 53.5 (50.5)/0 (0), cua:0ms 28 (20)/0 (0) | cua PASS, cua:0ms **FAIL** |
| Chrome | dnd | 2/2 | 2/2 | 2/2 | 2/2 | 337.2 | 370.8 | 357.5 | 523.6 | **changed** | speed (warm): cua **undetermined**: cua: 1 usable samples of 2, fewer than 20; cua:0ms **undetermined**: cua:0ms: 1 usable samples of 2, fewer than 20; received, coalesced samples (events), raw/moves, median: pinned 12.5 (12)/12.5 (1), newest 2.5 (2.5)/2.5 (1), cua 19 (18)/19 (1), cua:0ms 5.5 (1)/7 (1) | cua speed unjudged (a pilot), cua:0ms speed unjudged (a pilot) |
| Chrome | canvas | 2/2 | 1/2 | 2/2 | 0/2 | 516.8 | 478 | 88.9 | 1175.1 | clean | speed (warm): cua **undetermined**: cua: 1 usable samples of 2, fewer than 20; cua:0ms **undetermined**: cua:0ms: 0 usable samples of 2, fewer than 20; received, coalesced samples (events), raw/moves, median: pinned 766.5 (765)/766.5 (58.5), newest 196 (195.5)/196 (19), cua 763.5 (758)/763.5 (29), cua:0ms 747 (663.5)/747 (6) | cua speed unjudged (a pilot), cua:0ms **FAIL** |

Cells where a cua lane missed a run the pinned build took: chrome scroller (cua:0ms); chrome canvas (cua:0ms).

The judges' verdict for `cua`: no FAIL; unjudged in this pilot (not a pass): 2 speeds.

Unjudged in this pilot (no top-up; not passes): chrome dnd: cua speed unjudged (a pilot takes no top-up): cua: 1 usable samples of 2, fewer than 20; chrome canvas: cua speed unjudged (a pilot takes no top-up): cua: 1 usable samples of 2, fewer than 20.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00c0000c; the harness's own trace: 1179 requests, 225 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

