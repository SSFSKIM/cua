# linux-engine-diff summary

## t67-load2-head (experiment drag)

Every engine drags the same path 40 times per family and kind, in its own window (visible, under load: 2 stress-ng workers per core), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: under load the landed counts decide, cua's at least the pinned build's, 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | cua took | cua:before took | cua warm ms | cua:before warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---|---|---|
| Chrome | range | 40/40 | 40/40 | 40/40 | 140.1 | 200.3 | 548.9 | clean | load: pinned 40/40 (mean 50.6), cua 40/40 (mean 50.6, shortest 50), cua:before 40/40 (mean 50.6, shortest 50); received, coalesced samples (events), raw/moves, median: pinned 231.5 (202.5)/231.5 (22), cua 168.5 (115)/168.5 (9.5), cua:before 185.5 (160.5)/185.5 (12) | cua PASS, cua:before PASS |
| Chrome | scroller | 40/40 | 40/40 | 35/40 | 64.2 | 48.7 | 283.3 | clean | reach (pinned mean 129.9 px): cua 40/40 (shortest 146, mean 146.4), cua:before 15/40 (shortest 90, mean 120); load: pinned 40/40 (mean 129.9), cua 40/40 (mean 146.4, shortest 146), cua:before 35/40 (mean 120, shortest 90); received, coalesced samples (events), raw/moves, median: pinned 55 (50)/0 (0), cua 33 (22)/0 (0), cua:before 40 (34.5)/0 (0) | cua PASS, cua:before **FAIL** |
| Electron (cua fixture) | range | 40/40 | 40/40 | 40/40 | 254.4 | 255.6 | 488 | clean | load: pinned 40/40 (mean 50.5), cua 40/40 (mean 50.6, shortest 50), cua:before 40/40 (mean 50.4, shortest 49); received, coalesced samples (events), raw/moves, median: pinned 203.5 (182)/203.5 (21), cua 164 (109)/164 (9.5), cua:before 179.5 (154)/179.5 (12) | cua PASS, cua:before PASS |
| Electron (cua fixture) | scroller | 40/40 | 40/40 | 34/40 | 253.8 | 253.9 | 284.6 | clean | reach (pinned mean 130.1 px): cua 40/40 (shortest 146, mean 146.4), cua:before 15/40 (shortest 83, mean 119); load: pinned 40/40 (mean 130.1), cua 40/40 (mean 146.4, shortest 146), cua:before 34/40 (mean 119, shortest 83); received, coalesced samples (events), raw/moves, median: pinned 58 (51.5)/0 (0), cua 46 (32)/0 (0), cua:before 49 (37.5)/0 (0) | cua PASS, cua:before **FAIL** |

Cells where a cua lane missed a run the pinned build took: chrome scroller (cua:before); electron scroller (cua:before).

The judges' verdict for `cua`: PASS.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00c0000c; the harness's own trace: 7161 requests, 1596 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

