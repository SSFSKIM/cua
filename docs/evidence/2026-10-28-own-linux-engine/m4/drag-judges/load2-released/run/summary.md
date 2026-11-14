# linux-engine-diff summary

## t65-load2-released (experiment drag)

Every engine drags the same path 40 times per family and kind, in its own window (visible, under load: 2 stress-ng workers per core), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: under load the landed counts decide, cua's at least the pinned build's, 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | cua took | cua drag ms | pinned drag ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---|---|---|
| Chrome | range | 39/40 | 40/40 | 309.8 | 566 | clean | load: pinned 39/40 (mean 50.5), cua 40/40 (mean 50.6, shortest 49); received (raw/moves, median): pinned 182.5/22, cua 173/13 | cua PASS |
| Chrome | scroller | 40/40 | 36/40 | 149.8 | 285.1 | clean | reach (pinned mean 132.4 px): cua 18/40 (shortest 68, mean 124.8); load: pinned 40/40 (mean 132.4), cua 36/40 (mean 124.8, shortest 68); received (raw/moves, median): pinned 51.5/0, cua 33.5/0 | cua **FAIL** |
| Electron (cua fixture) | range | 40/40 | 40/40 | 354.2 | 491 | clean | load: pinned 40/40 (mean 50.5), cua 40/40 (mean 50.4, shortest 49); received (raw/moves, median): pinned 180.5/19.5, cua 151.5/11.5 | cua PASS |
| Electron (cua fixture) | scroller | 40/40 | 33/40 | 354 | 283 | clean | reach (pinned mean 133.2 px): cua 13/40 (shortest 85, mean 119.9); load: pinned 40/40 (mean 133.2), cua 33/40 (mean 119.9, shortest 85); received (raw/moves, median): pinned 55/0, cua 44.5/0 | cua **FAIL** |

Cells where a cua lane missed a run the pinned build took: chrome scroller (cua); electron scroller (cua).

The judges' verdict for `cua`: **FAIL**: chrome scroller: cua landed 36 of 40 against the pinned build's 40 of 40; electron scroller: cua landed 33 of 40 against the pinned build's 40 of 40.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00c0000c; the harness's own trace: 4598 requests, 1023 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

