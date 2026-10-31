# linux-engine-diff summary

## m31-kinds-partial (experiment kinds)

Each lane sends the same request 10 times per family and kind to its own window (partial); `xtest` is the control: the window activated, then the request through XTEST (kinds.mjs). A scroll is 300 px, down then up.

| family | kind | pinned took | cua took | xtest took | background witness | verdict |
|---|---|---:|---:|---:|---|---|
| Firefox | scroll (page status) | 10/10 | 10/10 | 10/10 | clean | taken |
| Firefox | move (page status) | 10/10 | 10/10 | 10/10 | clean | taken |
| Firefox | click (page status) | 10/10 | 0/10 | 10/10 | clean | undecided |
| Chrome | scroll (page status) | 10/10 | 10/10 | 10/10 | clean | taken |
| Chrome | move (page status) | 10/10 | 10/10 | 10/10 | clean | taken |
| Chrome | click (page status) | 10/10 | 10/10 | 10/10 | clean | taken |
| Electron (cua fixture) | scroll (page status) | 10/10 | 10/10 | 10/10 | clean | taken |
| Electron (cua fixture) | move (page status) | 10/10 | 10/10 | 10/10 | clean | taken |
| Electron (cua fixture) | click (page status) | 10/10 | 10/10 | 10/10 | clean | taken |

No kind was shown ignored.
Undecided (the control missed, or the background lanes took some runs): firefox click.

## m31-kinds-covered (experiment kinds)

Each lane sends the same request 10 times per family and kind to its own window (covered); `xtest` is the control: the window activated, then the request through XTEST (kinds.mjs). A scroll is 300 px, down then up.

| family | kind | pinned took | cua took | xtest took | background witness | verdict |
|---|---|---:|---:|---:|---|---|
| Chrome | scroll (page status) | 1/10 | 10/10 | 10/10 | clean | taken |
| Chrome | move (page status) | 10/10 | 10/10 | 10/10 | clean | taken |
| Chrome | click (page status) | 10/10 | 10/10 | 10/10 | clean | taken |
| Firefox | scroll (page status) | 0/10 | 0/10 | 10/10 | clean | **ignored** |
| Firefox | move (page status) | 0/10 | 0/10 | 10/10 | clean | **ignored** |
| Firefox | click (page status) | 0/10 | 0/10 | 10/10 | clean | **ignored** |
| Electron (cua fixture) | scroll (page status) | 1/10 | 10/10 | 10/10 | clean | taken |
| Electron (cua fixture) | move (page status) | 10/10 | 10/10 | 10/10 | clean | taken |
| Electron (cua fixture) | click (page status) | 10/10 | 10/10 | 10/10 | clean | taken |
| GTK3 gedit | scroll (scroll bar value) | 10/10 | 10/10 | 10/10 | clean | taken |
| GTK4 gnome-text-editor | scroll (scroll bar value) | 0/10 | 0/10 | 10/10 | clean | **ignored** |
| GTK 4 input (harness scene) | scroll (status line) | 0/10 | 0/10 | 10/10 | clean | **ignored** |
| GTK 4 input (harness scene) | move (status line) | 0/10 | 0/10 | 10/10 | clean | **ignored** |
| GTK 4 input (harness scene) | click (status line) | 0/10 | 0/10 | 10/10 | clean | **ignored** |
| Qt 5 kate | scroll (scroll bar value) | 0/10 | 0/10 | 10/10 | clean | **ignored** |
| Qt 6 qtcreator | scroll (scroll bar value) | 0/10 | 0/10 | 10/10 | clean | **ignored** |
| LibreOffice Writer (gtk3) | scroll (scroll bar value) | 10/10 | 10/10 | 10/10 | clean | taken |
| LibreOffice Writer (gen, X11 only) | scroll (pixels) | 10/10 | 10/10 | 10/10 | clean | taken |
| xterm | scroll (wheel report) | 10/10 | 10/10 | 10/10 | clean | taken |
| xterm, allowSendEvents on | scroll (wheel report) | 0/10 | 0/10 | 0/10 | clean | undecided |
| gnome-terminal (VTE) | scroll (wheel report) | 10/10 | 10/10 | 10/10 | clean | taken |

Ignored on the background route: firefox scroll; firefox move; firefox click; gnome-text-editor scroll; gtk4-input scroll; gtk4-input move; gtk4-input click; kate scroll; qtcreator scroll.
Undecided (the control missed, or the background lanes took some runs): xterm-allow scroll.

## m31-drag-partial (experiment drag)

Every engine drags the same path 10 times per family and kind, in its own window (partial), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.

