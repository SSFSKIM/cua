# linux-engine-diff summary

## m5-dev-D5-pilot (experiment drag; development run, not a release gate)

Every engine drags the same path 2 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| LibreOffice Writer (gtk3) | select | 2/2 | 2/2 | 2/2 | 2/2 | 295.1 | 4.3 | 4.4 | 344.6 | clean | – | cua PASS, cua:0ms PASS |
| xterm | select | 2/2 | 2/2 | 2/2 | 2/2 | 276.1 | 3.5 | 3.6 | 307 | clean | – | cua PASS, cua:0ms PASS |
| xterm, allowSendEvents on | select | 2/2 | 2/2 | 2/2 | 2/2 | 275.8 | 3.5 | 3.4 | 307.3 | clean | – | cua PASS, cua:0ms PASS |
| GTK 4 input (harness scene) | scale4 | 0/2 | 0/2 | 0/2 | 0/2 | 311.8 | – | – | 495 | clean | – | no vendor effect: not judged |
| gnome-terminal (VTE) | select | 2/2 | 2/2 | 2/2 | 2/2 | 300.9 | 5.5 | 5.1 | 359.5 | clean | – | cua PASS, cua:0ms PASS |
| LibreOffice Writer (gen, X11 only) | select | 2/2 | 2/2 | 2/2 | 2/2 | 293.2 | 4.2 | 4.1 | 343.7 | clean | – | cua PASS, cua:0ms PASS |

No cua lane missed a run the pinned build took.

The judges' verdict for `cua`: PASS.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00c0000c; the harness's own trace: 2782 requests, 351 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

