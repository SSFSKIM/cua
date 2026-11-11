# linux-engine-diff summary

## t73-grab (experiment drag)

Every engine drags the same path 2 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:d took | newest warm ms | cua warm ms | cua:d warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Chrome | handle-dnd | 2/2 | 0/2 | 2/2 | 0/2 | 182.6 | 175.8 | 174.4 | 183.1 | **changed** | control (no press) took 0/2; received, coalesced samples (events), raw/moves, median: pinned 2.5 (2.5)/2.5 (1.5), newest – (–)/– (–), cua 2 (1.5)/2 (1), cua:d – (–)/– (–) | cua PASS, cua:d **FAIL** |
| Chrome | handle-select | 2/2 | 0/2 | 2/2 | 0/2 | 107.8 | 86.6 | 86.5 | 109 | **changed** | control (no press) took 1/2; received, coalesced samples (events), raw/moves, median: pinned 11 (11)/11 (5.5), newest – (–)/– (–), cua 13 (11.5)/13 (3.5), cua:d – (–)/– (–) | cua PASS, cua:d **FAIL** |
| Chrome | handle-range | 2/2 | 0/2 | 2/2 | 0/2 | 83.8 | 68.1 | 70.2 | 84.3 | **changed** | control (no press) took 1/2; received, coalesced samples (events), raw/moves, median: pinned 11 (11)/11 (6), newest – (–)/– (–), cua 13 (12)/13 (3), cua:d – (–)/– (–) | cua PASS, cua:d **FAIL** |

Cells where a cua lane missed a run the pinned build took: chrome handle-dnd (cua:d); chrome handle-select (cua:d); chrome handle-range (cua:d).

The judges' verdict for `cua`: **FAIL**: chrome handle-select: CONTROL NON-DISCRIMINATING: the no-press control took 1 of 2; chrome handle-range: CONTROL NON-DISCRIMINATING: the no-press control took 1 of 2.

desktop: started with 0x0060000c active (foreign), ended with 0x0060000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 900 requests, 169 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

