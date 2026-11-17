# linux-engine-diff summary

## drag-20261108T155103 (experiment drag)

Every engine drags the same path 40 times per family and kind, in its own window (visible, under load: 2 stress-ng workers per core), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: under load the landed counts decide, cua's at least the pinned build's, 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | cua took | cua:r30 took | cua warm ms | cua:r30 warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---|---|---|
| Firefox | select | 40/40 | 40/40 | 40/40 | 116.8 | 129.6 | 474.7 | clean | load: pinned 40/40 (mean –), cua 40/40 (mean –, shortest –), cua:r30 40/40 (mean –, shortest –); received, coalesced samples (events), raw/moves, median: pinned 67 (67)/67 (15), cua 11 (11)/11 (4), cua:r30 12 (12)/12 (5) | cua PASS, cua:r30 PASS |
| Firefox | range | 40/40 | 40/40 | 40/40 | 136.1 | 148.6 | 556.5 | clean | load: pinned 40/40 (mean 50.6), cua 40/40 (mean 50.6, shortest 50), cua:r30 40/40 (mean 50.6, shortest 50); received, coalesced samples (events), raw/moves, median: pinned 94 (94)/94 (19), cua 14 (14)/14 (5), cua:r30 15.5 (15.5)/15.5 (5) | cua PASS, cua:r30 PASS |
| Firefox | scroller | 40/40 | 40/40 | 40/40 | 73.6 | 86.4 | 284.4 | clean | load: pinned 40/40 (mean 108), cua 40/40 (mean 108, shortest 108), cua:r30 40/40 (mean 108, shortest 108); received, coalesced samples (events), raw/moves, median: pinned 11.5 (11.5)/0 (0), cua 3 (3)/0 (0), cua:r30 3 (3)/0 (0) | cua PASS, cua:r30 PASS |
| Firefox | dnd | 40/40 | 38/40 | 40/40 | 137 | 143.4 | 566.2 | clean | load: pinned 40/40 (mean –), cua 38/40 (mean –, shortest –), cua:r30 40/40 (mean –, shortest –); received, coalesced samples (events), raw/moves, median: pinned 5 (5)/3 (2), cua 3 (3)/1 (1), cua:r30 3 (3)/1 (1) | cua **FAIL**, cua:r30 PASS |
| Firefox | canvas | 40/40 | 38/40 | 40/40 | 344.2 | 409.9 | 1227.4 | clean | load: pinned 40/40 (mean –), cua 38/40 (mean –, shortest –), cua:r30 40/40 (mean –, shortest –); received, coalesced samples (events), raw/moves, median: pinned 496 (496)/496 (60), cua 132 (132)/132 (18), cua:r30 121.5 (121.5)/121.5 (20) | cua **FAIL**, cua:r30 PASS |
| Firefox | handle-canvas | 39/40 | 39/40 | 39/40 | 186.6 | 227.7 | 325.5 | **changed** | load: pinned 39/40 (mean –), cua 39/40 (mean –, shortest –), cua:r30 39/40 (mean –, shortest –); control (no press) took 0/40; received, coalesced samples (events), raw/moves, median: pinned 31 (31)/31 (17), cua 17 (17)/17 (7), cua:r30 16.5 (16.5)/16.5 (8) | cua PASS, cua:r30 PASS |
| Firefox | handle-dnd | 40/40 | 40/40 | 40/40 | 185.1 | 216.4 | 196 | **changed** | load: pinned 40/40 (mean –), cua 40/40 (mean –, shortest –), cua:r30 40/40 (mean –, shortest –); control (no press) took 0/40; received, coalesced samples (events), raw/moves, median: pinned 4 (4)/2 (1), cua 2 (2)/1 (1), cua:r30 2 (2)/1 (1) | cua PASS, cua:r30 PASS |

Cells where a cua lane missed a run the pinned build took: firefox dnd (cua); firefox canvas (cua); firefox handle-canvas (cua, cua:r30).

The judges' verdict for `cua`: **FAIL**: firefox dnd: cua landed 38 of 40 against the pinned build's 40 of 40; firefox canvas: cua landed 38 of 40 against the pinned build's 40 of 40.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 13527 requests, 2964 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

