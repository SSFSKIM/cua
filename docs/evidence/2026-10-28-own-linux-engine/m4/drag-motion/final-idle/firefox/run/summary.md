# linux-engine-diff summary

## drag-20261108T174045 (experiment drag)

Every engine drags the same path 30 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:before took | newest warm ms | cua warm ms | cua:before warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Firefox | select | 30/30 | 30/30 | 30/30 | 30/30 | 323.7 | 122.9 | 144.7 | 466.4 | clean | received, coalesced samples (events), raw/moves, median: pinned 187.5 (187.5)/187.5 (16), newest 42 (42)/42 (7), cua 115 (115)/115 (5), cua:before 159.5 (159.5)/159.5 (7) | cua PASS, cua:before PASS |
| Firefox | range | 30/30 | 30/30 | 30/30 | 30/30 | 325.1 | 122.1 | 149.6 | 461.6 | clean | received, coalesced samples (events), raw/moves, median: pinned 223.5 (223.5)/223.5 (18.5), newest 50.5 (50.5)/50.5 (7), cua 131 (131)/131 (5.5), cua:before 198.5 (198.5)/198.5 (8.5) | cua PASS, cua:before PASS |
| Firefox | scroller | 30/30 | 30/30 | 30/30 | 30/30 | 263.5 | 81.2 | 65.6 | 281.3 | clean | received, coalesced samples (events), raw/moves, median: pinned 47 (47)/0 (0), newest 10 (10)/0 (0), cua 5 (5)/0 (0), cua:before 24 (24)/0 (0) | cua PASS, cua:before PASS |
| Firefox | dnd | 30/30 | 30/30 | 30/30 | 19/30 | 342.6 | 140.8 | 185.2 | 521.4 | clean | received, coalesced samples (events), raw/moves, median: pinned 14 (14)/3 (2), newest 11 (11)/2 (2), cua 4 (4)/1.5 (1.5), cua:before 29 (29)/4 (2) | cua PASS, cua:before **FAIL** |
| Firefox | canvas | 30/30 | 24/30 | 30/30 | 28/30 | 522.3 | 354.3 | 440.1 | 1174.5 | clean | speed (warm): cua faster [-170.9, -160.2], 354.3 ms against newest's 521.2 ms; cua:before faster [-89.8, -73.7], 439.5 ms against newest's 521.2 ms; received, coalesced samples (events), raw/moves, median: pinned 755 (755)/755 (57.5), newest 180.5 (180.5)/180.5 (19), cua 620.5 (620.5)/620.5 (19), cua:before 719 (719)/719 (25) | cua PASS, cua:before **FAIL** |
| Firefox | handle-canvas | 30/30 | 30/30 | 30/30 | 5/30 | 291.9 | 208.4 | 88.7 | 299.3 | **changed** | control (no press) took 0/30; received, coalesced samples (events), raw/moves, median: pinned 32 (32)/32 (16), newest 30 (30)/30 (16), cua 25 (25)/25 (8), cua:before 23 (23)/23 (2) | cua PASS, cua:before **FAIL** |
| Firefox | handle-dnd | 30/30 | 30/30 | 30/30 | 4/30 | 181.6 | 204.8 | 112.3 | 182.8 | **changed** | control (no press) took 0/30; received, coalesced samples (events), raw/moves, median: pinned 3 (3)/1 (1), newest 3 (3)/1 (1), cua 2 (2)/1 (1), cua:before 11.5 (11.5)/0 (0) | cua PASS, cua:before **FAIL** |

Cells where a cua lane missed a run the pinned build took: firefox dnd (cua:before); firefox canvas (cua:before); firefox handle-canvas (cua:before); firefox handle-dnd (cua:before).

The judges' verdict for `cua`: PASS.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 13414 requests, 2909 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

