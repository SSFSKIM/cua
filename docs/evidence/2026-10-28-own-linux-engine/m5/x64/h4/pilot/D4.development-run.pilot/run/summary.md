# linux-engine-diff summary

## m5-dev-D4-pilot (experiment drag; development run, not a release gate)

Every engine drags the same path 2 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| GTK3 gedit | select | 2/2 | 2/2 | 2/2 | 2/2 | 314.7 | 15.1 | 16.5 | 391 | clean | – | cua PASS, cua:0ms PASS |
| GTK3 gedit | scrollbar | 2/2 | 2/2 | 2/2 | 2/2 | 314.8 | 24.8 | 16.1 | 412.5 | clean | – | cua PASS, cua:0ms PASS |
| GTK 3 scale (harness scene) | scale | 2/2 | 2/2 | 2/2 | 2/2 | 322.2 | 42.7 | 33.2 | 547 | clean | – | cua PASS, cua:0ms PASS |
| GTK4 gnome-text-editor | select | 0/2 | 0/2 | 0/2 | 0/2 | 316.9 | – | – | 403.6 | clean | – | no vendor effect: not judged |
| Qt 5 kate | select | 2/2 | 2/2 | 2/2 | 2/2 | 299.7 | 30.9 | 20.5 | 355.4 | clean | – | cua PASS, cua:0ms PASS |
| Qt 5 kate | scrollbar | 2/2 | 2/2 | 2/2 | 2/2 | 313.7 | 27.7 | 26.6 | 394.6 | clean | – | cua PASS, cua:0ms PASS |
| Qt 6 qtcreator | select | 2/2 | 2/2 | 2/2 | 2/2 | 292.9 | 25.9 | 21.3 | 357.3 | clean | – | cua PASS, cua:0ms PASS |
| Qt 6 qtcreator | scrollbar | 2/2 | 2/2 | 2/2 | 2/2 | 314.5 | 67.5 | 70.1 | 402.2 | clean | – | cua PASS, cua:0ms PASS |

No cua lane missed a run the pinned build took.

The judges' verdict for `cua`: PASS.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00c0000c; the harness's own trace: 2033 requests, 391 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

