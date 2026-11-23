# linux-engine-diff summary

## engine-stop-20261104T202732 (experiment engine-stop)

| lane | path | case | runs | pass | engine after the stop, median ms | after the last answer, median ms |
|---|---|---|---:|---:|---:|---:|
| drain | idle | hold | 10 | 10 | 124.8 | 136 |
| drain | idle | handle | 10 | 10 | 126.6 | 137.2 |
| drain | eof | hold | 10 | 10 | 55.5 | 65.9 |
| drain | eof | handle | 10 | 10 | 59.1 | 78.8 |
| drain | signal | hold | 10 | 10 | 60.2 | 71.5 |
| drain | signal | handle | 10 | 10 | 51.1 | 62.3 |
| drain | remote | hold | 10 | 10 | 146.9 | 158.9 |
| drain | remote | handle | 10 | 10 | 145.4 | 157.6 |
| drain | held-back | hold | 10 | 10 | 7024.8 | 7337.1 |
| kill | idle | hold | 10 | 0 | 130.3 | 142.4 |
| kill | idle | handle | 10 | 0 | 130.1 | 141.1 |
| kill | eof | hold | 10 | 0 | 52.6 | 63.7 |
| kill | eof | handle | 10 | 0 | 50.9 | 63.3 |
| kill | signal | hold | 10 | 0 | 48.5 | 61.1 |
| kill | signal | handle | 10 | 0 | 54.9 | 70 |
| kill | remote | hold | 10 | 0 | 144.3 | 154 |
| kill | remote | handle | 10 | 0 | 115.1 | 126.2 |
| kill | held-back | hold | 10 | 10 | 7026.3 | 7339.6 |

desktop: started with no window active, ended with 0x00c0000c active (harness), neither acted on; holder none; the harness's own trace: 894 requests, 131 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

