# linux-engine-diff summary

## drag-20261108T144810 (experiment drag)

Every engine drags the same path 40 times per family and kind, in its own window (visible, under load: 2 stress-ng workers per core), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: under load the landed counts decide, cua's at least the pinned build's, 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:before took | cua:h6L took | newest warm ms | cua warm ms | cua:before warm ms | cua:h6L warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Firefox | handle-canvas | 38/40 | 39/40 | 37/40 | 9/40 | 38/40 | 319.5 | 190.3 | 105.1 | 283 | 322.6 | **changed** | load: pinned 38/40 (mean –), cua 37/40 (mean –, shortest –), cua:before 9/40 (mean –, shortest –), cua:h6L 38/40 (mean –, shortest –); control (no press) took 0/40; received, coalesced samples (events), raw/moves, median: pinned 31 (31)/31 (17), newest 29 (29)/29 (17), cua 15.5 (15.5)/15.5 (7), cua:before 9 (9)/9 (3), cua:h6L 30 (30)/30 (14) | cua **FAIL**, cua:before **FAIL**, cua:h6L PASS |
| Firefox | handle-dnd | 40/40 | 39/40 | 38/40 | 3/40 | 40/40 | 191.3 | 186.7 | 124.5 | 196.2 | 195.4 | **changed** | load: pinned 40/40 (mean –), cua 38/40 (mean –, shortest –), cua:before 3/40 (mean –, shortest –), cua:h6L 40/40 (mean –, shortest –); control (no press) took 0/40; received, coalesced samples (events), raw/moves, median: pinned 3 (3)/2 (1), newest 3 (3)/1 (1), cua 3 (3)/1 (1), cua:before 2 (2)/1 (1), cua:h6L 3 (3)/1.5 (1) | cua **FAIL**, cua:before **FAIL**, cua:h6L PASS |

Cells where a cua lane missed a run the pinned build took: firefox handle-canvas (cua, cua:before, cua:h6L); firefox handle-dnd (cua, cua:before).

The judges' verdict for `cua`: **FAIL**: firefox handle-canvas: cua landed 37 of 40 against the pinned build's 38 of 40; firefox handle-dnd: cua landed 38 of 40 against the pinned build's 40 of 40.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00c0000c; the harness's own trace: 7611 requests, 1566 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

