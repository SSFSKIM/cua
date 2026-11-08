# linux-engine-diff summary

## drag-20261108T100202 (experiment drag)

Every engine drags the same path 30 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:e300r20 took | cua:e300r20nd took | cua:e300r10 took | newest warm ms | cua warm ms | cua:e300r20 warm ms | cua:e300r20nd warm ms | cua:e300r10 warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Firefox | select | 30/30 | 30/30 | 30/30 | 30/30 | 30/30 | 30/30 | 324.1 | 141 | 112.3 | 81.6 | 101.8 | 459.9 | clean | received, coalesced samples (events), raw/moves, median: pinned 184.5 (184.5)/184.5 (16), newest 43 (43)/43 (7), cua 161 (161)/161 (7), cua:e300r20 113.5 (113.5)/113.5 (5), cua:e300r20nd 116.5 (116.5)/116.5 (5), cua:e300r10 112 (112)/112 (5) | cua PASS, cua:e300r20 PASS, cua:e300r20nd PASS, cua:e300r10 PASS |
| Firefox | range | 30/30 | 30/30 | 30/30 | 30/30 | 30/30 | 30/30 | 327 | 147.1 | 111.9 | 82.1 | 103 | 459.2 | clean | received, coalesced samples (events), raw/moves, median: pinned 225 (225)/225 (18.5), newest 50 (50)/50 (7), cua 193.5 (193.5)/193.5 (8), cua:e300r20 145 (145)/145 (6), cua:e300r20nd 122.5 (122.5)/122.5 (6), cua:e300r10 118 (118)/118 (5.5) | cua PASS, cua:e300r20 PASS, cua:e300r20nd PASS, cua:e300r10 PASS |
| Firefox | scroller | 30/30 | 30/30 | 30/30 | 30/30 | 30/30 | 30/30 | 266.4 | 67.5 | 71.7 | 41.7 | 61.3 | 281.4 | clean | received, coalesced samples (events), raw/moves, median: pinned 47 (47)/0 (0), newest 11 (11)/0 (0), cua 23 (23)/0 (0), cua:e300r20 5 (5)/0 (0), cua:e300r20nd 5 (5)/0 (0), cua:e300r10 5 (5)/0 (0) | cua PASS, cua:e300r20 PASS, cua:e300r20nd PASS, cua:e300r10 PASS |
| Firefox | dnd | 30/30 | 30/30 | 17/30 | 30/30 | 3/30 | 30/30 | 343.9 | 180.5 | 130.8 | 99.5 | 119.7 | 512.8 | clean | received, coalesced samples (events), raw/moves, median: pinned 14 (14)/3 (2), newest 11 (11)/2 (1), cua 29.5 (29.5)/4.5 (2), cua:e300r20 40 (40)/4 (2), cua:e300r20nd 4 (4)/1 (1), cua:e300r10 44.5 (44.5)/4 (2) | cua **FAIL**, cua:e300r20 PASS, cua:e300r20nd **FAIL**, cua:e300r10 PASS |
| Firefox | canvas | 30/30 | 21/30 | 26/30 | 30/30 | 30/30 | 30/30 | 520.2 | 448.4 | 323.6 | 293.6 | 293.9 | 1187.6 | clean | speed (warm): cua faster [-82.55, -52.5], 449.7 ms against newest's 519.25 ms; cua:e300r20 faster [-199.65, -192.6], 323.6 ms against newest's 519.25 ms; cua:e300r20nd faster [-229.75, -222.5], 293.6 ms against newest's 519.25 ms; cua:e300r10 faster [-229.45, -222.3], 293.9 ms against newest's 519.25 ms; received, coalesced samples (events), raw/moves, median: pinned 753.5 (753.5)/753.5 (58), newest 181 (181)/181 (19), cua 720 (720)/720 (25), cua:e300r20 645.5 (645.5)/645.5 (17), cua:e300r20nd 636.5 (636.5)/636.5 (17), cua:e300r10 636 (636)/636 (16) | cua **FAIL**, cua:e300r20 PASS, cua:e300r20nd PASS, cua:e300r10 PASS |

Cells where a cua lane missed a run the pinned build took: firefox dnd (cua, cua:e300r20nd); firefox canvas (cua).

The judges' verdict for `cua`: **FAIL**: firefox dnd: cua missed runs 1 4 8 10 11 15 17 18 21 23 25 28 29; firefox canvas: cua missed runs 8 19 20 29.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 13015 requests, 2927 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

