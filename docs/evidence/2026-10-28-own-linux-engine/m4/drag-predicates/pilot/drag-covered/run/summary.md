# linux-engine-diff summary

## t70-pilot-drag-covered (experiment drag)

Every engine drags the same path 10 times per family and kind, in its own window (covered), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | cua took | xtest took | cua warm ms | xtest warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---|---|---|
| Firefox | select | 0/10 | 0/10 | 0/10 | – | 136.8 | 452.8 | **changed** | received, coalesced samples (events), raw/moves, median: pinned – (–)/– (–), cua – (–)/– (–), xtest 175 (175)/175 (6) | no vendor effect: not judged |
| Firefox | range | 0/10 | 0/10 | 0/10 | – | 120.2 | 457.2 | **changed** | received, coalesced samples (events), raw/moves, median: pinned – (–)/– (–), cua – (–)/– (–), xtest 192.5 (192.5)/192.5 (7) | no vendor effect: not judged |
| Firefox | scroller | 0/10 | 0/10 | 0/10 | – | 105 | 280 | **changed** | received, coalesced samples (events), raw/moves, median: pinned – (–)/– (–), cua – (–)/– (–), xtest 48.5 (48.5)/0 (0) | no vendor effect: not judged |
| Firefox | dnd | 0/10 | 0/10 | 10/10 | – | 211.9 | 523.8 | **changed** | received, coalesced samples (events), raw/moves, median: pinned – (–)/– (–), cua – (–)/– (–), xtest 48.5 (48.5)/8.5 (1) | no vendor effect: not judged |
| Firefox | canvas | 0/40 | 0/40 | 40/40 | – | 393.7 | 1160.2 | **changed** | speed (warm): cua **fail**: cua: 0 usable samples of 40, fewer than 20; gave the bar up: pinned 0 usable of 40; received, coalesced samples (events), raw/moves, median: pinned – (–)/– (–), cua – (–)/– (–), xtest 727 (727)/727 (19) | cua **FAIL** |

No cua lane missed a run the pinned build took.

The judges' verdict for `cua`: **FAIL**: firefox canvas: cua missed runs 0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39; firefox canvas: cua speed: cua: 0 usable samples of 40, fewer than 20.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 17364 requests, 1191 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

