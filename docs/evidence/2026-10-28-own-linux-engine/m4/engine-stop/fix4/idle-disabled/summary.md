# linux-engine-diff summary

## engine-stop-20261104T180522 (experiment engine-stop)

| lane | path | case | runs | pass | engine after the stop, median ms | after the last answer, median ms |
|---|---|---|---:|---:|---:|---:|
| drain | idle | hold | 10 | 10 | 127.5 | 138.5 |
| drain | idle | handle | 10 | 10 | 132.7 | 144.7 |
| drain | eof | hold | 10 | 10 | 52.8 | 63.9 |
| drain | eof | handle | 10 | 10 | 56.2 | 67.9 |
| drain | signal | hold | 10 | 10 | 50.3 | 60.4 |
| drain | signal | handle | 10 | 10 | 49.6 | 60 |
| drain | remote | hold | 10 | 10 | 147.5 | 158.5 |
| drain | remote | handle | 10 | 10 | 152.4 | 165.4 |
| drain | held-back | hold | 10 | 10 | 7027.1 | 7338.2 |
| kill | idle | hold | 10 | 0 | 127.5 | 139.6 |
| kill | idle | handle | 10 | 0 | 130.1 | 143.7 |
| kill | eof | hold | 10 | 0 | 53.3 | 65.4 |
| kill | eof | handle | 10 | 0 | 63.4 | 77.9 |
| kill | signal | hold | 10 | 0 | 49.6 | 60.2 |
| kill | signal | handle | 10 | 0 | 51.7 | 62.9 |
| kill | remote | hold | 10 | 0 | 153.8 | 165.8 |
| kill | remote | handle | 10 | 0 | 140.9 | 151.7 |
| kill | held-back | hold | 10 | 10 | 7025.1 | 7339.7 |

desktop: started with no window active, ended with 0x00c0000c active (harness), neither acted on; holder none; the harness's own trace: 896 requests, 131 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

