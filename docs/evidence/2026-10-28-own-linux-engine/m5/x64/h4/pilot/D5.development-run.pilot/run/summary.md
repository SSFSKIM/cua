# linux-engine-diff summary

## m5-dev-D5-pilot (experiment drag; development run, not a release gate)

Every engine drags the same path 2 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| LibreOffice Writer (gtk3) | select | 2/2 | 2/2 | 2/2 | 2/2 | 300.9 | 16.7 | 24.4 | 374.7 | clean | – | cua PASS, cua:0ms PASS |
| xterm | select | 2/2 | 2/2 | 2/2 | 2/2 | 282.4 | 18.5 | 15.9 | 320.3 | clean | – | cua PASS, cua:0ms PASS |
| xterm, allowSendEvents on | select | 2/2 | 2/2 | 2/2 | 2/2 | 282.3 | 11.5 | 18.6 | 323.5 | clean | – | cua PASS, cua:0ms PASS |
| GTK 4 input (harness scene) | scale4 | 0/2 | 0/2 | 0/2 | 0/2 | 321.9 | – | – | 550.1 | clean | – | no vendor effect: not judged |
| gnome-terminal (VTE) | select | 2/2 | 2/2 | 2/2 | 1/2 | 307.5 | 25.4 | 15.3 | 381.6 | clean | – | cua PASS, cua:0ms **FAIL** |
| LibreOffice Writer (gen, X11 only) | select | 2/2 | 2/2 | 2/2 | 2/2 | 301.4 | 17.7 | 24.9 | 365.2 | clean | – | cua PASS, cua:0ms PASS |

Cells where a cua lane missed a run the pinned build took: gnome-terminal select (cua:0ms).

The judges' verdict for `cua`: PASS.

desktop: started with 0x0060000c active (foreign), ended with 0x0060000c active (foreign), neither acted on; holder 0x00c0000c; the harness's own trace: 2665 requests, 351 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

