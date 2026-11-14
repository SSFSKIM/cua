# linux-engine-diff summary

## t72-drag-writer (experiment drag)

Every engine drags the same path 10 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest warm ms | cua warm ms | cua:0ms warm ms | pinned warm ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| LibreOffice Writer (gtk3) | select | 10/10 | 10/10 | 10/10 | 10/10 | 302.3 | 17.7 | 16.6 | 376 | clean | – | cua PASS, cua:0ms PASS |
| LibreOffice Writer (gtk3) | select-unprimed | 10/10 | 10/10 | 10/10 | 10/10 | 310.7 | 16.2 | 22.6 | 394.5 | clean | the judge took 20/20 of the select cell's even runs | cua PASS, cua:0ms PASS |

No cua lane missed a run the pinned build took.

The judges' verdict for `cua`: PASS.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 6948 requests, 645 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

