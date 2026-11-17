# linux-engine-diff summary

## drag-20261108T150423 (experiment drag)

Every engine drags the same path 40 times per family and kind, in its own window (visible, under load: 2 stress-ng workers per core), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: under load the landed counts decide, cua's at least the pinned build's, 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:before took | newest warm ms | cua warm ms | cua:before warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Chrome | handle-canvas | 39/40 | 40/40 | 40/40 | 26/40 | 307.3 | 151 | 76.4 | 314.5 | **changed** | load: pinned 39/40 (mean –), cua 40/40 (mean –, shortest –), cua:before 26/40 (mean –, shortest –); control (no press) took 0/40; received, coalesced samples (events), raw/moves, median: pinned 33 (33)/33 (18), newest 30 (30)/30 (17), cua 34 (30.5)/34 (8), cua:before 31 (27)/31 (4) | cua PASS, cua:before **FAIL** |
| Chrome | handle-dnd | 40/40 | 40/40 | 40/40 | 22/40 | 189.4 | 156.9 | 93.3 | 189.4 | **changed** | load: pinned 40/40 (mean –), cua 40/40 (mean –, shortest –), cua:before 22/40 (mean –, shortest –); control (no press) took 0/40; received, coalesced samples (events), raw/moves, median: pinned 3 (3)/3 (2), newest 1 (1)/1 (1), cua 3 (2)/3 (1), cua:before 3 (2)/3 (1) | cua PASS, cua:before **FAIL** |
| Electron (cua fixture) | handle-canvas | 40/40 | 40/40 | 40/40 | 27/40 | 301.9 | 153.8 | 73.9 | 308.2 | **changed** | load: pinned 40/40 (mean –), cua 40/40 (mean –, shortest –), cua:before 27/40 (mean –, shortest –); control (no press) took 0/40; received, coalesced samples (events), raw/moves, median: pinned 33 (33)/33 (18), newest 30 (30)/30 (17), cua 34 (30)/34 (8), cua:before 29.5 (25)/29.5 (4) | cua PASS, cua:before **FAIL** |
| Electron (cua fixture) | handle-dnd | 38/40 | 36/40 | 36/40 | 16/40 | 189 | 155 | 90.6 | 190.8 | **changed** | load: pinned 38/40 (mean –), cua 36/40 (mean –, shortest –), cua:before 16/40 (mean –, shortest –); control (no press) took 0/40; received, coalesced samples (events), raw/moves, median: pinned 3 (3)/3 (2), newest 1 (1)/1 (1), cua 2 (2)/2 (1), cua:before 3 (2)/3 (1) | cua **FAIL**, cua:before **FAIL** |

Cells where a cua lane missed a run the pinned build took: chrome handle-canvas (cua:before); chrome handle-dnd (cua:before); electron handle-canvas (cua:before); electron handle-dnd (cua, cua:before).

The judges' verdict for `cua`: **FAIL**: electron handle-dnd: cua landed 36 of 40 against the pinned build's 38 of 40.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00c0000c; the harness's own trace: 12376 requests, 2609 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

