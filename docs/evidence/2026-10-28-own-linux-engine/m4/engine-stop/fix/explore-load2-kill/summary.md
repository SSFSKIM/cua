# linux-engine-diff summary

## engine-stop-20261104T110054 (experiment engine-stop)

| lane | path | case | runs | pass | engine after the stop, median ms | after the last answer, median ms |
|---|---|---|---:|---:|---:|---:|
| kill | signal | burst | 5 | 5 | 131 | 150.2 |
| kill | eof | burst | 5 | 5 | 140 | 155.4 |
| kill | idle | burst | 5 | 5 | 286.4 | 301.2 |
| kill | remote | burst | 5 | 5 | 296 | 310.3 |

**Incomplete or failed:** kill signal burst: the control cut no burst (0 of 5): no pending burst was shown; kill eof burst: the control cut no burst (0 of 5): no pending burst was shown; kill idle burst: the control cut no burst (0 of 5): no pending burst was shown; kill remote burst: the control cut no burst (0 of 5): no pending burst was shown.

desktop: started with no window active, ended with 0x00a0000c active (harness), neither acted on; holder none; the harness's own trace: 1324 requests, 91 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

