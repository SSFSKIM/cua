# linux-engine-diff summary

## engine-stop-20261104T112036 (experiment engine-stop)

| lane | path | case | runs | pass | engine after the stop, median ms | after the last answer, median ms |
|---|---|---|---:|---:|---:|---:|
| drain | idle | hold | 10 | 10 | 127.4 | 140.6 |
| drain | eof | hold | 10 | 10 | 55.3 | 68.9 |
| drain | signal | hold | 10 | 10 | 48.8 | 59.1 |
| drain | remote | hold | 10 | 10 | 146.1 | 159 |
| drain | held-back | hold | 10 | 10 | 7023.3 | 7335.9 |
| kill | idle | hold | 10 | 0 | 127.2 | 140.2 |
| kill | eof | hold | 10 | 0 | 48.6 | 60.3 |
| kill | signal | hold | 10 | 0 | 57.5 | 72.7 |
| kill | remote | hold | 10 | 0 | 162.4 | 176.6 |
| kill | held-back | hold | 10 | 10 | 7030.3 | 7341.9 |

desktop: started with no window active, ended with 0x00c0000c active (harness), neither acted on; holder none; the harness's own trace: 257 requests, 91 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

