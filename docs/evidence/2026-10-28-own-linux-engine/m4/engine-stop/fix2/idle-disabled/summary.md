# linux-engine-diff summary

## engine-stop-20261104T135010 (experiment engine-stop)

| lane | path | case | runs | pass | engine after the stop, median ms | after the last answer, median ms |
|---|---|---|---:|---:|---:|---:|
| drain | idle | hold | 10 | 10 | 131.2 | 144.2 |
| drain | idle | handle | 10 | 10 | 128.4 | 138.9 |
| drain | eof | hold | 10 | 10 | 50.3 | 62.1 |
| drain | eof | handle | 10 | 10 | 52.5 | 64.7 |
| drain | signal | hold | 10 | 10 | 54.6 | 65.9 |
| drain | signal | handle | 10 | 10 | 64.1 | 78.7 |
| drain | remote | hold | 10 | 10 | 152.5 | 164.7 |
| drain | remote | handle | 10 | 10 | 156.3 | 167.6 |
| drain | held-back | hold | 10 | 10 | 7027.6 | 7339.3 |
| kill | idle | hold | 10 | 0 | 129.1 | 139.8 |
| kill | idle | handle | 10 | 0 | 139.3 | 155.9 |
| kill | eof | hold | 10 | 0 | 54.4 | 68.5 |
| kill | eof | handle | 10 | 0 | 52.6 | 63 |
| kill | signal | hold | 10 | 0 | 48.8 | 59.7 |
| kill | signal | handle | 10 | 0 | 49.2 | 60.7 |
| kill | remote | hold | 10 | 0 | 143 | 154.7 |
| kill | remote | handle | 10 | 0 | 145.7 | 158.9 |
| kill | held-back | hold | 10 | 10 | 7028.7 | 7342.1 |

desktop: started with no window active, ended with 0x00c0000c active (harness), neither acted on; holder none; the harness's own trace: 894 requests, 131 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

