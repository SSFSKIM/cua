# linux-engine-diff summary

## m4-dev-D1-pilot (experiment drag; development run, not a release gate)

Every engine drags the same path 2 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Chrome | select | 2/2 | 2/2 | 2/2 | 2/2 | 319.8 | 128.9 | 25.8 | 443.1 | clean | received, coalesced samples (events), raw/moves, median: pinned 189 (189)/189 (15.5), newest 53 (53)/53 (8), cua 197.5 (190.5)/197.5 (7.5), cua:0ms 174 (153)/174 (2) | cua PASS, cua:0ms PASS |
| Chrome | range | 2/2 | 2/2 | 2/2 | 2/2 | 319.9 | 128.2 | 24.2 | 446.9 | clean | received, coalesced samples (events), raw/moves, median: pinned 239.5 (239)/239.5 (19), newest 61 (60.5)/61 (7), cua 234.5 (228)/234.5 (8.5), cua:0ms 213 (187)/213 (2.5) | cua PASS, cua:0ms PASS |
| Chrome | scroller | 2/2 | 2/2 | 2/2 | 0/2 | 261.2 | 62.6 | 7.8 | 280.6 | clean | reach (pinned mean 144 px): cua 2/2 (shortest 147, mean 147), cua:0ms 0/2 (shortest 41, mean 58.5); received, coalesced samples (events), raw/moves, median: pinned 60 (60)/0 (0), newest 17 (17)/0 (0), cua 56 (53)/0 (0), cua:0ms 34 (31.5)/0 (0) | cua PASS, cua:0ms **FAIL** |
| Chrome | dnd | 32/32 | 32/32 | 32/32 | 32/32 | 337 | 368.1 | 365.6 | 506.6 | **changed** | speed (warm): cua **declared speed gap (#358)** [25.2, 32.7]: cua 368.1 ms against newest's 337 ms, the interval [25.2, 32.7] above 0; cua:0ms **declared speed gap (#358)** [20.3, 30.6]: cua:0ms 365.6 ms against newest's 337 ms, the interval [20.3, 30.6] above 0; received, coalesced samples (events), raw/moves, median: pinned 9.5 (9.5)/9.5 (2), newest 3 (3)/3 (1), cua 21 (20.5)/21 (1), cua:0ms 82 (76)/83.5 (1) | cua declared speed gap (#358), cua:0ms declared speed gap (#358) |
| Chrome | canvas | 40/40 | 26/40 | 40/40 | 0/40 | 513.5 | 476.5 | 78.1 | 1143.6 | clean | speed (warm): cua faster [-41.75, -34.15], 476.5 ms against newest's 513.3 ms; cua:0ms **fail**: cua:0ms: 0 usable samples of 40, fewer than 20; received, coalesced samples (events), raw/moves, median: pinned 768 (768)/768 (57), newest 196 (196)/196 (19), cua 763 (759)/763 (28), cua:0ms 744.5 (659)/744.5 (5) | cua PASS, cua:0ms **FAIL** |

Cells where a cua lane missed a run the pinned build took: chrome scroller (cua:0ms); chrome canvas (cua:0ms).

The judges' verdict for `cua`: PASS.

Declared speed gaps (listed apart, not passes): chrome dnd: cua declared speed gap (#358): cua 368.1 ms against newest's 337 ms, the interval [25.2, 32.7] within the declared 40 ms.

desktop: started with 0x0060000c active (foreign), ended with 0x0060000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 7089 requests, 1385 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

