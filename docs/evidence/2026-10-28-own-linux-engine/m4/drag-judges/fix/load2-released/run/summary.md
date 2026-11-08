# linux-engine-diff summary

## t65-fix-load2-released (experiment drag)

Every engine drags the same path 40 times per family and kind, in its own window (visible, under load: 2 stress-ng workers per core), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: under load the landed counts decide, cua's at least the pinned build's, 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | cua took | cua warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---|---|---|
| Chrome | range | 40/40 | 39/40 | 299.8 | 514.7 | clean | load: pinned 40/40 (mean 50.5), cua 39/40 (mean 50.5, shortest 48); received, coalesced samples (events), raw/moves, median: pinned 219 (187.5)/219 (21), cua 186.5 (165)/186.5 (13) | cua **FAIL** |
| Chrome | scroller | 40/40 | 34/40 | 152.1 | 286.2 | clean | reach (pinned mean 132.6 px): cua 11/40 (shortest 85, mean 120.1); load: pinned 40/40 (mean 132.6), cua 34/40 (mean 120.1, shortest 85); received, coalesced samples (events), raw/moves, median: pinned 54 (49)/0 (0), cua 43 (35)/0 (0) | cua **FAIL** |
| Electron (cua fixture) | range | 40/40 | 40/40 | 353.9 | 510.5 | clean | load: pinned 40/40 (mean 50.6), cua 40/40 (mean 50.5, shortest 49); received, coalesced samples (events), raw/moves, median: pinned 203.5 (188)/203.5 (21.5), cua 187 (151)/187 (11.5) | cua PASS |
| Electron (cua fixture) | scroller | 40/40 | 35/40 | 354.8 | 283.5 | clean | reach (pinned mean 131.5 px): cua 10/40 (shortest 85, mean 119); load: pinned 40/40 (mean 131.5), cua 35/40 (mean 119, shortest 85); received, coalesced samples (events), raw/moves, median: pinned 59 (53.5)/0 (0), cua 53 (41)/0 (0) | cua **FAIL** |

Cells where a cua lane missed a run the pinned build took: chrome range (cua); chrome scroller (cua); electron scroller (cua).

The judges' verdict for `cua`: **FAIL**: chrome range: cua landed 39 of 40 against the pinned build's 40 of 40; chrome scroller: cua landed 34 of 40 against the pinned build's 40 of 40; electron scroller: cua landed 35 of 40 against the pinned build's 40 of 40.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00c0000c; the harness's own trace: 4866 requests, 1071 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

