# linux-engine-diff summary

## t72-pilot-pacing (experiment writer-drag)

T16's probe, measured and never judged (writer-drag.mjs): each case's 3 runs on LibreOffice Writer (gtk3), the path's text read by AT-SPI and by PRIMARY.

| case | lane | window | primed | pointer | why | ok | AT-SPI saw it | PRIMARY saw it | anything selected | caret moved | witness |
|---|---|---|---|---|---|---:|---:|---:|---:|---:|---|
| xdotool-fresh | xdotool | fresh each run | – | out | real input at a person's pace: 300 ms held, 12 moves 40 ms apart | 3/3 | 0/3 | 0/3 | 0/3 | 0/3 | clean |
| cua-fresh | cua | fresh each run | – | out | as shipped (no wait) | 3/3 | 0/3 | 0/3 | 0/3 | 0/3 | clean |
| rest-fresh | cua:rest | fresh each run | – | out | a rest at the end, then the end visited again | 3/3 | 0/3 | 0/3 | 0/3 | 0/3 | clean |
| press-fresh | cua:press | fresh each run | – | out | a dwell after the press | 3/3 | 0/3 | 0/3 | 0/3 | 0/3 | clean |
| step-fresh | cua:step | fresh each run | – | out | a wait after each sample | 3/3 | 0/3 | 0/3 | 0/3 | 0/3 | clean |
| rest-primed | cua:rest | one | drag | out | primed, the rest at the end | 3/3 | 0/3 | 0/3 | 0/3 | 0/3 | clean |

desktop: started with 0x0060000c active (foreign), ended with 0x0060000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 3002 requests, 294 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

