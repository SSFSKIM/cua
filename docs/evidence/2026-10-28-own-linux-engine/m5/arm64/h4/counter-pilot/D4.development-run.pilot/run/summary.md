# linux-engine-diff summary

## m5-dev-D4-pilot (experiment drag; development run, not a release gate)

Every engine drags the same path 2 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| GTK3 gedit | select | 2/2 | 2/2 | 2/2 | 2/2 | 302.3 | 5.1 | 5.1 | 360.6 | clean | – | cua PASS, cua:0ms PASS |
| GTK3 gedit | scrollbar | 2/2 | 2/2 | 2/2 | 2/2 | 306.2 | 4.8 | 4.9 | 367.7 | clean | – | cua PASS, cua:0ms PASS |
| GTK 3 scale (harness scene) | scale | 2/2 | 2/2 | 2/2 | 2/2 | 312.1 | 9 | 8.8 | 497.6 | clean | – | cua PASS, cua:0ms PASS |
| GTK4 gnome-text-editor | select | 0/2 | 0/2 | 0/2 | 0/2 | 310.1 | – | – | 384.8 | clean | – | no vendor effect: not judged |
| Qt 5 kate | select | 2/2 | 2/2 | 2/2 | 2/2 | 291.3 | 6.6 | 6 | 339.8 | clean | – | cua PASS, cua:0ms PASS |
| Qt 5 kate | scrollbar | 2/2 | 2/2 | 2/2 | 2/2 | 304.4 | 11.8 | 7.1 | 366.7 | clean | – | cua PASS, cua:0ms PASS |
| Qt 6 qtcreator | select | 2/2 | 2/2 | 2/2 | 2/2 | 287.7 | 10.4 | 11.8 | 330.4 | clean | – | cua PASS, cua:0ms PASS |
| Qt 6 qtcreator | scrollbar | 2/2 | 2/2 | 2/2 | 2/2 | 305.6 | 13.9 | 14.9 | 369.5 | clean | – | cua PASS, cua:0ms PASS |

No cua lane missed a run the pinned build took.

The judges' verdict for `cua`: PASS.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00c0000c; the harness's own trace: 2069 requests, 391 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

