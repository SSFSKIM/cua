# linux-engine-diff summary

## engine-stop-20261104T151643 (experiment engine-stop)

| lane | path | case | runs | pass | engine after the stop, median ms | after the last answer, median ms |
|---|---|---|---:|---:|---:|---:|
| drain | held-back | hold | 10 | 10 | 7076.3 | 7388 |
| kill | held-back | hold | 10 | 0 | 7019.5 | 7336.9 |

desktop: started with no window active, ended with 0x00c0000c active (harness), neither acted on; holder none; the harness's own trace: 165 requests, 31 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

