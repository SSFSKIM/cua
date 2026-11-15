# linux-engine-diff summary

## m4-dev-L2a-pilot (experiment drag; development run, not a release gate)

Every engine drags the same path 2 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Chrome | select | 2/2 | 2/2 | 2/2 | 2/2 | 321.9 | 129.4 | 20.2 | 459.7 | clean | received, coalesced samples (events), raw/moves, median: pinned 187.5 (186.5)/187.5 (16.5), newest 53 (53)/53 (8), cua 198 (187.5)/198 (8), cua:0ms 175.5 (152.5)/175.5 (2) | cua PASS, cua:0ms PASS |
| Chrome | dnd | 32/32 | 32/32 | 32/32 | 32/32 | 339.6 | 368.2 | 363.2 | 510.7 | **changed** | speed (warm): cua **declared speed gap (#358)** [25.2, 32.1]: cua 368.2 ms against newest's 339.6 ms, the interval [25.2, 32.1] above 0; cua:0ms **declared speed gap (#358)** [18.8, 31.4]: cua:0ms 363.2 ms against newest's 339.6 ms, the interval [18.8, 31.4] above 0; received, coalesced samples (events), raw/moves, median: pinned 11 (11)/11 (2), newest 3.5 (3.5)/3.5 (1), cua 17 (16.5)/17 (1), cua:0ms 66.5 (60.5)/67 (1) | cua declared speed gap (#358), cua:0ms declared speed gap (#358) |
| Chrome | canvas | 40/40 | 21/40 | 40/40 | 0/40 | 513.8 | 476.7 | 73.9 | 1148.6 | clean | speed (warm): cua faster [-677.65, -666.65], 476.65 ms against pinned's 1148.55 ms; cua:0ms **fail**: cua:0ms: 0 usable samples of 40, fewer than 20; gave the bar up: newest 18 usable of 40; received, coalesced samples (events), raw/moves, median: pinned 768 (768)/768 (58), newest 196 (196)/196 (19), cua 764 (760)/764 (28), cua:0ms 744 (668)/744 (5) | cua PASS, cua:0ms **FAIL** |

Cells where a cua lane missed a run the pinned build took: chrome canvas (cua:0ms).

The judges' verdict for `cua`: PASS.

Declared speed gaps (listed apart, not passes): chrome dnd: cua declared speed gap (#358): cua 368.2 ms against newest's 339.6 ms, the interval [25.2, 32.1] within the declared 40 ms.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 6793 requests, 1321 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

