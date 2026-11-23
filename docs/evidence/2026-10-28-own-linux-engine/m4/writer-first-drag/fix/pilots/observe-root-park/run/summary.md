# linux-engine-diff summary

## t72-pilot-first (experiment writer-drag)

T16's probe (writer-drag.mjs, plan observe): each case's runs (its own count, else 1) on LibreOffice Writer (gtk3), the path's text read by AT-SPI and by PRIMARY. The AT-SPI caret is not updated by a click alone in Writer, so "caret moved" says little for pointer input.

| case | lane | window | primed | pointer | aim | why | ok | AT-SPI saw it | PRIMARY saw it | anything selected | caret moved | witness | audit |
|---|---|---|---|---|---|---|---:|---:|---:|---:|---:|---|---|
| atspi-fresh | atspi | fresh each run | – | out | raw | the selection set through AT-SPI: every observer should see it | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | clean | – |
| keys-fresh | keys | fresh each run | – | out | raw | a background click on the text, then Shift+Right: a selection made by keys | 1/1 | 0/1 | 0/1 | 1/1 | 1/1 | clean | – |
| xtest-fresh | xtest | fresh each run | – | out | raw | real input: the window activated, the desktop route's drag | 1/1 | 0/1 | 0/1 | 0/1 | 0/1 | clean | – |
| xtest-primed | xtest | one | – | out | raw | real input, the same window drag after drag | 1/1 | 0/1 | 0/1 | 0/1 | 0/1 | clean | – |
| cua-fresh | cua | fresh each run | – | out | raw | the background route on a fresh window (the known miss) | 1/1 | 0/1 | 0/1 | 0/1 | 0/1 | clean | – |
| cua-primed | cua | one | drag | out | raw | the background route after one drag (the harness's priming) | 1/1 | 0/1 | 0/1 | 0/1 | 0/1 | clean | – |
| pinned-primed | pinned | one | drag | out | raw | the pinned build after one drag (the harness's priming) | 1/1 | 0/1 | 0/1 | 0/1 | 0/1 | clean | – |

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 934 requests, 115 changes of a window, **7 changes of a window it did not open: WarpPointer on 0x000001ff; WarpPointer on 0x000001ff; WarpPointer on 0x000001ff; WarpPointer on 0x000001ff; WarpPointer on 0x000001ff; WarpPointer on 0x000001ff; WarpPointer on 0x000001ff**; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

