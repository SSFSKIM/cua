# linux-engine-diff summary

## t69-long-drop (experiment drag)

Every engine drags the same path 30 times per family and kind, in its own window (covered), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | newest warm ms | cua warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---|---|---|
| Chrome | dnd | 30/30 | 30/30 | 30/30 | 339 | 368.8 | 514.1 | **changed** | speed (warm): cua **fail** [24, 31.5]: cua 368.8 ms against newest's 339 ms, the interval [24, 31.5] above 0; received, coalesced samples (events), raw/moves, median: pinned 10.5 (10.5)/10.5 (2), newest 4 (4)/4 (1), cua 21 (20.5)/21 (1) | cua **FAIL** |

No cua lane missed a run the pinned build took.

The judges' verdict for `cua`: **FAIL**: chrome dnd: cua speed: cua 368.8 ms against newest's 339 ms, the interval [24, 31.5] above 0.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 7578 requests, 590 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

