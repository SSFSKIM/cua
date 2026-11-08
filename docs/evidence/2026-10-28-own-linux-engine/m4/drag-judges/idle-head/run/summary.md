# linux-engine-diff summary

## t65-idle-head (experiment drag)

Every engine drags the same path 30 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest drag ms | cua drag ms | cua:0ms drag ms | pinned drag ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Chrome | scroller | 30/30 | 30/30 | 24/30 | 6/30 | 262.5 | 44.6 | 10.3 | 281.6 | clean | reach (pinned mean 133.7 px): cua 11/30 (shortest 90, mean 120.3), cua:0ms 2/30 (shortest 0, mean 50.5); received (raw/moves, median): pinned 60/0, newest 17/0, cua 54/0, cua:0ms 38.5/0 | cua **FAIL**, cua:0ms **FAIL** |
| Chrome | dnd | 30/30 | 30/30 | 30/30 | 30/30 | 337.4 | 364.8 | 363.8 | 513 | **changed** | speed (warm): cua **fail** [25.5, 30.9]: cua 364.8 ms against newest's 337.4 ms, the interval [25.5, 30.9] above 0; cua:0ms **fail** [22.4, 31.8]: cua:0ms 363.8 ms against newest's 337.4 ms, the interval [22.4, 31.8] above 0; received (raw/moves, median): pinned 12/2, newest 4/1, cua 12/1, cua:0ms 45/1 | cua **FAIL**, cua:0ms **FAIL** |
| Chrome | canvas | 40/40 | 16/40 | 40/40 | 1/40 | 520.7 | 569 | 77.7 | 1156.8 | clean | speed (warm): cua faster [-597.15, -572.85], 569 ms against pinned's 1156.8 ms; cua:0ms **fail**: cua:0ms: 0 usable samples of 40, fewer than 20; gave the bar up: newest 15 usable of 40; received (raw/moves, median): pinned 768/58, newest 196/19, cua 763/35, cua:0ms 662/5 | cua PASS, cua:0ms **FAIL** |
| Electron (cua fixture) | scroller | 30/30 | 30/30 | 28/30 | 6/30 | 262.9 | 253.5 | 254.3 | 278 | clean | reach (pinned mean 129.8 px): cua 2/30 (shortest 90, mean 108.7), cua:0ms 1/30 (shortest 0, mean 41.3); received (raw/moves, median): pinned 61/0, newest 17/0, cua 56/0, cua:0ms 53.5/0 | cua **FAIL**, cua:0ms **FAIL** |
| Electron (cua fixture) | dnd | 30/30 | 30/30 | 30/30 | 30/30 | 340.8 | 367.6 | 366.2 | 515.4 | clean | received (raw/moves, median): pinned 13/1, newest 4/1, cua 12.5/1, cua:0ms 45.5/1 | cua PASS, cua:0ms PASS |
| Electron (cua fixture) | canvas | 30/30 | 18/30 | 30/30 | 0/30 | 515.3 | 574.6 | 254.2 | 1155.7 | clean | received (raw/moves, median): pinned 769/58, newest 196/19, cua 764/35, cua:0ms 681/5 | cua PASS, cua:0ms **FAIL** |
| Firefox | scroller | 30/30 | 30/30 | 30/30 | 30/30 | 263.8 | 67.9 | 12.1 | 281.1 | clean | received (raw/moves, median): pinned 47/0, newest 11/0, cua 24/0, cua:0ms 4/0 | cua PASS, cua:0ms PASS |
| Firefox | dnd | 30/30 | 30/30 | 16/30 | 1/30 | 341.8 | 172.6 | 40.6 | 519.8 | clean | received (raw/moves, median): pinned 14/2, newest 11/2, cua 31.5/2, cua:0ms 3/1 | cua **FAIL**, cua:0ms **FAIL** |
| Firefox | canvas | 30/30 | 24/30 | 25/30 | 1/30 | 515.4 | 448.5 | 85.4 | 1173.5 | clean | speed (warm): cua faster [-71.2, -53], 451.4 ms against newest's 513.3 ms; cua:0ms **undetermined**: cua:0ms: 1 usable samples of 30, fewer than 20; received (raw/moves, median): pinned 754/58, newest 181/18, cua 721/25, cua:0ms 276.5/5 | cua **FAIL**, cua:0ms **FAIL** |

Cells where a cua lane missed a run the pinned build took: chrome scroller (cua, cua:0ms); chrome canvas (cua:0ms); electron scroller (cua, cua:0ms); electron canvas (cua:0ms); firefox dnd (cua, cua:0ms); firefox canvas (cua, cua:0ms).

The judges' verdict for `cua`: **FAIL**: chrome scroller: cua missed runs 2 5 16 20 27 28; chrome scroller: cua short of the pinned build's mean distance (133.7 px) on 19 of 30 runs (shortest 90 px, mean 120.3 px); chrome dnd: cua speed: cua 364.8 ms against newest's 337.4 ms, the interval [25.5, 30.9] above 0; electron scroller: cua missed runs 5 29; electron scroller: cua short of the pinned build's mean distance (129.8 px) on 28 of 30 runs (shortest 90 px, mean 108.7 px); firefox dnd: cua missed runs 1 3 8 9 10 11 12 15 19 21 22 24 28 29; firefox canvas: cua missed runs 0 2 15 18 23.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00c0000c; the harness's own trace: 17401 requests, 3777 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

