# linux-engine-diff summary

## drag-20261108T203130 (experiment drag)

Every engine drags the same path 30 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | newest warm ms | cua warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---|---|---|
| Firefox | canvas | 40/40 | 28/40 | 40/40 | 525 | 354.6 | 1183.5 | clean | speed (warm): cua faster [-171.3, -162.1], 354.6 ms against newest's 518.3 ms; received, coalesced samples (events), raw/moves, median: pinned 753 (753)/753 (58), newest 181 (181)/181 (19), cua 616.5 (616.5)/616.5 (19) | cua PASS |
| Firefox | handle-canvas | 30/30 | 30/30 | 30/30 | 291.5 | 209.6 | 299 | **changed** | control (no press) took 0/30; received, coalesced samples (events), raw/moves, median: pinned 32 (32)/32 (16), newest 30 (30)/30 (16), cua 26 (26)/26 (8) | cua PASS |

No cua lane missed a run the pinned build took.

The judges' verdict for `cua`: PASS.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00c0000c; the harness's own trace: 3815 requests, 796 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

