# linux-engine-diff summary

## m4-dev-L1-pilot (experiment drag; development run, not a release gate)

Every engine drags the same path 2 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Chrome | range | 2/2 | 2/2 | 2/2 | 2/2 | 319.4 | 130.3 | 24.9 | 442 | clean | received, coalesced samples (events), raw/moves, median: pinned 239.5 (239.5)/239.5 (19), newest 62 (62)/62 (8), cua 235.5 (226)/235.5 (9), cua:0ms 218.5 (196)/218.5 (2) | cua PASS, cua:0ms PASS |
| Chrome | scroller | 2/2 | 2/2 | 2/2 | 0/2 | 261.7 | 62.4 | 9.8 | 276.9 | clean | reach (pinned mean 130.5 px): cua 2/2 (shortest 146, mean 146.5), cua:0ms 0/2 (shortest 0, mean 29.5); received, coalesced samples (events), raw/moves, median: pinned 59.5 (59.5)/0 (0), newest 17 (17)/0 (0), cua 54.5 (52)/0 (0), cua:0ms 40 (37)/0 (0) | cua PASS, cua:0ms **FAIL** |
| Electron (cua fixture) | range | 2/2 | 2/2 | 2/2 | 2/2 | 319.1 | 254.7 | 256.5 | 441.4 | clean | received, coalesced samples (events), raw/moves, median: pinned 241 (240.5)/241 (18.5), newest 62 (62)/62 (7.5), cua 242 (235)/242 (13.5), cua:0ms 244 (211.5)/244 (16) | cua PASS, cua:0ms PASS |
| Electron (cua fixture) | scroller | 2/2 | 2/2 | 2/2 | 2/2 | 263 | 257.1 | 254.7 | 283.2 | clean | reach (pinned mean 134 px): cua 2/2 (shortest 144, mean 145), cua:0ms 2/2 (shortest 144, mean 145); received, coalesced samples (events), raw/moves, median: pinned 61 (61)/0 (0), newest 17 (17)/0 (0), cua 69 (68)/0 (0), cua:0ms 70.5 (66)/0 (0) | cua PASS, cua:0ms PASS |

Cells where a cua lane missed a run the pinned build took: chrome scroller (cua:0ms).

The judges' verdict for `cua`: PASS.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 1050 requests, 201 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