| family | kind | pinned took | cua took | xtest took | cua drag ms | xtest drag ms | pinned drag ms | witness | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---|---|
| Firefox | select | 10/10 | 10/10 | 10/10 | 247.5 | 207.6 | 467.5 | **changed** | cua PASS |
| Firefox | range | 10/10 | 10/10 | 10/10 | 264.5 | 201.5 | 510.6 | **changed** | cua PASS |
| Firefox | scroller | 10/10 | 10/10 | 10/10 | 174.2 | 101.6 | 283.5 | **changed** | cua PASS |
| Firefox | dnd | 10/10 | 10/10 | 4/10 | 471.6 | 530.3 | 622.3 | **changed** | cua PASS |
| Chrome | select | 10/10 | 10/10 | 10/10 | 256.8 | 245 | 460.7 | **changed** | cua PASS |
| Chrome | range | 10/10 | 10/10 | 10/10 | 280.7 | 254.4 | 500.8 | **changed** | cua PASS |
| Chrome | scroller | 10/10 | 10/10 | 10/10 | 147.3 | 90 | 280.2 | **changed** | cua PASS |
| Chrome | dnd | 10/10 | 10/10 | 10/10 | 499.3 | 647 | 616.4 | **changed** | cua PASS |
| Electron (cua fixture) | select | 10/10 | 10/10 | 10/10 | 256.6 | 255.1 | 469.2 | **changed** | cua PASS |
| Electron (cua fixture) | range | 10/10 | 10/10 | 10/10 | 279.9 | 247.7 | 506 | **changed** | cua PASS |
| Electron (cua fixture) | scroller | 10/10 | 10/10 | 10/10 | 145.2 | 87.1 | 278.7 | **changed** | cua PASS |
| Electron (cua fixture) | dnd | 10/10 | 10/10 | 10/10 | 499.3 | 627.3 | 612.2 | **changed** | cua PASS |

No cua lane missed a run the pinned build took.

## m31-drag-covered (experiment drag)

Every engine drags the same path 10 times per family and kind, in its own window (covered), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.

| family | kind | pinned took | cua took | xtest took | cua drag ms | xtest drag ms | pinned drag ms | witness | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---|---|
| Chrome | select | 0/10 | 0/10 | 0/10 | 249.5 | 240 | 457.4 | **changed** | no pinned effect: not judged |
| Chrome | range | 10/10 | 10/10 | 0/10 | 280.2 | 232 | 499.3 | **changed** | cua PASS |
| Chrome | scroller | 0/10 | 0/10 | 0/10 | 146.5 | 86 | 279.3 | **changed** | no pinned effect: not judged |
| Chrome | dnd | 0/10 | 0/10 | 10/10 | 279.8 | 621.2 | 511 | **changed** | no pinned effect: not judged |
| Chrome | canvas | 10/10 | 10/10 | 10/10 | 662 | 721.2 | 1145 | **changed** | cua PASS |
| Firefox | select | 0/10 | 0/10 | 0/10 | 240.7 | 221 | 456.1 | **changed** | no pinned effect: not judged |
| Firefox | range | 0/10 | 0/10 | 0/10 | 261 | 210.1 | 496.4 | **changed** | no pinned effect: not judged |
| Firefox | scroller | 0/10 | 0/10 | 0/10 | 166.4 | 105.3 | 277.8 | **changed** | no pinned effect: not judged |
| Firefox | dnd | 0/10 | 0/10 | 5/10 | 260.2 | 535.9 | 512 | **changed** | no pinned effect: not judged |
| Firefox | canvas | 0/10 | 0/10 | 10/10 | 520.6 | 574.2 | 1150.9 | **changed** | no pinned effect: not judged |
| Electron (cua fixture) | select | 0/10 | 0/10 | 0/10 | 251.8 | 236.7 | 460 | **changed** | no pinned effect: not judged |
| Electron (cua fixture) | range | 9/10 | 10/10 | 0/10 | 275.9 | 250 | 499.1 | **changed** | cua PASS |
| Electron (cua fixture) | scroller | 0/10 | 0/10 | 0/10 | 148.2 | 89.4 | 278.1 | **changed** | no pinned effect: not judged |
| Electron (cua fixture) | dnd | 0/10 | 0/10 | 10/10 | 281.3 | 640.6 | 510 | **changed** | no pinned effect: not judged |
| Electron (cua fixture) | canvas | 10/10 | 10/10 | 10/10 | 645 | 711.7 | 1138.7 | **changed** | cua PASS |
| GTK3 gedit | select | 10/10 | 10/10 | 10/10 | 121.5 | 78 | 395.3 | **changed** | cua PASS |
| GTK3 gedit | scrollbar | 10/10 | 10/10 | 10/10 | 120.2 | 22.8 | 396.5 | **changed** | cua PASS |
| GTK 3 scale (harness scene) | scale | 10/10 | 10/10 | 10/10 | 139.7 | 94.7 | 622.2 | **changed** | cua PASS |
| GTK4 gnome-text-editor | select | 0/10 | 0/10 | 0/10 | 120.2 | 94.8 | 411 | **changed** | no pinned effect: not judged |
| Qt 5 kate | select | 10/10 | 10/10 | 10/10 | 117.2 | 102.4 | 357.7 | **changed** | cua PASS |
| Qt 5 kate | scrollbar | 10/10 | 10/10 | 10/10 | 135.6 | 159.1 | 536.5 | **changed** | cua PASS |
| Qt 6 qtcreator | select | 10/10 | 10/10 | 10/10 | 116.3 | 80.4 | 356.8 | **changed** | cua PASS |
| Qt 6 qtcreator | scrollbar | 10/10 | 10/10 | 10/10 | 126 | 101.4 | 391 | **changed** | cua PASS |
| LibreOffice Writer (gtk3) | select | 10/10 | 10/10 | 10/10 | 117.8 | 78 | 374.5 | **changed** | cua PASS |
| xterm | select | 10/10 | 10/10 | 10/10 | 112.3 | 94 | 333.1 | **changed** | cua PASS |
| xterm, allowSendEvents on | select | 10/10 | 10/10 | 10/10 | 115.6 | 102.1 | 332.1 | **changed** | cua PASS |
| GTK 4 input (harness scene) | scale4 | 0/10 | 0/10 | 0/10 | 138.5 | 88 | 612.8 | **changed** | no pinned effect: not judged |
| gnome-terminal (VTE) | select | 0/10 | 0/10 | 0/10 | 121.1 | 81.2 | 396.3 | **changed** | no pinned effect: not judged |
| LibreOffice Writer (gen, X11 only) | – | **failed: The "file" argument must be of type string. Received undefined** |

