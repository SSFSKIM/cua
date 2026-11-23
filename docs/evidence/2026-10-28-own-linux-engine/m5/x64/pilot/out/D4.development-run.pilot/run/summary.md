# linux-engine-diff summary

## m4-dev-D4-pilot (experiment drag; development run, not a release gate)

Every engine drags the same path 2 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| GTK3 gedit | select | 2/2 | 2/2 | 2/2 | 2/2 | 308.3 | 35.4 | 31.4 | 389.2 | clean | – | cua PASS, cua:0ms PASS |
| GTK3 gedit | scrollbar | 2/2 | 2/2 | 2/2 | 2/2 | 313.5 | 22.9 | 17.2 | 396.3 | clean | – | cua PASS, cua:0ms PASS |
| GTK 3 scale (harness scene) | scale | 2/2 | 2/2 | 2/2 | 2/2 | 329.4 | 26.9 | 28.1 | 526.3 | clean | – | cua PASS, cua:0ms PASS |
| GTK4 gnome-text-editor | select | 0/2 | 0/2 | 0/2 | 0/2 | 317 | – | – | 399.3 | clean | – | no vendor effect: not judged |
| Qt 5 kate | select | 2/2 | 2/2 | 2/2 | 2/2 | 301.4 | 26.2 | 20.4 | 366.8 | clean | – | cua PASS, cua:0ms PASS |
| Qt 5 kate | scrollbar | 2/2 | 2/2 | 2/2 | 2/2 | 312.8 | 38.3 | 27.2 | 392.6 | clean | – | cua PASS, cua:0ms PASS |
| Qt 6 qtcreator | select | 2/2 | 2/2 | 2/2 | 2/2 | 294.7 | 23.2 | 24.6 | 347.8 | clean | – | cua PASS, cua:0ms PASS |
| Qt 6 qtcreator | scrollbar | 2/2 | 2/2 | 2/2 | 2/2 | 311.4 | 34.6 | 40.4 | 403.7 | clean | – | cua PASS, cua:0ms PASS |

No cua lane missed a run the pinned build took.

The judges' verdict for `cua`: PASS.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 2033 requests, 391 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

