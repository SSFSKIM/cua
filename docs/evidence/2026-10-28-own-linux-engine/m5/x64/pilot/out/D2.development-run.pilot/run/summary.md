# linux-engine-diff summary

## m4-dev-D2-pilot (experiment drag; development run, not a release gate)

Every engine drags the same path 2 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Electron (cua fixture) | select | 2/2 | 2/2 | 2/2 | 2/2 | 324 | 255.6 | 258.6 | 445.4 | clean | received, coalesced samples (events), raw/moves, median: pinned 190.5 (190.5)/190.5 (16.5), newest 39 (38)/39 (6.5), cua 207.5 (202)/207.5 (13.5), cua:0ms 102.5 (93)/102.5 (15) | cua PASS, cua:0ms PASS |
| Electron (cua fixture) | range | 2/2 | 2/2 | 2/2 | 2/2 | 320.3 | 256.6 | 255.4 | 438.3 | clean | received, coalesced samples (events), raw/moves, median: pinned 240.5 (240.5)/240.5 (18.5), newest 62 (62)/62 (7.5), cua 242 (235)/242 (13.5), cua:0ms 242.5 (211)/242.5 (15.5) | cua PASS, cua:0ms PASS |
| Electron (cua fixture) | scroller | 2/2 | 2/2 | 2/2 | 2/2 | 264.3 | 255.3 | 257.2 | 283.7 | clean | reach (pinned mean 135.5 px): cua 2/2 (shortest 146, mean 146.5), cua:0ms 2/2 (shortest 144, mean 145); received, coalesced samples (events), raw/moves, median: pinned 61 (61)/0 (0), newest 17 (17)/0 (0), cua 69 (67)/0 (0), cua:0ms 74 (67.5)/0 (0) | cua PASS, cua:0ms PASS |
| Electron (cua fixture) | dnd | 2/2 | 2/2 | 2/2 | 2/2 | 346.8 | 362.8 | 373 | 516.1 | clean | received, coalesced samples (events), raw/moves, median: pinned 14 (13.5)/14 (1.5), newest 2.5 (2.5)/2.5 (1), cua 15.5 (15.5)/15.5 (1), cua:0ms 62 (49)/62 (1) | cua PASS, cua:0ms PASS |
| Electron (cua fixture) | canvas | 2/2 | 1/2 | 2/2 | 0/2 | 514.4 | 481.9 | 256.3 | 1173.7 | clean | received, coalesced samples (events), raw/moves, median: pinned 769 (769)/769 (58.5), newest 196 (196)/196 (19.5), cua 765 (758.5)/765 (28.5), cua:0ms 774.5 (680)/774.5 (16) | cua PASS, cua:0ms **FAIL** |

Cells where a cua lane missed a run the pinned build took: electron canvas (cua:0ms).

The judges' verdict for `cua`: PASS.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 1028 requests, 197 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

