# linux-engine-diff summary

## t72-pilot-press (experiment writer-drag)

T16's probe, measured and never judged (writer-drag.mjs): each case's 3 runs on LibreOffice Writer (gtk3), the path's text read by AT-SPI and by PRIMARY.

| case | lane | window | primed | pointer | why | ok | AT-SPI saw it | PRIMARY saw it | anything selected | caret moved | witness |
|---|---|---|---|---|---|---:|---:|---:|---:|---:|---|
| click-fresh | click | fresh each run | – | out | a background click at the path's start | 3/3 | 0/3 | 0/3 | 0/3 | 0/3 | clean |
| xclick-fresh | xclick | fresh each run | – | out | a real click at the path's start, the window active | 3/3 | 0/3 | 0/3 | 0/3 | 0/3 | clean |
| xhold-fresh | xhold | fresh each run | – | out | the real button held 300 ms there, no move | 3/3 | 0/3 | 0/3 | 0/3 | 0/3 | clean |
| xdotool-fresh | xdotool | fresh each run | – | out | a real drag at a person's pace: 300 ms held, 12 moves 40 ms apart | 3/3 | 0/3 | 0/3 | 0/3 | 0/3 | clean |
| xdotool-primed | xdotool | one | – | out | a real drag at a person's pace, drag after drag | 3/3 | 0/3 | 0/3 | 0/3 | 0/3 | clean |

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 2783 requests, 336 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

