# linux-engine-diff summary

## drag-20261108T114903 (experiment drag)

Every engine drags the same path 30 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Chrome | select | 30/30 | 30/30 | 30/30 | 28/30 | 322.5 | 120.1 | 23.7 | 459.5 | clean | received, coalesced samples (events), raw/moves, median: pinned 192 (191)/192 (16), newest 50 (50)/50 (7), cua 188 (183)/188 (8), cua:0ms 171.5 (153)/171.5 (2) | cua PASS, cua:0ms **FAIL** |
| Chrome | range | 30/30 | 30/30 | 30/30 | 30/30 | 325.3 | 120 | 27.4 | 459.3 | clean | received, coalesced samples (events), raw/moves, median: pinned 239 (239)/239 (19.5), newest 50 (50)/50 (8), cua 235 (228.5)/235 (9), cua:0ms 214.5 (188.5)/214.5 (2) | cua PASS, cua:0ms PASS |
| Chrome | scroller | 30/30 | 30/30 | 30/30 | 5/30 | 263.1 | 52.5 | 9.8 | 281.7 | clean | reach (pinned mean 132.7 px): cua 30/30 (shortest 146, mean 146.3), cua:0ms 1/30 (shortest 0, mean 48.8); received, coalesced samples (events), raw/moves, median: pinned 60 (60)/0 (0), newest 17 (17)/0 (0), cua 56 (55)/0 (0), cua:0ms 42.5 (40.5)/0 (0) | cua PASS, cua:0ms **FAIL** |
| Chrome | dnd | 30/30 | 30/30 | 30/30 | 30/30 | 337.7 | 365.5 | 360.3 | 508.1 | **changed** | speed (warm): cua **fail** [25.9, 31]: cua 365.5 ms against newest's 337.7 ms, the interval [25.9, 31] above 0; cua:0ms **fail** [19, 30.4]: cua:0ms 360.3 ms against newest's 337.7 ms, the interval [19, 30.4] above 0; received, coalesced samples (events), raw/moves, median: pinned 10 (10)/10 (2), newest 4 (4)/4 (1), cua 17 (16.5)/17.5 (1), cua:0ms 35 (32)/35 (1) | cua **FAIL**, cua:0ms **FAIL** |
| Chrome | canvas | 40/40 | 22/40 | 40/40 | 1/40 | 518.5 | 446.4 | 75.8 | 1161.1 | clean | speed (warm): cua faster [-80.2, -64.95], 446.4 ms against newest's 517.5 ms; cua:0ms **fail**: cua:0ms: 1 usable samples of 40, fewer than 20; received, coalesced samples (events), raw/moves, median: pinned 768 (768)/768 (58), newest 196 (196)/196 (19), cua 764 (758)/764 (27), cua:0ms 744.5 (662)/744.5 (5) | cua PASS, cua:0ms **FAIL** |
| Firefox | select | 30/30 | 30/30 | 30/30 | 30/30 | 324.1 | 112.8 | 32.6 | 455.6 | clean | received, coalesced samples (events), raw/moves, median: pinned 188 (188)/188 (16), newest 43 (43)/43 (7), cua 114 (114)/114 (5), cua:0ms 24 (24)/24 (2) | cua PASS, cua:0ms PASS |
| Firefox | range | 30/30 | 30/30 | 30/30 | 30/30 | 325.8 | 112.1 | 34.2 | 459 | clean | received, coalesced samples (events), raw/moves, median: pinned 225.5 (225.5)/225.5 (18.5), newest 50 (50)/50 (7), cua 128.5 (128.5)/128.5 (5.5), cua:0ms 30.5 (30.5)/30.5 (2) | cua PASS, cua:0ms PASS |
| Firefox | scroller | 30/30 | 30/30 | 30/30 | 30/30 | 263.1 | 72 | 12 | 282.3 | clean | received, coalesced samples (events), raw/moves, median: pinned 47 (47)/0 (0), newest 10 (10)/0 (0), cua 5 (5)/0 (0), cua:0ms 4 (4)/0 (0) | cua PASS, cua:0ms PASS |
| Firefox | dnd | 30/30 | 30/30 | 30/30 | 0/30 | 347.8 | 130.7 | 42.8 | 521.4 | clean | received, coalesced samples (events), raw/moves, median: pinned 14 (14)/3 (2), newest 10 (10)/2 (1), cua 46 (46)/4 (2), cua:0ms 3 (3)/1 (1) | cua PASS, cua:0ms **FAIL** |
| Firefox | canvas | 40/40 | 25/40 | 40/40 | 0/40 | 519.6 | 324 | 92.7 | 1180.3 | clean | speed (warm): cua faster [-195.5, -190.3], 323.95 ms against newest's 517.25 ms; cua:0ms **fail**: cua:0ms: 0 usable samples of 40, fewer than 20; received, coalesced samples (events), raw/moves, median: pinned 753 (753)/753 (58), newest 180.5 (180.5)/180.5 (19), cua 630 (630)/630 (17), cua:0ms 277.5 (277.5)/277.5 (6) | cua PASS, cua:0ms **FAIL** |
| Electron (cua fixture) | select | 30/30 | 30/30 | 30/30 | 29/30 | 322.6 | 253.7 | 253.8 | 460.6 | clean | received, coalesced samples (events), raw/moves, median: pinned 193 (193)/193 (16), newest 50 (50)/50 (7), cua 189 (185.5)/189 (8), cua:0ms 185 (168)/185 (3) | cua PASS, cua:0ms **FAIL** |
| Electron (cua fixture) | range | 30/30 | 30/30 | 30/30 | 30/30 | 324.3 | 253.7 | 254.3 | 452.9 | clean | received, coalesced samples (events), raw/moves, median: pinned 240.5 (239.5)/240.5 (18.5), newest 50 (50)/50 (8), cua 235.5 (228.5)/235.5 (9), cua:0ms 228.5 (202.5)/228.5 (3) | cua PASS, cua:0ms PASS |
| Electron (cua fixture) | scroller | 30/30 | 30/30 | 30/30 | 5/30 | 264.2 | 253.7 | 254 | 278 | clean | reach (pinned mean 131.9 px): cua 30/30 (shortest 146, mean 146.3), cua:0ms 2/30 (shortest 0, mean 44.1); received, coalesced samples (events), raw/moves, median: pinned 61 (61)/0 (0), newest 17 (17)/0 (0), cua 57 (56)/0 (0), cua:0ms 56 (52.5)/0 (0) | cua PASS, cua:0ms **FAIL** |
| Electron (cua fixture) | dnd | 30/30 | 30/30 | 30/30 | 30/30 | 340.8 | 367.7 | 369.9 | 513.7 | clean | received, coalesced samples (events), raw/moves, median: pinned 10 (10)/10.5 (1), newest 4.5 (4.5)/4.5 (1), cua 19.5 (19.5)/19.5 (1), cua:0ms 75.5 (75.5)/76.5 (1) | cua PASS, cua:0ms PASS |
| Electron (cua fixture) | canvas | 30/30 | 18/30 | 30/30 | 1/30 | 521.3 | 446.4 | 254.7 | 1147.9 | clean | received, coalesced samples (events), raw/moves, median: pinned 769 (769)/769 (57.5), newest 196 (196)/196 (19), cua 765 (761)/765 (27), cua:0ms 753.5 (674)/753.5 (6) | cua PASS, cua:0ms **FAIL** |
| GTK3 gedit | select | 30/30 | 30/30 | 30/30 | 30/30 | 317.9 | 18.3 | 21.5 | 399.9 | clean | – | cua PASS, cua:0ms PASS |
| GTK3 gedit | scrollbar | 30/30 | 30/30 | 30/30 | 30/30 | 315.9 | 18.7 | 20.4 | 402.9 | clean | – | cua PASS, cua:0ms PASS |
| GTK 3 scale (harness scene) | scale | 30/30 | 30/30 | 30/30 | 30/30 | 326.1 | 43.2 | 43.2 | 560.4 | clean | – | cua PASS, cua:0ms PASS |
| GTK4 gnome-text-editor | select | 0/30 | 0/30 | 0/30 | 0/30 | 318.9 | – | – | 409.3 | clean | – | no vendor effect: not judged |
| Qt 5 kate | select | 30/30 | 30/30 | 30/30 | 30/30 | 300.7 | 21.3 | 22 | 370.1 | clean | – | cua PASS, cua:0ms PASS |
| Qt 5 kate | scrollbar | 30/30 | 30/30 | 30/30 | 30/30 | 313.9 | 25.6 | 31.5 | 402.7 | clean | – | cua PASS, cua:0ms PASS |
| Qt 6 qtcreator | select | 30/30 | 30/30 | 30/30 | 30/30 | 300.8 | 29.3 | 32.8 | 362.9 | clean | – | cua PASS, cua:0ms PASS |
| Qt 6 qtcreator | scrollbar | 30/30 | 30/30 | 30/30 | 30/30 | 316.8 | 46.5 | 43 | 403.3 | clean | – | cua PASS, cua:0ms PASS |
| LibreOffice Writer (gtk3) | select | 0/30 | 0/30 | 0/30 | 0/30 | 308 | 17.7 | 17.8 | 376.8 | clean | – | no vendor effect: not judged |
| xterm | select | 30/30 | 29/30 | 30/30 | 30/30 | 286.9 | 12.9 | 13.2 | 329.4 | clean | – | cua PASS, cua:0ms PASS |
| xterm, allowSendEvents on | select | 30/30 | 30/30 | 30/30 | 30/30 | 285.5 | 15.7 | 11.9 | 332.5 | clean | – | cua PASS, cua:0ms PASS |
| GTK 4 input (harness scene) | scale4 | 0/30 | 0/30 | 0/30 | 0/30 | 326 | – | – | 556 | clean | – | no vendor effect: not judged |
| gnome-terminal (VTE) | select | 30/30 | 30/30 | 30/30 | 30/30 | 311.3 | 20.6 | 18.2 | 388.4 | clean | – | cua PASS, cua:0ms PASS |
| LibreOffice Writer (gen, X11 only) | select | 30/30 | 30/30 | 30/30 | 30/30 | 305.7 | 20.8 | 17 | 372.3 | clean | – | cua PASS, cua:0ms PASS |

Cells where a cua lane missed a run the pinned build took: chrome select (cua:0ms); chrome scroller (cua:0ms); chrome canvas (cua:0ms); firefox dnd (cua:0ms); firefox canvas (cua:0ms); electron select (cua:0ms); electron scroller (cua:0ms); electron canvas (cua:0ms).

The judges' verdict for `cua`: **FAIL**: chrome dnd: cua speed: cua 365.5 ms against newest's 337.7 ms, the interval [25.9, 31] above 0.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 54916 requests, 11995 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