No cua lane missed a run the pinned build took.

## m31-kinds-visible (experiment kinds)

Each lane sends the same request 10 times per family and kind to its own window (visible); `xtest` is the control: the window activated, then the request through XTEST (kinds.mjs). A scroll is 300 px, down then up.

| family | kind | pinned took | cua took | xtest took | background witness | verdict |
|---|---|---:|---:|---:|---|---|
| Chrome | scroll (page status) | 10/10 | 10/10 | 10/10 | clean | taken |
| Chrome | move (page status) | 10/10 | 10/10 | 10/10 | clean | taken |
| Chrome | click (page status) | 10/10 | 10/10 | 10/10 | clean | taken |
| Firefox | scroll (page status) | 10/10 | 10/10 | 10/10 | clean | taken |
| Firefox | move (page status) | 10/10 | 10/10 | 10/10 | clean | taken |
| Firefox | click (page status) | 10/10 | 10/10 | 10/10 | clean | taken |
| Electron (cua fixture) | scroll (page status) | 10/10 | 10/10 | 10/10 | clean | taken |
| Electron (cua fixture) | move (page status) | 10/10 | 10/10 | 10/10 | clean | taken |
| Electron (cua fixture) | click (page status) | 10/10 | 10/10 | 10/10 | clean | taken |
| GTK3 gedit | scroll (scroll bar value) | 10/10 | 10/10 | 10/10 | clean | taken |
| GTK3 gedit | move (hover pixels) | 10/10 | 10/10 | 10/10 | clean | taken |
| GTK4 gnome-text-editor | scroll (scroll bar value) | 0/10 | 0/10 | 10/10 | clean | **ignored** |
| GTK 4 input (harness scene) | scroll (status line) | 0/10 | 0/10 | 10/10 | clean | **ignored** |
| GTK 4 input (harness scene) | move (status line) | 0/10 | 0/10 | 10/10 | clean | **ignored** |
| GTK 4 input (harness scene) | click (status line) | 0/10 | 0/10 | 10/10 | clean | **ignored** |
| Qt 5 kate | scroll (scroll bar value) | 0/10 | 0/10 | 10/10 | clean | **ignored** |
| Qt 5 kate | move (hover pixels) | 0/10 | 0/10 | 10/10 | clean | **ignored** |
| Qt 6 qtcreator | scroll (scroll bar value) | 0/10 | 0/10 | 10/10 | clean | **ignored** |
| Qt 6 qtcreator | move (hover pixels) | 10/10 | 10/10 | 10/10 | clean | taken |
| LibreOffice Writer (gtk3) | scroll (scroll bar value) | 10/10 | 10/10 | 10/10 | clean | taken |
| LibreOffice Writer (gtk3) | move (hover pixels) | 0/10 | 0/10 | 0/10 | clean | undecided |
| LibreOffice Writer (gen, X11 only) | scroll (pixels) | 10/10 | 10/10 | 10/10 | clean | taken |
| LibreOffice Writer (gen, X11 only) | move (hover pixels) | 10/10 | 10/10 | 10/10 | clean | taken |
| xterm | scroll (wheel report) | 10/10 | 10/10 | 10/10 | clean | taken |
| xterm | move (motion report) | 10/10 | 10/10 | 10/10 | clean | taken |
| xterm, allowSendEvents on | scroll (wheel report) | 0/10 | 0/10 | 0/10 | clean | undecided |
| xterm, allowSendEvents on | move (motion report) | 0/10 | 0/10 | 0/10 | clean | undecided |
| gnome-terminal (VTE) | scroll (wheel report) | 10/10 | 10/10 | 10/10 | clean | taken |
| gnome-terminal (VTE) | move (motion report) | 10/10 | 10/10 | 10/10 | clean | taken |

