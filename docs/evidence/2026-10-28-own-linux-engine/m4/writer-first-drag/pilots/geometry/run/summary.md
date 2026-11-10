# linux-engine-diff summary

## t72-pilot-geometry (experiment writer-drag)

T16's probe, measured and never judged (writer-drag.mjs): each case's 5 runs on LibreOffice Writer (gtk3), the path's text read by AT-SPI and by PRIMARY.

| case | lane | window | primed | pointer | why | ok | AT-SPI saw it | PRIMARY saw it | anything selected | caret moved | witness |
|---|---|---|---|---|---|---:|---:|---:|---:|---:|---|
| cua-fresh-atspi | cua | fresh each run | – | out | the drag cell's aim | 5/5 | 0/5 | 0/5 | 0/5 | 0/5 | clean |
| cua-fresh-frame | cua | fresh each run | – | out | aimed from the window's own AT-SPI frame | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 | clean |
| pinned-fresh-frame | pinned | fresh each run | – | out | the pinned build, aimed from the frame | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 | clean |
| xtest-fresh-frame | xtest | fresh each run | – | out | real input, aimed from the frame | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 | clean |
| cua-run-frame | cua | one | – | out | one window, drag after drag, aimed from the frame | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 | clean |

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 3983 requests, 340 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

