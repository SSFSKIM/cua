# linux-engine-diff summary

## t65-writer-released (experiment drag)

Every engine drags the same path 10 times per family and kind, in its own window (visible), each drag in a witness span; a run took effect when its result is the pinned build's (module header, drag.mjs). `cua:0ms` has no wait after a sample, after the press or before the release.
The judges (T10), for the shipped lane `cua`: every run takes effect; Chrome's and Electron's thumbs land at or past the pinned build's mean distance of the same sitting; the long paths (Chrome's and Firefox's canvas, Chrome's drag and drop in front) pass on warm speed under Acceptance 3's interval rule, topped up to 40 a side. Every other cua lane is measured, not judged.

| family | kind | pinned took | newest took | cua took | cua:0ms took | newest drag ms | cua drag ms | cua:0ms drag ms | pinned drag ms | witness | judges | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| LibreOffice Writer (gtk3) | select | 0/10 | 0/10 | 0/10 | 0/10 | 309.4 | 117.3 | 116.5 | 376 | clean | – | no pinned effect: not judged |
| LibreOffice Writer (gtk3) | select-unprimed | 0/10 | 0/10 | 0/10 | 0/10 | 313.8 | 119.5 | 116.7 | 386.3 | clean | the judge took 0/0 of the primed cell's even runs | cua **FAIL**, cua:0ms **FAIL** |

No cua lane missed a run the pinned build took.

The judges' verdict for `cua`: **FAIL**: writer select-unprimed: cua missed runs 0 1 2 3 4 5 6 7 8 9; writer select-unprimed: REFERENCE MISMATCH: the unprimed judge took 0 of the primed cell's 0 even runs that took.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 6959 requests, 645 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

