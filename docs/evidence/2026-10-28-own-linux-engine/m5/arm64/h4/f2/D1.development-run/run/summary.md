# linux-engine-diff summary

## m5-dev-D1 (experiment drag; development run, not a release gate)

Every engine drags the same path 30 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Chrome | select | 30/30 | 30/30 | 30/30 | 27/30 | 311.7 | 126 | 7.7 | 415.2 | clean | received, coalesced samples (events), raw/moves, median: pinned 192 (192)/192 (14), newest 50 (50)/50 (7), cua 186 (184)/186 (8), cua:0ms 77 (71)/77 (1) | cua PASS, cua:0ms **FAIL** |
| Chrome | range | 30/30 | 30/30 | 30/30 | 30/30 | 311.6 | 126.1 | 7.7 | 415.3 | clean | received, coalesced samples (events), raw/moves, median: pinned 240 (240)/240 (17), newest 50 (50)/50 (7), cua 234 (232.5)/234 (9), cua:0ms 108 (84)/108 (1) | cua PASS, cua:0ms PASS |
| Chrome | scroller | 30/30 | 30/30 | 30/30 | 8/30 | 257.8 | 59.9 | 3.4 | 269 | clean | reach (pinned mean 129.5 px): cua 30/30 (shortest 146, mean 146.3), cua:0ms 6/30 (shortest 0, mean 35.7); received, coalesced samples (events), raw/moves, median: pinned 60 (60)/0 (0), newest 17 (17)/0 (0), cua 54 (54)/0 (0), cua:0ms 1 (1)/0 (0) | cua PASS, cua:0ms **FAIL** |
| Chrome | dnd | 30/30 | 30/30 | 30/30 | 30/30 | 328.1 | 354.7 | 355.1 | 479.7 | **changed** | speed (warm): cua **declared speed gap (#358)** [26.5, 26.7]: cua 354.7 ms against newest's 328.1 ms, the interval [26.5, 26.7] above 0; cua:0ms **declared speed gap (#358)** [26.9, 27.2]: cua:0ms 355.1 ms against newest's 328.1 ms, the interval [26.9, 27.2] above 0; received, coalesced samples (events), raw/moves, median: pinned 12 (12)/12 (2), newest 4.5 (4.5)/4.5 (1), cua 2 (1)/2 (1), cua:0ms 9.5 (1)/11.5 (1) | cua declared speed gap (#358), cua:0ms declared speed gap (#358) |
| Chrome | canvas | 40/40 | 23/40 | 40/40 | 0/40 | 486 | 473.3 | 22.6 | 1045.4 | clean | speed (warm): cua faster [-12.85, -11.9], 473.3 ms against newest's 485.7 ms; cua:0ms **fail**: cua:0ms: 0 usable samples of 40, fewer than 20; received, coalesced samples (events), raw/moves, median: pinned 768 (768)/768 (51), newest 196 (196)/196 (17), cua 762 (762)/762 (28), cua:0ms 410 (358.5)/410 (2) | cua PASS, cua:0ms **FAIL** |

Cells where a cua lane missed a run the pinned build took: chrome select (cua:0ms); chrome scroller (cua:0ms); chrome canvas (cua:0ms).

The judges' verdict for `cua`: PASS.

Declared speed gaps (listed apart, not passes): chrome dnd: cua declared speed gap (#358): cua 354.7 ms against newest's 328.1 ms, the interval [26.5, 26.7] within the declared 40 ms.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 11160 requests, 2337 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

