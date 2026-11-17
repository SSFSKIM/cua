# linux-engine-diff summary

## t72-pilot-observe (experiment writer-drag)

T16's probe, measured and never judged (writer-drag.mjs): each case's 3 runs on LibreOffice Writer (gtk3), the path's text read by AT-SPI and by PRIMARY.

| case | lane | window | primed | pointer | why | ok | AT-SPI saw it | PRIMARY saw it | anything selected | caret moved | witness |
|---|---|---|---|---|---|---:|---:|---:|---:|---:|---|
| atspi-fresh | atspi | fresh each run | – | out | the selection set through AT-SPI: every observer should see it | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | clean |
| keys-fresh | keys | fresh each run | – | out | a background click on the text, then Shift+Right: a selection made by keys | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | clean |
| xtest-fresh | xtest | fresh each run | – | out | real input: the window activated, the desktop route's drag | 3/3 | 0/3 | 0/3 | 0/3 | 0/3 | clean |
| xtest-primed | xtest | one | – | out | real input, the same window drag after drag | 3/3 | 0/3 | 0/3 | 0/3 | 0/3 | clean |
| cua-fresh | cua | fresh each run | – | out | the background route on a fresh window (the known miss) | 3/3 | 0/3 | 0/3 | 0/3 | 0/3 | clean |
| cua-primed | cua | one | drag | out | the background route after one drag (the harness's priming) | 3/3 | 0/3 | 0/3 | 0/3 | 0/3 | clean |
| pinned-primed | pinned | one | drag | out | the pinned build after one drag (the harness's priming) | 3/3 | 0/3 | 0/3 | 0/3 | 0/3 | clean |

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 3188 requests, 286 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

