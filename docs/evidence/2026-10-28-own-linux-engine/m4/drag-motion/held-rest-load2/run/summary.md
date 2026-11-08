# linux-engine-diff summary

## drag-20261108T153414 (experiment drag)

Every engine drags the same path 40 times per family and kind, in its own window (visible, under load: 2 stress-ng workers per core), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: under load the landed counts decide, cua's at least the pinned build's, 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | cua took | cua:hr30 took | cua:hr40 took | cua:h6L took | cua warm ms | cua:hr30 warm ms | cua:hr40 warm ms | cua:h6L warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Firefox | handle-canvas | 36/40 | 37/40 | 40/40 | 40/40 | 35/40 | 189.4 | 225.9 | 273.4 | 283.5 | 325.2 | **changed** | load: pinned 36/40 (mean –), cua 37/40 (mean –, shortest –), cua:hr30 40/40 (mean –, shortest –), cua:hr40 40/40 (mean –, shortest –), cua:h6L 35/40 (mean –, shortest –); control (no press) took 0/40; received, coalesced samples (events), raw/moves, median: pinned 31 (31)/31 (17), cua 16.5 (16.5)/16.5 (7), cua:hr30 14 (14)/14 (8), cua:hr40 16.5 (16.5)/16.5 (9), cua:h6L 30 (30)/30 (14) | cua PASS, cua:hr30 PASS, cua:hr40 PASS, cua:h6L **FAIL** |
| Firefox | handle-dnd | 39/40 | 40/40 | 40/40 | 40/40 | 39/40 | 185.6 | 215.3 | 247.2 | 197.6 | 195.3 | **changed** | load: pinned 39/40 (mean –), cua 40/40 (mean –, shortest –), cua:hr30 40/40 (mean –, shortest –), cua:hr40 40/40 (mean –, shortest –), cua:h6L 39/40 (mean –, shortest –); control (no press) took 0/40; received, coalesced samples (events), raw/moves, median: pinned 3 (3)/2 (1), cua 3 (3)/1 (1), cua:hr30 2 (2)/1 (1), cua:hr40 2 (2)/1 (1), cua:h6L 4 (4)/2 (1) | cua PASS, cua:hr30 PASS, cua:hr40 PASS, cua:h6L PASS |

Cells where a cua lane missed a run the pinned build took: firefox handle-canvas (cua, cua:h6L); firefox handle-dnd (cua:h6L).

The judges' verdict for `cua`: PASS.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00c0000c; the harness's own trace: 7638 requests, 1566 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

