# linux-engine-diff summary

## t70-pilot-drag-partial (experiment drag)

Every engine drags the same path 10 times per family and kind, in its own window (partial), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | cua took | xtest took | cua warm ms | xtest warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---|---|---|
| Firefox | select | 10/10 | 0/10 | 10/10 | – | 137.2 | 457.4 | **changed** | received, coalesced samples (events), raw/moves, median: pinned 184 (184)/184 (15.5), cua – (–)/– (–), xtest 182 (182)/182 (5.5) | cua **FAIL** |
| Firefox | range | 10/10 | 0/10 | 10/10 | – | 120.3 | 457.5 | **changed** | received, coalesced samples (events), raw/moves, median: pinned 225.5 (225.5)/225.5 (18.5), cua – (–)/– (–), xtest 196.5 (196.5)/196.5 (6.5) | cua **FAIL** |
| Firefox | scroller | 10/10 | 0/10 | 10/10 | – | 104.6 | 281.1 | **changed** | received, coalesced samples (events), raw/moves, median: pinned 48 (48)/0 (0), cua – (–)/– (–), xtest 56 (56)/0 (0) | cua **FAIL** |
| Firefox | dnd | 10/10 | 0/10 | 10/10 | – | 211.5 | 516.1 | **changed** | received, coalesced samples (events), raw/moves, median: pinned 14 (14)/3.5 (2), cua – (–)/– (–), xtest 38 (38)/3 (1) | cua **FAIL** |
| Firefox | canvas | 0/40 | 0/40 | 40/40 | – | 393.2 | 1150.3 | **changed** | speed (warm): cua **fail**: cua: 0 usable samples of 40, fewer than 20; gave the bar up: pinned 0 usable of 40; received, coalesced samples (events), raw/moves, median: pinned – (–)/– (–), cua – (–)/– (–), xtest 744.5 (744.5)/744.5 (19) | cua **FAIL** |

Cells where a cua lane missed a run the pinned build took: firefox select (cua); firefox range (cua); firefox scroller (cua); firefox dnd (cua).

The judges' verdict for `cua`: **FAIL**: firefox select: cua missed runs 0 1 2 3 4 5 6 7 8 9; firefox range: cua missed runs 0 1 2 3 4 5 6 7 8 9; firefox scroller: cua missed runs 0 1 2 3 4 5 6 7 8 9; firefox dnd: cua missed runs 0 1 2 3 4 5 6 7 8 9; firefox canvas: cua missed runs 0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39; firefox canvas: cua speed: cua: 0 usable samples of 40, fewer than 20.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 17947 requests, 1440 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

