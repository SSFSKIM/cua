# linux-engine-diff summary

## engine-stop-20261106T131605 (experiment engine-stop)

| lane | path | case | runs | pass | engine after the stop, median ms | after the last answer, median ms |
|---|---|---|---:|---:|---:|---:|
| drain | idle | burst | 10 | 10 | 372 | 388.8 |
| drain | eof | burst | 10 | 10 | 289 | 298.9 |
| drain | signal | burst | 10 | 10 | 289 | 299.1 |
| drain | remote | burst | 10 | 10 | 368.3 | 377.5 |
| kill | idle | burst | 10 | 10 | 174.5 | 190 |
| kill | eof | burst | 10 | 10 | 83.2 | 92.9 |
| kill | signal | burst | 10 | 10 | 89.3 | 98.4 |
| kill | remote | burst | 10 | 10 | 152.8 | 164.1 |

The control's bursts: 0 of 40 cut (required on each path).

**Incomplete or failed:** kill idle burst: the control cut no burst (0 of 10): no pending burst was shown; kill eof burst: the control cut no burst (0 of 10): no pending burst was shown; kill signal burst: the control cut no burst (0 of 10): no pending burst was shown; kill remote burst: the control cut no burst (0 of 10): no pending burst was shown.

desktop: started with no window active, ended with 0x00a0000c active (harness), neither acted on; holder none; the harness's own trace: 5341 requests, 331 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

