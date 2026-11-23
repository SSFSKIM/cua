# linux-engine-diff summary

## engine-stop-20261104T090549 (experiment engine-stop)

| lane | path | case | runs | pass | engine after the stop, median ms | after the last answer, median ms |
|---|---|---|---:|---:|---:|---:|
| drain | idle | hold | 10 | 10 | 150.7 | 167.7 |
| drain | idle | burst | 10 | 10 | 359.4 | 369.2 |
| drain | eof | hold | 10 | 10 | 80.6 | 91.7 |
| drain | eof | burst | 10 | 10 | 290.5 | 299.3 |
| drain | signal | hold | 10 | 10 | 80.3 | 91.8 |
| drain | signal | burst | 10 | 10 | 278.3 | 297.9 |
| drain | remote | hold | 10 | 10 | 334.5 | 364.9 |
| drain | remote | burst | 10 | 10 | 396.2 | 418.7 |
| kill | idle | hold | 10 | 0 | 131.2 | 143.3 |
| kill | idle | burst | 10 | 10 | 126.9 | 137.8 |
| kill | eof | hold | 10 | 0 | 77.2 | 87.8 |
| kill | eof | burst | 10 | 10 | 64 | 74.2 |
| kill | signal | hold | 10 | 0 | 68.1 | 80.2 |
| kill | signal | burst | 10 | 10 | 64.8 | 72.7 |
| kill | remote | hold | 10 | 0 | 155.4 | 168.8 |
| kill | remote | burst | 10 | 10 | 151.4 | 161.5 |

desktop: started with no window active, ended with 0x00a0000c active (harness), neither acted on; holder none; the harness's own trace: 5410 requests, 411 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

