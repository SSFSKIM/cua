# linux-engine-diff summary

## drag-20261108T030257 (experiment drag)

Every engine drags the same path 4 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest drag ms | cua drag ms | cua:0ms drag ms | pinned drag ms | witness | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| Chrome | scroller | 4/4 | 4/4 | 4/4 | 1/4 | 264.4 | 146.5 | 112.1 | 278.3 | clean | cua PASS, cua:0ms **misses 3** |
| Electron (cua fixture) | scroller | 4/4 | 4/4 | 3/4 | 0/4 | 263.6 | 354 | 355.2 | 280.1 | clean | cua **misses 1**, cua:0ms **misses 4** |

Cells where a cua lane missed a run the pinned build took: chrome scroller (cua:0ms); electron scroller (cua, cua:0ms).

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 965 requests, 185 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

