# linux-engine-diff summary

## engine-stop-20261104T084547 (experiment engine-stop)

| lane | path | case | runs | pass | engine after the stop, median ms | after the last answer, median ms |
|---|---|---|---:|---:|---:|---:|
| drain | idle | hold | 10 | 10 | 130.8 | 145.05 |
| drain | idle | burst | 10 | 10 | 360.1 | 367.75 |
| drain | eof | hold | 10 | 10 | 70.75 | 81.8 |
| drain | eof | burst | 10 | 10 | 290.9 | 299.15 |
| drain | signal | hold | 10 | 10 | 75.7 | 87.85 |
| drain | signal | burst | 10 | 10 | 290.95 | 298.85 |
| drain | remote | hold | 10 | 10 | 146.5 | 156.7 |
| drain | remote | burst | 10 | 10 | 371 | 380.7 |
| kill | idle | hold | 10 | 0 | 124.65 | 137.2 |
| kill | idle | burst | 10 | 10 | 129.35 | 138.15 |
| kill | eof | hold | 10 | 0 | 64.55 | 76.5 |
| kill | eof | burst | 10 | 10 | 66.7 | 74.8 |
| kill | signal | hold | 10 | 0 | 80.15 | 92.7 |
| kill | signal | burst | 10 | 10 | 65.85 | 73.2 |
| kill | remote | hold | 10 | 0 | 146.89999999999998 | 159.35 |
| kill | remote | burst | 10 | 10 | 143.05 | 152.5 |

desktop: started with no window active, ended with 0x00a0000c active (harness), neither acted on; holder none; the harness's own trace: 5521 requests, 411 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

