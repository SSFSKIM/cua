# linux-engine-diff summary

## t73-nudge (experiment drag)

Every engine drags the same path 20 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:d took | newest warm ms | cua warm ms | cua:d warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Chrome | handle-dnd | 20/20 | 20/20 | 20/20 | 20/20 | 182.6 | 174.6 | 174.7 | 183.5 | **changed** | control (no press) took 0/20; received, coalesced samples (events), raw/moves, median: pinned 2 (2)/2 (1), newest 3 (3)/3 (2), cua 3 (2)/3 (1), cua:d 3.5 (3)/4 (2) | cua PASS, cua:d PASS |
| Chrome | handle-select | 20/20 | 20/20 | 20/20 | 20/20 | 109.3 | 86.9 | 86.8 | 109.2 | **changed** | control (no press) took 10/20; received, coalesced samples (events), raw/moves, median: pinned 11 (11)/11 (6), newest 12 (12)/12 (7), cua 13 (12)/13 (3), cua:d 14 (14)/14 (5) | cua PASS, cua:d PASS |
| Chrome | handle-range | 20/20 | 20/20 | 20/20 | 20/20 | 84.7 | 69 | 70.3 | 83.6 | **changed** | control (no press) took 10/20; received, coalesced samples (events), raw/moves, median: pinned 11 (11)/11 (6), newest 12 (12)/12 (7), cua 13 (12)/13 (3), cua:d 15 (14)/15 (5) | cua PASS, cua:d PASS |

No cua lane missed a run the pinned build took.

The judges' verdict for `cua`: **FAIL**: chrome handle-select: CONTROL NON-DISCRIMINATING: the no-press control took 10 of 20; chrome handle-range: CONTROL NON-DISCRIMINATING: the no-press control took 10 of 20.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 4998 requests, 1003 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