Ignored on the background route: gnome-text-editor scroll; gtk4-input scroll; gtk4-input move; gtk4-input click; kate scroll; kate move; qtcreator scroll.
Undecided (the control missed, or the background lanes took some runs): writer move; xterm-allow scroll; xterm-allow move.

## m31-drag-visible-new (experiment drag)

Every engine drags the same path 10 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.

| family | kind | pinned took | cua took | xtest took | cua drag ms | xtest drag ms | pinned drag ms | witness | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---|---|
| GTK 4 input (harness scene) | scale4 | 0/10 | 0/10 | 0/10 | 137.4 | 92.9 | 614.6 | **changed** | no pinned effect: not judged |
| gnome-terminal (VTE) | select | 10/10 | 10/10 | 10/10 | 121.5 | 76.7 | 390 | **changed** | cua PASS |
| LibreOffice Writer (gen, X11 only) | select | 10/10 | 10/10 | 10/10 | 163.8 | 129.3 | 400.1 | **changed** | cua PASS |

No cua lane missed a run the pinned build took.

## m31-qt-covered (experiment kinds)

Each lane sends the same request 10 times per family and kind to its own window (covered); `xtest` is the control: the window activated, then the request through XTEST (kinds.mjs). A scroll is 300 px, down then up.

| family | kind | pinned took | cua took | xtest took | background witness | verdict |
|---|---|---:|---:|---:|---|---|
| Qt 5 input (harness scene) | scroll (event counts) | 0/10 | 0/10 | 10/10 | clean | **ignored** |
| Qt 5 input (harness scene) | move (event counts) | 9/10 | 9/10 | 9/10 | clean | undecided |
| Qt 5 input (harness scene) | click (event counts) | 10/10 | 10/10 | 10/10 | clean | taken |
| Qt 6 input (harness scene) | scroll (event counts) | 0/10 | 0/10 | 10/10 | clean | **ignored** |
| Qt 6 input (harness scene) | move (event counts) | 9/10 | 9/10 | 9/10 | clean | undecided |
| Qt 6 input (harness scene) | click (event counts) | 10/10 | 10/10 | 10/10 | clean | taken |

Ignored on the background route: qt5-input scroll; qt6-input scroll.
Undecided (the control missed, or the background lanes took some runs): qt5-input move; qt6-input move.

## m31-qt-visible (experiment kinds)

Each lane sends the same request 10 times per family and kind to its own window (visible); `xtest` is the control: the window activated, then the request through XTEST (kinds.mjs). A scroll is 300 px, down then up.

| family | kind | pinned took | cua took | xtest took | background witness | verdict |
|---|---|---:|---:|---:|---|---|
| Qt 5 input (harness scene) | scroll (event counts) | 0/10 | 0/10 | 10/10 | clean | **ignored** |
| Qt 5 input (harness scene) | move (event counts) | 9/10 | 9/10 | 9/10 | clean | undecided |
| Qt 5 input (harness scene) | click (event counts) | 10/10 | 10/10 | 10/10 | clean | taken |
| Qt 6 input (harness scene) | scroll (event counts) | 0/10 | 0/10 | 10/10 | clean | **ignored** |
| Qt 6 input (harness scene) | move (event counts) | 9/10 | 9/10 | 9/10 | clean | undecided |
| Qt 6 input (harness scene) | click (event counts) | 10/10 | 10/10 | 10/10 | clean | taken |

Ignored on the background route: qt5-input scroll; qt6-input scroll.
Undecided (the control missed, or the background lanes took some runs): qt5-input move; qt6-input move.

## m31-dnd-visible (experiment dnd)

