# linux-engine-diff summary

## dev-t132-d1-a (experiment drag; development run, not a release gate)

Every engine drags the same path 30 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:off took | newest warm ms | cua warm ms | cua:off warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Chrome | dnd | 30/30 | 30/30 | 30/30 | 30/30 | 339.5 | 368.8 | 369.8 | 510 | **changed** | speed (warm): cua **declared speed gap (#358)** [25, 32.4]: cua 368.8 ms against newest's 339.5 ms, the interval [25, 32.4] above 0; cua:off **declared speed gap (#358)** [26, 34.1]: cua:off 369.8 ms against newest's 339.5 ms, the interval [26, 34.1] above 0; received, coalesced samples (events), raw/moves, median: pinned 10 (10)/10 (2), newest 4.5 (4.5)/4.5 (1), cua 15.5 (15.5)/16 (1), cua:off 19.5 (19.5)/19.5 (1) | cua declared speed gap (#358), cua:off declared speed gap (#358) |

No cua lane missed a run the pinned build took.

The judges' verdict for `cua`: PASS.

Declared speed gaps (listed apart, not passes): chrome dnd: cua declared speed gap (#358): cua 368.8 ms against newest's 339.5 ms, the interval [25, 32.4] within the declared 40 ms.

desktop: started with 0x0060000c active (foreign), ended with 0x0060000c active (foreign), neither acted on; holder 0x00c0000c; the harness's own trace: 3812 requests, 673 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

