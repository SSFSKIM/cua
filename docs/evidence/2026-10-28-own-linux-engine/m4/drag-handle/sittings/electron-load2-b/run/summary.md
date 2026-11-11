# linux-engine-diff summary

## t73-electron-load2-b (experiment drag)

Every engine drags the same path 40 times per family and kind, in its own window (visible, under load: 2 stress-ng workers per core), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: under load the landed counts decide, cua's at least the pinned build's, 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | cua took | cua warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---|---|---|
| Electron (cua fixture) | handle-dnd | 39/40 | 40/40 | 199.8 | 190.9 | **changed** | load: pinned 39/40 (mean –), cua 40/40 (mean –, shortest –); control (no press) took 0/40; received, coalesced samples (events), raw/moves, median: pinned 3 (3)/3 (2), cua 3 (2)/3 (1) | cua PASS |

No cua lane missed a run the pinned build took.

The judges' verdict for `cua`: PASS.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 1994 requests, 405 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