HTML5 drag and drop (pages/drag.html's `dnd` path), 10 drags a lane, each window visible (dnd.mjs). Columns: drops that landed; runs whose witness changed, by field; runs that took XdndSelection; runs where a grab was in force during the drag; runs with a grab left after the answer; runs whose active window, focus or stacking differed from before right after the answer, and 1 s later.

| family | lane | drops | witness changed | took XdndSelection | grab during | grab after | changed at the answer | changed 1 s later |
|---|---|---:|---|---:|---:|---:|---|---|
| chrome | pinned | 9/10 | stacking 9, active 9, focus 9 | 9/10 | 9/10 | 0/10 | active 9, focus 9, stacking 9 | active 9, focus 9, stacking 9 |
| chrome | newest | 8/10 | stacking 8, focus 8, active 8 | 8/10 | 8/10 | 0/10 | active 8, focus 8, stacking 8 | active 8, focus 8, stacking 8 |
| chrome | cua | 10/10 | stacking 10, focus 10, active 10 | 10/10 | 10/10 | 0/10 | active 10, focus 10, stacking 10 | active 10, focus 10, stacking 10 |
| electron | pinned | 10/10 | none | 10/10 | 10/10 | 0/10 | none | none |
| electron | newest | 10/10 | none | 10/10 | 10/10 | 0/10 | none | none |
| electron | cua | 10/10 | none | 10/10 | 10/10 | 0/10 | none | none |
| firefox | pinned | 10/10 | none | 10/10 | 10/10 | 0/10 | none | none |
| firefox | newest | 10/10 | none | 10/10 | 10/10 | 0/10 | none | none |
| firefox | cua | 10/10 | none | 10/10 | 10/10 | 0/10 | none | none |

## m31-drag-partial-top (experiment drag)

Every engine drags the same path 10 times per family and kind, in its own window (partial-top), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.

| family | kind | pinned took | cua took | xtest took | cua drag ms | xtest drag ms | pinned drag ms | witness | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---|---|
| Chrome | select | 0/10 | 0/10 | 0/10 | 252.4 | 243.8 | 462 | **changed** | no pinned effect: not judged |
| Chrome | range | 10/10 | 10/10 | 0/10 | 276.5 | 260.2 | 500.1 | **changed** | cua PASS |
| Chrome | scroller | 0/10 | 0/10 | 0/10 | 146.9 | 85.3 | 279.1 | **changed** | no pinned effect: not judged |
| Chrome | dnd | 0/10 | 0/10 | 10/10 | 283.8 | 632.2 | 511.8 | **changed** | no pinned effect: not judged |
| Chrome | canvas | 10/10 | 10/10 | 10/10 | 650 | 729.5 | 1167.7 | **changed** | cua PASS |
| Electron (cua fixture) | select | 10/10 | 10/10 | 10/10 | 254.6 | 241.4 | 453.6 | **changed** | cua PASS |
| Electron (cua fixture) | range | 10/10 | 10/10 | 0/10 | 278.1 | 234.8 | 505 | **changed** | cua PASS |
| Electron (cua fixture) | scroller | 0/10 | 0/10 | 0/10 | 148 | 89.5 | 279.2 | **changed** | no pinned effect: not judged |
| Electron (cua fixture) | dnd | 0/10 | 0/10 | 10/10 | 283.1 | 670.3 | 510.3 | **changed** | no pinned effect: not judged |
| Electron (cua fixture) | canvas | 10/10 | 10/10 | 10/10 | 656 | 741.6 | 1149 | **changed** | cua PASS |

No cua lane missed a run the pinned build took.

## m31-dnd-candidate (experiment dnd)

HTML5 drag and drop (pages/drag.html's `dnd` path), 10 drags a lane, each window visible (dnd.mjs). Columns: drops that landed; answers that refused the drop as declared (deviations.mjs) / that said the drop may have happened; runs whose witness changed, by field; runs that took XdndSelection; runs where a grab was in force during the drag; runs with a grab left after the answer; runs whose active window, focus or stacking differed from before right after the answer, and 1 s later.

| family | lane | drops | refused / may have dropped | witness changed | took XdndSelection | grab during | grab after | changed at the answer | changed 1 s later |
|---|---|---:|---|---|---:|---:|---:|---|---|
| chrome | pinned | 8/10 | 0 / 0 | stacking 8, focus 8, active 8 | 8/10 | 8/10 | 0/10 | active 8, focus 8, stacking 8 | active 8, focus 8, stacking 8 |
| chrome | cua | 0/10 | 10 / 0 | none | 10/10 | 0/10 | 0/10 | none | none |
| chrome | cua:active | 10/10 | 0 / 0 | stacking 10 | 10/10 | 10/10 | 0/10 | none | none |
| chrome | cua:dedicated | 10/10 | 0 / 0 | stacking 10, focus 10, active 10 | 10/10 | 10/10 | 0/10 | active 10, focus 10, stacking 10 | active 10, focus 10, stacking 10 |
| chrome | cua:late | 10/10 | 0 / 10 | stacking 10, focus 10, active 10 | 10/10 | 10/10 | 0/10 | active 10, focus 10, stacking 10 | active 10, focus 10, stacking 10 |

## m31-dnd-candidate-stats (experiment dnd)

HTML5 drag and drop (pages/drag.html's `dnd` path), 10 drags a lane, each window visible (dnd.mjs). Columns: drops that landed; answers that refused the drop as declared (deviations.mjs) / that said the drop may have happened; runs whose witness changed, by field; runs that took XdndSelection; runs where a grab was in force during the drag; runs with a grab left after the answer; runs whose active window, focus or stacking differed from before right after the answer, and 1 s later.

| family | lane | drops | refused / may have dropped | witness changed | took XdndSelection | grab during | grab after | changed at the answer | changed 1 s later |
|---|---|---:|---|---|---:|---:|---:|---|---|
| chrome | cua | 0/10 | 10 / 0 | none | 10/10 | 0/10 | 0/10 | none | none |
| chrome | cua:active | 10/10 | 0 / 0 | stacking 10 | 10/10 | 10/10 | 0/10 | none | none |
| chrome | cua:late | 10/10 | 0 / 10 | stacking 10, focus 10, active 10 | 10/10 | 10/10 | 0/10 | active 10, focus 10, stacking 10 | active 10, focus 10, stacking 10 |

## m31-qt-style (experiment kinds)

Each lane sends the same request 10 times per family and kind to its own window (visible); `xtest` is the control: the window activated, then the request through XTEST (kinds.mjs). A scroll is 300 px, down then up.

| family | kind | pinned took | cua took | xtest took | background witness | verdict |
|---|---|---:|---:|---:|---|---|
| Qt 5 Breeze (harness scene) | move (hover pixels) | 8/10 | 8/10 | 10/10 | clean | undecided |
| Qt 5 Fusion (harness scene) | move (hover pixels) | 10/10 | 10/10 | 10/10 | clean | taken |

No kind was shown ignored.
Undecided (the control missed, or the background lanes took some runs): qt5-breeze move.

## m31-move-covered (experiment kinds)

Each lane sends the same request 10 times per family and kind to its own window (covered); `xtest` is the control: the window activated, then the request through XTEST (kinds.mjs). A scroll is 300 px, down then up.

| family | kind | pinned took | cua took | xtest took | background witness | verdict |
|---|---|---:|---:|---:|---|---|
| Chrome | move (page status) | 10/10 | 10/10 | 10/10 | clean | taken |
| Firefox | move (page status) | 0/10 | 0/10 | 10/10 | clean | **ignored** |
| Electron (cua fixture) | move (page status) | 10/10 | 10/10 | 10/10 | clean | taken |
| GTK3 gedit | move (hover pixels) | 10/10 | 10/10 | 5/10 | clean | taken |
| GTK 4 input (harness scene) | move (status line) | 0/10 | 0/10 | 10/10 | clean | **ignored** |
| Qt 5 kate | move (hover pixels) | 0/10 | 0/10 | 10/10 | clean | **ignored** |
| Qt 6 qtcreator | move (hover pixels) | 8/10 | 8/10 | 5/10 | clean | undecided |
| LibreOffice Writer (gtk3) | move (hover pixels) | 10/10 | 10/10 | 5/10 | clean | taken |
| LibreOffice Writer (gen, X11 only) | move (hover pixels) | 10/10 | 10/10 | 5/10 | clean | taken |
| xterm | move (motion report) | 10/10 | 10/10 | 10/10 | clean | taken |
| xterm, allowSendEvents on | move (motion report) | 0/10 | 0/10 | 0/10 | clean | undecided |
| gnome-terminal (VTE) | move (motion report) | 10/10 | 10/10 | 10/10 | clean | taken |
| Qt 5 input (harness scene) | move (event counts) | 10/10 | 10/10 | 10/10 | clean | taken |
| Qt 6 input (harness scene) | move (event counts) | 10/10 | 10/10 | 10/10 | clean | taken |
| Qt 5 Breeze (harness scene) | move (hover pixels) | 8/10 | 8/10 | 5/10 | clean | undecided |
| Qt 5 Fusion (harness scene) | move (hover pixels) | 8/10 | 8/10 | 5/10 | clean | undecided |

Ignored on the background route: firefox move; gtk4-input move; kate move.
Undecided (the control missed, or the background lanes took some runs): qtcreator move; xterm-allow move; qt5-breeze move; qt5-fusion move.

## m31-move-visible-writer (experiment kinds)

Each lane sends the same request 10 times per family and kind to its own window (visible); `xtest` is the control: the window activated, then the request through XTEST (kinds.mjs). A scroll is 300 px, down then up.

| family | kind | pinned took | cua took | xtest took | background witness | verdict |
|---|---|---:|---:|---:|---|---|
| LibreOffice Writer (gtk3) | move (hover pixels) | 10/10 | 10/10 | 10/10 | clean | taken |

No kind was shown ignored.

## m31-kinds-partial-deep (experiment kinds)

Each lane sends the same request 10 times per family and kind to its own window (partial-deep); `xtest` is the control: the window activated, then the request through XTEST (kinds.mjs). A scroll is 300 px, down then up.

| family | kind | pinned took | cua took | xtest took | background witness | verdict |
|---|---|---:|---:|---:|---|---|
| Firefox | scroll (page status) | 0/10 | 0/10 | 10/10 | clean | **ignored** |
| Firefox | move (page status) | 10/10 | 10/10 | 10/10 | clean | taken |
| Firefox | click (page status) | 10/10 | 0/10 | 10/10 | clean | undecided |

Ignored on the background route: firefox scroll.
Undecided (the control missed, or the background lanes took some runs): firefox click.

## m31-drag-partial-deep (experiment drag)

Every engine drags the same path 10 times per family and kind, in its own window (partial-deep), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.

| family | kind | pinned took | cua took | xtest took | cua drag ms | xtest drag ms | pinned drag ms | witness | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---|---|
| Firefox | select | 10/10 | 10/10 | 10/10 | 245.8 | 222.7 | 472.2 | **changed** | cua PASS |
| Firefox | range | 10/10 | 10/10 | 10/10 | 276.1 | 208.2 | 519.4 | **changed** | cua PASS |

No cua lane missed a run the pinned build took.

## m31-drag-covered-2 (experiment drag)

Every engine drags the same path 10 times per family and kind, in its own window (covered), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.

| family | kind | pinned took | cua took | xtest took | cua drag ms | xtest drag ms | pinned drag ms | witness | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---|---|
| gnome-terminal (VTE) | select | 10/10 | 10/10 | 10/10 | 119.8 | 77.8 | 399 | **changed** | cua PASS |
| LibreOffice Writer (gen, X11 only) | select | 10/10 | 10/10 | 10/10 | 115.7 | 129.4 | 374.8 | **changed** | cua PASS |

No cua lane missed a run the pinned build took.

## m31-dnd-covered (experiment dnd)

HTML5 drag and drop (pages/drag.html's `dnd` path), 10 drags a lane, each window covered (dnd.mjs). Columns: drops that landed; answers that refused the drop as declared (deviations.mjs) / that said the drop may have happened; runs whose witness changed, by field; runs that took XdndSelection; runs where a grab was in force during the drag; runs with a grab left after the answer; runs whose active window, focus or stacking differed from before right after the answer, and 1 s later.

| family | lane | drops | refused / may have dropped | witness changed | took XdndSelection | grab during | grab after | changed at the answer | changed 1 s later |
|---|---|---:|---|---|---:|---:|---:|---|---|
| chrome | pinned | 0/10 | 0 / 0 | none | 0/10 | 10/10 | 0/10 | none | none |
| chrome | newest | 0/10 | 0 / 0 | none | 4/10 | 10/10 | 0/10 | none | none |
| chrome | cua | 0/10 | 0 / 0 | none | 0/10 | 10/10 | 0/10 | none | none |

## m31-dnd-load (experiment dnd)

HTML5 drag and drop (pages/drag.html's `dnd` path), 20 drags a lane, each window visible (dnd.mjs). Columns: drops that landed; answers that refused the drop as declared (deviations.mjs) / that said the drop may have happened; runs whose witness changed, by field; runs that took XdndSelection; runs where a grab was in force during the drag; runs with a grab left after the answer; runs whose active window, focus or stacking differed from before right after the answer, and 1 s later.

| family | lane | drops | refused / may have dropped | witness changed | took XdndSelection | grab during | grab after | changed at the answer | changed 1 s later |
|---|---|---:|---|---|---:|---:|---:|---|---|
| chrome | pinned | 17/20 | 0 / 0 | stacking 17, active 17, focus 17 | 17/20 | 17/20 | 0/20 | active 17, focus 17, stacking 17 | active 17, focus 17, stacking 17 |
| chrome | cua:active | 20/20 | 0 / 0 | stacking 20 | 20/20 | 20/20 | 0/20 | none | none |
| chrome | cua:dedicated | 18/20 | 0 / 0 | stacking 18, active 18, focus 18 | 18/20 | 18/20 | 0/20 | active 18, focus 18, stacking 18 | active 18, focus 18, stacking 18 |
| chrome | cua:active-rd30 | 19/20 | 0 / 0 | stacking 19 | 19/20 | 19/20 | 0/20 | none | none |
| chrome | cua:dedicated-rd30 | 18/20 | 0 / 0 | stacking 18, active 18, focus 18 | 18/20 | 18/20 | 0/20 | active 18, focus 18, stacking 18 | active 18, focus 18, stacking 18 |
| chrome | cua:active-pd30 | 20/20 | 0 / 0 | stacking 20 | 20/20 | 20/20 | 0/20 | none | none |
| chrome | cua:dedicated-pd30 | 20/20 | 0 / 0 | stacking 20, active 20, focus 20 | 20/20 | 20/20 | 0/20 | active 20, focus 20, stacking 20 | active 20, focus 20, stacking 20 |

## m31-drag-options-load (experiment drag)

Every engine drags the same path 20 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.

| family | kind | pinned took | cua:d0 took | cua:pd10 took | cua:pd20 took | cua:pd30 took | cua:ev50 took | xtest took | cua:d0 drag ms | cua:pd10 drag ms | cua:pd20 drag ms | cua:pd30 drag ms | cua:ev50 drag ms | xtest drag ms | pinned drag ms | witness | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| Chrome | select | 20/20 | 20/20 | 20/20 | 20/20 | 20/20 | 20/20 | 20/20 | 261.9 | 269.8 | 274.5 | 287.1 | 305.8 | 252.8 | 468.9 | **changed** | cua:d0 PASS, cua:pd10 PASS, cua:pd20 PASS, cua:pd30 PASS, cua:ev50 PASS |
| Chrome | range | 20/20 | 20/20 | 20/20 | 19/20 | 20/20 | 20/20 | 20/20 | 287.3 | 286 | 302.4 | 302 | 335.8 | 251.6 | 518.3 | **changed** | cua:d0 PASS, cua:pd10 PASS, cua:pd20 **misses 1**, cua:pd30 PASS, cua:ev50 PASS |
| Chrome | scroller | 20/20 | 20/20 | 20/20 | 20/20 | 20/20 | 20/20 | 20/20 | 150.1 | 159.5 | 167.6 | 177.6 | 199.3 | 95.9 | 280 | **changed** | cua:d0 PASS, cua:pd10 PASS, cua:pd20 PASS, cua:pd30 PASS, cua:ev50 PASS |
| Chrome | dnd | 20/20 | 20/20 | 20/20 | 20/20 | 20/20 | 20/20 | 20/20 | 523.7 | 517.7 | 556.2 | 557.8 | 540.1 | 774.2 | 756.8 | **changed** | cua:d0 PASS, cua:pd10 PASS, cua:pd20 PASS, cua:pd30 PASS, cua:ev50 PASS |
| Chrome | canvas | 20/20 | 20/20 | 20/20 | 20/20 | 20/20 | 20/20 | 20/20 | 664.4 | 670.2 | 693.9 | 689.9 | 714 | 757.8 | 1155.9 | **changed** | cua:d0 PASS, cua:pd10 PASS, cua:pd20 PASS, cua:pd30 PASS, cua:ev50 PASS |
| Electron (cua fixture) | select | 20/20 | 20/20 | 20/20 | 20/20 | 20/20 | 20/20 | 20/20 | 251.9 | 260.6 | 273.9 | 282.2 | 304.9 | 260.5 | 456 | **changed** | cua:d0 PASS, cua:pd10 PASS, cua:pd20 PASS, cua:pd30 PASS, cua:ev50 PASS |
| Electron (cua fixture) | range | 20/20 | 20/20 | 20/20 | 20/20 | 20/20 | 20/20 | 20/20 | 272.2 | 278 | 284.2 | 298.3 | 332 | 230.5 | 498.1 | **changed** | cua:d0 PASS, cua:pd10 PASS, cua:pd20 PASS, cua:pd30 PASS, cua:ev50 PASS |
| Electron (cua fixture) | scroller | 20/20 | 19/20 | 18/20 | 20/20 | 17/20 | 20/20 | 20/20 | 144.1 | 153.1 | 164.8 | 175.2 | 198.4 | 86.3 | 278 | **changed** | cua:d0 **misses 1**, cua:pd10 **misses 2**, cua:pd20 PASS, cua:pd30 **misses 3**, cua:ev50 PASS |
| Electron (cua fixture) | dnd | 20/20 | 20/20 | 20/20 | 20/20 | 20/20 | 20/20 | 20/20 | 547.5 | 555.7 | 568.9 | 566.8 | 551 | 785.8 | 719.2 | **changed** | cua:d0 PASS, cua:pd10 PASS, cua:pd20 PASS, cua:pd30 PASS, cua:ev50 PASS |
| Electron (cua fixture) | canvas | 20/20 | 20/20 | 20/20 | 20/20 | 20/20 | 20/20 | 20/20 | 622 | 640.2 | 658.8 | 656.7 | 676.8 | 703.6 | 1148.1 | **changed** | cua:d0 PASS, cua:pd10 PASS, cua:pd20 PASS, cua:pd30 PASS, cua:ev50 PASS |

Cells where a cua lane missed a run the pinned build took: chrome range (cua:pd20); electron scroller (cua:d0, cua:pd10, cua:pd30).

## m31-dnd-edge-load4 (experiment drag)

Every engine drags the same path 40 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.

| family | kind | pinned took | cua:d0 took | cua:pd10 took | cua:pd20 took | cua:pd30 took | cua:pd40 took | cua:ev50 took | cua:d0 drag ms | cua:pd10 drag ms | cua:pd20 drag ms | cua:pd30 drag ms | cua:pd40 drag ms | cua:ev50 drag ms | pinned drag ms | witness | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| Chrome | dnd | 40/40 | 40/40 | 40/40 | 40/40 | 40/40 | 40/40 | 40/40 | 588 | 600 | 596.4 | 625.9 | 626.6 | 588.4 | 782.4 | **changed** | cua:d0 PASS, cua:pd10 PASS, cua:pd20 PASS, cua:pd30 PASS, cua:pd40 PASS, cua:ev50 PASS |

No cua lane missed a run the pinned build took.

