# linux-engine-diff summary

## engine-stop-20261104T110603 (experiment engine-stop)

| lane | path | case | runs | pass | engine after the stop, median ms | after the last answer, median ms |
|---|---|---|---:|---:|---:|---:|
| drain | idle | hold | 10 | 10 | 129.8 | 141 |
| drain | idle | burst | 10 | 10 | 360.1 | 372.5 |
| drain | eof | hold | 10 | 10 | 76 | 90.5 |
| drain | eof | burst | 10 | 10 | 291.5 | 299.2 |
| drain | signal | hold | 10 | 10 | 68.9 | 79.8 |
| drain | signal | burst | 10 | 10 | 289.4 | 298.4 |
| drain | remote | hold | 10 | 10 | 157.6 | 170.1 |
| drain | remote | burst | 10 | 10 | 353.3 | 364.3 |
| drain | held-back | hold | 10 | 10 | 7081.4 | 7395.7 |
| kill | idle | hold | 10 | 0 | 124.5 | 136.9 |
| kill | idle | burst | 10 | 10 | 134.1 | 143.1 |
| kill | eof | hold | 10 | 0 | 81.3 | 97.1 |
| kill | eof | burst | 10 | 10 | 67.4 | 77.1 |
| kill | signal | hold | 10 | 0 | 73.2 | 84.2 |
| kill | signal | burst | 10 | 10 | 65 | 76.2 |
| kill | remote | hold | 10 | 0 | 153.9 | 167.2 |
| kill | remote | burst | 10 | 10 | 150.5 | 160.1 |
| kill | held-back | hold | 10 | 0 | 7032.7 | 7345.5 |

desktop: started with no window active, ended with 0x00c0000c active (harness), neither acted on; holder none; the harness's own trace: 5537 requests, 431 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

