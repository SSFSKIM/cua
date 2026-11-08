# linux-engine-diff summary

## drag-20261108T203930 (experiment drag)

Every engine drags the same path 30 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | newest warm ms | cua warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---|---|---|
| Chrome | scroller | 30/30 | 30/30 | 30/30 | 262.4 | 62.5 | 280 | clean | reach (pinned mean 129 px): cua 30/30 (shortest 146, mean 146.4); received, coalesced samples (events), raw/moves, median: pinned 60 (60)/0 (0), newest 17 (17)/0 (0), cua 55 (54)/0 (0) | cua PASS |
| Chrome | canvas | 30/30 | 21/30 | 30/30 | 515.3 | 476.4 | 1161.2 | clean | speed (warm): cua faster [-47.1, -37.1], 476.4 ms against newest's 517.7 ms; received, coalesced samples (events), raw/moves, median: pinned 768 (768)/768 (58.5), newest 196 (196)/196 (19), cua 764 (758.5)/764 (28.5) | cua PASS |

No cua lane missed a run the pinned build took.

The judges' verdict for `cua`: PASS.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 2832 requests, 617 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

