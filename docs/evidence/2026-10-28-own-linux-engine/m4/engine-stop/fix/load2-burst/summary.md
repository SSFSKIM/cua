# linux-engine-diff summary

## engine-stop-20261104T112503 (experiment engine-stop)

| lane | path | case | runs | pass | engine after the stop, median ms | after the last answer, median ms |
|---|---|---|---:|---:|---:|---:|
| drain | idle | burst | 10 | 10 | 384.6 | 405.2 |
| drain | eof | burst | 10 | 10 | 277.7 | 298 |
| drain | signal | burst | 10 | 10 | 275.5 | 294.9 |
| drain | remote | burst | 10 | 10 | 403.4 | 418.2 |
| kill | idle | burst | 10 | 10 | 227.8 | 254.4 |
| kill | eof | burst | 10 | 10 | 143 | 160 |
| kill | signal | burst | 10 | 10 | 136.3 | 153.2 |
| kill | remote | burst | 10 | 10 | 277.2 | 300.9 |

**Incomplete or failed:** kill idle burst: the control cut no burst (0 of 10): no pending burst was shown; kill eof burst: the control cut no burst (0 of 10): no pending burst was shown; kill signal burst: the control cut no burst (0 of 10): no pending burst was shown; kill remote burst: the control cut no burst (0 of 10): no pending burst was shown.

desktop: started with no window active, ended with 0x00a0000c active (harness), neither acted on; holder none; the harness's own trace: 4896 requests, 331 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

