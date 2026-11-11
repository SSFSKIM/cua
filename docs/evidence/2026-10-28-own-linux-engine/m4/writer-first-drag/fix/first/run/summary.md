# linux-engine-diff summary

## t72-fix2-first (experiment writer-drag)

T16's probe (writer-drag.mjs, plan first): each case's runs (its own count, else 5) on LibreOffice Writer (gtk3), the path's text read by AT-SPI and by PRIMARY. The AT-SPI caret is not updated by a click alone in Writer, so "caret moved" says little for pointer input.

| case | lane | window | primed | pointer | aim | why | ok | AT-SPI saw it | PRIMARY saw it | anything selected | caret moved | witness | audit |
|---|---|---|---|---|---|---|---:|---:|---:|---:|---:|---|---|
| cua-first | cua | fresh each run | – | out | locate | cua as shipped, the pointer on another window of the run (the front window), off Writer | 30/30 | 30/30 | 30/30 | 30/30 | 30/30 | clean | – |
| cua-first-text | cua | fresh each run | – | text | locate | the pointer on the path's start | 10/10 | 10/10 | 10/10 | 10/10 | 10/10 | clean | – |
| cua-first-blank | cua | fresh each run | – | blank | locate | the pointer in the window, off the text | 10/10 | 10/10 | 10/10 | 10/10 | 10/10 | clean | – |
| pinned-first | pinned | fresh each run | – | out | locate | the pinned build | 10/10 | 10/10 | 10/10 | 10/10 | 10/10 | clean | – |
| newest-first | newest | fresh each run | – | out | locate | the newest build | 10/10 | 10/10 | 10/10 | 10/10 | 10/10 | clean | – |
| cua-first-audit | cua | fresh each run | – | out | locate | cua through an xtrace proxy: no forbidden request on the background route | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | clean | clean (1683 requests) |
| cua-first-raw | cua | fresh each run | – | out | raw | the control: the drag cell's aim before T16, 27 px above the text | 5/5 | 0/5 | 0/5 | 0/5 | 0/5 | clean | – |

The row's proof (T16: on fresh unprimed windows the first drag selects, 30 of 30, witness and audit clean; the control misses): PASS.

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 13002 requests, 1105 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

