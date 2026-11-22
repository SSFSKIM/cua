# linux-engine-diff summary

## dev-t130-d1-a (experiment drag; development run, not a release gate)

Every engine drags the same path 30 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:tail took | cua:tail-outlasted took | cua:ping-outlasted took | newest warm ms | cua warm ms | cua:tail warm ms | cua:tail-outlasted warm ms | cua:ping-outlasted warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Chrome | dnd | 30/30 | 30/30 | 30/30 | 30/30 | 30/30 | 30/30 | 337 | 369.2 | 393.6 | 369.9 | 369.5 | 508.1 | **changed** | speed (warm): cua **declared speed gap (#358)** [26.3, 35.4]: cua 369.2 ms against newest's 337 ms, the interval [26.3, 35.4] above 0; cua:tail **fail** [53, 57.8]: cua:tail 393.6 ms against newest's 337 ms, the interval [53, 57.8] above 0; cua:tail-outlasted **declared speed gap (#358)** [30.5, 36.2]: cua:tail-outlasted 369.9 ms against newest's 337 ms, the interval [30.5, 36.2] above 0; cua:ping-outlasted **declared speed gap (#358)** [28.1, 34.8]: cua:ping-outlasted 369.5 ms against newest's 337 ms, the interval [28.1, 34.8] above 0; received, coalesced samples (events), raw/moves, median: pinned 11 (11)/11 (2), newest 4 (4)/4 (1), cua 21 (21)/21 (1), cua:tail 17.5 (17.5)/17.5 (1), cua:tail-outlasted 22.5 (22.5)/22.5 (1), cua:ping-outlasted 20 (20)/20 (1) | cua declared speed gap (#358), cua:tail **FAIL**, cua:tail-outlasted declared speed gap (#358), cua:ping-outlasted declared speed gap (#358) |

No cua lane missed a run the pinned build took.

The judges' verdict for `cua`: PASS.

Declared speed gaps (listed apart, not passes): chrome dnd: cua declared speed gap (#358): cua 369.2 ms against newest's 337 ms, the interval [26.3, 35.4] within the declared 40 ms.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00c0000c; the harness's own trace: 5609 requests, 1001 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

