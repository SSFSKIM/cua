# linux-engine-diff summary

## t70-pilot-drag-partial-top (experiment drag)

Every engine drags the same path 10 times per family and kind, in its own window (partial-top), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | cua took | xtest took | cua warm ms | xtest warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---|---|---|
| Firefox | select | 0/10 | 0/10 | 0/10 | – | 137 | 459.9 | **changed** | received, coalesced samples (events), raw/moves, median: pinned – (–)/– (–), cua – (–)/– (–), xtest 164.5 (164.5)/164.5 (5.5) | no vendor effect: not judged |
| Firefox | range | 0/10 | 0/10 | 0/10 | – | 120.3 | 456 | **changed** | received, coalesced samples (events), raw/moves, median: pinned – (–)/– (–), cua – (–)/– (–), xtest 193.5 (193.5)/193.5 (6.5) | no vendor effect: not judged |
| Firefox | scroller | 0/10 | 0/10 | 0/10 | – | 104.5 | 278.7 | **changed** | received, coalesced samples (events), raw/moves, median: pinned – (–)/– (–), cua – (–)/– (–), xtest 54.5 (54.5)/0 (0) | no vendor effect: not judged |
| Firefox | dnd | 0/10 | 0/10 | 10/10 | – | 211.5 | 512 | **changed** | received, coalesced samples (events), raw/moves, median: pinned – (–)/– (–), cua – (–)/– (–), xtest 54 (54)/3 (1) | no vendor effect: not judged |
| Firefox | canvas | 40/40 | 0/40 | 40/40 | – | 393.8 | 1168.7 | **changed** | speed (warm): cua **fail**: cua: 0 usable samples of 40, fewer than 20; received, coalesced samples (events), raw/moves, median: pinned 753 (753)/753 (57), cua – (–)/– (–), xtest 697.5 (697.5)/697.5 (19) | cua **FAIL** |

Cells where a cua lane missed a run the pinned build took: firefox canvas (cua).

The judges' verdict for `cua`: **FAIL**: firefox canvas: cua missed runs 0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39; firefox canvas: cua speed: cua: 0 usable samples of 40, fewer than 20.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 17918 requests, 1440 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

